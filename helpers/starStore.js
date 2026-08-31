const defaultWalletRepo = require('../repositories/walletRepo');
const defaultInventoryRepo = require('../repositories/inventoryRepo');
const defaultInteractionsRepo = require('../repositories/interactionsRepo');
const defaultStatsRepo = require('../repositories/statsRepo');
const defaultProgressRepo = require('../repositories/progressRepo');
const { resolveLessonRef } = require('./lessonRef');
const { recordProgressEvent: defaultRecordProgressEvent } = require('./studentProgress');
const {
    STORE_ITEMS,
    getItem,
    upgradeCost,
    chargeCost,
    publicItem,
    lessonResetCost,
    maxStarsForLesson,
    CERTIFICATE_PRINT_COST,
    BLOCK_RESET_ON_DEMAND_COST,
    REFERENCE_ON_DEMAND_COST,
    LESSON_EARLY_UNLOCK_COST,
} = require('./starMarket');
const { fetchLessonLock, notifyIfStarUnlocked } = require('./lessonUnlock');

function createStarStore({
    walletRepo = defaultWalletRepo,
    inventoryRepo = defaultInventoryRepo,
    interactionsRepo = defaultInteractionsRepo,
    statsRepo = defaultStatsRepo,
    progressRepo = defaultProgressRepo,
    resolveLesson = resolveLessonRef,
    recordProgressEvent = defaultRecordProgressEvent,
} = {}) {
    function inventoryView(doc) {
        const items = {};
        for (const item of Object.values(STORE_ITEMS)) {
            items[item.sku] = publicItem(item, doc?.items?.[item.sku]);
        }
        return {
            items,
            buffs: doc?.buffs || {},
        };
    }

    async function snapshot(userId) {
        const [wallet, inventory] = await Promise.all([
            walletRepo.getOrCreate(userId),
            inventoryRepo.getOrCreate(userId),
        ]);
        return {
            starBalance: wallet.starBalance || 0,
            inventory: inventoryView(inventory),
        };
    }

    async function spend(userId, amount, itemType) {
        const wallet = await walletRepo.findByUserId(userId);
        const currentBalance = wallet ? (wallet.starBalance || 0) : 0;
        if (currentBalance < amount) {
            return { error: 'Insufficient star balance', status: 400, currentBalance, required: amount };
        }
        const transaction = walletRepo.spendTransaction(amount, itemType);
        const updated = await walletRepo.applyBalanceChange(userId, {
            inc: -amount,
            transaction,
        });
        await recordProgressEvent(userId, 'STARS_SPENT', { amount });
        return {
            starBalance: updated ? updated.starBalance : currentBalance - amount,
            transaction,
        };
    }

    async function buyCharge(userId, sku) {
        const item = getItem(sku);
        if (!item) return { error: 'Unknown powerup', status: 400 };
        const inventory = await inventoryRepo.getOrCreate(userId);
        const current = inventory.items?.[sku] || { level: 1, charges: 0 };
        const cost = chargeCost(item);
        const paid = await spend(userId, cost, `store:${sku}`);
        if (paid.error) return paid;
        const next = await inventoryRepo.update(userId, {
            $set: {
                [`items.${sku}.level`]: Math.max(1, Number(current.level) || 1),
                updated_at: new Date(),
            },
            $inc: { [`items.${sku}.charges`]: 1 },
        });
        return { ...paid, inventory: inventoryView(next), sku };
    }

    async function upgrade(userId, sku) {
        const item = getItem(sku);
        if (!item) return { error: 'Unknown powerup', status: 400 };
        const inventory = await inventoryRepo.getOrCreate(userId);
        const current = inventory.items?.[sku] || { level: 1, charges: 0 };
        const level = Math.max(1, Number(current.level) || 1);
        const cost = upgradeCost(item, level);
        if (cost == null) return { error: 'Already at max level', status: 400 };
        const paid = await spend(userId, cost, `upgrade:${sku}`);
        if (paid.error) return paid;
        const next = await inventoryRepo.update(userId, {
            $set: {
                [`items.${sku}.level`]: level + 1,
                updated_at: new Date(),
            },
        });
        return { ...paid, inventory: inventoryView(next), sku };
    }

    async function activate(userId, sku) {
        const item = getItem(sku);
        if (!item) return { error: 'Unknown powerup', status: 400 };
        const inventory = await inventoryRepo.getOrCreate(userId);
        const current = inventory.items?.[sku] || { level: 1, charges: 0 };
        const charges = Number(current.charges) || 0;
        if (charges < 1) return { error: 'No charges left', status: 400 };
        const level = Math.max(1, Number(current.level) || 1);
        const effect = item.effectAt(level);

        const set = { updated_at: new Date() };
        if (item.kind === 'buff') {
            set[`buffs.${sku}`] = {
                remaining: (Number(inventory.buffs?.[sku]?.remaining) || 0) + effect,
                effect,
            };
        }

        const next = await inventoryRepo.update(userId, {
            $inc: { [`items.${sku}.charges`]: -1 },
            $set: set,
        });

        return {
            sku,
            effect,
            kind: item.kind,
            inventory: inventoryView(next),
        };
    }

    async function consumeCharge(userId, sku) {
        const item = getItem(sku);
        if (!item || (item.kind !== 'consumable' && item.kind !== 'buff')) {
            return { error: 'Unknown consumable', status: 400 };
        }
        const inventory = await inventoryRepo.getOrCreate(userId);
        const current = inventory.items?.[sku] || { level: 1, charges: 0 };
        const charges = Number(current.charges) || 0;
        if (charges < 1) return { error: 'No charges left', status: 400 };
        const level = Math.max(1, Number(current.level) || 1);
        const effect = item.effectAt(level);
        const next = await inventoryRepo.update(userId, {
            $inc: { [`items.${sku}.charges`]: -1 },
            $set: { updated_at: new Date() },
        });
        return { consumed: true, sku, effect, inventory: inventoryView(next) };
    }

    async function consumeBuff(userId, sku) {
        const inventory = await inventoryRepo.getOrCreate(userId);
        const remaining = Number(inventory.buffs?.[sku]?.remaining) || 0;
        if (remaining <= 0) return { consumed: false, effect: 0, remaining: 0 };
        const effect = Number(inventory.buffs?.[sku]?.effect) || 0;
        const nextRemaining = remaining - 1;
        const set = { updated_at: new Date() };
        if (nextRemaining <= 0) {
            set[`buffs.${sku}`] = { remaining: 0, effect };
        } else {
            set[`buffs.${sku}.remaining`] = nextRemaining;
        }
        await inventoryRepo.update(userId, { $set: set });
        return { consumed: true, effect, remaining: nextRemaining };
    }

    async function resetLesson(userId, lessonId) {
        const ref = await resolveLesson(lessonId);
        const content = ref?.content;
        if (!content) return { error: 'Lesson not found', status: 404 };
        const cost = lessonResetCost(content);
        const paid = await spend(userId, cost, `lesson_reset:${lessonId}`);
        if (paid.error) return paid;

        const publicId = ref.publicId || lessonId;
        await interactionsRepo.deleteByUserAndLesson(userId, publicId);
        if (typeof statsRepo.deleteCompletion === 'function') {
            await statsRepo.deleteCompletion(userId, publicId);
        }

        const progress = await progressRepo.getOrCreate(userId);
        const hadCompleted = Number(progress.lessonsCompleted) || 0;
        if (hadCompleted > 0) {
            await progressRepo.update(userId, {
                $inc: { lessonsCompleted: -1 },
                $set: { updated_at: new Date() },
            });
        }

        return {
            ...paid,
            lessonId: publicId,
            cost,
            maxStars: maxStarsForLesson(content),
            wiped: true,
        };
    }

    async function resetBlock(userId, lessonId, componentId) {
        const ref = await resolveLesson(lessonId);
        const publicId = ref?.publicId || lessonId;
        if (!ref?.content) return { error: 'Lesson not found', status: 404 };
        const inventory = await inventoryRepo.getOrCreate(userId);
        const charges = Number(inventory.items?.live_block_reset?.charges) || 0;
        let paid;
        if (charges > 0) {
            paid = await consumeCharge(userId, 'live_block_reset');
            if (paid.error) return paid;
        } else {
            paid = await spend(userId, BLOCK_RESET_ON_DEMAND_COST, `block_reset:${publicId}:${componentId}`);
            if (paid.error) return paid;
        }
        const cleared = await interactionsRepo.clearComponent(userId, publicId, componentId);
        return {
            ...paid,
            lessonId: publicId,
            componentId,
            cost: charges > 0 ? 0 : BLOCK_RESET_ON_DEMAND_COST,
            usedCharge: charges > 0,
            version: cleared.version,
            wiped: true,
        };
    }

    async function openReference(userId, kind) {
        if (kind !== 'live') {
            return { spent: false, cost: 0, usedCredit: false };
        }
        const inventory = await inventoryRepo.getOrCreate(userId);
        const charges = Number(inventory.items?.reference_credit?.charges) || 0;
        if (charges > 0) {
            const used = await consumeCharge(userId, 'reference_credit');
            if (used.error) return used;
            return { ...used, spent: true, cost: 0, usedCredit: true };
        }
        const paid = await spend(userId, REFERENCE_ON_DEMAND_COST, 'reference:live');
        if (paid.error) return paid;
        return { ...paid, spent: true, cost: REFERENCE_ON_DEMAND_COST, usedCredit: false };
    }

    async function unlockLesson(userId, lessonId) {
        const lock = await fetchLessonLock(userId, lessonId);
        const publicId = lock.lessonId || lessonId;
        if (!lock.locked) {
            const wallet = await walletRepo.getOrCreate(userId);
            return {
                alreadyUnlocked: true,
                unlocked: true,
                cost: 0,
                lessonId: publicId,
                starBalance: wallet.starBalance || 0,
            };
        }
        const paid = await spend(userId, LESSON_EARLY_UNLOCK_COST, `lesson_unlock:${publicId}`);
        if (paid.error) return paid;
        await progressRepo.update(userId, {
            $addToSet: { earlyUnlockLessonIds: publicId },
            $set: { updated_at: new Date() },
        });
        notifyIfStarUnlocked(userId, publicId, false).catch(() => {});
        return {
            ...paid,
            lessonId: publicId,
            cost: LESSON_EARLY_UNLOCK_COST,
            unlocked: true,
        };
    }

    async function printCertificate(userId, kind, ref) {
        const type = String(kind || '');
        if (type !== 'lesson' && type !== 'pride') {
            return { error: 'Unknown certificate', status: 400 };
        }
        const marker = String(ref || '').slice(0, 128);
        const itemType = marker ? `certificate:${type}:${marker}` : `certificate:${type}`;
        const paid = await spend(userId, CERTIFICATE_PRINT_COST, itemType);
        if (paid.error) return paid;
        return {
            ...paid,
            kind: type,
            cost: CERTIFICATE_PRINT_COST,
            printedAt: new Date().toISOString(),
        };
    }

    return {
        snapshot,
        buyCharge,
        upgrade,
        activate,
        consumeBuff,
        consumeCharge,
        resetLesson,
        resetBlock,
        openReference,
        printCertificate,
        unlockLesson,
        inventoryView,
    };
}

const defaults = createStarStore();

module.exports = {
    createStarStore,
    snapshot: defaults.snapshot,
    buyCharge: defaults.buyCharge,
    upgrade: defaults.upgrade,
    activate: defaults.activate,
    consumeBuff: defaults.consumeBuff,
    consumeCharge: defaults.consumeCharge,
    resetLesson: defaults.resetLesson,
    resetBlock: defaults.resetBlock,
    openReference: defaults.openReference,
    printCertificate: defaults.printCertificate,
    unlockLesson: defaults.unlockLesson,
};

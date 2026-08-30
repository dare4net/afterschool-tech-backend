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
} = require('./starMarket');

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

    return {
        snapshot,
        buyCharge,
        upgrade,
        activate,
        consumeBuff,
        resetLesson,
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
    resetLesson: defaults.resetLesson,
};

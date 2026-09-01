const { describe, it } = require('node:test');
const assert = require('assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { nextStreakState, streakMilestoneReward } = require('../helpers/loginStreak');
const { applyLoginStreak } = require('../helpers/applyLoginStreak');
const { createStarStore } = require('../helpers/starStore');
const { lessonResetCost, upgradeCost, getItem, maxStarsForLesson, CERTIFICATE_PRINT_COST } = require('../helpers/starMarket');

const read = (relative) => readFileSync(join(__dirname, '..', relative), 'utf8');

describe('W5 store and login streak', () => {
    it('counts consecutive UTC days and spends streak freezes on gaps', () => {
        const first = nextStreakState({}, '2026-08-30', 0);
        assert.equal(first.loginStreak, 1);
        assert.equal(first.continued, true);

        const same = nextStreakState({ loginStreak: 4, lastLoginDate: '2026-08-30' }, '2026-08-30', 0);
        assert.equal(same.alreadyCounted, true);
        assert.equal(same.loginStreak, 4);

        const next = nextStreakState({ loginStreak: 4, lastLoginDate: '2026-08-29', longestLoginStreak: 4 }, '2026-08-30', 0);
        assert.equal(next.loginStreak, 5);

        const saved = nextStreakState({ loginStreak: 6, lastLoginDate: '2026-08-28', longestLoginStreak: 6 }, '2026-08-30', 1);
        assert.equal(saved.loginStreak, 7);
        assert.equal(saved.usedFreeze, 1);
        assert.equal(saved.broken, false);

        const broken = nextStreakState({ loginStreak: 6, lastLoginDate: '2026-08-27', longestLoginStreak: 6 }, '2026-08-30', 0);
        assert.equal(broken.loginStreak, 1);
        assert.equal(broken.broken, true);
    });

    it('prices lesson reset at 150% of max live stars', () => {
        const content = {
            slides: [
                { components: [
                    { type: 'quiz', mode: 'live', props: { points: 5, mode: 'live', questions: [{}] } },
                    { type: 'hangman', props: { points: 10, timeLimit: 20, mode: 'live' } },
                ] },
                { components: [{ type: 'paragraph' }] },
            ],
        };
        assert.equal(maxStarsForLesson(content), 10);
        assert.equal(lessonResetCost(content), Math.max(21, Math.ceil(10 * 1.5)));
        const item = getItem('live_time');
        assert.equal(upgradeCost(item, 1), 40);
        assert.equal(upgradeCost(item, 2), 80);
        assert.equal(upgradeCost(item, 5), null);
    });

    it('buys a charge from the wallet and refuses a poor student', async () => {
        const wallets = new Map();
        const inventory = new Map();
        const api = createStarStore({
            walletRepo: {
                findByUserId: async (userId) => wallets.get(userId) || null,
                getOrCreate: async (userId) => {
                    if (!wallets.has(userId)) wallets.set(userId, { user_id: userId, starBalance: 0, transactions: [] });
                    return wallets.get(userId);
                },
                spendTransaction: (amount, itemType) => ({ type: 'spend', amount, itemType }),
                applyBalanceChange: async (userId, { inc, transaction }) => {
                    const wallet = wallets.get(userId) || { user_id: userId, starBalance: 0, transactions: [] };
                    wallet.starBalance = (wallet.starBalance || 0) + inc;
                    wallet.transactions.push(transaction);
                    wallets.set(userId, wallet);
                    return wallet;
                },
            },
            recordProgressEvent: async () => ({}),
            inventoryRepo: {
                getOrCreate: async (userId) => inventory.get(userId) || { user_id: userId, items: {}, buffs: {} },
                update: async (userId, update) => {
                    const current = inventory.get(userId) || { user_id: userId, items: {}, buffs: {} };
                    const sku = 'live_time';
                    current.items[sku] = current.items[sku] || { level: 1, charges: 0 };
                    if (update.$inc?.['items.live_time.charges']) {
                        current.items[sku].charges += update.$inc['items.live_time.charges'];
                    }
                    inventory.set(userId, current);
                    return current;
                },
            },
        });

        wallets.set('poor', { user_id: 'poor', starBalance: 5, transactions: [] });
        const refused = await api.buyCharge('poor', 'live_time');
        assert.equal(refused.error, 'Insufficient star balance');

        wallets.set('rich', { user_id: 'rich', starBalance: 40, transactions: [] });
        inventory.set('rich', { user_id: 'rich', items: {}, buffs: {} });
        const bought = await api.buyCharge('rich', 'live_time');
        assert.equal(bought.error, undefined);
        assert.equal(bought.starBalance, 20);
        assert.equal(bought.inventory.items.live_time.charges, 1);
    });

    it('pays exponential stars on streak milestones', async () => {
        assert.equal(streakMilestoneReward(1), 0);
        assert.equal(streakMilestoneReward(3), 5);
        assert.equal(streakMilestoneReward(7), 10);
        assert.equal(streakMilestoneReward(14), 20);
        assert.equal(streakMilestoneReward(30), 40);
        assert.equal(streakMilestoneReward(60), 80);
        assert.equal(streakMilestoneReward(100), 160);

        const progress = { loginStreak: 6, longestLoginStreak: 6, lastLoginDate: '2026-08-29' };
        const wallets = new Map();
        const result = await applyLoginStreak('u1', {
            now: new Date('2026-08-30T12:00:00Z'),
            progressRepo: {
                getOrCreate: async () => progress,
                update: async (_id, update) => Object.assign(progress, update.$set),
            },
            inventoryRepo: {
                getOrCreate: async () => ({ buffs: {} }),
                update: async () => ({}),
            },
            walletRepo: {
                earnTransaction: (amount, reason) => ({ amount, reason }),
                applyBalanceChange: async (userId, { inc, transaction }) => {
                    const wallet = wallets.get(userId) || { starBalance: 0, transactions: [] };
                    wallet.starBalance += inc;
                    wallet.transactions.push(transaction);
                    wallets.set(userId, wallet);
                    return wallet;
                },
            },
            prideStats: { syncFromProgressEvent: async () => ({}) },
            recordProgressEvent: async () => ({ lifetimeStarsEarned: 10 }),
        });
        assert.equal(result.loginStreak, 7);
        assert.equal(result.streakBonusStars, 10);
        assert.equal(result.streakBonusClaimed, false);
        assert.equal(wallets.get('u1'), undefined);

        const { claimStreakBonus } = require('../helpers/claimStreakBonus');
        const claimed = await claimStreakBonus('u1', {
            progressRepo: {
                getOrCreate: async () => progress,
                update: async (_id, update) => Object.assign(progress, update.$set),
            },
            walletRepo: {
                earnTransaction: (amount, reason) => ({ amount, reason }),
                applyBalanceChange: async (userId, { inc, transaction }) => {
                    const wallet = wallets.get(userId) || { starBalance: 0, transactions: [] };
                    wallet.starBalance += inc;
                    wallet.transactions.push(transaction);
                    wallets.set(userId, wallet);
                    return wallet;
                },
                findByUserId: async (userId) => wallets.get(userId) || null,
            },
            prideStats: { syncFromProgressEvent: async () => ({}) },
            recordProgressEvent: async () => ({ lifetimeStarsEarned: 10 }),
        });
        assert.equal(claimed.streakBonusStars, 10);
        assert.equal(wallets.get('u1').starBalance, 10);
        assert.equal(progress.streakBonusClaimed, true);
        assert.equal(progress.lastStreakBonusStars, 10);
    });

    it('prints a certificate for a cheap star spend every time', async () => {
        assert.equal(CERTIFICATE_PRINT_COST, 5);
        const wallets = new Map();
        wallets.set('u1', { user_id: 'u1', starBalance: 12, transactions: [] });
        const api = createStarStore({
            walletRepo: {
                findByUserId: async (userId) => wallets.get(userId) || null,
                getOrCreate: async (userId) => wallets.get(userId),
                spendTransaction: (amount, itemType) => ({ type: 'spend', amount, itemType }),
                applyBalanceChange: async (userId, { inc, transaction }) => {
                    const wallet = wallets.get(userId);
                    wallet.starBalance += inc;
                    wallet.transactions.push(transaction);
                    return wallet;
                },
            },
            recordProgressEvent: async () => ({}),
            inventoryRepo: {
                getOrCreate: async () => ({ items: {}, buffs: {} }),
                update: async () => ({}),
            },
        });
        const first = await api.printCertificate('u1', 'lesson', 'L1');
        assert.equal(first.error, undefined);
        assert.equal(first.cost, 5);
        assert.equal(first.starBalance, 7);
        assert.ok(first.printedAt);
        const second = await api.printCertificate('u1', 'pride', 'loginStreak');
        assert.equal(second.starBalance, 2);
        const broke = await api.printCertificate('u1', 'lesson', 'L1');
        assert.equal(broke.error, 'Insufficient star balance');
        assert.match(read('routes/storeRoutes.js'), /print-certificate/);
        assert.match(read('controllers/storeController.js'), /printCertificate/);
    });

    it('lists login streak on the pride catalog and mounts the store', () => {
        const catalog = read('helpers/prideCatalog.js');
        assert.match(catalog, /key: 'loginStreak'/);
        const server = read('server.js');
        assert.match(server, /app\.use\('\/api\/store',\s*storeRoutes\)/);
        assert.equal(read('controllers/storeController.js').includes('getMainDb'), false);
        assert.equal(read('controllers/storeController.js').includes('db.collection'), false);
    });

    it('sells hint packs, block resets, references, and cosmetics', async () => {
        assert.equal(getItem('hint_pack').kind, 'consumable');
        assert.equal(getItem('live_block_reset').chargeCost, 10);
        assert.equal(getItem('reference_credit').kind, 'consumable');
        assert.equal(getItem('avatar_frame').kind, 'cosmetic');
        const routes = read('routes/storeRoutes.js');
        assert.match(routes, /\/consume/);
        assert.match(routes, /\/reset-block/);
        assert.match(routes, /\/open-reference/);
        assert.match(read('controllers/studioController.js'), /COMPONENT_SUBMITTED/);
        assert.match(read('controllers/studioController.js'), /tutorResetState/);

        const wallets = new Map();
        const inventory = new Map();
        let cleared = 0;
        wallets.set('u1', { user_id: 'u1', starBalance: 40, transactions: [] });
        inventory.set('u1', { user_id: 'u1', items: { live_block_reset: { level: 1, charges: 1 }, reference_credit: { level: 1, charges: 1 } }, buffs: {} });
        const api = createStarStore({
            walletRepo: {
                findByUserId: async (userId) => wallets.get(userId) || null,
                getOrCreate: async (userId) => wallets.get(userId),
                spendTransaction: (amount, itemType) => ({ type: 'spend', amount, itemType }),
                applyBalanceChange: async (userId, { inc, transaction }) => {
                    const wallet = wallets.get(userId);
                    wallet.starBalance += inc;
                    wallet.transactions.push(transaction);
                    return wallet;
                },
            },
            recordProgressEvent: async () => ({}),
            inventoryRepo: {
                getOrCreate: async (userId) => inventory.get(userId) || { user_id: userId, items: {}, buffs: {} },
                update: async (userId, update) => {
                    const current = inventory.get(userId) || { user_id: userId, items: {}, buffs: {} };
                    current.items = current.items || {};
                    if (update.$inc) {
                        for (const [path, delta] of Object.entries(update.$inc)) {
                            const match = String(path).match(/^items\.([^.]+)\.charges$/);
                            if (match) {
                                current.items[match[1]] = current.items[match[1]] || { level: 1, charges: 0 };
                                current.items[match[1]].charges += delta;
                            }
                        }
                    }
                    inventory.set(userId, current);
                    return current;
                },
            },
            interactionsRepo: {
                clearComponent: async () => {
                    cleared += 1;
                    return { version: 2 };
                },
            },
            resolveLesson: async () => ({ publicId: 'L1', content: { slides: [] } }),
        });

        const reset = await api.resetBlock('u1', 'L1', 'c1');
        assert.equal(reset.error, undefined);
        assert.equal(reset.usedCharge, true);
        assert.equal(cleared, 1);
        const practice = await api.openReference('u1', 'practice');
        assert.equal(practice.spent, false);
        const live = await api.openReference('u1', 'live');
        assert.equal(live.usedCredit, true);
        const livePaid = await api.openReference('u1', 'live');
        assert.equal(livePaid.usedCredit, false);
        assert.equal(livePaid.cost, 15);
        assert.equal(getItem('reference_credit').chargeCost, 10);
        assert.equal(getItem('live_block_reset').chargeCost, 10);
        assert.match(read('helpers/starMarket.js'), /BLOCK_RESET_ON_DEMAND_COST = 15/);
        assert.match(read('helpers/starMarket.js'), /REFERENCE_ON_DEMAND_COST = 15/);
        assert.match(read('routes/storeRoutes.js'), /unlock-lesson/);
    });
});

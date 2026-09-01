const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isClubPlanId,
    brandingTierForPlan,
    settingsPatchForBillingPlan,
    expandOrgPatchWithBillingPlan,
} = require('../helpers/clubPlans');

describe('clubPlans', () => {
    it('maps Stripe plan ids to branding tiers', () => {
        assert.equal(brandingTierForPlan('club_standard'), 'standard');
        assert.equal(brandingTierForPlan('club_branded'), 'branded');
        assert.equal(brandingTierForPlan('club_white_label'), 'white_label');
        assert.equal(brandingTierForPlan('unknown'), null);
        assert.equal(isClubPlanId('club_branded'), true);
        assert.equal(isClubPlanId('legacy'), false);
    });

    it('turns off vanity when downgrading below white-label', () => {
        const patch = settingsPatchForBillingPlan('club_branded', {
            brandingTier: 'white_label',
            vanityEnabled: true,
        });
        assert.equal(patch.brandingTier, 'branded');
        assert.equal(patch.vanityEnabled, false);
    });

    it('expands billing.plan patches with synced branding tier', () => {
        const expanded = expandOrgPatchWithBillingPlan(
            { billing: { plan: 'club_white_label' } },
            { settings: { brandingTier: 'standard', vanityEnabled: false } },
        );
        assert.equal(expanded.settings.brandingTier, 'white_label');
    });
});

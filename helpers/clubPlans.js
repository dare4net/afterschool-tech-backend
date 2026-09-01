const { normalizeBrandingTier } = require('./orgBranding');

const PLAN_RANK = { standard: 0, branded: 1, white_label: 2 };

/** Stripe-ready plan IDs. Superadmin sets billing.plan; branding tier syncs on save. */
const CLUB_PLANS = {
    club_standard: {
        id: 'club_standard',
        label: 'Club Standard',
        brandingTier: 'standard',
        seatProduct: true,
        stripePriceHint: 'price_club_standard_seats',
        notes: 'Accent colour, join chrome, vanity subdomain (when enabled by ops).',
    },
    club_branded: {
        id: 'club_branded',
        label: 'Club Branded',
        brandingTier: 'branded',
        seatProduct: true,
        stripePriceHint: 'price_club_branded_seats',
        notes: 'Logo, banner, welcome message, org-wide pride scope.',
    },
    club_white_label: {
        id: 'club_white_label',
        label: 'Club White-label',
        brandingTier: 'white_label',
        seatProduct: true,
        stripePriceHint: 'price_club_white_label_seats',
        notes: 'Hero join, favicon, splash, branded emails, vanity subdomain.',
    },
};

const PLAN_IDS = Object.keys(CLUB_PLANS);

function isClubPlanId(plan) {
    return PLAN_IDS.includes(String(plan || '').trim());
}

function brandingTierForPlan(plan) {
    const row = CLUB_PLANS[String(plan || '').trim()];
    return row ? normalizeBrandingTier(row.brandingTier) : null;
}

function planLabel(plan) {
    const row = CLUB_PLANS[String(plan || '').trim()];
    return row ? row.label : null;
}

/**
 * When billing.plan is set, derive settings patches (branding tier, vanity downgrade).
 * Does not auto-enable vanity on white-label — superadmin still toggles that.
 */
function settingsPatchForBillingPlan(plan, currentSettings = {}) {
    const tier = brandingTierForPlan(plan);
    if (!tier) return {};

    const patch = { brandingTier: tier };
    const currentTier = normalizeBrandingTier(currentSettings.brandingTier || currentSettings.branding_tier);
    if (tier !== 'white_label' && currentSettings.vanityEnabled === true) {
        patch.vanityEnabled = false;
    }
    if (PLAN_RANK[tier] < PLAN_RANK[currentTier] && tier !== 'white_label') {
        patch.vanityEnabled = false;
    }
    return patch;
}

/**
 * Expand an org update patch so billing.plan keeps branding tier in sync.
 */
function expandOrgPatchWithBillingPlan(patch = {}, currentOrg = {}) {
    const plan = patch.billing?.plan;
    if (plan === undefined || plan === null || plan === '') {
        return patch;
    }
    if (!isClubPlanId(plan)) {
        return patch;
    }

    const settingsPatch = settingsPatchForBillingPlan(plan, {
        brandingTier: currentOrg.settings?.brandingTier,
        branding_tier: currentOrg.settings?.brandingTier,
        vanityEnabled: currentOrg.settings?.vanityEnabled,
    });

    return {
        ...patch,
        settings: {
            ...(patch.settings || {}),
            ...settingsPatch,
        },
    };
}

module.exports = {
    CLUB_PLANS,
    PLAN_IDS,
    isClubPlanId,
    brandingTierForPlan,
    planLabel,
    settingsPatchForBillingPlan,
    expandOrgPatchWithBillingPlan,
};

const ACCENT_COLORS = ['#58CC02', '#1CB0F6', '#FF9600', '#CE82FF', '#FF4B4B'];

const BRANDING_TIERS = ['standard', 'branded', 'white_label'];
const PRIDE_SCOPES = ['cohort', 'org'];
const JOIN_LAYOUTS = ['standard', 'hero'];

const TIER_RANK = { standard: 0, branded: 1, white_label: 2 };

const FEATURE_MIN_TIER = {
    accent: 'standard',
    vanity: 'standard',
    logo: 'branded',
    banner: 'branded',
    welcome: 'branded',
    prideScope: 'branded',
    joinLayout: 'white_label',
    favicon: 'white_label',
    splash: 'white_label',
    brandedEmail: 'white_label',
};

function isHexColor(value) {
    return /^#[0-9A-Fa-f]{6}$/.test(String(value || ''));
}

function slugAccent(slug) {
    const text = String(slug || '');
    let n = 0;
    for (let i = 0; i < text.length; i += 1) {
        n = (n + text.charCodeAt(i) * (i + 1)) % ACCENT_COLORS.length;
    }
    return ACCENT_COLORS[n];
}

function resolveOrgAccent(slug, chosen) {
    if (isHexColor(chosen)) return chosen;
    return slugAccent(slug);
}

function normalizeBrandingTier(value) {
    return BRANDING_TIERS.includes(value) ? value : 'standard';
}

function normalizePrideScope(value) {
    return value === 'cohort' ? 'cohort' : 'org';
}

function normalizeJoinLayout(value) {
    return value === 'hero' ? 'hero' : 'standard';
}

function orgCanUse(tier, feature) {
    const required = FEATURE_MIN_TIER[feature] || 'standard';
    const have = TIER_RANK[normalizeBrandingTier(tier)] || 0;
    const need = TIER_RANK[normalizeBrandingTier(required)] || 0;
    return have >= need;
}

function mapSettingsFromDoc(docSettings, slug) {
    const s = docSettings || {};
    const tier = normalizeBrandingTier(s.branding_tier);
    return {
        allowPublicOptIn: s.allow_public_opt_in !== false,
        vanityEnabled: s.vanity_enabled === true,
        accentColor: resolveOrgAccent(slug, s.accent_color || null),
        logoUrl: orgCanUse(tier, 'logo') ? (s.logo_url || null) : null,
        bannerUrl: orgCanUse(tier, 'banner') ? (s.banner_url || null) : null,
        welcomeMessage: orgCanUse(tier, 'welcome') ? (s.welcome_message || null) : null,
        prideScope: normalizePrideScope(s.pride_scope),
        brandingTier: tier,
        joinLayout: normalizeJoinLayout(s.join_layout),
    };
}

function defaultSettingsForCreate(slug) {
    return {
        allow_public_opt_in: true,
        vanity_enabled: false,
        accent_color: slugAccent(slug),
        branding_tier: 'standard',
        pride_scope: 'org',
        join_layout: 'standard',
    };
}

function publicBrandingFromOrg(org) {
    if (!org) return null;
    return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        accentColor: org.settings?.accentColor || resolveOrgAccent(org.slug, null),
        welcomeMessage: org.settings?.welcomeMessage || null,
        logoUrl: org.settings?.logoUrl || null,
    };
}

function brandingPatchToDb(patch = {}, { tier = 'standard' } = {}) {
    const out = {};
    if (patch.allowPublicOptIn !== undefined) {
        out.allow_public_opt_in = patch.allowPublicOptIn === true;
    }
    if (patch.vanityEnabled !== undefined) {
        out.vanity_enabled = patch.vanityEnabled === true;
    }
    if (patch.accentColor !== undefined && orgCanUse(tier, 'accent')) {
        const color = String(patch.accentColor || '').trim();
        out.accent_color = isHexColor(color) ? color : null;
    }
    if (patch.logoUrl !== undefined && orgCanUse(tier, 'logo')) {
        out.logo_url = patch.logoUrl ? String(patch.logoUrl).trim().slice(0, 512) : null;
    }
    if (patch.bannerUrl !== undefined && orgCanUse(tier, 'banner')) {
        out.banner_url = patch.bannerUrl ? String(patch.bannerUrl).trim().slice(0, 512) : null;
    }
    if (patch.welcomeMessage !== undefined && orgCanUse(tier, 'welcome')) {
        out.welcome_message = patch.welcomeMessage
            ? String(patch.welcomeMessage).trim().slice(0, 240)
            : null;
    }
    if (patch.prideScope !== undefined && orgCanUse(tier, 'prideScope')) {
        out.pride_scope = normalizePrideScope(patch.prideScope);
    }
    if (patch.brandingTier !== undefined) {
        out.branding_tier = normalizeBrandingTier(patch.brandingTier);
    }
    if (patch.joinLayout !== undefined && orgCanUse(tier, 'joinLayout')) {
        out.join_layout = normalizeJoinLayout(patch.joinLayout);
    }
    return out;
}

module.exports = {
    ACCENT_COLORS,
    BRANDING_TIERS,
    PRIDE_SCOPES,
    JOIN_LAYOUTS,
    isHexColor,
    slugAccent,
    resolveOrgAccent,
    normalizeBrandingTier,
    normalizePrideScope,
    orgCanUse,
    mapSettingsFromDoc,
    defaultSettingsForCreate,
    publicBrandingFromOrg,
    brandingPatchToDb,
};

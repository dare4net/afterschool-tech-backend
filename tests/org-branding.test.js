const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
    resolveOrgAccent,
    slugAccent,
    orgCanUse,
    mapSettingsFromDoc,
    publicBrandingFromOrg,
    brandingPatchToDb,
} = require('../helpers/orgBranding');
const { updateMyOrgBodySchema } = require('../contracts/platform');

const ROOT = join(__dirname, '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

describe('orgBranding', () => {
    it('derives a stable accent from slug when none is chosen', () => {
        assert.equal(resolveOrgAccent('riverside', null), slugAccent('riverside'));
        assert.equal(resolveOrgAccent('riverside', '#CE82FF'), '#CE82FF');
        assert.match(resolveOrgAccent('byte-club', null), /^#[0-9A-Fa-f]{6}$/);
    });

    it('maps persisted settings to public org shape', () => {
        const mapped = mapSettingsFromDoc(
            {
                accent_color: '#1CB0F6',
                pride_scope: 'org',
                branding_tier: 'standard',
            },
            'riverside',
        );
        assert.equal(mapped.accentColor, '#1CB0F6');
        assert.equal(mapped.prideScope, 'org');
        assert.equal(mapped.brandingTier, 'standard');
    });

    it('gates branded assets by tier', () => {
        assert.equal(orgCanUse('standard', 'accent'), true);
        assert.equal(orgCanUse('standard', 'logo'), false);
        assert.equal(orgCanUse('branded', 'logo'), true);
        assert.equal(orgCanUse('white_label', 'joinLayout'), true);
        assert.equal(orgCanUse('branded', 'joinLayout'), false);
        assert.equal(orgCanUse('white_label', 'favicon'), true);
    });

    it('strips tier-3 fields on read for lower tiers', () => {
        const mapped = mapSettingsFromDoc(
            {
                branding_tier: 'branded',
                join_layout: 'hero',
                favicon_url: 'https://cdn.example/f.ico',
            },
            'riverside',
        );
        assert.equal(mapped.joinLayout, 'standard');
        assert.equal(mapped.faviconUrl, null);
    });

    it('exposes join layout and favicon on public branding for white label', () => {
        const payload = publicBrandingFromOrg({
            id: '1',
            name: 'Riverside',
            slug: 'riverside',
            settings: mapSettingsFromDoc(
                {
                    branding_tier: 'white_label',
                    join_layout: 'hero',
                    favicon_url: 'https://cdn.example/f.ico',
                    accent_color: '#58CC02',
                },
                'riverside',
            ),
        });
        assert.equal(payload.joinLayout, 'hero');
        assert.equal(payload.faviconUrl, 'https://cdn.example/f.ico');
    });

    it('builds a safe public branding payload', () => {
        const payload = publicBrandingFromOrg({
            id: '1',
            name: 'Riverside',
            slug: 'riverside',
            settings: mapSettingsFromDoc({ accent_color: '#58CC02' }, 'riverside'),
        });
        assert.equal(payload.name, 'Riverside');
        assert.equal(payload.accentColor, '#58CC02');
        assert.equal(payload.billing, undefined);
    });

    it('writes accent patches to snake_case settings', () => {
        const patch = brandingPatchToDb({ accentColor: '#FF9600' }, { tier: 'standard' });
        assert.deepEqual(patch, { accent_color: '#FF9600' });
    });

    it('allows owners to patch white-label settings', () => {
        const parsed = updateMyOrgBodySchema.parse({
            settings: { joinLayout: 'hero', faviconUrl: 'https://cdn.example/f.ico' },
        });
        assert.equal(parsed.settings.joinLayout, 'hero');
        assert.equal(parsed.settings.faviconUrl, 'https://cdn.example/f.ico');
    });
});

describe('org branding wiring', () => {
    it('exposes branding on public org and org repo mapping', () => {
        assert.match(read('repositories/orgsRepo.js'), /mapSettingsFromDoc/);
        assert.match(read('controllers/orgsController.js'), /publicBrandingFromOrg/);
        assert.match(read('helpers/cohorts.js'), /accentColor/);
        assert.match(read('helpers/brandedEmailTemplates.js'), /buildStaffInviteEmail/);
    });
});

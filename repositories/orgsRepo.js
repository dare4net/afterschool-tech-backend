const { ObjectId } = require('mongodb');
const { getMainDb } = require('../config/database');
const { normalizeOrgSlug } = require('../helpers/orgSlug');
const {
    mapSettingsFromDoc,
    defaultSettingsForCreate,
    brandingPatchToDb,
} = require('../helpers/orgBranding');

const COLLECTION = 'orgs';

async function col() {
    return (await getMainDb()).collection(COLLECTION);
}

function asObjectId(value) {
    if (!value) return null;
    if (value instanceof ObjectId) return value;
    const text = String(value);
    if (!ObjectId.isValid(text)) return null;
    try {
        return new ObjectId(text);
    } catch {
        return null;
    }
}

function toPublicOrg(doc, extras = {}) {
    if (!doc) return null;
    const slug = doc.slug;
    return {
        id: String(doc._id),
        name: doc.name,
        slug,
        status: doc.status || 'active',
        seatCap: Number(doc.seat_cap) || 0,
        settings: mapSettingsFromDoc(doc.settings, slug),
        billing: {
            plan: doc.billing?.plan || null,
            externalCustomerId: doc.billing?.external_customer_id || null,
        },
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        ...extras,
    };
}

async function ensureIndexes() {
    const collection = await col();
    await collection.createIndex({ slug: 1 }, { unique: true, name: 'orgs_slug_unique' });
    await collection.createIndex({ status: 1, created_at: -1 }, { name: 'orgs_status_created' });
}

async function create({ name, slug, seatCap = 40, status = 'active', settings = {}, billing = {} }) {
    const normalized = normalizeOrgSlug(slug);
    if (!normalized) {
        const err = new Error('Invalid org slug');
        err.code = 'invalid_slug';
        throw err;
    }
    const cap = Math.max(0, Math.min(Number(seatCap) || 0, 100000));
    const now = new Date();
    const doc = {
        name: String(name || '').trim().slice(0, 120),
        slug: normalized,
        status: status === 'suspended' || status === 'trial' ? status : 'active',
        seat_cap: cap,
        settings: {
            ...defaultSettingsForCreate(normalized),
            ...brandingPatchToDb(settings, { tier: 'standard' }),
            allow_public_opt_in: settings.allowPublicOptIn !== false,
            vanity_enabled: settings.vanityEnabled === true,
        },
        billing: {
            plan: billing.plan || null,
            external_customer_id: billing.externalCustomerId || null,
        },
        created_at: now,
        updated_at: now,
    };
    if (!doc.name) {
        const err = new Error('Org name is required');
        err.code = 'invalid_name';
        throw err;
    }
    await ensureIndexes();
    try {
        const result = await (await col()).insertOne(doc);
        return toPublicOrg({ ...doc, _id: result.insertedId });
    } catch (err) {
        if (err && err.code === 11000) {
            const conflict = new Error('Org slug already exists');
            conflict.code = 'slug_taken';
            throw conflict;
        }
        throw err;
    }
}

async function findById(orgId) {
    const id = asObjectId(orgId);
    if (!id) return null;
    return toPublicOrg(await (await col()).findOne({ _id: id }));
}

async function findBySlug(slug) {
    const normalized = normalizeOrgSlug(slug);
    if (!normalized) return null;
    return toPublicOrg(await (await col()).findOne({ slug: normalized }));
}

async function list({ limit = 100 } = {}) {
    const cap = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const rows = await (await col())
        .find({})
        .sort({ created_at: -1 })
        .limit(cap)
        .toArray();
    return rows.map((row) => toPublicOrg(row));
}

async function update(orgId, patch = {}) {
    const id = asObjectId(orgId);
    if (!id) return null;

    const existing = await (await col()).findOne({ _id: id });
    if (!existing) return null;

    const { expandOrgPatchWithBillingPlan } = require('../helpers/clubPlans');
    const resolvedPatch = expandOrgPatchWithBillingPlan(
        patch,
        toPublicOrg(existing),
    );

    const $set = { updated_at: new Date() };
    if (resolvedPatch.name !== undefined) $set.name = String(resolvedPatch.name).trim().slice(0, 120);
    if (resolvedPatch.seatCap !== undefined) {
        $set.seat_cap = Math.max(0, Math.min(Number(resolvedPatch.seatCap) || 0, 100000));
    }
    if (resolvedPatch.status !== undefined) {
        if (!['active', 'suspended', 'trial'].includes(resolvedPatch.status)) {
            const err = new Error('Invalid org status');
            err.code = 'invalid_status';
            throw err;
        }
        $set.status = resolvedPatch.status;
    }
    if (resolvedPatch.settings) {
        const { normalizeBrandingTier } = require('../helpers/orgBranding');
        const nextTier = normalizeBrandingTier(
            resolvedPatch.settings.brandingTier || existing?.settings?.branding_tier || 'standard',
        );
        const dbPatch = brandingPatchToDb(resolvedPatch.settings, { tier: nextTier });
        for (const [key, value] of Object.entries(dbPatch)) {
            $set[`settings.${key}`] = value;
        }
    }
    if (resolvedPatch.billing) {
        if (resolvedPatch.billing.plan !== undefined) $set['billing.plan'] = resolvedPatch.billing.plan;
        if (resolvedPatch.billing.externalCustomerId !== undefined) {
            $set['billing.external_customer_id'] = resolvedPatch.billing.externalCustomerId;
        }
    }
    const result = await (await col()).findOneAndUpdate(
        { _id: id },
        { $set },
        { returnDocument: 'after' }
    );
    return toPublicOrg(result.value || result);
}

module.exports = {
    COLLECTION,
    asObjectId,
    toPublicOrg,
    ensureIndexes,
    create,
    findById,
    findBySlug,
    list,
    update,
};

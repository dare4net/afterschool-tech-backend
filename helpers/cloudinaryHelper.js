const axios = require('axios');
const crypto = require('crypto');

function requireCloudinaryConfig() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error(
            'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set'
        );
    }
    return { cloudName, apiKey, apiSecret };
}

/**
 * Uploads base64 image data URL to Cloudinary REST API.
 */
async function uploadToCloudinary(base64Data, folder, entityId) {
    if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
        return base64Data;
    }
    const { cloudName, apiKey, apiSecret } = requireCloudinaryConfig();
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const public_id = `${folder}/${entityId}`;

        // Signature string built in alphabetical parameter order
        const signatureStr = `invalidate=true&overwrite=true&public_id=${public_id}&timestamp=${timestamp}${apiSecret}`;
        const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

        const params = new URLSearchParams();
        params.append('file', base64Data);
        params.append('api_key', apiKey);
        params.append('timestamp', timestamp);
        params.append('public_id', public_id);
        params.append('overwrite', 'true');
        params.append('invalidate', 'true');
        params.append('signature', signature);

        const response = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, params);
        return response.data?.secure_url || base64Data;
    } catch (err) {
        console.error('[Backend Cloudinary] Upload failed:', err.response?.data || err.message);
        return base64Data;
    }
}

/**
 * Destroys Cloudinary image given its URL.
 */
async function deleteFromCloudinary(url) {
    if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return;
    const { cloudName, apiKey, apiSecret } = requireCloudinaryConfig();
    try {
        const parts = url.split('/upload/');
        if (parts.length < 2) return;
        let publicIdWithExt = parts[1].replace(/^v\d+\//, '');
        const lastDot = publicIdWithExt.lastIndexOf('.');
        const publicId = lastDot !== -1 ? publicIdWithExt.substring(0, lastDot) : publicIdWithExt;

        const timestamp = Math.floor(Date.now() / 1000);
        const signatureStr = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
        const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

        const params = new URLSearchParams();
        params.append('public_id', publicId);
        params.append('api_key', apiKey);
        params.append('timestamp', timestamp);
        params.append('invalidate', 'true');
        params.append('signature', signature);

        await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, params);
        console.log(`[Backend Cloudinary] Destroyed image: ${publicId}`);
    } catch (err) {
        console.error('[Backend Cloudinary] Delete failed:', err.response?.data || err.message);
    }
}

function getCloudinaryPublicId(url) {
    if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return null;
    try {
        const parts = url.split('/upload/');
        if (parts.length < 2) return null;
        let publicIdWithExt = parts[1].replace(/^v\d+\//, '');
        const lastDot = publicIdWithExt.lastIndexOf('.');
        return lastDot !== -1 ? publicIdWithExt.substring(0, lastDot) : publicIdWithExt;
    } catch (e) {
        return null;
    }
}

module.exports = {
    requireCloudinaryConfig,
    uploadToCloudinary,
    deleteFromCloudinary,
    getCloudinaryPublicId
};

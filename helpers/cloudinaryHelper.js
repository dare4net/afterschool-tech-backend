const axios = require('axios');
const crypto = require('crypto');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'rwjtoqiy';
const API_KEY = process.env.CLOUDINARY_API_KEY || '431677943928628';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || 'S1MeiLS39dDREEfHz4xTGhNTzQU';

/**
 * Uploads base64 image data URL to Cloudinary REST API.
 */
async function uploadToCloudinary(base64Data, folder, entityId) {
    if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
        return base64Data;
    }
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const public_id = `${folder}/${entityId}`;

        // Signature string built in alphabetical parameter order
        const signatureStr = `invalidate=true&overwrite=true&public_id=${public_id}&timestamp=${timestamp}${API_SECRET}`;
        const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

        const params = new URLSearchParams();
        params.append('file', base64Data);
        params.append('api_key', API_KEY);
        params.append('timestamp', timestamp);
        params.append('public_id', public_id);
        params.append('overwrite', 'true');
        params.append('invalidate', 'true');
        params.append('signature', signature);

        const response = await axios.post(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, params);
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
    try {
        const parts = url.split('/upload/');
        if (parts.length < 2) return;
        let publicIdWithExt = parts[1].replace(/^v\d+\//, '');
        const lastDot = publicIdWithExt.lastIndexOf('.');
        const publicId = lastDot !== -1 ? publicIdWithExt.substring(0, lastDot) : publicIdWithExt;

        const timestamp = Math.floor(Date.now() / 1000);
        const signatureStr = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
        const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

        const params = new URLSearchParams();
        params.append('public_id', publicId);
        params.append('api_key', API_KEY);
        params.append('timestamp', timestamp);
        params.append('invalidate', 'true');
        params.append('signature', signature);

        await axios.post(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, params);
        console.log(`[Backend Cloudinary] Destroyed image: ${publicId}`);
    } catch (err) {
        console.error('[Backend Cloudinary] Delete failed:', err.response?.data || err.message);
    }
}

module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary
};

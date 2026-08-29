const { getMainDb } = require('../config/database');
const usersRepo = require('../repositories/usersRepo');
const { sanitizeHandle, handleError, isAccentColor } = require('../helpers/publicProfile');
const prideStats = require('../helpers/prideStats');

// Helper: get collection name by role (previously table)
function getCollectionByRole(role) {
  switch (role) {
    case 'student': return 'students';
    case 'parent': return 'parents';
    case 'organization': return 'organizations';
    case 'tutor': return 'tutors';
    default: return null;
  }
}

// GET /api/profile
exports.getProfile = async (req, res) => {
  console.log('we are getting the profile...');
  const userId = req.user.user_id;
  const role = req.user.role;
  try {
    const db = await getMainDb();
    // Get base user info
    const user = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { password_hash: 0 } } // Exclude sensitive data
    );
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    const collection = getCollectionByRole(role);
    let profile = { ...user };

    // Get role-specific info
    if (collection) {
      const roleSpecificData = await db.collection(collection).findOne({ user_id: userId });
      if (roleSpecificData) {
        // Remove _id from the role-specific data to avoid conflicts
        delete roleSpecificData._id;
        profile = { ...profile, ...roleSpecificData };
      }
    }

    profile.handle = user.handle || null;
    profile.isPublicProfile = user.isPublicProfile === true;
    profile.accentColor = user.accentColor || null;
    res.json(profile);
  } catch (err) {
    console.error('MongoDB Error:', err);
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/profile
// PUT /api/profile/password
exports.updatePassword = async (req, res) => {
  const userId = req.user.user_id;
  const { currentPassword, newPassword } = req.body;

  try {
    const db = await getMainDb();
    // Get user with password hash
    const user = await db.collection('users').findOne({ user_id: userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify current password
    const bcrypt = require('bcrypt');
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.collection('users').updateOne(
      { user_id: userId },
      { $set: { password_hash: newPasswordHash } }
    );

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('MongoDB Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  const userId = req.user.user_id;
  const role = req.user.role;
  const body = req.validatedBody || req.body || {};
  const { full_name, handle, isPublicProfile, accentColor, ...rest } = body;

  try {
    const current = await usersRepo.findByUserId(userId);
    if (!current) return res.status(404).json({ message: 'User not found' });

    const identityPatch = {};
    if (full_name !== undefined) identityPatch.full_name = full_name;

    if (handle !== undefined) {
      const nextHandle = sanitizeHandle(handle);
      const error = handleError(nextHandle);
      if (error) {
        return res.status(400).json({ error });
      }
      if (await usersRepo.handleTakenByOther(nextHandle, userId)) {
        return res.status(409).json({ error: 'That handle is taken' });
      }
      identityPatch.handle = nextHandle;
    }

    if (isPublicProfile !== undefined) {
      const nextHandle = identityPatch.handle || current.handle;
      if (isPublicProfile === true && !nextHandle) {
        return res.status(400).json({ error: 'Choose a handle before making your profile public' });
      }
      identityPatch.isPublicProfile = isPublicProfile === true;
    }

    if (accentColor !== undefined) {
      if (!isAccentColor(accentColor)) {
        return res.status(400).json({ error: 'Pick a handle color' });
      }
      identityPatch.accentColor = accentColor;
    }

    if (Object.keys(identityPatch).length > 0) {
      await usersRepo.ensureIndexes();
      await usersRepo.updateIdentity(userId, identityPatch);
    }

    const db = await getMainDb();
    const collection = getCollectionByRole(role);
    if (collection && Object.keys(rest).length > 0) {
      const updateData = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined && !['_id', 'user_id', 'password_hash', 'email', 'handle', 'isPublicProfile', 'accentColor'].includes(key)) {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await db.collection(collection).updateOne(
          { user_id: userId },
          { $set: updateData },
          { upsert: true }
        );
      }
    }

    const updated = await usersRepo.findByUserId(userId);
    if (identityPatch.isPublicProfile !== undefined || identityPatch.handle !== undefined) {
        await prideStats.setListed(
            userId,
            updated?.isPublicProfile === true && Boolean(updated?.handle)
        );
    }
    res.json({
      message: 'Profile updated',
      full_name: updated?.full_name || null,
      handle: updated?.handle || null,
      isPublicProfile: updated?.isPublicProfile === true,
      accentColor: updated?.accentColor || null,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'That handle is taken' });
    }
    console.error('MongoDB Error:', err);
    res.status(500).json({ error: err.message });
  }
};

const { getMainDb } = require('../config/database');

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
  const { full_name, ...rest } = req.body;

  try {
    const db = await getMainDb();
    // Update base user info
    if (full_name) {
      await db.collection('users').updateOne(
        { user_id: userId },
        { $set: { full_name } }
      );
    }

    // Update role-specific info
    const collection = getCollectionByRole(role);
    if (collection && Object.keys(rest).length > 0) {
      // Remove any undefined values and sensitive fields
      const updateData = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined && !['_id', 'user_id', 'password_hash'].includes(key)) {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length > 0) {
        // Use upsert to create the document if it doesn't exist
        await db.collection(collection).updateOne(
          { user_id: userId },
          { $set: updateData },
          { upsert: true }
        );
      }
    }

    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error('MongoDB Error:', err);
    res.status(500).json({ error: err.message });
  }
};

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const db = client.db('ast_beta');

exports.submitFeedback = async (req, res) => {
  console.log(`[BETA] Submit Feedback called - ${new Date().toISOString()}`);
  console.log('[BETA] Request body:', JSON.stringify(req.body, null, 2));
  console.log('[BETA] User:', req.user?.user_id);

  try {
    const { phase, message, category, screen, anonymous } = req.body;
    
    // Ensure user is authenticated
    if (!req.user?.user_id) {
      console.log('[BETA] Authentication failed - no user ID');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate phase
    if (!phase || ![1, 2, 3].includes(parseInt(phase))) {
      console.log(`[BETA] Invalid phase provided: ${phase}`);
      return res.status(400).json({ error: 'Invalid phase. Must be 1, 2, or 3' });
    }

    const feedback = {
      phase: parseInt(phase),
      message,
      category, // bug, feature-request, general, etc
      screen, // where in the app
      userId: req.user.user_id,
      anonymous: Boolean(anonymous), // Ensure it's a boolean
      created_at: new Date()
    };
    
    console.log('[BETA] Debug - Saving feedback with anonymous:', feedback.anonymous);

    await db.collection('beta_feedbacks').insertOne(feedback);
    console.log('[BETA] Feedback saved successfully:', feedback._id);
    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('[BETA] Error saving feedback:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getUserFeedbacks = async (req, res) => {
  console.log(`[BETA] Get User Feedbacks called - ${new Date().toISOString()}`);
  console.log('[BETA] User:', req.user?.user_id);

  try {
    // Ensure user is authenticated
    if (!req.user?.user_id) {
      console.log('[BETA] Authentication failed - no user ID');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const feedbacks = await db.collection('beta_feedbacks')
      .find({ 
        userId: req.user.user_id,
        $or: [
          { anonymous: false },
          { anonymous: { $exists: false } }  // Include documents where anonymous field isn't set
        ]
      })
      .sort({ created_at: -1 })
      .toArray();
    
    console.log(`[BETA] Retrieved ${feedbacks.length} non-anonymous feedbacks for user ${req.user.user_id}`);

    res.json(feedbacks);
  } catch (error) {
    console.error('MongoDB Error:', error);
    res.status(500).json({ error: error.message });
  }
};

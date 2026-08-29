const { ObjectId } = require('mongodb');
const { accessCheck } = require('../utils/accessChecker');
const { getMainDb } = require('../config/database');

// The ObjectId of your dummy lesson for access control
const TEMPORARY_ACCESS_LESSON_ID = '687f80c7d4187f2163d7365b'; // Replace with your actual lesson ID

// Middleware to check temporary access
const temporaryAccessMiddleware = async (req, res, next) => {
  // Only check login and register routes
  console.log('[TEMP ACCESS] Checking path:', req.path);
  if (!req.path.includes('/signup')) {
    console.log('[TEMP ACCESS] Skipping non-auth route');
    return next();
  }
  console.log('[TEMP ACCESS] Checking access for auth route');

  try {
    const mainDb = await getMainDb();
    const dummyLesson = await mainDb.collection('lessons').findOne({
      _id: new ObjectId(TEMPORARY_ACCESS_LESSON_ID)
    });

    if (!dummyLesson) {
      console.error('[TEMP ACCESS] Access control lesson not found');
      return res.status(503).json({ 
        error: 'Service temporarily unavailable',
        message: 'Access restrictions are currently in place'
      });
    }

    const email = req.body.email;
    if (!email) {
      console.error('[TEMP ACCESS] No email provided in request body');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email is required'
      });
    }

    console.log('[TEMP ACCESS] Checking access for email:', email);
    console.log('[TEMP ACCESS] Lesson access rules:', JSON.stringify(dummyLesson.access, null, 2));
    
    // Create user object with both email formats for testing
    const userToCheck = {
      email: email,
      email_address: email  // try alternative field name
    };
    console.log('[TEMP ACCESS] Checking access with user object:', JSON.stringify(userToCheck, null, 2));
    
    // Use the access checker with the dummy lesson's access rules
    const checker = accessCheck(dummyLesson.access);
    const hasAccess = await checker.check(userToCheck);
    
    console.log('[TEMP ACCESS] Access check result:', hasAccess);

    if (!hasAccess) {
      console.log('[TEMP ACCESS] Access denied for email:', email);
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not currently have access to this service'
      });
    }

    // If access is granted, proceed to next middleware
    console.log('[TEMP ACCESS] Access granted for email:', email);
    next();

  } catch (error) {
    console.error('[TEMP ACCESS] Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to check access restrictions'
    });
  }
};

module.exports = temporaryAccessMiddleware;

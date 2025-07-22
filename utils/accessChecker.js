const { MongoClient, ObjectId } = require('mongodb');

class AccessChecker {
  constructor(access) {
    this.access = access || { type: 'everyone', auth: [] };
    this.client = new MongoClient(process.env.MONGODB_URI);
    this.mainDb = this.client.db('afterschooltech');
  }

  /**
   * Check if a user has access based on the access rules
   * @param {Object} user - The user object with at least user_id
   * @returns {Promise<boolean>} - True if user has access, false otherwise
   */
  async check(user) {
    console.log('[ACCESS] Starting access check:', {
      userId: user?.user_id,
      accessType: this.access?.type,
      timestamp: new Date().toISOString()
    });

    try {
      // Always allow if type is everyone or no access rules defined
      if (!this.access?.type || this.access.type === 'everyone') {
        console.log('[ACCESS] Everyone access granted');
        return true;
      }

      // Must have auth array for all other types
      if (!Array.isArray(this.access.auth)) {
        console.warn('[ACCESS] Invalid auth array for type:', this.access.type);
        return false;
      }

      // For empty auth array, deny access (except 'everyone' type)
      if (this.access.auth.length === 0) {
        console.warn('[ACCESS] Empty auth array for type:', this.access.type);
        return false;
      }

      console.log('[ACCESS] Checking access type:', this.access.type, 'for user:', user.user_id);

      switch (this.access.type) {
        case 'user_id': {
          const userId = String(user.user_id);
          const hasAccess = this.access.auth.includes(userId);
          console.log('[ACCESS] User ID check:', { userId, hasAccess, allowedIds: this.access.auth });
          return hasAccess;
        }

        case 'email': {
          // Original implementation
          /* 
          console.log('[ACCESS] Fetching user email for:', user.user_id);
          const userDoc = await this.mainDb.collection('users').findOne(
            { user_id: user.user_id },
            { projection: { email: 1 } }
          );
          if (!userDoc?.email) {
            console.warn('[ACCESS] User email not found:', user.user_id);
            return false;
          }
          const hasAccess = this.access.auth.includes(userDoc.email);
          console.log('[ACCESS] Email check:', { email: userDoc.email, hasAccess, allowedEmails: this.access.auth });
          return hasAccess;
          */

          // New direct email check implementation
          const emailToCheck = user.email || user.email_address;
          if (!emailToCheck) {
            console.warn('[ACCESS] No email provided in user object');
            return false;
          }
          const hasAccess = this.access.auth.includes(emailToCheck);
          console.log('[ACCESS] Direct email check:', { 
            email: emailToCheck, 
            hasAccess, 
            allowedEmails: this.access.auth 
          });
          return hasAccess;
        }

        case 'current_program': {
          console.log('[ACCESS] Fetching current program for user:', user.user_id);
          const userDoc = await this.mainDb.collection('users').findOne(
            { user_id: user.user_id },
            { projection: { 'current_program.program_id': 1 } }
          );
          if (!userDoc?.current_program?.program_id) {
            console.warn('[ACCESS] No current program for user:', user.user_id);
            return false;
          }
          const programId = userDoc.current_program.program_id.toString();
          const hasAccess = this.access.auth.includes(programId);
          console.log('[ACCESS] Program check:', { programId, hasAccess, allowedPrograms: this.access.auth });
          return hasAccess;
        }

        case 'current_module': {
          console.log('[ACCESS] Fetching current module for user:', user.user_id);
          const registration = await this.mainDb.collection('program_registrations').findOne(
            { user_id: user.user_id },
            { projection: { 'progress.current_module': 1 } }
          );
          if (!registration?.progress?.current_module) {
            console.warn('[ACCESS] No current module for user:', user.user_id);
            return false;
          }
          const moduleId = registration.progress.current_module.toString();
          const hasAccess = this.access.auth.includes(moduleId);
          console.log('[ACCESS] Module check:', { moduleId, hasAccess, allowedModules: this.access.auth });
          return hasAccess;
        }

        default: {
          console.warn('[ACCESS] Unsupported access type:', this.access.type);
          return false;
        }
      }
    } catch (error) {
      console.error('[ACCESS] Error checking access:', error);
      // Log detailed error for debugging but don't expose internals
      console.error('[ACCESS] Details:', {
        error: error.message,
        type: this.access?.type,
        userId: user?.user_id,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return false; // Fail closed - deny access on error
    } finally {
      console.log('[ACCESS] Completed access check:', {
        userId: user?.user_id,
        accessType: this.access?.type,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Placeholder for future methods
  async add(value) {
    // To be implemented
    throw new Error('Not implemented');
  }

  async remove(value) {
    // To be implemented
    throw new Error('Not implemented');
  }
}

/**
 * Create an access checker instance
 * @param {Object} access - The access configuration object
 * @param {string} access.type - The type of access check ('everyone', 'user_id', 'email', 'current_program', 'current_module')
 * @param {string[]} access.auth - Array of authorized values based on type
 * @returns {AccessChecker} An instance of AccessChecker
 */
const accessCheck = (access) => {
  return new AccessChecker(access);
};

module.exports = {
  accessCheck
};

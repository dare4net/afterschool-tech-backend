const { authorize } = require('./authorize');

/** Alias of authorize — one req.user shape (`user_id`) for every router. */
module.exports = authorize;

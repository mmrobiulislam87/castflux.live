/** Admin token check for sync / channel management APIs */
function getAdminSecret() {
  return process.env.SYNC_SECRET || process.env.ADMIN_SECRET || null;
}

function isAdminAuthorized(req) {
  const secret = getAdminSecret();
  if (!secret) return false;

  const auth = req.headers.authorization;
  const token = req.headers['x-admin-token'];

  if (auth?.startsWith('Bearer ')) return auth.slice(7) === secret;
  if (token === secret) return true;
  return false;
}

function requireAdmin(req, res, next) {
  if (isAdminAuthorized(req)) return next();
  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Valid SYNC_SECRET token required',
  });
}

module.exports = { getAdminSecret, isAdminAuthorized, requireAdmin };

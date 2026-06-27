/** Admin token check for sync / channel management APIs */
export function getAdminSecret(env) {
  return env?.SYNC_SECRET || env?.ADMIN_SECRET || null;
}

export function isAdminAuthorized(req, secret) {
  if (!secret) return false;

  const auth = req.headers.get('Authorization') || req.headers.get('authorization');
  const token = req.headers.get('X-Admin-Token') || req.headers.get('x-admin-token');

  if (auth?.startsWith('Bearer ')) return auth.slice(7) === secret;
  if (token === secret) return true;
  return false;
}

export function adminDeniedResponse() {
  return Response.json(
    { error: 'Unauthorized', message: 'Valid SYNC_SECRET token required' },
    { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }
  );
}

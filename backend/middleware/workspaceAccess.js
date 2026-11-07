import { hashToken } from '../security.js';
import { pool } from '../db.js';

const cookieName = 'uim_session';

function readSessionToken(request) {
  const pair = (request.headers.cookie || '').split(';').map((value) => value.trim())
    .find((value) => value.startsWith(cookieName + '='));
  return pair ? decodeURIComponent(pair.slice(cookieName.length + 1)) : '';
}

export async function authenticateSession(request, response, next) {
  const token = readSessionToken(request);
  if (!token) return response.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    const [rows] = await pool.execute(
      "SELECT u.id, u.email, u.display_name AS name FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP(3) AND u.status='active' LIMIT 1",
      [hashToken(token)]
    );
    if (!rows.length) return response.status(401).json({ error: 'UNAUTHENTICATED' });
    request.user = rows[0];
    next();
  } catch (error) { next(error); }
}

export function requireWorkspacePermission(permissionKey) {
  return async (request, response, next) => {
    const workspaceId = request.params.workspaceId;
    if (!workspaceId) return response.status(400).json({ error: 'WORKSPACE_REQUIRED' });
    try {
      const [memberships] = await pool.execute(
        "SELECT role_id FROM workspace_members WHERE workspace_id=? AND user_id=? AND status='active' LIMIT 1",
        [workspaceId, request.user.id]
      );
      if (!memberships.length) return response.status(404).json({ error: 'WORKSPACE_NOT_FOUND' });
      request.workspaceMembership = memberships[0];
      const [permissions] = await pool.execute(
        'SELECT 1 FROM role_permissions WHERE workspace_id=? AND role_id=? AND permission_key=? LIMIT 1',
        [workspaceId, memberships[0].role_id, permissionKey]
      );
      if (!permissions.length) return response.status(403).json({ error: 'WORKSPACE_PERMISSION_DENIED', permission: permissionKey });
      next();
    } catch (error) { next(error); }
  };
}

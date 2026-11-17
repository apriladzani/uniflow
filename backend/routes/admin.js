import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateSession } from '../middleware/workspaceAccess.js';

// Platform-wide administration. Separate from workspace roles: only users with
// users.is_platform_admin = 1 can reach these routes, regardless of workspace membership.
export const adminRouter = Router();
// Public branding (the favicon is fetched by every visitor, signed in or not).
export const brandingRouter = Router();

const FAVICON_KEY = 'favicon';
const FAVICON_MAX_BYTES = 512 * 1024;
// SVG is deliberately excluded: it can carry script and is served from the app origin.
const FAVICON_TYPES = new Set(['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/webp']);

async function requirePlatformAdmin(request, response, next) {
  try {
    const [[row]] = await pool.execute('SELECT is_platform_admin FROM users WHERE id=? LIMIT 1', [request.user.id]);
    if (!row || Number(row.is_platform_admin) !== 1) return response.status(403).json({ error: 'PLATFORM_ADMIN_REQUIRED' });
    next();
  } catch (error) { next(error); }
}

adminRouter.use(authenticateSession, requirePlatformAdmin);

adminRouter.get('/overview', async (_request, response, next) => {
  try {
    const [[counts]] = await pool.query(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE status='active') AS activeUsers,
      (SELECT COUNT(*) FROM workspaces) AS workspaces,
      (SELECT COUNT(*) FROM content_plans) AS contents`);
    response.json({ overview: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])) });
  } catch (error) { next(error); }
});

adminRouter.get('/users', async (_request, response, next) => {
  try {
    const [rows] = await pool.query(`SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.status,
        u.is_platform_admin, u.google_sub IS NOT NULL AS google_linked, u.password_hash IS NOT NULL AS has_password,
        u.last_login_at, u.created_at,
        (SELECT COUNT(*) FROM workspace_members m WHERE m.user_id=u.id AND m.status='active') AS workspace_count
      FROM users u ORDER BY u.created_at DESC`);
    response.json({ users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      username: row.username,
      name: row.display_name,
      avatarUrl: row.avatar_url || '',
      status: row.status,
      isPlatformAdmin: Number(row.is_platform_admin) === 1,
      signInMethods: [Number(row.has_password) ? 'password' : null, Number(row.google_linked) ? 'google' : null].filter(Boolean),
      workspaceCount: Number(row.workspace_count),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    })) });
  } catch (error) { next(error); }
});

adminRouter.get('/workspaces', async (_request, response, next) => {
  try {
    const [rows] = await pool.query(`SELECT w.id, w.name, w.slug, w.description, w.created_at,
        o.display_name AS owner_name, o.email AS owner_email,
        (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id=w.id AND m.status='active') AS member_count,
        (SELECT COUNT(*) FROM content_plans c WHERE c.workspace_id=w.id) AS content_count
      FROM workspaces w LEFT JOIN users o ON o.id=w.owner_user_id ORDER BY w.created_at DESC`);
    response.json({ workspaces: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || '',
      ownerName: row.owner_name || '',
      ownerEmail: row.owner_email || '',
      memberCount: Number(row.member_count),
      contentCount: Number(row.content_count),
      createdAt: row.created_at,
    })) });
  } catch (error) { next(error); }
});

async function faviconInfo() {
  const [[row]] = await pool.execute('SELECT value_mime, updated_at FROM app_settings WHERE setting_key=? AND value_blob IS NOT NULL LIMIT 1', [FAVICON_KEY]);
  return row ? { url: `/api/branding/favicon?v=${encodeURIComponent(new Date(row.updated_at).getTime() || Date.now())}`, mime: row.value_mime, updatedAt: row.updated_at } : null;
}

adminRouter.get('/favicon', async (_request, response, next) => {
  try { response.json({ favicon: await faviconInfo() }); } catch (error) { next(error); }
});

// The browser sends the chosen file as a data URL (same approach as profile avatars).
adminRouter.put('/favicon', async (request, response, next) => {
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(request.body?.dataUrl || ''));
  const mime = match?.[1].toLowerCase();
  if (!match || !FAVICON_TYPES.has(mime)) return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Favicon harus berformat PNG, ICO, JPG, atau WEBP.' });
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > FAVICON_MAX_BYTES) return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Ukuran favicon maksimal 512 KB.' });
  try {
    await pool.execute(
      `INSERT INTO app_settings (setting_key, value_blob, value_mime, updated_by_user_id) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE value_blob=VALUES(value_blob), value_mime=VALUES(value_mime), updated_by_user_id=VALUES(updated_by_user_id), updated_at=CURRENT_TIMESTAMP(3)`,
      [FAVICON_KEY, image, mime, request.user.id]
    );
    response.json({ favicon: await faviconInfo() });
  } catch (error) { next(error); }
});

adminRouter.delete('/favicon', async (_request, response, next) => {
  try {
    await pool.execute('DELETE FROM app_settings WHERE setting_key=?', [FAVICON_KEY]);
    response.json({ favicon: null });
  } catch (error) { next(error); }
});

brandingRouter.get('/favicon', async (request, response, next) => {
  try {
    const [[row]] = await pool.execute('SELECT value_blob, value_mime, updated_at FROM app_settings WHERE setting_key=? LIMIT 1', [FAVICON_KEY]);
    if (!row?.value_blob) return response.status(404).end();
    const etag = `"fav-${new Date(row.updated_at).getTime()}"`;
    response.set('ETag', etag);
    // Revalidate on every load so a new favicon shows up without waiting for caches.
    response.set('Cache-Control', 'public, no-cache');
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.headers['if-none-match'] === etag) return response.status(304).end();
    response.set('Content-Type', row.value_mime || 'image/png');
    response.send(row.value_blob);
  } catch (error) {
    // Before migration 015 runs the table does not exist; behave as "no custom favicon".
    if (error?.code === 'ER_NO_SUCH_TABLE') return response.status(404).end();
    next(error);
  }
});

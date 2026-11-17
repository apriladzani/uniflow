import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateSession } from '../middleware/workspaceAccess.js';

// Platform-wide administration. Separate from workspace roles: only users with
// users.is_platform_admin = 1 can reach these routes, regardless of workspace membership.
export const adminRouter = Router();
// Public branding (the favicon is fetched by every visitor, signed in or not).
export const brandingRouter = Router();

// Platform branding assets stored in app_settings, keyed by asset name.
// SVG is deliberately excluded: it can carry script and is served from the app origin.
const BRANDING_ASSETS = {
  favicon: { maxBytes: 512 * 1024, types: new Set(['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/webp']), formats: 'PNG, ICO, JPG, atau WEBP', label: 'favicon' },
  logo: { maxBytes: 512 * 1024, types: new Set(['image/png', 'image/jpeg', 'image/webp']), formats: 'PNG, JPG, atau WEBP', label: 'logo' },
};

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

async function brandingInfo() {
  let rows = [];
  try {
    [rows] = await pool.query(`SELECT setting_key, value_mime, updated_at FROM app_settings WHERE setting_key IN ('favicon','logo') AND value_blob IS NOT NULL`);
  } catch (error) {
    // Before migration 015 runs the table does not exist; behave as "nothing customised".
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  const info = { favicon: null, logo: null };
  for (const row of rows) {
    info[row.setting_key] = { url: `/api/branding/${row.setting_key}?v=${new Date(row.updated_at).getTime() || Date.now()}`, mime: row.value_mime, updatedAt: row.updated_at };
  }
  return info;
}

function brandingAsset(request, response) {
  const asset = BRANDING_ASSETS[request.params.asset] ? request.params.asset : '';
  if (!asset) response.status(404).json({ error: 'NOT_FOUND' });
  return asset;
}

adminRouter.get('/branding', async (_request, response, next) => {
  try { response.json({ branding: await brandingInfo() }); } catch (error) { next(error); }
});

// The browser sends the chosen file as a data URL (same approach as profile avatars).
adminRouter.put('/branding/:asset', async (request, response, next) => {
  const asset = brandingAsset(request, response);
  if (!asset) return;
  const rules = BRANDING_ASSETS[asset];
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(request.body?.dataUrl || ''));
  const mime = match?.[1].toLowerCase();
  if (!match || !rules.types.has(mime)) return response.status(400).json({ error: 'VALIDATION_ERROR', message: `${rules.label[0].toUpperCase()}${rules.label.slice(1)} harus berformat ${rules.formats}.` });
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > rules.maxBytes) return response.status(400).json({ error: 'VALIDATION_ERROR', message: `Ukuran ${rules.label} maksimal ${rules.maxBytes / 1024} KB.` });
  try {
    await pool.execute(
      `INSERT INTO app_settings (setting_key, value_blob, value_mime, updated_by_user_id) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE value_blob=VALUES(value_blob), value_mime=VALUES(value_mime), updated_by_user_id=VALUES(updated_by_user_id), updated_at=CURRENT_TIMESTAMP(3)`,
      [asset, image, mime, request.user.id]
    );
    response.json({ branding: await brandingInfo() });
  } catch (error) { next(error); }
});

adminRouter.delete('/branding/:asset', async (request, response, next) => {
  const asset = brandingAsset(request, response);
  if (!asset) return;
  try {
    await pool.execute('DELETE FROM app_settings WHERE setting_key=?', [asset]);
    response.json({ branding: await brandingInfo() });
  } catch (error) { next(error); }
});

// Public: which branding assets are customised (the app falls back to its built-in logo).
brandingRouter.get('/', async (_request, response, next) => {
  try {
    const info = await brandingInfo();
    response.set('Cache-Control', 'no-cache');
    response.json({ faviconUrl: info.favicon?.url || '', logoUrl: info.logo?.url || '' });
  } catch (error) { next(error); }
});

brandingRouter.get('/:asset', async (request, response, next) => {
  const asset = BRANDING_ASSETS[request.params.asset] ? request.params.asset : '';
  if (!asset) return response.status(404).end();
  try {
    const [[row]] = await pool.execute('SELECT value_blob, value_mime, updated_at FROM app_settings WHERE setting_key=? LIMIT 1', [asset]);
    if (!row?.value_blob) return response.status(404).end();
    const etag = `"${asset}-${new Date(row.updated_at).getTime()}"`;
    response.set('ETag', etag);
    // Revalidate on every load so a new image shows up without waiting for caches.
    response.set('Cache-Control', 'public, no-cache');
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.headers['if-none-match'] === etag) return response.status(304).end();
    response.set('Content-Type', row.value_mime || 'image/png');
    response.send(row.value_blob);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return response.status(404).end();
    next(error);
  }
});

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateSession } from '../middleware/workspaceAccess.js';
import { hashPassword } from '../security.js';
import { slugify } from '../slug.js';
import { createWorkspaceRecord } from '../workspaceSeed.js';

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
    const [rows] = await pool.query(`SELECT w.id, w.name, w.slug, w.description, w.created_at, w.owner_user_id,
        o.display_name AS owner_name, o.email AS owner_email,
        (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id=w.id AND m.status='active') AS member_count,
        (SELECT COUNT(*) FROM content_plans c WHERE c.workspace_id=w.id) AS content_count
      FROM workspaces w LEFT JOIN users o ON o.id=w.owner_user_id ORDER BY w.created_at DESC`);
    response.json({ workspaces: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || '',
      ownerUserId: row.owner_user_id,
      ownerName: row.owner_name || '',
      ownerEmail: row.owner_email || '',
      memberCount: Number(row.member_count),
      contentCount: Number(row.content_count),
      createdAt: row.created_at,
    })) });
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// User and workspace management (create / update / delete)
// ---------------------------------------------------------------------------

class InputError extends Error {
  constructor(message, field, status = 400, code = 'VALIDATION_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const sendInputError = (error, response) => response.status(error.status).json({ error: error.code, message: error.message, field: error.field });

const text = (value, field, label, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new InputError(min > 0 ? `${label} harus ${min}–${max} karakter.` : `${label} maksimal ${max} karakter.`, field);
  }
  return value.trim();
};

const userValidators = {
  name: (value) => ['display_name', text(value, 'name', 'Nama', 2, 120)],
  username: (value) => {
    const username = String(value ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new InputError('Username 3–30 karakter, hanya huruf, angka, atau underscore.', 'username');
    return ['username', username];
  },
  email: (value) => {
    const email = String(value ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new InputError('Email tidak valid.', 'email');
    return ['email', email];
  },
  status: (value) => {
    if (value !== 'active' && value !== 'disabled') throw new InputError('Status tidak valid.', 'status');
    return ['status', value];
  },
  isPlatformAdmin: (value) => ['is_platform_admin', value ? 1 : 0],
};

async function passwordHashFor(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw new InputError('Password harus 8–128 karakter.', 'password');
  return hashPassword(value);
}

async function duplicateUserError(email, username) {
  const [[match]] = await pool.execute('SELECT email, username FROM users WHERE email=? OR username=? LIMIT 1', [email ?? '', username ?? '']);
  return match?.username === username
    ? new InputError('Username sudah dipakai.', 'username', 409, 'USERNAME_IN_USE')
    : new InputError('Email sudah terdaftar.', 'email', 409, 'EMAIL_IN_USE');
}

adminRouter.post('/users', async (request, response, next) => {
  const body = request.body || {};
  let values;
  try {
    values = Object.fromEntries(['name', 'username', 'email'].map((key) => userValidators[key](body[key])));
    values.password_hash = await passwordHashFor(body.password);
    values.is_platform_admin = body.isPlatformAdmin ? 1 : 0;
  } catch (error) {
    if (error instanceof InputError) return sendInputError(error, response);
    return next(error);
  }
  try {
    const id = randomUUID();
    await pool.execute(
      'INSERT INTO users (id, email, password_hash, display_name, username, is_platform_admin) VALUES (?, ?, ?, ?, ?, ?)',
      [id, values.email, values.password_hash, values.display_name, values.username, values.is_platform_admin]
    );
    response.status(201).json({ user: { id } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return sendInputError(await duplicateUserError(values.email, values.username), response);
    next(error);
  }
});

adminRouter.patch('/users/:userId', async (request, response, next) => {
  const { userId } = request.params;
  const body = request.body || {};
  const self = userId === request.user.id;
  const assignments = [];
  try {
    for (const [key, value] of Object.entries(body)) {
      if (Object.hasOwn(userValidators, key)) assignments.push(userValidators[key](value));
    }
    if (body.password) assignments.push(['password_hash', await passwordHashFor(body.password)]);
    // An admin cannot lock themselves out; this also guarantees at least one admin remains.
    if (self && assignments.some(([column, value]) => (column === 'status' && value !== 'active') || (column === 'is_platform_admin' && value !== 1))) {
      throw new InputError('Kamu tidak bisa menonaktifkan atau mencabut admin akunmu sendiri.', 'status', 409, 'CANNOT_CHANGE_SELF');
    }
    if (!assignments.length) throw new InputError('Tidak ada perubahan.', undefined, 400, 'EMPTY_UPDATE');
  } catch (error) {
    if (error instanceof InputError) return sendInputError(error, response);
    return next(error);
  }
  const values = Object.fromEntries(assignments);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `UPDATE users SET ${assignments.map(([column]) => `${column}=?`).join(',')} WHERE id=?`,
      [...assignments.map(([, value]) => value), userId]
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return response.status(404).json({ error: 'NOT_FOUND', message: 'User tidak ditemukan.' });
    }
    // Disabling or resetting the password signs the user out everywhere.
    if (values.status === 'disabled' || values.password_hash) {
      await connection.execute('DELETE FROM user_sessions WHERE user_id=?', [userId]);
    }
    await connection.commit();
    response.json({ ok: true });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return sendInputError(await duplicateUserError(values.email, values.username), response);
    next(error);
  } finally { connection?.release(); }
});

adminRouter.delete('/users/:userId', async (request, response, next) => {
  const { userId } = request.params;
  if (userId === request.user.id) return response.status(409).json({ error: 'CANNOT_CHANGE_SELF', message: 'Kamu tidak bisa menghapus akunmu sendiri.' });
  try {
    const [owned] = await pool.execute('SELECT name FROM workspaces WHERE owner_user_id=? ORDER BY name', [userId]);
    if (owned.length) {
      return response.status(409).json({
        error: 'USER_OWNS_WORKSPACES',
        message: `User ini masih owner workspace: ${owned.map((row) => row.name).join(', ')}. Pindahkan owner atau hapus workspace-nya dulu.`,
      });
    }
    const [result] = await pool.execute('DELETE FROM users WHERE id=?', [userId]);
    if (!result.affectedRows) return response.status(404).json({ error: 'NOT_FOUND', message: 'User tidak ditemukan.' });
    response.json({ ok: true });
  } catch (error) {
    // Content, reviews, credits etc. reference the membership with ON DELETE RESTRICT.
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return response.status(409).json({ error: 'USER_HAS_CONTENT', message: 'User ini sudah punya data konten di workspace, jadi tidak bisa dihapus. Nonaktifkan saja akunnya.' });
    }
    next(error);
  }
});

const workspaceValidators = {
  name: (value) => ['name', text(value, 'name', 'Nama workspace', 2, 160)],
  description: (value) => ['description', text(value ?? '', 'description', 'Deskripsi', 0, 2000) || null],
  slug: (value) => {
    const slug = String(value ?? '').trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 140 || slugify(slug) !== slug) {
      throw new InputError('Slug hanya boleh huruf kecil, angka, dan tanda strip (contoh: tim-kreatif).', 'slug');
    }
    return ['slug', slug];
  },
};

async function activeUserExists(connection, userId) {
  const [[row]] = await connection.execute("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1", [String(userId || '')]);
  return Boolean(row);
}

adminRouter.post('/workspaces', async (request, response, next) => {
  const body = request.body || {};
  let name, description;
  try {
    name = workspaceValidators.name(body.name)[1];
    description = workspaceValidators.description(body.description)[1] || '';
  } catch (error) {
    if (error instanceof InputError) return sendInputError(error, response);
    return next(error);
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const ownerUserId = body.ownerUserId || request.user.id;
    if (!await activeUserExists(connection, ownerUserId)) {
      await connection.rollback();
      return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Owner harus user yang aktif.', field: 'ownerUserId' });
    }
    const created = await createWorkspaceRecord(connection, { name, description, ownerUserId });
    await connection.commit();
    response.status(201).json({ workspace: { id: created.id, slug: created.slug } });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    next(error);
  } finally { connection?.release(); }
});

adminRouter.patch('/workspaces/:workspaceId', async (request, response, next) => {
  const { workspaceId } = request.params;
  const body = request.body || {};
  const assignments = [];
  try {
    for (const [key, value] of Object.entries(body)) {
      if (Object.hasOwn(workspaceValidators, key)) assignments.push(workspaceValidators[key](value));
    }
    if (!assignments.length && !body.ownerUserId) throw new InputError('Tidak ada perubahan.', undefined, 400, 'EMPTY_UPDATE');
  } catch (error) {
    if (error instanceof InputError) return sendInputError(error, response);
    return next(error);
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[workspace]] = await connection.execute('SELECT id FROM workspaces WHERE id=? FOR UPDATE', [workspaceId]);
    if (!workspace) {
      await connection.rollback();
      return response.status(404).json({ error: 'NOT_FOUND', message: 'Workspace tidak ditemukan.' });
    }
    if (body.ownerUserId) {
      if (!await activeUserExists(connection, body.ownerUserId)) {
        await connection.rollback();
        return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Owner harus user yang aktif.', field: 'ownerUserId' });
      }
      // The new owner becomes an active member with the workspace's Owner role.
      const [[ownerRole]] = await connection.execute("SELECT id FROM roles WHERE workspace_id=? AND role_key='owner' LIMIT 1", [workspaceId]);
      if (ownerRole) {
        await connection.execute(
          `INSERT INTO workspace_members (workspace_id, user_id, role_id) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE role_id=VALUES(role_id), status='active'`,
          [workspaceId, body.ownerUserId, ownerRole.id]
        );
      }
      assignments.push(['owner_user_id', body.ownerUserId]);
    }
    await connection.execute(
      `UPDATE workspaces SET ${assignments.map(([column]) => `${column}=?`).join(',')} WHERE id=?`,
      [...assignments.map(([, value]) => value), workspaceId]
    );
    await connection.commit();
    response.json({ ok: true });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'SLUG_IN_USE', message: 'Slug sudah dipakai workspace lain.', field: 'slug' });
    next(error);
  } finally { connection?.release(); }
});

// Deletes the workspace and every row that belongs to it. Children reference each other
// (and workspace memberships) with ON DELETE RESTRICT, so a plain cascading delete can be
// refused depending on the order InnoDB visits them. Every tenant table carries workspace_id,
// so the rows are removed explicitly inside one transaction with FK checks paused.
adminRouter.delete('/workspaces/:workspaceId', async (request, response, next) => {
  const { workspaceId } = request.params;
  let connection;
  let checksDisabled = false;
  try {
    connection = await pool.getConnection();
    const [[workspace]] = await connection.execute('SELECT id FROM workspaces WHERE id=? LIMIT 1', [workspaceId]);
    if (!workspace) return response.status(404).json({ error: 'NOT_FOUND', message: 'Workspace tidak ditemukan.' });
    const [tables] = await connection.query(
      `SELECT DISTINCT TABLE_NAME AS name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='workspace_id' AND TABLE_NAME<>'workspaces'`
    );
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    checksDisabled = true;
    await connection.beginTransaction();
    for (const { name } of tables) await connection.query('DELETE FROM ?? WHERE workspace_id=?', [name, workspaceId]);
    await connection.execute('DELETE FROM workspaces WHERE id=?', [workspaceId]);
    await connection.commit();
    response.json({ ok: true });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    next(error);
  } finally {
    if (checksDisabled) {
      // Never hand a connection with FK checks off back to the pool.
      try { await connection.query('SET FOREIGN_KEY_CHECKS=1'); } catch { connection.destroy(); connection = null; }
    }
    connection?.release();
  }
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

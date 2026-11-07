import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateSession, requireWorkspacePermission } from '../middleware/workspaceAccess.js';

export const settingsRouter = Router();
settingsRouter.use(authenticateSession);

export const PLATFORM_OPTIONS = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'X (Twitter)'];
export const AI_MODEL_OPTIONS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
// Permissions shown in the Roles & Permissions matrix, in display order.
const MANAGED_PERMISSIONS = ['content.read', 'content.write', 'media.manage', 'reviews.manage', 'publishing.manage', 'members.manage', 'settings.manage', 'workspace.manage'];

const DEFAULT_SETTINGS = {
  timezone: 'Asia/Jakarta',
  productionCycle: '',
  defaultWeeklyTarget: 2,
  contentPillars: ['Campus Education', 'Scholarship Hub', 'Career & Internship Tips', 'Culture & Entertainment', 'Campus Events & Highlights', 'Research & Student Opinion'],
  platforms: [...PLATFORM_OPTIONS],
  aiModel: process.env.AI_ASSISTANT_MODEL && AI_MODEL_OPTIONS.includes(process.env.AI_ASSISTANT_MODEL) ? process.env.AI_ASSISTANT_MODEL : 'claude-opus-5-5',
  aiDefaultTone: 'Casual, student friendly',
};

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

const cleanText = (value, field, max, { allowEmpty = false } = {}) => {
  if (typeof value !== 'string') throw validationError(`${field} must be text.`);
  const text = value.trim();
  if (!allowEmpty && !text) throw validationError(`${field} cannot be empty.`);
  if (text.length > max) throw validationError(`${field} must be at most ${max} characters.`);
  return text;
};

// Each validator returns the normalised value or throws a 400.
const validators = {
  timezone: (value) => {
    const timezone = cleanText(value, 'Timezone', 64);
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw validationError(`"${timezone}" is not a valid timezone.`); }
    return timezone;
  },
  productionCycle: (value) => cleanText(value, 'Production cycle', 160, { allowEmpty: true }),
  defaultWeeklyTarget: (value) => {
    const target = Number(value);
    if (!Number.isFinite(target) || target < 1 || target > 10 || Math.round(target * 2) !== target * 2) {
      throw validationError('Weekly target must be between 1 and 10, in steps of 0.5.');
    }
    return target;
  },
  contentPillars: (value) => {
    if (!Array.isArray(value)) throw validationError('Content pillars must be a list.');
    const pillars = value.map((item) => cleanText(item, 'Pillar name', 120));
    if (!pillars.length) throw validationError('At least 1 content pillar must remain.');
    if (pillars.length > 30) throw validationError('A workspace can have at most 30 content pillars.');
    if (new Set(pillars.map((item) => item.toLowerCase())).size !== pillars.length) throw validationError('Content pillar names must be unique.');
    return pillars;
  },
  platforms: (value) => {
    if (!Array.isArray(value) || !value.length) throw validationError('At least 1 platform must stay active.');
    if (value.some((item) => !PLATFORM_OPTIONS.includes(item))) throw validationError('Unknown platform.');
    return PLATFORM_OPTIONS.filter((item) => value.includes(item));
  },
  aiModel: (value) => {
    if (!AI_MODEL_OPTIONS.includes(value)) throw validationError('Unknown AI model.');
    return value;
  },
  aiDefaultTone: (value) => cleanText(value, 'Default tone', 60, { allowEmpty: true }),
};

export async function getWorkspaceSettings(workspaceId, connection = pool) {
  const [rows] = await connection.execute('SELECT setting_key,setting_value FROM workspace_settings WHERE workspace_id=?', [workspaceId]);
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!Object.hasOwn(validators, row.setting_key)) continue;
    // mysql2 already decodes JSON columns, so a stored string arrives as a plain JS string.
    try { settings[row.setting_key] = validators[row.setting_key](row.setting_value); } catch { /* Ignore a stale value and keep the default. */ }
  }
  return settings;
}

async function hasPermission(workspaceId, roleId, permissionKey) {
  const [rows] = await pool.execute('SELECT 1 FROM role_permissions WHERE workspace_id=? AND role_id=? AND permission_key=? LIMIT 1', [workspaceId, roleId, permissionKey]);
  return rows.length > 0;
}

async function loadSettingsPayload(workspaceId, roleId) {
  const [[workspace]] = await pool.execute('SELECT name FROM workspaces WHERE id=? LIMIT 1', [workspaceId]);
  const settings = await getWorkspaceSettings(workspaceId);
  return {
    settings: { organizationName: workspace?.name || '', ...settings },
    options: { platforms: PLATFORM_OPTIONS, aiModels: AI_MODEL_OPTIONS },
    canManage: await hasPermission(workspaceId, roleId, 'settings.manage'),
  };
}

settingsRouter.get('/:workspaceId/settings', requireWorkspacePermission('content.read'), async (request, response, next) => {
  try {
    response.json(await loadSettingsPayload(request.params.workspaceId, request.workspaceMembership.role_id));
  } catch (error) { next(error); }
});

settingsRouter.patch('/:workspaceId/settings', requireWorkspacePermission('settings.manage'), async (request, response, next) => {
  const { workspaceId } = request.params;
  const body = request.body || {};
  const applyTargetToMembers = body.applyWeeklyTargetToMembers === true;
  let connection;
  try {
    const updates = {};
    for (const [key, value] of Object.entries(body)) {
      if (Object.hasOwn(validators, key)) updates[key] = validators[key](value);
    }
    const organizationName = Object.hasOwn(body, 'organizationName') ? cleanText(body.organizationName, 'Organization name', 160) : null;
    if (organizationName !== null && organizationName.length < 2) throw validationError('Organization name must be at least 2 characters.');
    if (!Object.keys(updates).length && organizationName === null) return response.status(400).json({ error: 'EMPTY_UPDATE', message: 'Nothing to save.' });

    connection = await pool.getConnection();
    await connection.beginTransaction();
    if (organizationName !== null) {
      await connection.execute('UPDATE workspaces SET name=? WHERE id=?', [organizationName, workspaceId]);
    }
    for (const [key, value] of Object.entries(updates)) {
      await connection.execute(
        `INSERT INTO workspace_settings (workspace_id,setting_key,setting_value,updated_by_user_id) VALUES (?,?,CAST(? AS JSON),?)
         ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by_user_id=VALUES(updated_by_user_id)`,
        [workspaceId, key, JSON.stringify(value), request.user.id]
      );
    }
    if (applyTargetToMembers && Object.hasOwn(updates, 'defaultWeeklyTarget')) {
      await connection.execute("UPDATE workspace_members SET weekly_target=? WHERE workspace_id=? AND status='active'", [updates.defaultWeeklyTarget, workspaceId]);
    }
    await connection.commit();
    response.json(await loadSettingsPayload(workspaceId, request.workspaceMembership.role_id));
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.code === 'VALIDATION_ERROR') return response.status(400).json({ error: error.code, message: error.message });
    next(error);
  } finally { connection?.release(); }
});

// Restores every stored setting to its default. The workspace name is kept.
settingsRouter.delete('/:workspaceId/settings', requireWorkspacePermission('settings.manage'), async (request, response, next) => {
  try {
    await pool.execute('DELETE FROM workspace_settings WHERE workspace_id=?', [request.params.workspaceId]);
    response.json(await loadSettingsPayload(request.params.workspaceId, request.workspaceMembership.role_id));
  } catch (error) { next(error); }
});

async function loadRoles(workspaceId) {
  const [roles] = await pool.execute('SELECT id,role_key,name FROM roles WHERE workspace_id=? ORDER BY created_at,name', [workspaceId]);
  const [grants] = await pool.execute('SELECT role_id,permission_key FROM role_permissions WHERE workspace_id=?', [workspaceId]);
  return roles.map((role) => ({
    id: role.id,
    key: role.role_key,
    name: role.name,
    locked: role.role_key === 'owner',
    permissions: MANAGED_PERMISSIONS.filter((key) => grants.some((grant) => grant.role_id === role.id && grant.permission_key === key)),
  }));
}

settingsRouter.get('/:workspaceId/settings/roles', requireWorkspacePermission('content.read'), async (request, response, next) => {
  try {
    response.json({ roles: await loadRoles(request.params.workspaceId), permissions: MANAGED_PERMISSIONS, currentRoleId: request.workspaceMembership.role_id });
  } catch (error) { next(error); }
});

settingsRouter.put('/:workspaceId/settings/roles/:roleId/permissions', requireWorkspacePermission('settings.manage'), async (request, response, next) => {
  const { workspaceId, roleId } = request.params;
  const requested = request.body?.permissions;
  if (!Array.isArray(requested) || requested.some((key) => !MANAGED_PERMISSIONS.includes(key))) {
    return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unknown permission.' });
  }
  // Prevent lock-outs: the owner role always keeps full access, and nobody edits their own role.
  if (roleId === request.workspaceMembership.role_id) {
    return response.status(403).json({ error: 'OWN_ROLE_LOCKED', message: 'You cannot change the permissions of your own role.' });
  }
  let connection;
  try {
    const [[role]] = await pool.execute('SELECT role_key FROM roles WHERE workspace_id=? AND id=? LIMIT 1', [workspaceId, roleId]);
    if (!role) return response.status(404).json({ error: 'ROLE_NOT_FOUND', message: 'Role not found.' });
    if (role.role_key === 'owner') return response.status(403).json({ error: 'OWNER_ROLE_LOCKED', message: 'The Owner role always has full access.' });
    // Only the owner role may grant workspace.manage.
    if (requested.includes('workspace.manage')) return response.status(403).json({ error: 'WORKSPACE_MANAGE_LOCKED', message: 'Only the Owner role can manage the workspace.' });

    const permissions = [...new Set(requested)];
    if (permissions.some((key) => key !== 'content.read') && !permissions.includes('content.read')) permissions.push('content.read');

    connection = await pool.getConnection();
    await connection.beginTransaction();
    for (const key of permissions) {
      await connection.execute('INSERT IGNORE INTO permissions (permission_key,description) VALUES (?,?)', [key, key.replace('.', ' ')]);
    }
    await connection.execute(
      `DELETE FROM role_permissions WHERE workspace_id=? AND role_id=? AND permission_key IN (${MANAGED_PERMISSIONS.map(() => '?').join(',')})`,
      [workspaceId, roleId, ...MANAGED_PERMISSIONS]
    );
    for (const key of permissions) {
      await connection.execute('INSERT INTO role_permissions (workspace_id,role_id,permission_key) VALUES (?,?,?)', [workspaceId, roleId, key]);
    }
    await connection.commit();
    response.json({ roles: await loadRoles(workspaceId), permissions: MANAGED_PERMISSIONS, currentRoleId: request.workspaceMembership.role_id });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    next(error);
  } finally { connection?.release(); }
});

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { hashToken } from '../security.js';
import { uniqueWorkspaceSlug } from '../slug.js';

export const workspaceRouter = Router();
const cookieName = 'uim_session';

function readToken(request) {
  const part = (request.headers.cookie || '').split(';').map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`));
  return part ? decodeURIComponent(part.slice(cookieName.length + 1)) : '';
}

async function authenticate(request, response, next) {
  const token = readToken(request);
  if (!token) return response.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.email, u.display_name AS name
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3) AND u.status = 'active' LIMIT 1`,
      [hashToken(token)]
    );
    if (!rows.length) return response.status(401).json({ error: 'UNAUTHENTICATED' });
    request.user = rows[0];
    next();
  } catch (error) { next(error); }
}

workspaceRouter.use(authenticate);

workspaceRouter.get('/', async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT w.id, w.slug, w.name, w.description, r.name AS role,
        (SELECT COUNT(*) FROM workspace_members m2 WHERE m2.workspace_id = w.id AND m2.status = 'active') AS member_count,
        (SELECT COUNT(*) FROM content_plans c WHERE c.workspace_id = w.id) AS content_count
       FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
       JOIN roles r ON r.workspace_id = m.workspace_id AND r.id = m.role_id
       WHERE m.user_id = ? AND m.status = 'active' ORDER BY w.updated_at DESC`,
      [request.user.id]
    );
    response.json({ workspaces: rows.map((row) => ({ ...row, memberCount: Number(row.member_count), contentCount: Number(row.content_count) })) });
  } catch (error) { next(error); }
});

workspaceRouter.post('/', async (request, response, next) => {
  const { name, description = '' } = request.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160 || typeof description !== 'string' || description.length > 2000) {
    return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Workspace name or description is invalid.' });
  }

  let connection;
  const workspaceId = randomUUID();
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const workspaceSlug = await uniqueWorkspaceSlug(connection, name.trim());
    await connection.execute('INSERT INTO workspaces (id, slug, name, description, owner_user_id) VALUES (?, ?, ?, ?, ?)', [workspaceId, workspaceSlug, name.trim(), description.trim() || null, request.user.id]);
    const roles = [
      ['owner', 'Owner'], ['manager', 'Workspace Manager'], ['coordinator', 'Creative Coordinator'], ['editor', 'Editor'],
    ];
    const roleIds = {};
    for (const [key, label] of roles) {
      const id = randomUUID(); roleIds[key] = id;
      await connection.execute('INSERT INTO roles (id, workspace_id, role_key, name, is_system) VALUES (?, ?, ?, ?, TRUE)', [id, workspaceId, key, label]);
    }
    const permissionKeys = ['workspace.manage', 'members.manage', 'content.read', 'content.write', 'media.manage', 'reviews.manage', 'publishing.manage', 'settings.manage'];
    for (const key of permissionKeys) await connection.execute('INSERT IGNORE INTO permissions (permission_key, description) VALUES (?, ?)', [key, key.replace('.', ' ')]);
    const grants = {
      owner: permissionKeys,
      manager: permissionKeys.filter((key) => key !== 'workspace.manage'),
      coordinator: ['content.read', 'content.write', 'media.manage', 'reviews.manage', 'publishing.manage'],
      editor: ['content.read', 'content.write', 'media.manage'],
    };
    for (const [key, keys] of Object.entries(grants)) {
      for (const permission of keys) await connection.execute('INSERT INTO role_permissions (workspace_id, role_id, permission_key) VALUES (?, ?, ?)', [workspaceId, roleIds[key], permission]);
    }
    await connection.execute('INSERT INTO workspace_members (workspace_id, user_id, role_id) VALUES (?, ?, ?)', [workspaceId, request.user.id, roleIds.owner]);
    const stages = [
      ['idea', 'Idea', '#94A3B8', false], ['production', 'In Production', '#3B82F6', false],
      ['review', 'Review', '#F59E0B', false], ['scheduled', 'Scheduled', '#8B5CF6', false], ['published', 'Published', '#10B981', true],
    ];
    const stageIds = [];
    for (let index = 0; index < stages.length; index += 1) {
      const [key, label, color, terminal] = stages[index]; const id = randomUUID(); stageIds.push(id);
      await connection.execute('INSERT INTO workflow_stages (id, workspace_id, stage_key, name, position, color, is_terminal) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, workspaceId, key, label, index, color, terminal]);
    }
    for (let index = 0; index < stageIds.length - 1; index += 1) {
      await connection.execute('INSERT INTO workflow_transitions (workspace_id, from_stage_id, to_stage_id, role_id) VALUES (?, ?, ?, ?)', [workspaceId, stageIds[index], stageIds[index + 1], roleIds.owner]);
    }
    await connection.commit();
    response.status(201).json({ workspace: { id: workspaceId, slug: workspaceSlug, name: name.trim(), description: description.trim(), role: 'Owner', memberCount: 1, contentCount: 0 } });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback(); next(error);
  } finally { connection?.release(); }
});

workspaceRouter.post('/join', async (request, response, next) => {
  const { inviteCode } = request.body || {};
  if (typeof inviteCode !== 'string' || inviteCode.length < 20 || inviteCode.length > 512) {
    return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Enter a valid workspace invite code.' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [invites] = await connection.execute(
      `SELECT id, workspace_id, role_id, invitee_email FROM workspace_invitations
       WHERE token_hash = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP(3) LIMIT 1 FOR UPDATE`,
      [hashToken(inviteCode)]
    );
    const invitation = invites[0];
    if (!invitation) { await connection.rollback(); return response.status(404).json({ error: 'INVITE_NOT_FOUND', message: 'Invitation is invalid or expired.' }); }
    if (invitation.invitee_email.toLowerCase() !== request.user.email.toLowerCase()) {
      await connection.rollback(); return response.status(403).json({ error: 'INVITE_EMAIL_MISMATCH', message: 'Sign in with the email address that received this invitation.' });
    }
    await connection.execute('INSERT INTO workspace_members (workspace_id, user_id, role_id) VALUES (?, ?, ?)', [invitation.workspace_id, request.user.id, invitation.role_id]);
    await connection.execute("UPDATE workspace_invitations SET status = 'accepted', accepted_by_user_id = ?, accepted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [request.user.id, invitation.id]);
    await connection.commit();
    const [rows] = await pool.execute('SELECT w.id, w.name, w.description, r.name AS role FROM workspaces w JOIN roles r ON r.workspace_id = w.id AND r.id = ? WHERE w.id = ?', [invitation.role_id, invitation.workspace_id]);
    response.status(201).json({ workspace: { ...rows[0], memberCount: 0, contentCount: 0 } });
  } catch (error) { if (connection.inTransaction) await connection.rollback(); next(error); }
  finally { connection?.release(); }
});

// Slugs are resolved only through the signed-in user's active workspace membership.
// UUID values are accepted here too so legacy links can be redirected to the canonical slug URL.
workspaceRouter.get('/slug/:workspaceSlug', async (request, response, next) => {
  try {
    const value = request.params.workspaceSlug;
    const [rows] = await pool.execute(
      `SELECT w.id,w.slug,w.name,w.description
       FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id
       WHERE (w.slug=? OR w.id=?) AND m.user_id=? AND m.status='active' LIMIT 1`,
      [value, value, request.user.id]
    );
    if (!rows.length) return response.status(404).json({ error: 'WORKSPACE_NOT_FOUND' });
    response.json({ workspace: rows[0] });
  } catch (error) { next(error); }
});

workspaceRouter.get('/slug/:workspaceSlug/content/:contentSlug', async (request, response, next) => {
  try {
    const workspaceValue = request.params.workspaceSlug;
    const contentValue = request.params.contentSlug;
    const [rows] = await pool.execute(
      `SELECT w.id AS workspace_id,w.slug AS workspace_slug,c.id AS content_id,c.slug AS content_slug
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? AND m.status='active'
       JOIN roles r ON r.workspace_id=m.workspace_id AND r.id=m.role_id
       JOIN role_permissions rp ON rp.workspace_id=r.workspace_id AND rp.role_id=r.id AND rp.permission_key='content.read'
       JOIN content_plans c ON c.workspace_id=w.id AND (c.slug=? OR c.id=?)
       WHERE (w.slug=? OR w.id=?) LIMIT 1`,
      [request.user.id, contentValue, contentValue, workspaceValue, workspaceValue]
    );
    if (!rows.length) return response.status(404).json({ error: 'CONTENT_NOT_FOUND' });
    response.json({ workspaceId: rows[0].workspace_id, workspaceSlug: rows[0].workspace_slug, contentId: rows[0].content_id, contentSlug: rows[0].content_slug });
  } catch (error) { next(error); }
});

workspaceRouter.get('/:workspaceId', async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT w.id, w.name, w.description, r.name AS role,
        (SELECT COUNT(*) FROM workspace_members m2 WHERE m2.workspace_id = w.id AND m2.status = 'active') AS member_count,
        (SELECT COUNT(*) FROM content_plans c WHERE c.workspace_id = w.id) AS content_count
       FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
       JOIN roles r ON r.workspace_id = m.workspace_id AND r.id = m.role_id
       WHERE m.workspace_id = ? AND m.user_id = ? AND m.status = 'active' LIMIT 1`,
      [request.params.workspaceId, request.user.id]
    );
    if (!rows.length) return response.status(404).json({ error: 'WORKSPACE_NOT_FOUND' });
    const row = rows[0]; response.json({ workspace: { ...row, memberCount: Number(row.member_count), contentCount: Number(row.content_count) } });
  } catch (error) { next(error); }
});

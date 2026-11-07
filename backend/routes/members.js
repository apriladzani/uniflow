import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateSession, requireWorkspacePermission } from '../middleware/workspaceAccess.js';

export const memberRouter = Router();
memberRouter.use(authenticateSession);

function serializeMember(row) {
  return {
    id: row.id, username: row.username, name: row.display_name, role: row.role_name,
    roleId: row.role_id, email: '', avatar: row.avatar_url || '',
    weeklyTarget: Number(row.weekly_target), active: row.status === 'active',
    totalPublishedCredits: Number(row.total_credits || 0), currentDebt: Number(row.current_debt || 0),
    previousDebt: Number(row.previous_debt || 0), debtHistory: row.debtHistory || [],
  };
}

async function listMembers(workspaceId) {
  const [rows] = await pool.execute(
    `SELECT u.id,u.username,u.display_name,u.avatar_url,m.role_id,r.name AS role_name,m.weekly_target,m.status,
      (SELECT COALESCE(SUM(cc.credits),0) FROM content_credits cc WHERE cc.workspace_id=m.workspace_id AND cc.user_id=m.user_id AND cc.status='awarded') AS total_credits,
      (SELECT cd.debt_after FROM content_debts cd WHERE cd.workspace_id=m.workspace_id AND cd.user_id=m.user_id ORDER BY cd.calculated_at DESC LIMIT 1) AS current_debt,
      (SELECT cd.debt_before FROM content_debts cd WHERE cd.workspace_id=m.workspace_id AND cd.user_id=m.user_id ORDER BY cd.calculated_at DESC LIMIT 1) AS previous_debt
     FROM workspace_members m JOIN users u ON u.id=m.user_id
     JOIN roles r ON r.workspace_id=m.workspace_id AND r.id=m.role_id
     WHERE m.workspace_id=? AND m.status IN ('active','suspended')
     ORDER BY u.display_name,u.username`,
    [workspaceId]
  );
  const [debtRows] = await pool.execute(
    `SELECT d.user_id,DATE_FORMAT(p.period_start,'%Y-%m-%d') AS period_start,
      DATE_FORMAT(p.period_end,'%Y-%m-%d') AS period_end,d.target_credits,d.earned_credits,d.debt_before,d.debt_after
     FROM content_debts d JOIN performance_periods p ON p.workspace_id=d.workspace_id AND p.id=d.period_id
     WHERE d.workspace_id=? ORDER BY d.calculated_at DESC LIMIT 500`,
    [workspaceId]
  );
  const historyByUser = new Map();
  for (const row of debtRows) {
    if (!historyByUser.has(row.user_id)) historyByUser.set(row.user_id, []);
    const history = historyByUser.get(row.user_id);
    if (history.length >= 12) continue;
    history.push({
      week: `${row.period_start} – ${row.period_end}`,
      target: Number(row.target_credits),
      credits: Number(row.earned_credits),
      debt: Number(row.debt_after),
    });
  }
  return rows.map((row) => serializeMember({ ...row, debtHistory: (historyByUser.get(row.id) || []).reverse() }));
}

async function listWeeklyCredits(workspaceId) {
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(DATE_SUB(DATE(cc.awarded_at), INTERVAL WEEKDAY(cc.awarded_at) DAY),'%Y-%m-%d') AS week_start,
      SUM(cc.credits) AS credits
     FROM content_credits cc JOIN content_plans c ON c.workspace_id=cc.workspace_id AND c.id=cc.content_id
     WHERE cc.workspace_id=? AND cc.status='awarded' AND cc.awarded_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 WEEK)
     GROUP BY week_start ORDER BY week_start`,
    [workspaceId]
  );
  return rows.map((row) => ({ weekStart: row.week_start, credits: Number(row.credits) }));
}

async function listCreditHistory(workspaceId) {
  const [rows] = await pool.execute(
    `SELECT cc.id,cc.content_id,cc.user_id,u.display_name AS user_name,c.title AS content_title,c.platform_key,
      cc.credits,cc.status,cc.awarded_at,COALESCE(p.published_url,c.published_url) AS published_url
     FROM content_credits cc
     JOIN content_plans c ON c.workspace_id=cc.workspace_id AND c.id=cc.content_id
     JOIN users u ON u.id=cc.user_id
     LEFT JOIN content_publications p ON p.workspace_id=cc.workspace_id AND p.id=cc.publication_id
     WHERE cc.workspace_id=? ORDER BY COALESCE(cc.awarded_at,cc.created_at) DESC LIMIT 250`,
    [workspaceId]
  );
  return rows.map((row) => ({
    id: row.id,
    contentId: row.content_id,
    contentTitle: row.content_title,
    userId: row.user_id,
    userName: row.user_name,
    platform: row.platform_key,
    credits: Number(row.credits),
    status: row.status,
    awardedAt: row.awarded_at ? String(row.awarded_at).replace('T', ' ').slice(0, 19) : '',
    publishedUrl: row.published_url || '',
  }));
}

async function getAssignableRoles(workspaceId, actorRoleId) {
  const [roles] = await pool.execute(
    `SELECT r.id,r.role_key,r.name FROM roles r WHERE r.workspace_id=?
     AND NOT EXISTS (
       SELECT 1 FROM role_permissions candidate
       WHERE candidate.workspace_id=r.workspace_id AND candidate.role_id=r.id
         AND NOT EXISTS (
           SELECT 1 FROM role_permissions actor_permission
           WHERE actor_permission.workspace_id=r.workspace_id AND actor_permission.role_id=?
             AND actor_permission.permission_key=candidate.permission_key
         )
     ) ORDER BY r.name`,
    [workspaceId, actorRoleId]
  );
  return roles;
}

memberRouter.get('/:workspaceId/members', requireWorkspacePermission('content.read'), async (request, response, next) => {
  try {
    const [members, weeklyCredits, creditHistory] = await Promise.all([
      listMembers(request.params.workspaceId),
      listWeeklyCredits(request.params.workspaceId),
      listCreditHistory(request.params.workspaceId),
    ]);
    response.json({ members, weeklyCredits, creditHistory });
  }
  catch (error) { next(error); }
});

memberRouter.get('/:workspaceId/member-roles', requireWorkspacePermission('members.manage'), async (request, response, next) => {
  try { response.json({ roles: await getAssignableRoles(request.params.workspaceId, request.workspaceMembership.role_id) }); }
  catch (error) { next(error); }
});

memberRouter.get('/:workspaceId/member-candidates', requireWorkspacePermission('members.manage'), async (request, response, next) => {
  const term = typeof request.query.q === 'string' ? request.query.q.trim().toLowerCase() : '';
  if (term.length < 2) return response.json({ users: [] });
  if (term.length > 40) return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Search query is too long.' });
  const escaped = term.replace(/[\\%_]/g, '\\$&') + '%';
  try {
    const [rows] = await pool.execute(
      `SELECT u.id,u.username,u.display_name,u.avatar_url FROM users u
       WHERE u.status='active' AND u.username LIKE ?
         AND NOT EXISTS (
           SELECT 1 FROM workspace_members existing
           WHERE existing.workspace_id=? AND existing.user_id=u.id AND existing.status IN ('active','suspended')
         )
       ORDER BY u.username LIMIT 10`,
      [escaped, request.params.workspaceId]
    );
    response.json({ users: rows.map((row) => ({
      id: row.id, username: row.username, name: row.display_name, avatar: row.avatar_url || '',
    })) });
  } catch (error) { next(error); }
});

memberRouter.post('/:workspaceId/members', requireWorkspacePermission('members.manage'), async (request, response, next) => {
  const { userId, roleId } = request.body || {};
  const weeklyTarget = Number(request.body?.weeklyTarget ?? 2);
  if (typeof userId !== 'string' || typeof roleId !== 'string' || !Number.isFinite(weeklyTarget) || weeklyTarget < 1 || weeklyTarget > 10) {
    return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Select a registered user, role, and weekly target from 1 to 10.' });
  }
  const workspaceId = request.params.workspaceId;
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [roles] = await connection.execute(
      `SELECT r.id FROM roles r WHERE r.workspace_id=? AND r.id=?
       AND NOT EXISTS (
         SELECT 1 FROM role_permissions candidate WHERE candidate.workspace_id=r.workspace_id AND candidate.role_id=r.id
           AND NOT EXISTS (
             SELECT 1 FROM role_permissions actor_permission WHERE actor_permission.workspace_id=r.workspace_id
               AND actor_permission.role_id=? AND actor_permission.permission_key=candidate.permission_key
           )
       ) LIMIT 1`,
      [workspaceId, roleId, request.workspaceMembership.role_id]
    );
    if (!roles.length) {
      await connection.rollback();
      return response.status(403).json({ error: 'ROLE_NOT_ASSIGNABLE', message: 'You cannot assign a role with permissions you do not have.' });
    }
    const [users] = await connection.execute("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1", [userId]);
    if (!users.length) {
      await connection.rollback();
      return response.status(404).json({ error: 'USER_NOT_FOUND', message: 'No active registered user was found.' });
    }
    const [existing] = await connection.execute(
      'SELECT status FROM workspace_members WHERE workspace_id=? AND user_id=? LIMIT 1 FOR UPDATE',
      [workspaceId, userId]
    );
    if (existing.length && existing[0].status !== 'left') {
      await connection.rollback();
      return response.status(409).json({ error: 'MEMBER_ALREADY_EXISTS', message: 'This user already belongs to the workspace.' });
    }
    if (existing.length) {
      await connection.execute("UPDATE workspace_members SET role_id=?,weekly_target=?,status='active' WHERE workspace_id=? AND user_id=?", [roleId, weeklyTarget, workspaceId, userId]);
    } else {
      await connection.execute('INSERT INTO workspace_members (workspace_id,user_id,role_id,weekly_target) VALUES (?,?,?,?)', [workspaceId, userId, roleId, weeklyTarget]);
    }
    await connection.commit();
    response.status(201).json({ members: await listMembers(workspaceId) });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'MEMBER_ALREADY_EXISTS', message: 'This user already belongs to the workspace.' });
    next(error);
  } finally { connection?.release(); }
});

memberRouter.patch('/:workspaceId/members/:memberId', requireWorkspacePermission('members.manage'), async (request, response, next) => {
  const { roleId, weeklyTarget, active } = request.body || {};
  const workspaceId = request.params.workspaceId;
  const memberId = request.params.memberId;
  if ((roleId != null && typeof roleId !== 'string')
    || (weeklyTarget != null && (!Number.isFinite(Number(weeklyTarget)) || Number(weeklyTarget) < 1 || Number(weeklyTarget) > 10))
    || (active != null && typeof active !== 'boolean')) {
    return response.status(400).json({ error: 'VALIDATION_ERROR', message: 'Member updates are invalid.' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [workspaceRows] = await connection.execute('SELECT owner_user_id FROM workspaces WHERE id=?', [workspaceId]);
    const [memberRows] = await connection.execute(
      'SELECT role_id,status,weekly_target FROM workspace_members WHERE workspace_id=? AND user_id=? LIMIT 1 FOR UPDATE',
      [workspaceId, memberId]
    );
    if (!memberRows.length) {
      await connection.rollback();
      return response.status(404).json({ error: 'MEMBER_NOT_FOUND' });
    }
    const nextRoleId = roleId || memberRows[0].role_id;
    if (memberId === workspaceRows[0]?.owner_user_id && (nextRoleId !== memberRows[0].role_id || active === false)) {
      await connection.rollback();
      return response.status(400).json({ error: 'OWNER_MEMBERSHIP_REQUIRED', message: 'The workspace owner membership cannot be removed or downgraded.' });
    }
    const [roles] = await connection.execute(
      `SELECT r.id FROM roles r WHERE r.workspace_id=? AND r.id=?
       AND NOT EXISTS (
         SELECT 1 FROM role_permissions candidate WHERE candidate.workspace_id=r.workspace_id AND candidate.role_id=r.id
           AND NOT EXISTS (
             SELECT 1 FROM role_permissions actor_permission WHERE actor_permission.workspace_id=r.workspace_id
               AND actor_permission.role_id=? AND actor_permission.permission_key=candidate.permission_key
           )
       ) LIMIT 1`,
      [workspaceId, nextRoleId, request.workspaceMembership.role_id]
    );
    if (!roles.length) {
      await connection.rollback();
      return response.status(403).json({ error: 'ROLE_NOT_ASSIGNABLE' });
    }
    await connection.execute(
      'UPDATE workspace_members SET role_id=?,weekly_target=?,status=? WHERE workspace_id=? AND user_id=?',
      [nextRoleId, Number(weeklyTarget ?? memberRows[0].weekly_target), active === false ? 'suspended' : 'active', workspaceId, memberId]
    );
    await connection.commit();
    response.json({ members: await listMembers(workspaceId) });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    next(error);
  } finally { connection?.release(); }
});

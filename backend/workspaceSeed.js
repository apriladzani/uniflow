import { randomUUID } from 'node:crypto';
import { uniqueWorkspaceSlug } from './slug.js';

/**
 * Inserts a workspace with its default roles, permissions, owner membership and workflow.
 * Runs inside the caller's transaction. Used by self-service creation and by platform admins.
 */
export async function createWorkspaceRecord(connection, { id = randomUUID(), name, description = '', ownerUserId }) {
  const workspaceId = id;
  const workspaceSlug = await uniqueWorkspaceSlug(connection, name);
  await connection.execute('INSERT INTO workspaces (id, slug, name, description, owner_user_id) VALUES (?, ?, ?, ?, ?)', [workspaceId, workspaceSlug, name, description || null, ownerUserId]);
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
  await connection.execute('INSERT INTO workspace_members (workspace_id, user_id, role_id) VALUES (?, ?, ?)', [workspaceId, ownerUserId, roleIds.owner]);
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
  return { id: workspaceId, slug: workspaceSlug, ownerRoleId: roleIds.owner };
}

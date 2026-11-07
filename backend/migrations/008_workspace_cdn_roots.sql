-- Keep one stable physical Kroombox root per UniFlow workspace.
-- Safe to re-run and additive: existing workspace, media, and scene rows remain intact.
CREATE TABLE IF NOT EXISTS workspace_cdn_roots (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cdn_folder_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  connected_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id),
  UNIQUE KEY uq_workspace_cdn_roots_folder (cdn_folder_id),
  CONSTRAINT fk_workspace_cdn_roots_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_cdn_roots_user FOREIGN KEY (workspace_id, connected_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reuse previously validated physical root mappings where they exist.
INSERT IGNORE INTO workspace_cdn_roots (workspace_id, cdn_folder_id, connected_by_user_id)
SELECT folder.workspace_id, folder.cdn_folder_id, workspace.owner_user_id
FROM media_folders AS folder
JOIN workspaces AS workspace ON workspace.id = folder.workspace_id
JOIN workspace_members AS owner_membership ON owner_membership.workspace_id = workspace.id AND owner_membership.user_id = workspace.owner_user_id
WHERE folder.identity_key = 'repository'
  AND folder.cdn_folder_id IS NOT NULL
  AND folder.cdn_folder_id <> ''
  AND (SELECT COUNT(*) FROM media_folders AS same_root WHERE same_root.identity_key='repository' AND same_root.cdn_folder_id=folder.cdn_folder_id) = 1;

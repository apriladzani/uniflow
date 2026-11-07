-- Add stable UniFlow folder identities and optional mappings to existing CDN folders.
SET @add_media_folder_identity = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_folders' AND COLUMN_NAME='identity_key') = 0,
  'ALTER TABLE media_folders ADD COLUMN identity_key VARCHAR(255) NULL AFTER name',
  'SELECT 1'
);
PREPARE add_media_folder_identity_stmt FROM @add_media_folder_identity;
EXECUTE add_media_folder_identity_stmt;
DEALLOCATE PREPARE add_media_folder_identity_stmt;

SET @add_media_folder_cdn_id = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_folders' AND COLUMN_NAME='cdn_folder_id') = 0,
  'ALTER TABLE media_folders ADD COLUMN cdn_folder_id VARCHAR(255) NULL AFTER identity_key',
  'SELECT 1'
);
PREPARE add_media_folder_cdn_id_stmt FROM @add_media_folder_cdn_id;
EXECUTE add_media_folder_cdn_id_stmt;
DEALLOCATE PREPARE add_media_folder_cdn_id_stmt;

SET @add_folder_parent_fk_index = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_folders' AND INDEX_NAME='idx_media_folders_parent_fk') = 0,
  'ALTER TABLE media_folders ADD KEY idx_media_folders_parent_fk (workspace_id, parent_folder_id)',
  'SELECT 1'
);
PREPARE add_folder_parent_fk_index_stmt FROM @add_folder_parent_fk_index;
EXECUTE add_folder_parent_fk_index_stmt;
DEALLOCATE PREPARE add_folder_parent_fk_index_stmt;

SET @drop_old_folder_name_index = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_folders' AND INDEX_NAME='uq_media_folders_parent_name') > 0,
  'ALTER TABLE media_folders DROP INDEX uq_media_folders_parent_name',
  'SELECT 1'
);
PREPARE drop_old_folder_name_index_stmt FROM @drop_old_folder_name_index;
EXECUTE drop_old_folder_name_index_stmt;
DEALLOCATE PREPARE drop_old_folder_name_index_stmt;

SET @add_folder_identity_index = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_folders' AND INDEX_NAME='uq_media_folders_identity') = 0,
  'ALTER TABLE media_folders ADD UNIQUE KEY uq_media_folders_identity (workspace_id, identity_key)',
  'SELECT 1'
);
PREPARE add_folder_identity_index_stmt FROM @add_folder_identity_index;
EXECUTE add_folder_identity_index_stmt;
DEALLOCATE PREPARE add_folder_identity_index_stmt;

SET @add_folder_parent_name_index = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_folders' AND INDEX_NAME='idx_media_folders_parent_name') = 0,
  'ALTER TABLE media_folders ADD KEY idx_media_folders_parent_name (workspace_id, parent_folder_id, name)',
  'SELECT 1'
);
PREPARE add_folder_parent_name_index_stmt FROM @add_folder_parent_name_index;
EXECUTE add_folder_parent_name_index_stmt;
DEALLOCATE PREPARE add_folder_parent_name_index_stmt;

SET @add_folder_cdn_index = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_folders' AND INDEX_NAME='idx_media_folders_cdn_id') = 0,
  'ALTER TABLE media_folders ADD KEY idx_media_folders_cdn_id (workspace_id, cdn_folder_id)',
  'SELECT 1'
);
PREPARE add_folder_cdn_index_stmt FROM @add_folder_cdn_index;
EXECUTE add_folder_cdn_index_stmt;
DEALLOCATE PREPARE add_folder_cdn_index_stmt;

CREATE TABLE IF NOT EXISTS storyboard_scene_media_links (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scene_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  footage_section ENUM('main_visual','a_roll','b_roll') NOT NULL,
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  linked_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, scene_id, footage_section, file_id),
  KEY idx_scene_media_file (workspace_id, file_id),
  CONSTRAINT fk_scene_media_scene FOREIGN KEY (workspace_id, scene_id) REFERENCES storyboard_scenes (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_scene_media_file FOREIGN KEY (workspace_id, file_id) REFERENCES repository_files (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_scene_media_linker FOREIGN KEY (workspace_id, linked_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

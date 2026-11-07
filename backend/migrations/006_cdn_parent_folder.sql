-- Keep the physical Kroombox parent folder ID separate from the UniFlow virtual folder relation.
SET @add_repository_file_cdn_parent = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='repository_files' AND COLUMN_NAME='cdn_parent_id') = 0,
  'ALTER TABLE repository_files ADD COLUMN cdn_parent_id VARCHAR(255) NULL AFTER storage_key',
  'SELECT 1'
);
PREPARE add_repository_file_cdn_parent_stmt FROM @add_repository_file_cdn_parent;
EXECUTE add_repository_file_cdn_parent_stmt;
DEALLOCATE PREPARE add_repository_file_cdn_parent_stmt;

SET @add_repository_file_cdn_parent_index = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='repository_files' AND INDEX_NAME='idx_repository_files_cdn_parent') = 0,
  'ALTER TABLE repository_files ADD KEY idx_repository_files_cdn_parent (workspace_id, cdn_parent_id)',
  'SELECT 1'
);
PREPARE add_repository_file_cdn_parent_index_stmt FROM @add_repository_file_cdn_parent_index;
EXECUTE add_repository_file_cdn_parent_index_stmt;
DEALLOCATE PREPARE add_repository_file_cdn_parent_index_stmt;

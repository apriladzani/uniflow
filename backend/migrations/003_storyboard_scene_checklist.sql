-- Add scene-level completion and assignment without rewriting existing scenes.
SET @has_completed = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'storyboard_scenes' AND COLUMN_NAME = 'is_completed'
);
SET @ddl = IF(@has_completed = 0,
  'ALTER TABLE storyboard_scenes ADD COLUMN is_completed BOOLEAN NOT NULL DEFAULT FALSE AFTER editor_notes',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @has_assignee = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'storyboard_scenes' AND COLUMN_NAME = 'assigned_to_user_id'
);
SET @ddl = IF(@has_assignee = 0,
  'ALTER TABLE storyboard_scenes ADD COLUMN assigned_to_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER is_completed, ADD KEY idx_storyboard_scenes_assignee (workspace_id, assigned_to_user_id)',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @has_constraint = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'storyboard_scenes'
    AND CONSTRAINT_NAME = 'fk_storyboard_scenes_assignee' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @ddl = IF(@has_constraint = 0,
  'ALTER TABLE storyboard_scenes ADD CONSTRAINT fk_storyboard_scenes_assignee FOREIGN KEY (workspace_id, assigned_to_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

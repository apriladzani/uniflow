-- Add a searchable, unique nickname to existing user accounts without
-- dropping columns or changing existing account credentials.
SET @uniflow_username_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'
);
SET @uniflow_username_ddl = IF(
  @uniflow_username_column = 0,
  'ALTER TABLE users ADD COLUMN username VARCHAR(40) NULL AFTER display_name',
  'SELECT 1'
);
PREPARE uniflow_username_stmt FROM @uniflow_username_ddl;
EXECUTE uniflow_username_stmt;
DEALLOCATE PREPARE uniflow_username_stmt;

UPDATE users
SET username = CONCAT('member_', LOWER(LEFT(REPLACE(id, '-', ''), 12)))
WHERE username IS NULL OR TRIM(username) = '';

SET @uniflow_username_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_username'
);
SET @uniflow_username_ddl = IF(
  @uniflow_username_index = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)',
  'SELECT 1'
);
PREPARE uniflow_username_stmt FROM @uniflow_username_ddl;
EXECUTE uniflow_username_stmt;
DEALLOCATE PREPARE uniflow_username_stmt;

SET @uniflow_username_nullable = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'username' AND IS_NULLABLE = 'YES'
);
SET @uniflow_username_ddl = IF(
  @uniflow_username_nullable > 0,
  'ALTER TABLE users MODIFY COLUMN username VARCHAR(40) NOT NULL',
  'SELECT 1'
);
PREPARE uniflow_username_stmt FROM @uniflow_username_ddl;
EXECUTE uniflow_username_stmt;
DEALLOCATE PREPARE uniflow_username_stmt;

-- Optional section direction and opaque media library references. Existing scenes remain valid.
SET @add_a_roll_direction = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scenes' AND COLUMN_NAME='a_roll_direction') = 0,
  'ALTER TABLE storyboard_scenes ADD COLUMN a_roll_direction TEXT NULL AFTER visual_direction',
  'SELECT 1'
);
PREPARE add_a_roll_direction_stmt FROM @add_a_roll_direction;
EXECUTE add_a_roll_direction_stmt;
DEALLOCATE PREPARE add_a_roll_direction_stmt;

SET @add_b_roll_direction = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scenes' AND COLUMN_NAME='b_roll_direction') = 0,
  'ALTER TABLE storyboard_scenes ADD COLUMN b_roll_direction TEXT NULL AFTER a_roll_direction',
  'SELECT 1'
);
PREPARE add_b_roll_direction_stmt FROM @add_b_roll_direction;
EXECUTE add_b_roll_direction_stmt;
DEALLOCATE PREPARE add_b_roll_direction_stmt;

SET @add_footage_references = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scenes' AND COLUMN_NAME='footage_references') = 0,
  'ALTER TABLE storyboard_scenes ADD COLUMN footage_references JSON NULL AFTER b_roll_direction',
  'SELECT 1'
);
PREPARE add_footage_references_stmt FROM @add_footage_references;
EXECUTE add_footage_references_stmt;
DEALLOCATE PREPARE add_footage_references_stmt;

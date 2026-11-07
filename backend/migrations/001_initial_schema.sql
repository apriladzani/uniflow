-- UniFlow initial schema.
-- Safe to re-run: this migration only creates missing tables and never alters,
-- drops, or inserts business/demo records. Run via `npm run migrate`.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  avatar_url VARCHAR(2048) NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  email_verified_at TIMESTAMP(3) NULL,
  last_login_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip_address VARBINARY(16) NULL,
  user_agent VARCHAR(500) NULL,
  PRIMARY KEY (token_hash),
  KEY idx_user_sessions_user_expiry (user_id, expires_at),
  KEY idx_user_sessions_expiry (expires_at),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspaces (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_workspaces_owner_created (owner_user_id, created_at),
  CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role_key VARCHAR(60) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_workspace_key (workspace_id, role_key),
  UNIQUE KEY uq_roles_workspace_id (workspace_id, id),
  CONSTRAINT fk_roles_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  permission_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  description VARCHAR(255) NOT NULL,
  PRIMARY KEY (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  permission_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (workspace_id, role_id, permission_key),
  KEY idx_role_permissions_permission (permission_key),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (workspace_id, role_id) REFERENCES roles (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_key) REFERENCES permissions (permission_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('active','suspended','left') NOT NULL DEFAULT 'active',
  weekly_target DECIMAL(6,2) NOT NULL DEFAULT 2.00,
  joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, user_id),
  KEY idx_workspace_members_user_status (user_id, status),
  KEY idx_workspace_members_role (workspace_id, role_id),
  CONSTRAINT fk_workspace_members_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_members_role FOREIGN KEY (workspace_id, role_id) REFERENCES roles (workspace_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  invitee_email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  invited_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  accepted_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  status ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  accepted_at TIMESTAMP(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workspace_invites_token (token_hash),
  KEY idx_workspace_invites_email_status (invitee_email, status),
  KEY idx_workspace_invites_workspace_status (workspace_id, status, expires_at),
  CONSTRAINT fk_workspace_invites_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_invites_role FOREIGN KEY (workspace_id, role_id) REFERENCES roles (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_workspace_invites_inviter FOREIGN KEY (workspace_id, invited_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_workspace_invites_acceptor FOREIGN KEY (workspace_id, accepted_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workflow_stages (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  stage_key VARCHAR(60) NOT NULL,
  name VARCHAR(100) NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  color CHAR(7) NULL,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workflow_stages_workspace_key (workspace_id, stage_key),
  UNIQUE KEY uq_workflow_stages_workspace_id (workspace_id, id),
  KEY idx_workflow_stages_order (workspace_id, is_active, position),
  CONSTRAINT fk_workflow_stages_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workflow_transitions (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  from_stage_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  to_stage_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (workspace_id, from_stage_id, to_stage_id, role_id),
  KEY idx_workflow_transitions_to (workspace_id, to_stage_id),
  CONSTRAINT fk_workflow_transitions_from FOREIGN KEY (workspace_id, from_stage_id) REFERENCES workflow_stages (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_transitions_to FOREIGN KEY (workspace_id, to_stage_id) REFERENCES workflow_stages (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_transitions_role FOREIGN KEY (workspace_id, role_id) REFERENCES roles (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_plans (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  platform_key VARCHAR(50) NOT NULL,
  format_key VARCHAR(80) NOT NULL,
  pillar VARCHAR(120) NULL,
  priority ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
  stage_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  assigned_to_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  target_publish_at DATETIME(3) NULL,
  actual_publish_at DATETIME(3) NULL,
  published_url VARCHAR(2048) NULL,
  verified_at TIMESTAMP(3) NULL,
  script_notes TEXT NULL,
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_content_plans_workspace_id (workspace_id, id),
  KEY idx_content_plans_calendar (workspace_id, target_publish_at, stage_id),
  KEY idx_content_plans_assignee (workspace_id, assigned_to_user_id, target_publish_at),
  KEY idx_content_plans_stage_updated (workspace_id, stage_id, updated_at),
  CONSTRAINT fk_content_plans_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_content_plans_stage FOREIGN KEY (workspace_id, stage_id) REFERENCES workflow_stages (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_content_plans_assignee FOREIGN KEY (workspace_id, assigned_to_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_content_plans_creator FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_calendar_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event_type ENUM('publish','shoot','edit','review','custom') NOT NULL,
  title VARCHAR(255) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NULL,
  notes TEXT NULL,
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calendar_workspace_id (workspace_id, id),
  KEY idx_calendar_workspace_start (workspace_id, starts_at),
  KEY idx_calendar_content (workspace_id, content_id, starts_at),
  CONSTRAINT fk_calendar_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_calendar_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_calendar_creator FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_contributors (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  contribution_role VARCHAR(80) NULL,
  credit_weight DECIMAL(6,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, content_id, user_id),
  KEY idx_content_contributors_user (workspace_id, user_id, content_id),
  CONSTRAINT fk_content_contributors_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_content_contributors_member FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS script_blocks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  block_index SMALLINT UNSIGNED NOT NULL,
  cue VARCHAR(255) NULL,
  visual TEXT NULL,
  audio TEXT NULL,
  duration_seconds DECIMAL(7,2) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_script_blocks_workspace_id (workspace_id, id),
  UNIQUE KEY uq_script_blocks_order (workspace_id, content_id, block_index),
  CONSTRAINT fk_script_blocks_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storyboards (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(255) NOT NULL,
  revision_number INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('draft','review','approved','archived') NOT NULL DEFAULT 'draft',
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_storyboards_workspace_id (workspace_id, id),
  UNIQUE KEY uq_storyboards_content (workspace_id, content_id),
  CONSTRAINT fk_storyboards_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_storyboards_creator FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storyboard_scenes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  storyboard_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scene_number SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  duration_seconds DECIMAL(7,2) NOT NULL DEFAULT 0,
  visual_direction TEXT NULL,
  voice_over TEXT NULL,
  on_screen_text TEXT NULL,
  camera_angle VARCHAR(80) NULL,
  transition_type VARCHAR(80) NULL,
  footage_ref VARCHAR(2048) NULL,
  editor_notes TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_scenes_workspace_id (workspace_id, id),
  UNIQUE KEY uq_scenes_storyboard_number (workspace_id, storyboard_id, scene_number),
  CONSTRAINT fk_scenes_storyboard FOREIGN KEY (workspace_id, storyboard_id) REFERENCES storyboards (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_tasks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(255) NOT NULL,
  assignee_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('todo','in_progress','done','blocked') NOT NULL DEFAULT 'todo',
  due_at DATETIME(3) NULL,
  position INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_tasks_workspace_id (workspace_id, id),
  KEY idx_production_tasks_assignee_due (workspace_id, assignee_user_id, status, due_at),
  KEY idx_production_tasks_content (workspace_id, content_id, position),
  CONSTRAINT fk_production_tasks_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_production_tasks_assignee FOREIGN KEY (workspace_id, assignee_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_production_tasks_creator FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_reviews (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  requested_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reviewer_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  status ENUM('pending','comment','needs_revision','approved','rejected') NOT NULL DEFAULT 'pending',
  revision_number INT UNSIGNED NOT NULL DEFAULT 1,
  requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at TIMESTAMP(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_content_reviews_workspace_id (workspace_id, id),
  KEY idx_content_reviews_status (workspace_id, status, requested_at),
  CONSTRAINT fk_content_reviews_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_content_reviews_requester FOREIGN KEY (workspace_id, requested_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_content_reviews_reviewer FOREIGN KEY (workspace_id, reviewer_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS review_comments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  review_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  author_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  comment_text TEXT NOT NULL,
  status ENUM('comment','needs_revision','approved') NOT NULL DEFAULT 'comment',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_review_comments_workspace_id (workspace_id, id),
  KEY idx_review_comments_review (workspace_id, review_id, created_at),
  CONSTRAINT fk_review_comments_review FOREIGN KEY (workspace_id, review_id) REFERENCES content_reviews (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_review_comments_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_review_comments_author FOREIGN KEY (workspace_id, author_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_revisions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  snapshot JSON NOT NULL,
  change_note TEXT NULL,
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_content_revisions_number (workspace_id, content_id, revision_number),
  KEY idx_content_revisions_creator (workspace_id, created_by_user_id, created_at),
  CONSTRAINT fk_content_revisions_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_content_revisions_creator FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS social_media_platforms (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  platform_key VARCHAR(50) NOT NULL,
  account_name VARCHAR(160) NULL,
  external_account_id VARCHAR(255) NULL,
  status ENUM('active','disabled','disconnected') NOT NULL DEFAULT 'active',
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_platforms_workspace_id (workspace_id, id),
  UNIQUE KEY uq_social_platform_account (workspace_id, platform_key, external_account_id),
  KEY idx_social_platform_status (workspace_id, status, platform_key),
  CONSTRAINT fk_social_platform_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_social_platform_creator FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_publications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  social_platform_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  platform_key VARCHAR(50) NOT NULL,
  status ENUM('scheduled','published','failed','verified') NOT NULL DEFAULT 'scheduled',
  scheduled_at DATETIME(3) NULL,
  published_at DATETIME(3) NULL,
  published_url VARCHAR(2048) NULL,
  verified_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  verified_at TIMESTAMP(3) NULL,
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_publications_workspace_id (workspace_id, id),
  KEY idx_publications_schedule (workspace_id, status, scheduled_at),
  KEY idx_publications_content (workspace_id, content_id, published_at),
  CONSTRAINT fk_publications_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_publications_platform FOREIGN KEY (workspace_id, social_platform_id) REFERENCES social_media_platforms (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_publications_verifier FOREIGN KEY (workspace_id, verified_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_publications_creator FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media_folders (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  parent_folder_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  name VARCHAR(160) NOT NULL,
  created_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_folders_workspace_id (workspace_id, id),
  UNIQUE KEY uq_media_folders_parent_name (workspace_id, parent_folder_id, name),
  CONSTRAINT fk_media_folders_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_media_folders_parent FOREIGN KEY (workspace_id, parent_folder_id) REFERENCES media_folders (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_media_folders_creator FOREIGN KEY (workspace_id, created_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS repository_files (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  folder_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  name VARCHAR(255) NOT NULL,
  media_type ENUM('video','audio','image','document','other') NOT NULL DEFAULT 'other',
  mime_type VARCHAR(150) NULL,
  size_bytes BIGINT UNSIGNED NULL,
  duration_seconds DECIMAL(9,2) NULL,
  width_px INT UNSIGNED NULL,
  height_px INT UNSIGNED NULL,
  storage_provider VARCHAR(80) NULL,
  storage_key VARCHAR(1024) NULL,
  url VARCHAR(2048) NULL,
  thumbnail_url VARCHAR(2048) NULL,
  uploaded_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_repository_files_workspace_id (workspace_id, id),
  KEY idx_repository_files_folder (workspace_id, folder_id, created_at),
  KEY idx_repository_files_type (workspace_id, media_type, created_at),
  KEY idx_repository_files_uploader (workspace_id, uploaded_by_user_id, created_at),
  CONSTRAINT fk_repository_files_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_repository_files_folder FOREIGN KEY (workspace_id, folder_id) REFERENCES media_folders (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_repository_files_uploader FOREIGN KEY (workspace_id, uploaded_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_media_links (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attached_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, content_id, file_id),
  KEY idx_content_media_file (workspace_id, file_id),
  CONSTRAINT fk_content_media_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_content_media_file FOREIGN KEY (workspace_id, file_id) REFERENCES repository_files (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_content_media_attacher FOREIGN KEY (workspace_id, attached_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS performance_periods (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  closed_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  closed_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_performance_period_dates (workspace_id, period_start, period_end),
  UNIQUE KEY uq_performance_period_workspace_id (workspace_id, id),
  KEY idx_performance_period_status (workspace_id, status, period_start),
  CONSTRAINT fk_performance_period_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_performance_period_closer FOREIGN KEY (workspace_id, closed_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_performance (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  period_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  weekly_target DECIMAL(7,2) NOT NULL DEFAULT 0,
  eligible_credits DECIMAL(7,2) NOT NULL DEFAULT 0,
  previous_debt DECIMAL(7,2) NOT NULL DEFAULT 0,
  current_debt DECIMAL(7,2) NOT NULL DEFAULT 0,
  achievement_rate DECIMAL(7,2) NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, period_id, user_id),
  KEY idx_team_performance_user (workspace_id, user_id, period_id),
  CONSTRAINT fk_team_performance_period FOREIGN KEY (workspace_id, period_id) REFERENCES performance_periods (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_team_performance_member FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_credits (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  publication_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  credits DECIMAL(7,2) NOT NULL DEFAULT 1.00,
  status ENUM('pending','awarded','revoked') NOT NULL DEFAULT 'pending',
  awarded_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  awarded_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_content_credits_workspace_id (workspace_id, id),
  UNIQUE KEY uq_content_credit_publication_user (workspace_id, publication_id, user_id),
  KEY idx_content_credits_member_status (workspace_id, user_id, status, awarded_at),
  CONSTRAINT fk_content_credits_content FOREIGN KEY (workspace_id, content_id) REFERENCES content_plans (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_content_credits_member FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_content_credits_publication FOREIGN KEY (workspace_id, publication_id) REFERENCES content_publications (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_content_credits_awarder FOREIGN KEY (workspace_id, awarded_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_debts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  period_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  target_credits DECIMAL(7,2) NOT NULL DEFAULT 0,
  earned_credits DECIMAL(7,2) NOT NULL DEFAULT 0,
  debt_before DECIMAL(7,2) NOT NULL DEFAULT 0,
  debt_after DECIMAL(7,2) NOT NULL DEFAULT 0,
  calculated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_content_debts_workspace_id (workspace_id, id),
  UNIQUE KEY uq_content_debt_period_member (workspace_id, period_id, user_id),
  KEY idx_content_debts_member_date (workspace_id, user_id, calculated_at),
  CONSTRAINT fk_content_debts_period FOREIGN KEY (workspace_id, period_id) REFERENCES performance_periods (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_content_debts_member FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  actor_name VARCHAR(120) NOT NULL,
  action VARCHAR(500) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  metadata JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_activity_logs_workspace_created (workspace_id, created_at),
  KEY idx_activity_logs_entity (workspace_id, entity_type, entity_id),
  KEY idx_activity_logs_actor (workspace_id, actor_user_id, created_at),
  CONSTRAINT fk_activity_logs_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_logs_actor FOREIGN KEY (workspace_id, actor_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  setting_key VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  setting_value JSON NOT NULL,
  updated_by_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, setting_key),
  CONSTRAINT fk_workspace_settings_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_settings_updater FOREIGN KEY (workspace_id, updated_by_user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Persist upload attempt state so retries can resume MySQL metadata writes without
-- creating another CDN asset.
CREATE TABLE IF NOT EXISTS media_upload_requests (
  workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  state ENUM('uploading','accepted','complete','retryable') NOT NULL DEFAULT 'uploading',
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(255) NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  cdn_file_id VARCHAR(255) NULL,
  response_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, idempotency_key),
  KEY idx_media_upload_requests_state (workspace_id, state, updated_at),
  CONSTRAINT fk_media_upload_requests_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

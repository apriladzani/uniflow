import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD, DB_NAME } = process.env;

export const requiredCmsTables = [
  'schema_migrations', 'users', 'user_sessions', 'workspaces', 'roles', 'permissions',
  'role_permissions', 'workspace_members', 'workspace_invitations', 'workflow_stages',
  'workflow_transitions', 'content_plans', 'content_calendar_events', 'content_contributors',
  'script_blocks', 'storyboards', 'storyboard_scenes', 'production_tasks', 'content_reviews',
  'review_comments', 'content_revisions', 'social_media_platforms', 'content_publications',
  'media_folders', 'repository_files', 'content_media_links', 'storyboard_scene_media_links', 'media_upload_requests', 'workspace_cdn_roots', 'performance_periods',
  'team_performance', 'content_credits', 'content_debts', 'activity_logs', 'workspace_settings', 'password_reset_otps',
];

export const databaseConfigured = Boolean(DB_HOST && DB_USER && DB_NAME);

export const pool = databaseConfigured
  ? mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      // Keep MySQL DATE/DATETIME values as-is; converting DATETIME to JS Date
      // shifts date-only values across days in UTC+ timezones.
      dateStrings: true,
    })
  : null;

export async function getSchemaStatus() {
  if (!pool) {
    return { connected: false, ready: false, tableCount: 0, missingTables: requiredCmsTables };
  }

  const [rows] = await pool.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  const tableNames = new Set(rows.map((row) => row.TABLE_NAME));
  const missingTables = requiredCmsTables.filter((table) => !tableNames.has(table));
  const [usernameRows] = await pool.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['users', 'username']
  );
  const missingColumns = usernameRows.length ? [] : ['users.username'];

  const [[cdnParentColumn]] = await pool.query(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='repository_files' AND COLUMN_NAME='cdn_parent_id'"
  );
  if (Number(cdnParentColumn.count) !== 1) missingColumns.push('repository_files.cdn_parent_id');

  const [[sceneColumns]] = await pool.query(
    `SELECT COUNT(DISTINCT COLUMN_NAME) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scenes'
       AND COLUMN_NAME IN ('is_completed','assigned_to_user_id')`
  );
  if (Number(sceneColumns.count) !== 2) missingColumns.push('storyboard_scenes.is_completed', 'storyboard_scenes.assigned_to_user_id');

  const [[googleSubColumn]] = await pool.query(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='google_sub'"
  );
  if (Number(googleSubColumn.count) !== 1) missingColumns.push('users.google_sub');

  const [[resetTokenColumn]] = await pool.query(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='password_reset_otps' AND COLUMN_NAME='reset_token_hash'"
  );
  if (Number(resetTokenColumn.count) !== 1) missingColumns.push('password_reset_otps.reset_token_hash');
  return {
    connected: true,
    ready: missingTables.length === 0 && missingColumns.length === 0,
    tableCount: tableNames.size,
    missingTables,
    missingColumns,
  };
}

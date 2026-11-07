import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { slugify } from './slug.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

const expectedDatabase = 'uniflow';
const migrationVersion = '001_initial_schema';
const migrationPath = new URL('./migrations/001_initial_schema.sql', import.meta.url);
const usernameMigrationVersion = '002_usernames';
const usernameMigrationPath = new URL('./migrations/002_usernames.sql', import.meta.url);
const storyboardMigrationVersion = '003_storyboard_scene_checklist';
const storyboardMigrationPath = new URL('./migrations/003_storyboard_scene_checklist.sql', import.meta.url);
const footageMigrationVersion = '004_storyboard_section_footage';
const footageMigrationPath = new URL('./migrations/004_storyboard_section_footage.sql', import.meta.url);
const virtualMediaMigrationVersion = '005_storyboard_virtual_media_folders';
const virtualMediaMigrationPath = new URL('./migrations/005_storyboard_virtual_media_folders.sql', import.meta.url);
const cdnParentMigrationVersion = '006_cdn_parent_folder';
const cdnParentMigrationPath = new URL('./migrations/006_cdn_parent_folder.sql', import.meta.url);
const uploadIdempotencyMigrationVersion = '007_media_upload_idempotency';
const uploadIdempotencyMigrationPath = new URL('./migrations/007_media_upload_idempotency.sql', import.meta.url);
const workspaceCdnRootsMigrationVersion = '008_workspace_cdn_roots';
const workspaceCdnRootsMigrationPath = new URL('./migrations/008_workspace_cdn_roots.sql', import.meta.url);
const publicationCreditsMigrationVersion = '009_verified_publication_credits';
const publicationCreditsMigrationPath = new URL('./migrations/009_verified_publication_credits.sql', import.meta.url);
const slugRoutingMigrationVersion = '010_slug_routing';
const slugRoutingMigrationPath = new URL('./migrations/010_slug_routing.sql', import.meta.url);
const userProfileMigrationVersion = '011_user_profile';
// Additive profile columns on `users`; each one is added only if it is missing.
const userProfileColumns = [
  ['nickname', 'VARCHAR(60) NULL AFTER username'],
  ['phone', 'VARCHAR(20) NULL AFTER nickname'],
  ['bio', 'VARCHAR(500) NULL AFTER phone'],
  ['avatar_image', 'MEDIUMBLOB NULL AFTER avatar_url'],
  ['avatar_mime', 'VARCHAR(30) NULL AFTER avatar_image'],
];
const googleAuthMigrationVersion = '012_google_auth';
const passwordResetMigrationVersion = '013_password_reset_otps';
const passwordResetTokenMigrationVersion = '014_password_reset_tokens';
const expectedTables = [
  'schema_migrations', 'users', 'user_sessions', 'workspaces', 'roles', 'permissions',
  'role_permissions', 'workspace_members', 'workspace_invitations', 'workflow_stages',
  'workflow_transitions', 'content_plans', 'content_calendar_events', 'content_contributors',
  'script_blocks', 'storyboards', 'storyboard_scenes', 'production_tasks', 'content_reviews',
  'review_comments', 'content_revisions', 'social_media_platforms', 'content_publications',
  'media_folders', 'repository_files', 'content_media_links', 'performance_periods',
  'team_performance', 'content_credits', 'content_debts', 'activity_logs', 'workspace_settings',
];

if (process.env.DB_NAME !== expectedDatabase) {
  throw new Error(`Refusing to migrate: DB_NAME must be ${expectedDatabase}.`);
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 8000,
  charset: 'utf8mb4',
});

let lockAcquired = false;
let backfilledVerifiedPublications = 0;
let backfilledContentCredits = 0;
try {
  const [[identity]] = await connection.query('SELECT DATABASE() AS selectedDatabase');
  if (identity.selectedDatabase !== expectedDatabase) {
    throw new Error(`Refusing to migrate: MySQL selected ${identity.selectedDatabase || '(none)'}.`);
  }

  const [[lock]] = await connection.query('SELECT GET_LOCK(?, 15) AS acquired', ['uniflow_schema_migrations']);
  if (Number(lock.acquired) !== 1) throw new Error('Could not acquire the schema migration lock.');
  lockAcquired = true;

  const [beforeRows] = await connection.query('SHOW TABLES');
  const tablesBefore = new Set(beforeRows.map((row) => String(Object.values(row)[0])));
  const sql = await readFile(migrationPath, 'utf8');
  const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
  const expectedColumnsByTable = new Map();
  const createTablePattern = /CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE=/gi;
  const columnPattern = /^([a-z][a-z0-9_]*)\s+(?:CHAR|VARCHAR|ENUM|TEXT|LONGTEXT|BIGINT|INT|SMALLINT|DECIMAL|DATETIME|TIMESTAMP|BOOLEAN|DATE|JSON|VARBINARY)\b/i;
  for (const match of sql.matchAll(createTablePattern)) {
    const columns = new Set();
    for (const line of match[2].split('\n')) {
      const column = line.trim().match(columnPattern);
      if (column) columns.add(column[1]);
    }
    expectedColumnsByTable.set(match[1], columns);
  }

  for (const statement of statements) {
    await connection.query(statement);
  }

  const [afterRows] = await connection.query('SHOW TABLES');
  const tablesAfter = new Set(afterRows.map((row) => String(Object.values(row)[0])));
  const missingTables = expectedTables.filter((table) => !tablesAfter.has(table));
  if (missingTables.length) {
    throw new Error(`Migration incomplete; missing tables: ${missingTables.join(', ')}.`);
  }

  const [columnRows] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`
  );
  const columnsByTable = new Map();
  for (const row of columnRows) {
    if (!columnsByTable.has(row.TABLE_NAME)) columnsByTable.set(row.TABLE_NAME, new Set());
    columnsByTable.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }
  const missingColumns = [];
  for (const [table, expectedColumns] of expectedColumnsByTable) {
    for (const column of expectedColumns) {
      if (!columnsByTable.get(table)?.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }
  if (missingColumns.length) {
    throw new Error(`Migration did not modify existing tables; required columns are missing: ${missingColumns.join(', ')}.`);
  }

  const [[usernameMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1',
    [usernameMigrationVersion]
  );
  if (!usernameMigration) {
    const usernameSql = await readFile(usernameMigrationPath, 'utf8');
    for (const statement of usernameSql.split(';').map((item) => item.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    const [[usernameColumn]] = await connection.execute(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['users', 'username']
    );
    const [[usernameIndex]] = await connection.execute(
      'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
      ['users', 'uq_users_username']
    );
    if (!usernameColumn || !usernameIndex) throw new Error('Username migration incomplete.');
    await connection.execute(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      [usernameMigrationVersion, 'Unique usernames for registered accounts']
    );
  }

  const [[storyboardMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1',
    [storyboardMigrationVersion]
  );
  if (!storyboardMigration) {
    const storyboardSql = await readFile(storyboardMigrationPath, 'utf8');
    for (const statement of storyboardSql.split(';').map((item) => item.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    const [sceneColumns] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scenes' AND COLUMN_NAME IN ('is_completed','assigned_to_user_id')"
    );
    const [[assigneeConstraint]] = await connection.execute(
      "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scenes' AND CONSTRAINT_NAME='fk_storyboard_scenes_assignee' AND CONSTRAINT_TYPE='FOREIGN KEY' LIMIT 1"
    );
    if (sceneColumns.length !== 2 || !assigneeConstraint) throw new Error('Storyboard checklist migration incomplete.');
    await connection.execute(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      [storyboardMigrationVersion, 'Storyboard scene assignment and completion checklist']
    );
  }

  const [[footageMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [footageMigrationVersion]
  );
  if (!footageMigration) {
    const footageSql = await readFile(footageMigrationPath, 'utf8');
    for (const statement of footageSql.split(';').map((item) => item.trim()).filter(Boolean)) await connection.query(statement);
    const [footageColumns] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scenes' AND COLUMN_NAME IN ('a_roll_direction','b_roll_direction','footage_references')"
    );
    if (footageColumns.length !== 3) throw new Error('Storyboard section footage migration incomplete.');
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [footageMigrationVersion, 'Optional footage references for storyboard sections']);
  }

  const [[virtualMediaMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [virtualMediaMigrationVersion]
  );
  if (!virtualMediaMigration) {
    const virtualMediaSql = await readFile(virtualMediaMigrationPath, 'utf8');
    for (const statement of virtualMediaSql.split(';').map((item) => item.trim()).filter(Boolean)) await connection.query(statement);
    const [folderColumns] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_folders' AND COLUMN_NAME IN ('identity_key','cdn_folder_id')"
    );
    const [[sceneMediaTable]] = await connection.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scene_media_links'"
    );
    const [sceneMediaConstraints] = await connection.execute(
      "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='storyboard_scene_media_links' AND CONSTRAINT_TYPE='FOREIGN KEY'"
    );
    if (folderColumns.length !== 2 || !sceneMediaTable || sceneMediaConstraints.length !== 3) throw new Error('Storyboard virtual media folder migration incomplete.');
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [virtualMediaMigrationVersion, 'Virtual media folders and per-scene CDN file links']);
  }

  const [[cdnParentMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [cdnParentMigrationVersion]
  );
  if (!cdnParentMigration) {
    const cdnParentSql = await readFile(cdnParentMigrationPath, 'utf8');
    for (const statement of cdnParentSql.split(';').map((item) => item.trim()).filter(Boolean)) await connection.query(statement);
    const [cdnParentColumns] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='repository_files' AND COLUMN_NAME='cdn_parent_id'"
    );
    const [[cdnParentIndex]] = await connection.execute(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='repository_files' AND INDEX_NAME='idx_repository_files_cdn_parent' LIMIT 1"
    );
    if (cdnParentColumns.length !== 1 || !cdnParentIndex) throw new Error('CDN physical parent folder migration incomplete.');
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [cdnParentMigrationVersion, 'Physical Kroombox parent folder IDs on repository files']);
  }

  const [[uploadIdempotencyMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [uploadIdempotencyMigrationVersion]
  );
  if (!uploadIdempotencyMigration) {
    const uploadSql = await readFile(uploadIdempotencyMigrationPath, 'utf8');
    for (const statement of uploadSql.split(';').map((item) => item.trim()).filter(Boolean)) await connection.query(statement);
    const [[attemptTable]] = await connection.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='media_upload_requests' LIMIT 1"
    );
    if (!attemptTable) throw new Error('Media upload idempotency migration incomplete.');
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [uploadIdempotencyMigrationVersion, 'Idempotent CDN media upload attempts']);
  }

  const [[workspaceCdnRootsMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [workspaceCdnRootsMigrationVersion]
  );
  if (!workspaceCdnRootsMigration) {
    const rootsSql = await readFile(workspaceCdnRootsMigrationPath, 'utf8');
    for (const statement of rootsSql.split(';').map((item) => item.trim()).filter(Boolean)) await connection.query(statement);
    const [[rootsTable]] = await connection.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workspace_cdn_roots' LIMIT 1"
    );
    const [[rootsIndex]] = await connection.execute(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workspace_cdn_roots' AND INDEX_NAME='uq_workspace_cdn_roots_folder' LIMIT 1"
    );
    if (!rootsTable || !rootsIndex) throw new Error('Workspace CDN root migration incomplete.');
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [workspaceCdnRootsMigrationVersion, 'Workspace scoped Kroombox root folder mappings']);
  }

  const [[publicationCreditsMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [publicationCreditsMigrationVersion]
  );
  if (!publicationCreditsMigration) {
    const publicationCreditsSql = await readFile(publicationCreditsMigrationPath, 'utf8');
    for (const statement of publicationCreditsSql.split(';').map((item) => item.trim()).filter(Boolean)) {
      const [result] = await connection.query(statement);
      if (statement.includes('INSERT INTO content_publications')) backfilledVerifiedPublications += Number(result.affectedRows || 0);
      if (statement.includes('INSERT IGNORE INTO content_credits')) backfilledContentCredits += Number(result.affectedRows || 0);
    }
    const [[publicationCreditCheck]] = await connection.execute(
      `SELECT COUNT(*) AS count FROM content_plans c
       JOIN workflow_stages s ON s.workspace_id=c.workspace_id AND s.id=c.stage_id AND s.stage_key='published'
       JOIN content_contributors contributor ON contributor.workspace_id=c.workspace_id AND contributor.content_id=c.id AND contributor.credit_weight>0
       WHERE c.actual_publish_at IS NOT NULL AND c.published_url IS NOT NULL AND c.verified_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM content_credits cc WHERE cc.workspace_id=c.workspace_id AND cc.content_id=c.id AND cc.user_id=contributor.user_id)`
    );
    if (Number(publicationCreditCheck.count) > 0) throw new Error('Verified publication credit migration incomplete.');
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [publicationCreditsMigrationVersion, 'Awards credit weights for verified published content']);
  }

  const [[slugRoutingMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [slugRoutingMigrationVersion]
  );
  if (!slugRoutingMigration) {
    const slugSql = await readFile(slugRoutingMigrationPath, 'utf8');
    for (const statement of slugSql.split(';').map((item) => item.trim()).filter((item) => item && !item.startsWith('--'))) {
      await connection.query(statement);
    }
    const ensureSlugColumn = async (table) => {
      const [[column]] = await connection.execute(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=\'slug\' LIMIT 1', [table]
      );
      if (!column) await connection.query(`ALTER TABLE ${table} ADD COLUMN slug VARCHAR(160) CHARACTER SET ascii COLLATE ascii_general_ci NULL`);
    };
    await ensureSlugColumn('workspaces');
    await ensureSlugColumn('content_plans');

    const backfillSlugs = async (table, keyColumn, rows, workspaceId = null) => {
      const taken = new Set(rows.map((row) => row.slug).filter(Boolean));
      for (const row of rows) {
        if (row.slug) continue;
        const base = slugify(row.name);
        let candidate = base;
        let suffix = 2;
        while (taken.has(candidate)) candidate = `${base}-${suffix++}`;
        taken.add(candidate);
        if (workspaceId === null) await connection.execute(`UPDATE ${table} SET slug=? WHERE ${keyColumn}=?`, [candidate, row.id]);
        else await connection.execute(`UPDATE ${table} SET slug=? WHERE workspace_id=? AND ${keyColumn}=?`, [candidate, workspaceId, row.id]);
      }
    };
    const [workspaceRows] = await connection.query('SELECT id,name,slug FROM workspaces ORDER BY created_at,id');
    await backfillSlugs('workspaces', 'id', workspaceRows);
    const [contentRows] = await connection.query('SELECT id,workspace_id,title AS name,slug FROM content_plans ORDER BY workspace_id,created_at,id');
    for (const workspaceId of [...new Set(contentRows.map((row) => row.workspace_id))]) {
      await backfillSlugs('content_plans', 'id', contentRows.filter((row) => row.workspace_id === workspaceId), workspaceId);
    }

    const ensureIndex = async (table, indexName, columns) => {
      const [[index]] = await connection.execute(
        'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? LIMIT 1', [table, indexName]
      );
      if (!index) await connection.query(`CREATE UNIQUE INDEX ${indexName} ON ${table} (${columns})`);
    };
    await connection.query('ALTER TABLE workspaces MODIFY slug VARCHAR(160) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL');
    await connection.query('ALTER TABLE content_plans MODIFY slug VARCHAR(160) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL');
    await ensureIndex('workspaces', 'uq_workspaces_slug', 'slug');
    await ensureIndex('content_plans', 'uq_content_plans_workspace_slug', 'workspace_id,slug');
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [slugRoutingMigrationVersion, 'Stable workspace and content URL slugs']);
  }

  const [[userProfileMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [userProfileMigrationVersion]
  );
  if (!userProfileMigration) {
    for (const [column, definition] of userProfileColumns) {
      const [[existing]] = await connection.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME=? LIMIT 1", [column]
      );
      if (!existing) await connection.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
    }
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [userProfileMigrationVersion, 'User profile fields and stored avatars']);
  }

  const [[googleAuthMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [googleAuthMigrationVersion]
  );
  if (!googleAuthMigration) {
    const [[googleSubColumn]] = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='google_sub' LIMIT 1"
    );
    if (!googleSubColumn) await connection.query('ALTER TABLE users ADD COLUMN google_sub VARCHAR(255) NULL AFTER email');
    const [[googleSubIndex]] = await connection.query(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='uq_users_google_sub' LIMIT 1"
    );
    if (!googleSubIndex) await connection.query('ALTER TABLE users ADD UNIQUE KEY uq_users_google_sub (google_sub)');
    // Accounts created through Google have no password.
    await connection.query('ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL');
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [googleAuthMigrationVersion, 'Google sign-in identity on users']);
  }

  const [[passwordResetMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [passwordResetMigrationVersion]
  );
  if (!passwordResetMigration) {
    await connection.query(`CREATE TABLE IF NOT EXISTS password_reset_otps (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      expires_at TIMESTAMP(3) NOT NULL,
      consumed_at TIMESTAMP(3) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_password_reset_otps_user_created (user_id, created_at),
      CONSTRAINT fk_password_reset_otps_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [passwordResetMigrationVersion, 'Password reset one-time codes']);
  }

  const [[passwordResetTokenMigration]] = await connection.execute(
    'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [passwordResetTokenMigrationVersion]
  );
  if (!passwordResetTokenMigration) {
    const [[tokenColumn]] = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='password_reset_otps' AND COLUMN_NAME='reset_token_hash' LIMIT 1"
    );
    if (!tokenColumn) {
      await connection.query(`ALTER TABLE password_reset_otps
        ADD COLUMN reset_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER consumed_at,
        ADD COLUMN reset_token_expires_at TIMESTAMP(3) NULL AFTER reset_token_hash,
        ADD UNIQUE KEY uq_password_reset_otps_token (reset_token_hash)`);
    }
    await connection.execute('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [passwordResetTokenMigrationVersion, 'Separate password reset step after code verification']);
  }

  const [[fkCountRow]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'`
  );
  const foreignKeyCount = Number(fkCountRow.count);
  if (foreignKeyCount < 35) throw new Error(`Expected workspace and entity foreign keys; found ${foreignKeyCount}.`);

  await connection.execute(
    'INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
    [migrationVersion, 'UniFlow initial schema']
  );

  const createdTables = expectedTables.filter((table) => !tablesBefore.has(table));
  const existingTables = expectedTables.filter((table) => tablesBefore.has(table));
  console.log(JSON.stringify({
    databaseVerified: identity.selectedDatabase,
    createdTables,
    existingTablesBeforeMigrations: existingTables,
    additiveExistingTableChanges: ['users.username (unique, non-null)', 'workspaces.slug (unique, non-null)', 'content_plans.slug (unique per workspace, non-null)', 'storyboard_scenes.is_completed', 'storyboard_scenes.assigned_to_user_id + workspace member foreign key', 'media_folders.identity_key + cdn_folder_id and indexes', 'repository_files.cdn_parent_id', 'users profile columns (nickname, phone, bio, avatar_image, avatar_mime)'],
    additiveTablesCreated: ['storyboard_scene_media_links', 'media_upload_requests', 'workspace_cdn_roots'],
    totalCmsTables: expectedTables.length + 3,
    foreignKeyCount,
    migrationRecorded: [migrationVersion, usernameMigrationVersion, storyboardMigrationVersion, footageMigrationVersion, virtualMediaMigrationVersion, cdnParentMigrationVersion, uploadIdempotencyMigrationVersion, workspaceCdnRootsMigrationVersion, publicationCreditsMigrationVersion, slugRoutingMigrationVersion, userProfileMigrationVersion, googleAuthMigrationVersion, passwordResetMigrationVersion, passwordResetTokenMigrationVersion],
    usernameColumnAdded: true,
    backfilledVerifiedPublications,
    backfilledContentCredits,
    businessRecordsInserted: backfilledVerifiedPublications + backfilledContentCredits,
  }, null, 2));
} finally {
  if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', ['uniflow_schema_migrations']);
  await connection.end();
}

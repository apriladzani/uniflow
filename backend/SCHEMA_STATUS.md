# UniFlow schema design and migration status

## Target and safety

The migration target was verified: `DB_NAME` and `SELECT DATABASE()` both resolved to `uniflow`. The initial migration creates missing tables with `CREATE TABLE IF NOT EXISTS`. Follow-up migrations are additive and versioned; none drops tables or data. The separate `uni_inside` database was not used or changed.

Migration file: [`migrations/001_initial_schema.sql`](./migrations/001_initial_schema.sql)

Follow-up migration `014_password_reset_tokens` (inline in `migrate.js`) adds `reset_token_hash` and `reset_token_expires_at` to `password_reset_otps`; a verified code yields a short-lived token that sets the new password.

Follow-up migration `013_password_reset_otps` (inline in `migrate.js`) adds `password_reset_otps`, which stores hashed one-time codes for password reset.

Follow-up migration `012_google_auth` (inline in `migrate.js`) adds a unique, nullable `users.google_sub` and makes `users.password_hash` nullable for accounts created through Google.

Follow-up migration: [`migrations/002_usernames.sql`](./migrations/002_usernames.sql) adds a unique, non-null `users.username`; existing accounts receive a generated `member_<id-prefix>` handle. This does not insert user or business records.

Follow-up migration: [`migrations/003_storyboard_scene_checklist.sql`](./migrations/003_storyboard_scene_checklist.sql) adds nullable scene assignment and a `is_completed` flag to `storyboard_scenes`, plus a workspace-member foreign key. Existing scene rows are preserved and default to incomplete/unassigned.

Follow-up migration: [`migrations/004_storyboard_section_footage.sql`](./migrations/004_storyboard_section_footage.sql) adds optional A-Roll/B-Roll directions and independent nullable footage reference slots for Main Visual, A-Roll, and B-Roll. References are opaque Media Library identifiers; no CDN upload or URL is created.

Follow-up migration: [`migrations/005_storyboard_virtual_media_folders.sql`](./migrations/005_storyboard_virtual_media_folders.sql) adds stable virtual folder identities and optional Kroombox folder ID mappings, plus `storyboard_scene_media_links` for section-specific links to existing repository files. Removing a scene footage link only removes this local relationship; it does not delete the CDN file.

Follow-up migration: [`migrations/006_cdn_parent_folder.sql`](./migrations/006_cdn_parent_folder.sql) stores the physical Kroombox parent folder ID separately on each repository file, keeping it distinct from the UniFlow virtual-folder relationship.

Follow-up migration: [`migrations/008_workspace_cdn_roots.sql`](./migrations/008_workspace_cdn_roots.sql) adds one stable physical CDN root mapping per workspace. The root folder ID is unique across workspaces, and previously validated repository-root mappings are reused when unambiguous. Kroombox does not document a physical folder-creation operation, so new workspaces connect an existing CDN folder through Media Library.

Follow-up migration: [`migrations/009_verified_publication_credits.sql`](./migrations/009_verified_publication_credits.sql) creates missing verified publication and awarded credit records for already-published content with a live URL, publication date, verification timestamp, and positive contributor credit weights. It leaves existing credit rows and values unchanged. New publication writes create the publication and credit rows in the same content transaction; each contributor receives their stored `credit_weight` once per content.

## Tables and relationships

| Area | Tables | Main relationships |
| --- | --- | --- |
| Authentication | `users`, `user_sessions` | Sessions reference users and expire independently. Session cookie tokens are stored as hashes. |
| Workspace access | `workspaces`, `workspace_cdn_roots`, `workspace_members`, `workspace_invitations`, `roles`, `permissions`, `role_permissions` | A user can belong to many workspaces. Each workspace maps to at most one physical CDN root, and a root cannot be shared across workspaces. Membership uses `(workspace_id, user_id)` as its primary key and points to a workspace-scoped role. |
| Workflow | `workflow_stages`, `workflow_transitions` | Stages and permitted transitions belong to one workspace; content references a stage in the same workspace. |
| Planning and calendar | `content_plans`, `content_calendar_events`, `content_contributors`, `script_blocks` | Plans belong to a workspace; calendar events, contributors, and script blocks reference plans using composite workspace-aware foreign keys. |
| Storyboards and production | `storyboards`, `storyboard_scenes`, `production_tasks` | Storyboards attach to plans, scenes attach to storyboards, and tasks attach to plans and workspace members. |
| Reviews and publishing | `content_reviews`, `review_comments`, `content_revisions`, `content_publications`, `social_media_platforms` | Reviewers, comment authors, publishers, and platform accounts are constrained to the same workspace as their content. Revisions preserve a JSON content snapshot. |
| Media | `media_folders`, `repository_files`, `content_media_links` | Folders can nest within their workspace; files belong to folders and contributors; content-file links cannot cross workspaces. |
| Performance and credits | `performance_periods`, `team_performance`, `content_credits`, `content_debts` | Period snapshots, credits, and debt entries reference workspace members and content in the same workspace. |
| Audit and settings | `activity_logs`, `workspace_settings` | Both are workspace-scoped; settings use a `(workspace_id, setting_key)` primary key. |
| Migration tracking | `schema_migrations` | Stores applied migration versions only. |

`users`, `permissions`, and `schema_migrations` are global tables. Every business table owned by a workspace has a `workspace_id`. Composite foreign keys enforce tenant boundaries for child rows, assignees, reviewers, and membership roles.

All primary entity IDs use UUID strings. Memberships, role permissions, calendar dates, content stages, file folders, user sessions, and performance periods have dedicated composite or lookup indexes. Foreign keys use restrictive deletes for nullable workspace references where `SET NULL` would incorrectly null the required `workspace_id`.

## Created by migration

The migration created 32 tables: `schema_migrations`, `users`, `user_sessions`, `workspaces`, `roles`, `permissions`, `role_permissions`, `workspace_members`, `workspace_invitations`, `workflow_stages`, `workflow_transitions`, `content_plans`, `content_calendar_events`, `content_contributors`, `script_blocks`, `storyboards`, `storyboard_scenes`, `production_tasks`, `content_reviews`, `review_comments`, `content_revisions`, `social_media_platforms`, `content_publications`, `media_folders`, `repository_files`, `content_media_links`, `performance_periods`, `team_performance`, `content_credits`, `content_debts`, `activity_logs`, and `workspace_settings`.

Migration verification found 76 foreign keys and all 35 tables/required columns. Migrations through `009_verified_publication_credits` are applied to `uniflow`. Existing verified Published content was backfilled using each contributor's stored credit weight; existing credit values were not changed. No content or workspace records were copied from another database.

## API integration status

Authentication and workspace access are the first integrated modules. The API exposes account registration, sign-in, sign-out, session lookup, membership-filtered workspace listing and detail, invitation acceptance, and workspace creation. Passwords use Node.js `scrypt`; browser sessions use opaque HTTP-only, SameSite cookies while only SHA-256 session-token hashes are stored in MySQL. SQL uses prepared statements, and workspace detail/list access requires an active membership.

Workspace creation transactionally establishes the owner's workspace-scoped roles, permission assignments, and default workflow stages/transitions. These rows are created only in response to an explicit user workspace-creation request. There are no seeded accounts, workspaces, content, or demo business records.

The frontend sign-in/sign-up/session bootstrap and workspace selection/create/join flows use the API. Last workspace selection remains in localStorage for this prototype. Content CRUD and publishing are integrated through workspace-scoped APIs backed by `content_plans`, `content_contributors`, and `content_publications`; verified publication credits are stored in `content_credits` using contributor credit weights. Member totals, weekly earned credits, and the credit history returned to Dashboard and Performance are queried from awarded credit rows. Storyboard scenes, including legacy script segments, scene assignment, and completion state, are persisted through the workspace-scoped content API. Content review comments also use the workspace API.

The health endpoint was verified against `uniflow` (`databaseConnected: true`, `schemaReady: true`, 32 tables). Browser/API end-to-end checks covered sign-up, workspace creation, content create/edit/delete persistence after refresh, workspace isolation, registered-user lookup, member creation/duplicate rejection, and member persistence after refresh. Temporary test accounts and workspaces were removed after verification. Workspace-management permission rejection was also verified for an Editor account.

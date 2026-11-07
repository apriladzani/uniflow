import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateSession, requireWorkspacePermission } from '../middleware/workspaceAccess.js';
import { uniqueContentSlug } from '../slug.js';

export const contentRouter = Router();
contentRouter.use(authenticateSession);

const stages = {
  Planning: ['planning', 'Planning', '#94A3B8'],
  Scripting: ['scripting', 'Scripting', '#6366F1'],
  Shooting: ['shooting', 'Shooting', '#3B82F6'],
  Editing: ['editing', 'Editing', '#0EA5E9'],
  Review: ['review', 'Review', '#F59E0B'],
  Revision: ['revision', 'Revision', '#F97316'],
  Approved: ['approved', 'Approved', '#8B5CF6'],
  Scheduled: ['scheduled', 'Scheduled', '#A855F7'],
  Published: ['published', 'Published', '#10B981'],
};
const priorities = new Set(['Low', 'Medium', 'High']);
// MySQL is configured with dateStrings:true. Keep DATE/DATETIME values as the
// database returned them; converting through JS Date/UTC changes calendar days.
const dateOnly = (value) => value ? String(value).slice(0, 10) : '';
const dateTime = (value) => value ? String(value).replace('T', ' ').replace(/Z$/, '').slice(0, 23) : '';
const calendarDateTime = (value) => value ? `${value} 00:00:00` : null;
const isCalendarDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= monthLengths[month - 1];
};

function serialize(row, contributorIds) {
  return {
    id: row.id, workspaceId: row.workspace_id, slug: row.slug, title: row.title, description: row.description || '', platform: row.platform_key,
    format: row.format_key, pillar: row.pillar || '', priority: row.priority,
    status: stages[row.stage_key]?.[1] || row.stage_name || 'Planning',
    picId: row.assigned_to_user_id || '', contributorIds,
    targetPublishDate: dateOnly(row.target_publish_at), actualPublishDate: dateTime(row.actual_publish_at),
    publishedUrl: row.published_url || '', verifiedAt: dateTime(row.verified_at), scriptNotes: row.script_notes || '',
    scenes: [], scriptBlocks: [], tasks: [], reviewComments: [], attachedAssetIds: [],
    createdAt: dateTime(row.created_at), updatedAt: dateTime(row.updated_at),
  };
}

async function loadStudio(connection, workspaceId, contentId) {
  const [scriptRows] = await connection.execute('SELECT id,cue,visual,audio,duration_seconds FROM script_blocks WHERE workspace_id=? AND content_id=? ORDER BY block_index', [workspaceId, contentId]);
  const [sceneRows] = await connection.execute(
    `SELECT s.id,s.scene_number,s.title,s.duration_seconds,s.visual_direction,s.a_roll_direction,s.b_roll_direction,s.footage_references,s.voice_over,s.on_screen_text,s.camera_angle,s.transition_type,s.footage_ref,s.editor_notes,s.is_completed,s.assigned_to_user_id
     FROM storyboard_scenes s JOIN storyboards b ON b.workspace_id=s.workspace_id AND b.id=s.storyboard_id
     WHERE s.workspace_id=? AND b.content_id=? ORDER BY s.scene_number`, [workspaceId, contentId]);
  const [taskRows] = await connection.execute('SELECT id,title,assignee_user_id,status,due_at FROM production_tasks WHERE workspace_id=? AND content_id=? ORDER BY position,created_at', [workspaceId, contentId]);
  const [reviewRows] = await connection.execute(
    `SELECT c.id,c.content_id,c.author_user_id,c.comment_text,c.status,c.created_at,u.display_name,u.avatar_url
     FROM review_comments c JOIN users u ON u.id=c.author_user_id WHERE c.workspace_id=? AND c.content_id=? ORDER BY c.created_at DESC`, [workspaceId, contentId]);
  const [mediaRows] = await connection.execute('SELECT file_id FROM content_media_links WHERE workspace_id=? AND content_id=? ORDER BY created_at,file_id', [workspaceId, contentId]);
  const [sceneMediaRows] = await connection.execute(
    `SELECT l.scene_id,l.footage_section,f.id AS repository_file_id,f.storage_key AS cdn_file_id,f.name,f.mime_type,f.size_bytes,f.url
     FROM storyboard_scene_media_links l JOIN repository_files f ON f.workspace_id=l.workspace_id AND f.id=l.file_id
     JOIN storyboard_scenes s ON s.workspace_id=l.workspace_id AND s.id=l.scene_id
     JOIN storyboards b ON b.workspace_id=s.workspace_id AND b.id=s.storyboard_id
     WHERE l.workspace_id=? AND b.content_id=? ORDER BY l.created_at,f.name`, [workspaceId, contentId]);
  const sceneAssets = new Map();
  for (const row of sceneMediaRows) {
    if (!sceneAssets.has(row.scene_id)) sceneAssets.set(row.scene_id, { mainVisual: [], aRoll: [], bRoll: [] });
    const section = row.footage_section === 'main_visual' ? 'mainVisual' : row.footage_section === 'a_roll' ? 'aRoll' : 'bRoll';
    sceneAssets.get(row.scene_id)[section].push({ id: row.repository_file_id, cdnFileId: row.cdn_file_id, name: row.name, mimeType: row.mime_type || '', sizeBytes: Number(row.size_bytes || 0), url: row.url || '' });
  }
  const scenes = sceneRows.map((row) => ({ id: row.id, sceneNumber: Number(row.scene_number), title: row.title, durationSeconds: Number(row.duration_seconds), visualDirection: row.visual_direction || '', aRollDirection: row.a_roll_direction || '', bRollDirection: row.b_roll_direction || '', footageReferences: row.footage_references ? (typeof row.footage_references === 'string' ? JSON.parse(row.footage_references) : row.footage_references) : {}, footageAssets: sceneAssets.get(row.id) || { mainVisual: [], aRoll: [], bRoll: [] }, voiceOver: row.voice_over || '', onScreenText: row.on_screen_text || '', cameraAngle: row.camera_angle || 'Medium Shot', transition: row.transition_type || 'Cut', footageRef: row.footage_ref || '', editorNotes: row.editor_notes || '', isCompleted: Boolean(row.is_completed), assignedMemberId: row.assigned_to_user_id || '' }));
  for (const [index, block] of scriptRows.entries()) {
    if (scenes[index]) {
      scenes[index].title ||= block.cue || `Scene ${index + 1}`;
      scenes[index].visualDirection ||= block.visual || '';
      scenes[index].voiceOver ||= block.audio || '';
      if (!scenes[index].durationSeconds) scenes[index].durationSeconds = Number(block.duration_seconds || 0);
    } else {
      scenes.push({ id: `legacy-script-${block.id}`, sceneNumber: index + 1, title: block.cue || `Scene ${index + 1}`, durationSeconds: Number(block.duration_seconds || 0), visualDirection: block.visual || '', voiceOver: block.audio || '', onScreenText: '', cameraAngle: 'Medium Shot', transition: 'Cut', footageRef: '', editorNotes: '', isCompleted: false, assignedMemberId: '' });
    }
  }
  return {
    // Legacy script_blocks are represented as storyboard scenes above. They are migrated
    // into storyboard_scenes the next time the user saves the unified storyboard.
    scriptBlocks: [],
    scenes,
    tasks: taskRows.map((row) => ({ id: row.id, contentId, title: row.title, assigneeId: row.assignee_user_id || '', completed: row.status === 'done', dueDate: row.due_at ? dateOnly(row.due_at) : '' })),
    reviewComments: reviewRows.map((row) => ({ id: row.id, contentId, authorId: row.author_user_id, authorName: row.display_name, authorAvatar: row.avatar_url || '', text: row.comment_text, status: ({ comment: 'Comment', needs_revision: 'Needs Revision', approved: 'Approved' })[row.status], createdAt: dateTime(row.created_at) })),
    attachedAssetIds: mediaRows.map((row) => row.file_id),
  };
}

async function saveStudio(connection, workspaceId, contentId, actorId, body) {
  const [contents] = await connection.execute('SELECT id,title FROM content_plans WHERE workspace_id=? AND id=? LIMIT 1', [workspaceId, contentId]);
  if (!contents.length) return false;
  const hasScenes = Object.hasOwn(body, 'scenes');
  const hasScripts = Object.hasOwn(body, 'scriptBlocks');
  const hasTasks = Object.hasOwn(body, 'tasks');
  const hasReviews = Object.hasOwn(body, 'reviewComments');
  for (const [key, present] of [['scenes', hasScenes], ['scriptBlocks', hasScripts], ['tasks', hasTasks], ['reviewComments', hasReviews]]) {
    if (present && !Array.isArray(body[key])) {
      const error = new Error(`${key} must be an array.`); error.status = 400; error.code = 'INVALID_STUDIO_DATA'; throw error;
    }
  }
  const sceneList = hasScenes ? body.scenes : [];
  const scriptList = hasScripts ? body.scriptBlocks : [];
  const taskList = hasTasks ? body.tasks : [];
  const reviewList = hasReviews ? body.reviewComments : [];
  const memberIds = new Set([
    ...(hasScenes ? sceneList.map((item) => item.assignedMemberId).filter(Boolean) : []),
    ...(hasTasks ? taskList.map((item) => item.assigneeId).filter(Boolean) : []),
    ...(hasReviews ? reviewList.map((item) => item.authorId).filter(Boolean) : []),
  ]);
  if (memberIds.size) {
    const [validMembers] = await connection.execute(
      `SELECT user_id FROM workspace_members WHERE workspace_id=? AND status='active' AND user_id IN (${Array.from(memberIds).map(() => '?').join(',')})`,
      [workspaceId, ...memberIds]
    );
    if (validMembers.length !== memberIds.size) { const error = new Error('Assignees and review authors must be active workspace members.'); error.status = 400; error.code = 'INVALID_WORKSPACE_MEMBER'; throw error; }
  }

  if (hasScripts) {
    await connection.execute('DELETE FROM script_blocks WHERE workspace_id=? AND content_id=?', [workspaceId, contentId]);
    for (const [index, item] of scriptList.entries()) {
      await connection.execute('INSERT INTO script_blocks (id,workspace_id,content_id,block_index,cue,visual,audio,duration_seconds) VALUES (?,?,?,?,?,?,?,?)', [randomUUID(), workspaceId, contentId, index, item.cue || null, item.visual || null, item.audio || null, Number(item.durationSec || 0)]);
    }
  }

  let [boards] = await connection.execute('SELECT id FROM storyboards WHERE workspace_id=? AND content_id=? LIMIT 1', [workspaceId, contentId]);
  let storyboardId = boards[0]?.id;
  if (hasScenes && !storyboardId && sceneList.length) {
    storyboardId = randomUUID();
    await connection.execute('INSERT INTO storyboards (id,workspace_id,content_id,title,created_by_user_id) VALUES (?,?,?,?,?)', [storyboardId, workspaceId, contentId, contents[0].title, actorId]);
  }
  if (hasScenes && storyboardId) {
    if (sceneList.length > 65535) { const error = new Error('A storyboard cannot contain more than 65,535 scenes.'); error.status = 400; error.code = 'SCENE_LIMIT_EXCEEDED'; throw error; }
    const [existingScenes] = await connection.execute('SELECT id,scene_number FROM storyboard_scenes WHERE workspace_id=? AND storyboard_id=?', [workspaceId, storyboardId]);
    const existingById = new Map(existingScenes.map((scene) => [scene.id, scene]));
    const retainedIds = new Set(sceneList.map((item) => item.id).filter((id) => existingById.has(id)));
    const removedIds = existingScenes.filter((scene) => !retainedIds.has(scene.id)).map((scene) => scene.id);
    if (removedIds.length) await connection.execute(`DELETE FROM storyboard_scenes WHERE workspace_id=? AND id IN (${removedIds.map(() => '?').join(',')})`, [workspaceId, ...removedIds]);
    const remaining = existingScenes.filter((scene) => retainedIds.has(scene.id));
    const occupied = new Set(existingScenes.map((scene) => Number(scene.scene_number)));
    const temporaryNumbers = [];
    for (let number = 65535; number >= 1 && temporaryNumbers.length < remaining.length; number -= 1) {
      if (!occupied.has(number)) temporaryNumbers.push(number);
    }
    if (temporaryNumbers.length < remaining.length) { const error = new Error('Could not safely reorder storyboard scenes.'); error.status = 409; error.code = 'SCENE_ORDER_CONFLICT'; throw error; }
    for (const [index, scene] of remaining.entries()) await connection.execute('UPDATE storyboard_scenes SET scene_number=? WHERE workspace_id=? AND id=?', [temporaryNumbers[index], workspaceId, scene.id]);

    const usedSceneIds = new Set();
    for (const [index, item] of sceneList.entries()) {
      const existingId = existingById.has(item.id) && !usedSceneIds.has(item.id) ? item.id : '';
      const sceneId = existingId || randomUUID();
      usedSceneIds.add(sceneId);
      const footageReferences = item.footageReferences && typeof item.footageReferences === 'object' ? JSON.stringify({ mainVisual: item.footageReferences.mainVisual || null, aRoll: item.footageReferences.aRoll || null, bRoll: item.footageReferences.bRoll || null }) : null;
      const values = [index + 1, String(item.title || '').slice(0, 255), Number(item.durationSeconds || 0), item.visualDirection || null, item.aRollDirection || null, item.bRollDirection || null, footageReferences, item.voiceOver || null, item.onScreenText || null, item.cameraAngle || null, item.transition || null, item.footageRef || null, item.editorNotes || null, Boolean(item.isCompleted), item.assignedMemberId || null];
      if (existingId) {
        await connection.execute('UPDATE storyboard_scenes SET scene_number=?,title=?,duration_seconds=?,visual_direction=?,a_roll_direction=?,b_roll_direction=?,footage_references=?,voice_over=?,on_screen_text=?,camera_angle=?,transition_type=?,footage_ref=?,editor_notes=?,is_completed=?,assigned_to_user_id=? WHERE workspace_id=? AND id=?', [...values, workspaceId, sceneId]);
      } else {
        await connection.execute('INSERT INTO storyboard_scenes (id,workspace_id,storyboard_id,scene_number,title,duration_seconds,visual_direction,a_roll_direction,b_roll_direction,footage_references,voice_over,on_screen_text,camera_angle,transition_type,footage_ref,editor_notes,is_completed,assigned_to_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [sceneId, workspaceId, storyboardId, ...values]);
      }
    }
  }

  if (hasTasks) {
    await connection.execute('DELETE FROM production_tasks WHERE workspace_id=? AND content_id=?', [workspaceId, contentId]);
    for (const [index, item] of taskList.entries()) {
      await connection.execute('INSERT INTO production_tasks (id,workspace_id,content_id,title,assignee_user_id,created_by_user_id,status,due_at,position) VALUES (?,?,?,?,?,?,?,?,?)', [randomUUID(), workspaceId, contentId, String(item.title || '').slice(0, 255), item.assigneeId || null, actorId, item.completed ? 'done' : 'todo', item.dueDate ? `${item.dueDate} 00:00:00` : null, index]);
    }
  }

  if (hasReviews) {
    await connection.execute('DELETE FROM content_reviews WHERE workspace_id=? AND content_id=?', [workspaceId, contentId]);
    for (const item of reviewList) {
      const reviewId = randomUUID();
      const status = item.status === 'Approved' ? 'approved' : item.status === 'Needs Revision' ? 'needs_revision' : 'comment';
      await connection.execute('INSERT INTO content_reviews (id,workspace_id,content_id,requested_by_user_id,reviewer_user_id,status,resolved_at) VALUES (?,?,?,?,?,?,?)', [reviewId, workspaceId, contentId, item.authorId || actorId, item.authorId || actorId, status, status === 'comment' ? null : new Date()]);
      await connection.execute('INSERT INTO review_comments (id,workspace_id,review_id,content_id,author_user_id,comment_text,status) VALUES (?,?,?,?,?,?,?)', [randomUUID(), workspaceId, reviewId, contentId, item.authorId || actorId, String(item.text || ''), status]);
    }
  }
  return true;
}

function validate(body) {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 255) return 'Title is required and must be at most 255 characters.';
  if (typeof body.description !== 'string' || body.description.length > 60000) return 'Description is invalid.';
  if (typeof body.platform !== 'string' || !body.platform.trim() || body.platform.trim().length > 50) return 'Platform is invalid.';
  if (typeof body.format !== 'string' || !body.format.trim() || body.format.trim().length > 80) return 'Format is invalid.';
  if (typeof body.pillar !== 'string' || body.pillar.length > 120) return 'Pillar is invalid.';
  if (!priorities.has(body.priority)) return 'Priority is invalid.';
  if (!Object.hasOwn(stages, body.status)) return 'Production stage is invalid.';
  if (body.picId != null && typeof body.picId !== 'string') return 'PIC is invalid.';
  if (!Array.isArray(body.contributorIds) || body.contributorIds.some((id) => typeof id !== 'string') || new Set(body.contributorIds).size !== body.contributorIds.length) return 'Contributors are invalid.';
  if (body.targetPublishDate && !isCalendarDate(body.targetPublishDate)) return 'Target publish date must be a valid YYYY-MM-DD calendar date.';
  if (body.actualPublishDate && !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(body.actualPublishDate)) return 'Actual publish date is invalid.';
  if (body.publishedUrl && (typeof body.publishedUrl !== 'string' || body.publishedUrl.length > 2048)) return 'Published URL is invalid.';
  if (body.scriptNotes != null && (typeof body.scriptNotes !== 'string' || body.scriptNotes.length > 60000)) return 'Script notes are invalid.';
  return '';
}

function publicationVerificationError(body) {
  if (body.status !== 'Published') return '';
  if (!body.publishedUrl || !/^https?:\/\//i.test(body.publishedUrl)
    || !body.actualPublishDate || !body.verifiedAt || !Array.isArray(body.contributorIds) || !body.contributorIds.length) {
    return 'Published content requires a verified live URL, actual publish date, verification timestamp, and at least one contributor.';
  }
  return '';
}

async function awardVerifiedPublicationCredits(connection, workspaceId, contentId, actorId) {
  const [[content]] = await connection.execute(
    `SELECT c.id,c.title,c.platform_key,c.actual_publish_at,c.published_url,c.verified_at,s.stage_key,c.created_by_user_id
     FROM content_plans c JOIN workflow_stages s ON s.workspace_id=c.workspace_id AND s.id=c.stage_id
     WHERE c.workspace_id=? AND c.id=? LIMIT 1 FOR UPDATE`,
    [workspaceId, contentId]
  );
  if (!content || content.stage_key !== 'published' || !content.actual_publish_at || !content.published_url || !content.verified_at) return;

  const [contributors] = await connection.execute(
    'SELECT user_id,credit_weight FROM content_contributors WHERE workspace_id=? AND content_id=? AND credit_weight>0 ORDER BY created_at,user_id',
    [workspaceId, contentId]
  );
  if (!contributors.length) return;

  let [[publication]] = await connection.execute(
    `SELECT id,status FROM content_publications WHERE workspace_id=? AND content_id=?
     ORDER BY CASE status WHEN 'verified' THEN 0 WHEN 'published' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,created_at DESC LIMIT 1 FOR UPDATE`,
    [workspaceId, contentId]
  );
  if (!publication) {
    const publicationId = randomUUID();
    await connection.execute(
      `INSERT INTO content_publications
       (id,workspace_id,content_id,platform_key,status,published_at,published_url,verified_by_user_id,verified_at,created_by_user_id)
       VALUES (?,?,?,?,'verified',?,?,?,?,?)`,
      [publicationId, workspaceId, contentId, content.platform_key, content.actual_publish_at, content.published_url, actorId, content.verified_at, content.created_by_user_id]
    );
    publication = { id: publicationId, status: 'verified' };
  } else if (publication.status !== 'verified') {
    await connection.execute(
      `UPDATE content_publications SET platform_key=?,status='verified',published_at=?,published_url=?,verified_by_user_id=?,verified_at=?
       WHERE workspace_id=? AND id=?`,
      [content.platform_key, content.actual_publish_at, content.published_url, actorId, content.verified_at, workspaceId, publication.id]
    );
    publication.status = 'verified';
  } else {
    // Once a verified publication has been credited, later metadata or
    // contributor edits must not create a second award event.
    return;
  }

  // A published item earns the contributor's existing credit_weight once.
  // The content row lock serializes concurrent publish requests; this check also
  // protects legacy credit rows whose publication_id is NULL.
  for (const contributor of contributors) {
    const [[existingCredit]] = await connection.execute(
      'SELECT id,status FROM content_credits WHERE workspace_id=? AND content_id=? AND user_id=? ORDER BY created_at LIMIT 1 FOR UPDATE',
      [workspaceId, contentId, contributor.user_id]
    );
    if (existingCredit?.status === 'pending') {
      await connection.execute(
        `UPDATE content_credits SET publication_id=COALESCE(publication_id,?),status='awarded',awarded_by_user_id=?,awarded_at=COALESCE(awarded_at,CURRENT_TIMESTAMP(3))
         WHERE workspace_id=? AND id=? AND status='pending'`,
        [publication.id, actorId, workspaceId, existingCredit.id]
      );
    } else if (!existingCredit) {
      await connection.execute(
        `INSERT INTO content_credits (id,workspace_id,content_id,user_id,publication_id,credits,status,awarded_by_user_id,awarded_at)
         VALUES (?,?,?,?,?,?,'awarded',?,CURRENT_TIMESTAMP(3))`,
        [randomUUID(), workspaceId, contentId, contributor.user_id, publication.id, contributor.credit_weight, actorId]
      );
    }
  }
}

async function ensureStages(connection, workspaceId) {
  for (const [index, [key, label, color]] of Object.values(stages).entries()) {
    await connection.execute(
      'INSERT IGNORE INTO workflow_stages (id,workspace_id,stage_key,name,position,color,is_active) VALUES (?,?,?,?,?,?,TRUE)',
      [randomUUID(), workspaceId, key, label, index + 20, color]
    );
  }
}

async function validateMembers(connection, workspaceId, picId, contributorIds) {
  const ids = Array.from(new Set([...(picId ? [picId] : []), ...contributorIds]));
  if (!ids.length) return;
  const [rows] = await connection.execute(
    "SELECT user_id FROM workspace_members WHERE workspace_id=? AND status='active' AND user_id IN (" + ids.map(() => '?').join(',') + ')',
    [workspaceId, ...ids]
  );
  if (rows.length !== ids.length) {
    const error = new Error('PIC and contributors must be active members of this workspace.');
    error.status = 400; error.code = 'INVALID_WORKSPACE_MEMBER'; throw error;
  }
}

async function loadContent(connection, workspaceId, contentId) {
  const [rows] = await connection.execute(
    'SELECT c.*,s.stage_key,s.name AS stage_name FROM content_plans c JOIN workflow_stages s ON s.workspace_id=c.workspace_id AND s.id=c.stage_id WHERE c.workspace_id=? AND c.id=? LIMIT 1',
    [workspaceId, contentId]
  );
  if (!rows.length) return null;
  const [contributors] = await connection.execute(
    'SELECT user_id FROM content_contributors WHERE workspace_id=? AND content_id=? ORDER BY created_at,user_id',
    [workspaceId, contentId]
  );
  return { ...serialize(rows[0], contributors.map((row) => row.user_id)), ...await loadStudio(connection, workspaceId, contentId) };
}

contentRouter.get('/:workspaceId/content', requireWorkspacePermission('content.read'), async (request, response, next) => {
  try {
    const workspaceId = request.params.workspaceId;
    const [rows] = await pool.execute(
      'SELECT c.*,s.stage_key,s.name AS stage_name FROM content_plans c JOIN workflow_stages s ON s.workspace_id=c.workspace_id AND s.id=c.stage_id WHERE c.workspace_id=? ORDER BY c.created_at DESC',
      [workspaceId]
    );
    const [contributors] = await pool.execute(
      'SELECT content_id,user_id FROM content_contributors WHERE workspace_id=? ORDER BY created_at,user_id',
      [workspaceId]
    );
    const byContent = new Map();
    for (const row of contributors) {
      if (!byContent.has(row.content_id)) byContent.set(row.content_id, []);
      byContent.get(row.content_id).push(row.user_id);
    }
    const contents = [];
    for (const row of rows) contents.push({ ...serialize(row, byContent.get(row.id) || []), ...await loadStudio(pool, workspaceId, row.id) });
    response.json({ contents });
  } catch (error) { next(error); }
});

contentRouter.post('/:workspaceId/content', requireWorkspacePermission('content.write'), async (request, response, next) => {
  const body = request.body || {};
  const message = validate(body);
  if (message) return response.status(400).json({ error: 'VALIDATION_ERROR', message });
  const publicationMessage = publicationVerificationError(body);
  if (publicationMessage) return response.status(400).json({ error: 'PUBLICATION_VERIFICATION_REQUIRED', message: publicationMessage });
  const workspaceId = request.params.workspaceId;
  const contentId = randomUUID();
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await ensureStages(connection, workspaceId);
    await validateMembers(connection, workspaceId, body.picId || null, body.contributorIds);
    const contentSlug = await uniqueContentSlug(connection, workspaceId, body.title.trim());
    const [foundStages] = await connection.execute(
      'SELECT id FROM workflow_stages WHERE workspace_id=? AND stage_key=? AND is_active=TRUE LIMIT 1',
      [workspaceId, stages[body.status][0]]
    );
    await connection.execute(
      'INSERT INTO content_plans (id,workspace_id,slug,title,description,platform_key,format_key,pillar,priority,stage_id,assigned_to_user_id,target_publish_at,actual_publish_at,published_url,verified_at,script_notes,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [contentId, workspaceId, contentSlug, body.title.trim(), body.description.trim() || null, body.platform.trim(), body.format.trim(),
        body.pillar.trim() || null, body.priority, foundStages[0].id, body.picId || null, calendarDateTime(body.targetPublishDate),
        body.actualPublishDate || null, body.publishedUrl || null, body.verifiedAt || null, body.scriptNotes || null, request.user.id]
    );
    for (const userId of body.contributorIds) {
      await connection.execute('INSERT INTO content_contributors (workspace_id,content_id,user_id) VALUES (?,?,?)', [workspaceId, contentId, userId]);
    }
    await awardVerifiedPublicationCredits(connection, workspaceId, contentId, request.user.id);
    await connection.commit();
    response.status(201).json({ content: await loadContent(pool, workspaceId, contentId) });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.status) return response.status(error.status).json({ error: error.code, message: error.message });
    next(error);
  } finally { connection?.release(); }
});

contentRouter.put('/:workspaceId/content/:contentId', requireWorkspacePermission('content.write'), async (request, response, next) => {
  const body = request.body || {};
  const message = validate(body);
  if (message) return response.status(400).json({ error: 'VALIDATION_ERROR', message });
  const workspaceId = request.params.workspaceId;
  const contentId = request.params.contentId;
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await ensureStages(connection, workspaceId);
    await validateMembers(connection, workspaceId, body.picId || null, body.contributorIds);
    const [existing] = await connection.execute('SELECT id FROM content_plans WHERE workspace_id=? AND id=? LIMIT 1 FOR UPDATE', [workspaceId, contentId]);
    if (!existing.length) {
      await connection.rollback();
      return response.status(404).json({ error: 'CONTENT_NOT_FOUND' });
    }
    const [foundStages] = await connection.execute(
      'SELECT id FROM workflow_stages WHERE workspace_id=? AND stage_key=? AND is_active=TRUE LIMIT 1',
      [workspaceId, stages[body.status][0]]
    );
    await connection.execute(
      'UPDATE content_plans SET title=?,description=?,platform_key=?,format_key=?,pillar=?,priority=?,stage_id=?,assigned_to_user_id=?,target_publish_at=?,actual_publish_at=?,published_url=?,verified_at=?,script_notes=? WHERE workspace_id=? AND id=?',
      [body.title.trim(), body.description.trim() || null, body.platform.trim(), body.format.trim(), body.pillar.trim() || null,
        body.priority, foundStages[0].id, body.picId || null, calendarDateTime(body.targetPublishDate), body.actualPublishDate || null,
        body.publishedUrl || null, body.verifiedAt || null, body.scriptNotes || null, workspaceId, contentId]
    );
    await connection.execute('DELETE FROM content_contributors WHERE workspace_id=? AND content_id=?', [workspaceId, contentId]);
    for (const userId of body.contributorIds) {
      await connection.execute('INSERT INTO content_contributors (workspace_id,content_id,user_id) VALUES (?,?,?)', [workspaceId, contentId, userId]);
    }
    const studioKeys = ['scenes', 'scriptBlocks', 'tasks', 'reviewComments'];
    if (studioKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
      await saveStudio(connection, workspaceId, contentId, request.user.id, body);
    }
    const publicationMessage = publicationVerificationError(body);
    if (publicationMessage) { await connection.rollback(); return response.status(400).json({ error: 'PUBLICATION_VERIFICATION_REQUIRED', message: publicationMessage }); }
    await awardVerifiedPublicationCredits(connection, workspaceId, contentId, request.user.id);
    await connection.commit();
    response.json({ content: await loadContent(pool, workspaceId, contentId) });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.status) return response.status(error.status).json({ error: error.code, message: error.message });
    next(error);
  } finally { connection?.release(); }
});

// Partial updates keep independent workflows from overwriting one another.
// Kanban sends only `status`; Storyboard sends only its storyboard collections.
contentRouter.patch('/:workspaceId/content/:contentId', requireWorkspacePermission('content.write'), async (request, response, next) => {
  const body = request.body || {};
  const workspaceId = request.params.workspaceId;
  const contentId = request.params.contentId;
  const metadataColumns = {
    title: 'title', description: 'description', platform: 'platform_key', format: 'format_key',
    pillar: 'pillar', priority: 'priority', picId: 'assigned_to_user_id',
    targetPublishDate: 'target_publish_at', actualPublishDate: 'actual_publish_at',
    publishedUrl: 'published_url', verifiedAt: 'verified_at', scriptNotes: 'script_notes',
  };
  const studioKeys = ['scenes', 'scriptBlocks', 'tasks', 'reviewComments'];
  const hasMetadata = Object.keys(metadataColumns).some((key) => Object.hasOwn(body, key));
  const hasStage = Object.hasOwn(body, 'status');
  const hasStudio = studioKeys.some((key) => Object.hasOwn(body, key));
  if (!hasMetadata && !hasStage && !hasStudio) return response.status(400).json({ error: 'EMPTY_UPDATE' });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT c.*,s.stage_key,s.name AS stage_name FROM content_plans c JOIN workflow_stages s ON s.workspace_id=c.workspace_id AND s.id=c.stage_id WHERE c.workspace_id=? AND c.id=? LIMIT 1 FOR UPDATE',
      [workspaceId, contentId]
    );
    if (!rows.length) {
      await connection.rollback();
      return response.status(404).json({ error: 'CONTENT_NOT_FOUND' });
    }
    const [contributorRows] = await connection.execute(
      'SELECT user_id FROM content_contributors WHERE workspace_id=? AND content_id=? ORDER BY created_at,user_id',
      [workspaceId, contentId]
    );
    const current = serialize(rows[0], contributorRows.map((row) => row.user_id));
    const candidate = { ...current, ...body };

    if (hasMetadata || hasStage) {
      const message = validate(candidate);
      if (message) {
        await connection.rollback();
        return response.status(400).json({ error: 'VALIDATION_ERROR', message });
      }
      await validateMembers(connection, workspaceId, candidate.picId || null, candidate.contributorIds || []);
    }
    if (hasStage && candidate.status === 'Published' && current.status !== 'Published') {
      const publicationMessage = publicationVerificationError(candidate);
      if (publicationMessage) { await connection.rollback(); return response.status(400).json({ error: 'PUBLICATION_VERIFICATION_REQUIRED', message: publicationMessage }); }
    }

    const assignments = [];
    const values = [];
    for (const [key, column] of Object.entries(metadataColumns)) {
      if (!Object.hasOwn(body, key)) continue;
      const value = body[key];
      if (key === 'targetPublishDate') {
        assignments.push(`${column}=?`);
        values.push(calendarDateTime(value)); // Store a calendar date at midnight, without timezone conversion.
      } else if (key === 'actualPublishDate' || key === 'verifiedAt') {
        assignments.push(`${column}=?`);
        values.push(value || null); // Preserve the provided wall-clock timestamp.
      } else if (key === 'description' || key === 'pillar' || key === 'picId' || key === 'publishedUrl' || key === 'scriptNotes') {
        assignments.push(`${column}=?`);
        values.push(value || null);
      } else {
        assignments.push(`${column}=?`);
        values.push(typeof value === 'string' ? value.trim() : value);
      }
    }
    if (hasStage) {
      const stageKey = stages[body.status][0];
      const [stageRows] = await connection.execute(
        'SELECT id FROM workflow_stages WHERE workspace_id=? AND stage_key=? AND is_active=TRUE LIMIT 1',
        [workspaceId, stageKey]
      );
      if (!stageRows.length) {
        await connection.rollback();
        return response.status(400).json({ error: 'WORKFLOW_STAGE_NOT_FOUND' });
      }
      assignments.push('stage_id=?');
      values.push(stageRows[0].id);
    }
    if (assignments.length) {
      await connection.execute(
        `UPDATE content_plans SET ${assignments.join(',')} WHERE workspace_id=? AND id=?`,
        [...values, workspaceId, contentId]
      );
    }
    if (Object.hasOwn(body, 'contributorIds')) {
      await connection.execute('DELETE FROM content_contributors WHERE workspace_id=? AND content_id=?', [workspaceId, contentId]);
      for (const userId of body.contributorIds) {
        await connection.execute('INSERT INTO content_contributors (workspace_id,content_id,user_id) VALUES (?,?,?)', [workspaceId, contentId, userId]);
      }
    }
    if (hasStudio) await saveStudio(connection, workspaceId, contentId, request.user.id, body);
    await awardVerifiedPublicationCredits(connection, workspaceId, contentId, request.user.id);
    await connection.commit();
    response.json({ content: await loadContent(pool, workspaceId, contentId) });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.status) return response.status(error.status).json({ error: error.code, message: error.message });
    next(error);
  } finally { connection?.release(); }
});

contentRouter.delete('/:workspaceId/content/:contentId', requireWorkspacePermission('content.write'), async (request, response, next) => {
  try {
    const [result] = await pool.execute('DELETE FROM content_plans WHERE workspace_id=? AND id=?', [request.params.workspaceId, request.params.contentId]);
    if (!result.affectedRows) return response.status(404).json({ error: 'CONTENT_NOT_FOUND' });
    response.status(204).end();
  } catch (error) {
    // Keep FK restrictions intact: records such as content credits may intentionally
    // prevent deletion until their related publication records are handled safely.
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return response.status(409).json({
        error: 'CONTENT_DELETE_BLOCKED',
        message: 'This content has related records that prevent deletion. Resolve those records first.',
      });
    }
    next(error);
  }
});

contentRouter.put('/:workspaceId/content/:contentId/studio', requireWorkspacePermission('content.write'), async (request, response, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const saved = await saveStudio(connection, request.params.workspaceId, request.params.contentId, request.user.id, request.body || {});
    if (!saved) { await connection.rollback(); return response.status(404).json({ error: 'CONTENT_NOT_FOUND' }); }
    await connection.commit();
    response.json({ content: await loadContent(pool, request.params.workspaceId, request.params.contentId) });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    if (error.status) return response.status(error.status).json({ error: error.code, message: error.message });
    next(error);
  } finally { connection?.release(); }
});

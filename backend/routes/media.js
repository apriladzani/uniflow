import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, openAsBlob } from 'node:fs';
import { Readable } from 'node:stream';
import { unlink } from 'node:fs/promises';
import os from 'node:os';
import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import { authenticateSession, requireWorkspacePermission } from '../middleware/workspaceAccess.js';

export const mediaRouter = Router();
// Loaded from backend/.env by db.js. Normalised to an origin because signed URLs are compared against it.
const CDN_BASE_URL = process.env.CDN_BASE_URL ? new URL(process.env.CDN_BASE_URL).origin : '';
const CDN_API_KEY = CDN_BASE_URL ? process.env.KROOMBOX_API_KEY || '' : '';
const CDN_PROJECT_ID = process.env.KROOMBOX_PROJECT_ID || '';
const folderScopeCache = new Map();
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024, files: 1 }, storage: multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, os.tmpdir()),
  filename: (_request, _file, callback) => callback(null, `uniflow-cdn-${randomUUID()}`),
}) });

mediaRouter.use(authenticateSession);

function unavailable(response) {
  response.status(503).json({ error: 'CDN_NOT_CONFIGURED', message: 'Kroombox CDN is not configured. Add CDN_BASE_URL and KROOMBOX_API_KEY to backend/.env.' });
}

async function callCdn(route, init = {}) {
  let response;
  try {
    response = await fetch(`${CDN_BASE_URL}${route}`, {
      ...init,
      headers: { ...(init.headers || {}), 'x-api-key': CDN_API_KEY },
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    const error = new Error('Kroombox could not be reached.');
    error.status = 502;
    error.code = 'CDN_UNAVAILABLE';
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Kroombox request failed (${response.status}).`);
    error.status = response.status === 401 || response.status >= 500 ? 502 : response.status;
    error.code = response.status === 401 ? 'CDN_AUTH_FAILED'
      : response.status === 403 ? 'CDN_FORBIDDEN'
        : response.status === 404 ? 'CDN_ASSET_NOT_FOUND'
          : response.status === 429 ? 'CDN_RATE_LIMITED'
            : response.status >= 500 ? 'CDN_UPSTREAM_ERROR' : 'CDN_REQUEST_FAILED';
    error.upstreamStatus = response.status;
    throw error;
  }
  return response;
}

async function getWorkspaceCdnRoot(workspaceId) {
  const [[root]] = await pool.execute(
    'SELECT cdn_folder_id,connected_by_user_id,created_at,updated_at FROM workspace_cdn_roots WHERE workspace_id=? LIMIT 1',
    [workspaceId]
  );
  return root || null;
}

async function getCdnFolder(folderId) {
  const upstream = await callCdn(`/api/bridge/files/${encodeURIComponent(folderId)}`);
  return upstream.json();
}

async function isFolderWithinWorkspaceRoot(workspaceId, folderId, rootFolderId) {
  if (!folderId || !rootFolderId) return false;
  if (folderId === rootFolderId) return true;
  const cacheKey = `${workspaceId}:${rootFolderId}:${folderId}`;
  const cached = folderScopeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  let currentId = folderId;
  const visited = new Set();
  let allowed = false;
  for (let depth = 0; depth < 32 && currentId && !visited.has(currentId); depth += 1) {
    visited.add(currentId);
    const folder = await getCdnFolder(currentId);
    if (String(folder.id || '') !== currentId || String(folder.mimeType || folder.mime_type || '').toLowerCase() !== 'folder') break;
    const parentId = folder.parentId ?? folder.parent_id ?? null;
    if (!parentId) break;
    if (String(parentId) === rootFolderId) { allowed = true; break; }
    currentId = String(parentId);
  }
  if (allowed) folderScopeCache.set(cacheKey, { allowed: true, expiresAt: Date.now() + 5 * 60_000 });
  return allowed;
}

async function findWorkspaceCdnFile(workspaceId, cdnFileId) {
  const [[file]] = await pool.execute(
    `SELECT id,storage_key AS cdn_file_id,cdn_parent_id,name,mime_type,size_bytes
     FROM repository_files WHERE workspace_id=? AND storage_provider='kroombox' AND storage_key=? LIMIT 1`,
    [workspaceId, cdnFileId]
  );
  return file || null;
}

async function requireWorkspaceCdnFile(workspaceId, cdnFileId) {
  const file = await findWorkspaceCdnFile(workspaceId, cdnFileId);
  if (!file) return { error: 'MEDIA_NOT_FOUND' };
  const root = await getWorkspaceCdnRoot(workspaceId);
  if (!root) return { error: 'WORKSPACE_CDN_ROOT_UNCONNECTED' };
  let parentId = file.cdn_parent_id;
  if (!parentId) {
    const metadata = await getCdnFolder(cdnFileId);
    parentId = metadata.parentId ?? metadata.parent_id ?? null;
  }
  if (!parentId || !(await isFolderWithinWorkspaceRoot(workspaceId, String(parentId), root.cdn_folder_id))) {
    return { error: 'MEDIA_OUTSIDE_WORKSPACE_CDN_ROOT' };
  }
  return { file, root };
}

function respondCdnFileAccessError(response, error) {
  if (error === 'WORKSPACE_CDN_ROOT_UNCONNECTED') {
    response.status(409).json({ error, message: 'Connect a physical Kroombox folder to this workspace before accessing media.' });
  } else {
    response.status(404).json({ error: 'MEDIA_NOT_FOUND', message: 'This Kroombox file is not available in the active workspace.' });
  }
}

function mediaType(mimeType = '') {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text/')) return 'document';
  return 'other';
}

async function saveAsset(connection, workspaceId, userId, asset) {
  if (!asset?.id || typeof asset.name !== 'string') return;
  const type = mediaType(asset.mimeType || '');
  let virtualFolderId = asset.virtualFolderId || null;
  if (!virtualFolderId && asset.parentId) {
    const [folders] = await connection.execute('SELECT id FROM media_folders WHERE workspace_id=? AND cdn_folder_id=? ORDER BY created_at LIMIT 1', [workspaceId, asset.parentId]);
    virtualFolderId = folders[0]?.id || null;
  }
  const [existing] = await connection.execute(
    'SELECT id FROM repository_files WHERE workspace_id=? AND storage_provider=? AND storage_key=? LIMIT 1',
    [workspaceId, 'kroombox', asset.id]
  );
  if (existing.length) {
    await connection.execute(
      'UPDATE repository_files SET name=?,media_type=?,mime_type=?,size_bytes=?,url=?,folder_id=COALESCE(?,folder_id),cdn_parent_id=COALESCE(?,cdn_parent_id) WHERE workspace_id=? AND id=?',
      [asset.name.slice(0, 255), type, asset.mimeType || null, asset.size ?? null, asset.url || null, virtualFolderId, asset.cdnParentId || asset.parentId || null, workspaceId, existing[0].id]
    );
    return existing[0].id;
  } else {
    const localId = randomUUID();
    await connection.execute(
      'INSERT INTO repository_files (id,workspace_id,folder_id,name,media_type,mime_type,size_bytes,storage_provider,storage_key,url,uploaded_by_user_id,cdn_parent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [localId, workspaceId, virtualFolderId, asset.name.slice(0, 255), type, asset.mimeType || null, asset.size ?? null, 'kroombox', asset.id, asset.url || null, userId, asset.cdnParentId || asset.parentId || null]
    );
    return localId;
  }
}

async function ensureVirtualFolder(connection, workspaceId, userId, parentFolderId, identityKey, name) {
  const [found] = await connection.execute('SELECT id FROM media_folders WHERE workspace_id=? AND identity_key=? LIMIT 1', [workspaceId, identityKey]);
  if (found.length) {
    await connection.execute('UPDATE media_folders SET parent_folder_id=?,name=? WHERE workspace_id=? AND id=?', [parentFolderId || null, name.slice(0, 160), workspaceId, found[0].id]);
    return found[0].id;
  }
  const id = randomUUID();
  await connection.execute('INSERT INTO media_folders (id,workspace_id,parent_folder_id,name,identity_key,created_by_user_id) VALUES (?,?,?,?,?,?)', [id, workspaceId, parentFolderId || null, name.slice(0, 160), identityKey, userId]);
  return id;
}

async function ensureStoryboardFolders(connection, workspaceId, userId, contentId) {
  const [[content]] = await connection.execute('SELECT id,title FROM content_plans WHERE workspace_id=? AND id=? LIMIT 1', [workspaceId, contentId]);
  if (!content) return null;
  const [[root]] = await connection.execute('SELECT id FROM media_folders WHERE workspace_id=? AND identity_key=? LIMIT 1', [workspaceId, 'repository']);
  const rootId = root?.id || await ensureVirtualFolder(connection, workspaceId, userId, null, 'repository', 'UniInside Repository');
  const plannerId = await ensureVirtualFolder(connection, workspaceId, userId, rootId, `planner:${contentId}`, content.title);
  const [scenes] = await connection.execute(
    `SELECT s.id,s.scene_number FROM storyboard_scenes s JOIN storyboards b ON b.workspace_id=s.workspace_id AND b.id=s.storyboard_id
     WHERE s.workspace_id=? AND b.content_id=? ORDER BY s.scene_number`, [workspaceId, contentId]);
  const sectionFolders = [];
  for (const scene of scenes) {
    const sceneFolderId = await ensureVirtualFolder(connection, workspaceId, userId, plannerId, `scene:${scene.id}`, `Scene ${scene.scene_number}`);
    for (const [section, label] of [['main_visual', 'Main Visual'], ['a_roll', 'A-Roll'], ['b_roll', 'B-Roll']]) {
      const folderId = await ensureVirtualFolder(connection, workspaceId, userId, sceneFolderId, `scene:${scene.id}:${section}`, label);
      sectionFolders.push({ sceneId: scene.id, sceneNumber: Number(scene.scene_number), section, folderId });
    }
  }
  return { contentId, title: content.title, rootId, plannerId, sectionFolders };
}

async function requirePhysicalUploadFolder(request, response, next) {
  const parentId = typeof request.query.parentId === 'string' ? request.query.parentId.trim() : '';
  if (!parentId) return response.status(400).json({ error: 'CDN_PARENT_REQUIRED', message: 'Choose a physical Kroombox destination folder before uploading.' });
  if (!CDN_API_KEY) return unavailable(response);
  try {
    const root = await getWorkspaceCdnRoot(request.params.workspaceId);
    if (!root) return response.status(409).json({ error: 'WORKSPACE_CDN_ROOT_UNCONNECTED', message: 'Connect a physical Kroombox folder to this workspace before uploading.' });
    const folder = await getCdnFolder(parentId);
    if (folder.id !== parentId || String(folder.mimeType || folder.mime_type || '').toLowerCase() !== 'folder') {
      return response.status(400).json({ error: 'CDN_PARENT_NOT_FOLDER', message: 'The selected Kroombox item is not a folder.' });
    }
    if (!(await isFolderWithinWorkspaceRoot(request.params.workspaceId, parentId, root.cdn_folder_id))) {
      return response.status(403).json({ error: 'CDN_PARENT_OUTSIDE_WORKSPACE', message: 'Choose a folder inside this workspace’s connected Kroombox root.' });
    }
    request.cdnParentFolder = { id: parentId, name: folder.name || parentId };
    next();
  } catch (error) { next(error); }
}

mediaRouter.get('/:workspaceId/media/cdn-root', requireWorkspacePermission('content.read'), async (request, response, next) => {
  try {
    const root = await getWorkspaceCdnRoot(request.params.workspaceId);
    if (!root) return response.json({ folder: null });
    let name = root.cdn_folder_id;
    if (CDN_API_KEY) {
      try {
        const metadata = await getCdnFolder(root.cdn_folder_id);
        if (String(metadata.mimeType || metadata.mime_type || '').toLowerCase() === 'folder') name = String(metadata.name || name);
      } catch { /* Keep the stable mapped ID visible if Kroombox is temporarily unavailable. */ }
    }
    response.json({ folder: { id: root.cdn_folder_id, name } });
  } catch (error) { next(error); }
});

mediaRouter.put('/:workspaceId/media/cdn-root', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  const cdnFolderId = typeof request.body?.cdnFolderId === 'string' ? request.body.cdnFolderId.trim() : '';
  if (!cdnFolderId || cdnFolderId.length > 255) return response.status(400).json({ error: 'INVALID_CDN_FOLDER_ID', message: 'Select an existing physical Kroombox folder.' });
  if (!CDN_API_KEY) return unavailable(response);
  try {
    const metadata = await getCdnFolder(cdnFolderId);
    if (String(metadata.id || '') !== cdnFolderId || String(metadata.mimeType || metadata.mime_type || '').toLowerCase() !== 'folder') {
      return response.status(400).json({ error: 'CDN_FOLDER_NOT_FOUND', message: 'Select an existing physical Kroombox folder.' });
    }
    const [[existing]] = await pool.execute('SELECT workspace_id FROM workspace_cdn_roots WHERE cdn_folder_id=? LIMIT 1', [cdnFolderId]);
    if (existing && existing.workspace_id !== request.params.workspaceId) {
      return response.status(409).json({ error: 'CDN_FOLDER_ALREADY_CONNECTED', message: 'This Kroombox folder is already connected to another workspace.' });
    }
    const [otherRoots] = await pool.execute('SELECT workspace_id,cdn_folder_id FROM workspace_cdn_roots WHERE workspace_id<>?', [request.params.workspaceId]);
    for (const otherRoot of otherRoots) {
      const selectedInsideOther = await isFolderWithinWorkspaceRoot(otherRoot.workspace_id, cdnFolderId, otherRoot.cdn_folder_id);
      const otherInsideSelected = await isFolderWithinWorkspaceRoot(request.params.workspaceId, otherRoot.cdn_folder_id, cdnFolderId);
      if (selectedInsideOther || otherInsideSelected) {
        return response.status(409).json({ error: 'CDN_FOLDER_SCOPE_OVERLAP', message: 'Choose a folder that does not overlap another workspace’s connected CDN root.' });
      }
    }
    await pool.execute(
      `INSERT INTO workspace_cdn_roots (workspace_id,cdn_folder_id,connected_by_user_id) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE cdn_folder_id=VALUES(cdn_folder_id),connected_by_user_id=VALUES(connected_by_user_id),updated_at=CURRENT_TIMESTAMP(3)`,
      [request.params.workspaceId, cdnFolderId, request.user.id]
    );
    response.json({ folder: { id: cdnFolderId, name: String(metadata.name || cdnFolderId) } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'CDN_FOLDER_ALREADY_CONNECTED', message: 'This Kroombox folder is already connected to another workspace.' });
    next(error);
  }
});

mediaRouter.get('/:workspaceId/media/folders', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const contentId = typeof request.query.contentId === 'string' ? request.query.contentId : '';
    if (contentId) {
      const result = await ensureStoryboardFolders(connection, request.params.workspaceId, request.user.id, contentId);
      if (!result) { await connection.rollback(); return response.status(404).json({ error: 'CONTENT_NOT_FOUND' }); }
    } else {
      const [contents] = await connection.execute('SELECT id FROM content_plans WHERE workspace_id=?', [request.params.workspaceId]);
      for (const content of contents) await ensureStoryboardFolders(connection, request.params.workspaceId, request.user.id, content.id);
    }
    const [folders] = await connection.execute(
      'SELECT id,parent_folder_id,name,identity_key,cdn_folder_id FROM media_folders WHERE workspace_id=? ORDER BY created_at,name', [request.params.workspaceId]);
    await connection.commit();
    response.json({ folders: folders.map((folder) => ({ id: folder.id, parentFolderId: folder.parent_folder_id, name: folder.name, identityKey: folder.identity_key, cdnFolderId: folder.cdn_folder_id, folderType: 'virtual', mappingState: folder.cdn_folder_id ? 'mapped-to-physical-cdn-folder' : 'unmapped' })) });
  } catch (error) {
    if (connection?.inTransaction) await connection.rollback();
    next(error);
  } finally { connection?.release(); }
});

mediaRouter.post('/:workspaceId/media/folders', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
  const parentFolderId = typeof request.body?.parentFolderId === 'string' && request.body.parentFolderId.trim() ? request.body.parentFolderId.trim() : null;
  if (!name || name.length > 160 || (parentFolderId && typeof parentFolderId !== 'string')) return response.status(400).json({ error: 'INVALID_FOLDER' });
  try {
    if (parentFolderId) {
      const [[parent]] = await pool.execute('SELECT id FROM media_folders WHERE workspace_id=? AND id=? LIMIT 1', [request.params.workspaceId, parentFolderId]);
      if (!parent) return response.status(404).json({ error: 'PARENT_FOLDER_NOT_FOUND' });
    }
    const id = randomUUID();
    await pool.execute('INSERT INTO media_folders (id,workspace_id,parent_folder_id,name,created_by_user_id) VALUES (?,?,?,?,?)', [id, request.params.workspaceId, parentFolderId, name, request.user.id]);
    response.status(201).json({ folder: { id, parentFolderId, name, folderType: 'virtual', cdnFolderId: null, mappingState: 'unmapped' } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'FOLDER_ALREADY_EXISTS', message: 'A folder with this name already exists here.' });
    next(error);
  }
});

mediaRouter.patch('/:workspaceId/media/folders/:folderId/mapping', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  const cdnFolderId = request.body?.cdnFolderId === null || request.body?.cdnFolderId === '' ? null : request.body?.cdnFolderId;
  if (cdnFolderId !== null && (typeof cdnFolderId !== 'string' || !cdnFolderId.trim() || cdnFolderId.trim().length > 255)) return response.status(400).json({ error: 'INVALID_CDN_FOLDER_ID' });
  try {
    const [[folder]] = await pool.execute('SELECT id FROM media_folders WHERE workspace_id=? AND id=? LIMIT 1', [request.params.workspaceId, request.params.folderId]);
    if (!folder) return response.status(404).json({ error: 'VIRTUAL_FOLDER_NOT_FOUND' });
    if (cdnFolderId) {
      if (!CDN_API_KEY) return unavailable(response);
      const existingFolder = await callCdn(`/api/bridge/files/${encodeURIComponent(cdnFolderId.trim())}`);
      const metadata = await existingFolder.json();
      if (metadata.id !== cdnFolderId.trim() || String(metadata.mimeType || metadata.mime_type || '').toLowerCase() !== 'folder') return response.status(400).json({ error: 'CDN_FOLDER_NOT_FOUND', message: 'Select an existing Kroombox folder.' });
    }
    await pool.execute('UPDATE media_folders SET cdn_folder_id=? WHERE workspace_id=? AND id=?', [cdnFolderId ? cdnFolderId.trim() : null, request.params.workspaceId, request.params.folderId]);
    response.json({ folder: { id: folder.id, cdnFolderId: cdnFolderId ? cdnFolderId.trim() : null, folderType: 'virtual', mappingState: cdnFolderId ? 'mapped-to-physical-cdn-folder' : 'unmapped' } });
  } catch (error) { next(error); }
});

// Kroombox exposes folders through its documented files listing. The API returns
// folders with the documented mimeType field set to "folder".
mediaRouter.get('/:workspaceId/media/cdn-folders', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  if (!CDN_API_KEY) return unavailable(response);
  try {
    const page = Math.max(1, Number.parseInt(String(request.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(request.query.limit || '100'), 10) || 100));
    const query = new URLSearchParams({ paginate: '1', page: String(page), limit: String(limit) });
    const root = await getWorkspaceCdnRoot(request.params.workspaceId);
    const selectingRoot = request.query.connect === '1';
    if (!root && !selectingRoot) return response.status(409).json({ error: 'WORKSPACE_CDN_ROOT_UNCONNECTED', message: 'Connect a physical Kroombox folder to this workspace in Media Library.' });
    const requestedParentId = typeof request.query.folderId === 'string' ? request.query.folderId.trim() : '';
    const parentId = requestedParentId || (root && !selectingRoot ? root.cdn_folder_id : '');
    if (root && !selectingRoot && parentId && !(await isFolderWithinWorkspaceRoot(request.params.workspaceId, parentId, root.cdn_folder_id))) {
      return response.status(403).json({ error: 'CDN_FOLDER_OUTSIDE_WORKSPACE', message: 'This folder is outside the active workspace’s connected Kroombox root.' });
    }
    if (parentId) {
      const parent = await getCdnFolder(parentId);
      if (String(parent.id || '') !== parentId || String(parent.mimeType || parent.mime_type || '').toLowerCase() !== 'folder') {
        return response.status(404).json({ error: 'CDN_FOLDER_NOT_FOUND', message: 'The requested Kroombox folder was not found.' });
      }
    }
    if (parentId) query.set('folderId', parentId);
    if (typeof request.query.search === 'string' && request.query.search.trim()) query.set('search', request.query.search.trim().slice(0, 200));
    const upstream = await callCdn(`/api/bridge/files?${query}`);
    const payload = await upstream.json();
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
    const folders = rows.filter((item) => String(item.mimeType || item.mime_type || '').toLowerCase() === 'folder')
      .map((item) => ({ id: String(item.id), name: String(item.name || 'Unnamed folder'), parentId: item.parentId || item.parent_id || null }));
    response.json({ folders, pagination: Array.isArray(payload) ? { page, limit, total: folders.length, totalPages: 1, hasNext: false, hasPrev: page > 1 } : payload.pagination || null });
  } catch (error) { next(error); }
});

mediaRouter.get('/:workspaceId/media', requireWorkspacePermission('content.read'), async (request, response, next) => {
  if (!CDN_API_KEY) return unavailable(response);
  try {
    const { search, type, folderId, virtualFolderId } = request.query;
    if (typeof virtualFolderId === 'string' && virtualFolderId.trim()) {
      return response.status(400).json({ error: 'VIRTUAL_FOLDER_NOT_SUPPORTED', message: 'Browse using a physical Kroombox folder ID.' });
    }
    const root = await getWorkspaceCdnRoot(request.params.workspaceId);
    if (!root) return response.status(409).json({ error: 'WORKSPACE_CDN_ROOT_UNCONNECTED', message: 'Connect a physical Kroombox folder to this workspace before browsing media.' });
    const page = Math.max(1, Number.parseInt(String(request.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(request.query.limit || '20'), 10) || 20));
    const query = new URLSearchParams({ paginate: '1', page: String(page), limit: String(limit) });
    if (typeof search === 'string' && search.trim()) query.set('search', search.trim().slice(0, 200));
    if (typeof type === 'string' && type.trim()) query.set('type', type.trim().slice(0, 100));
    const physicalFolderId = typeof folderId === 'string' && folderId.trim() ? folderId.trim().slice(0, 255) : root.cdn_folder_id;
    if (!(await isFolderWithinWorkspaceRoot(request.params.workspaceId, physicalFolderId, root.cdn_folder_id))) {
      return response.status(403).json({ error: 'CDN_FOLDER_OUTSIDE_WORKSPACE', message: 'This folder is outside the active workspace’s connected Kroombox root.' });
    }
    query.set('folderId', physicalFolderId);
    // Kroombox root listings include nested assets, while folderId listings
    // include both subfolders and files. Gather the documented pages first so
    // this endpoint can return a complete, file-only page for either location.
    const allRows = [];
    let upstreamPage = 1;
    let upstreamHasNext = true;
    while (upstreamHasNext) {
      const upstreamQuery = new URLSearchParams(query);
      upstreamQuery.set('page', String(upstreamPage));
      upstreamQuery.set('limit', '100');
      const upstream = await callCdn(`/api/bridge/files?${upstreamQuery}`);
      const payload = await upstream.json();
      const pageRows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
      allRows.push(...pageRows);
      const pageInfo = Array.isArray(payload) ? null : payload.pagination;
      const totalPages = Number(pageInfo?.totalPages) || 0;
      upstreamHasNext = pageInfo
        ? Boolean(pageInfo.hasNext) && (!totalPages || upstreamPage < totalPages)
        : pageRows.length === 100;
      upstreamPage += 1;
    }
    const matchingAssets = allRows.filter((asset) => String(asset.mimeType || asset.mime_type || '').toLowerCase() !== 'folder')
      .filter((asset) => {
        const parentId = asset.parentId ?? asset.parent_id ?? null;
        return physicalFolderId ? String(parentId || '') === physicalFolderId : !parentId;
      });
    const start = (page - 1) * limit;
    const assets = matchingAssets.slice(start, start + limit);
    const totalPages = Math.ceil(matchingAssets.length / limit);
    const responsePagination = { page, limit, total: matchingAssets.length, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const asset of assets) asset.repositoryFileId = await saveAsset(connection, request.params.workspaceId, request.user.id, { ...asset, parentId: asset.parentId ?? asset.parent_id ?? null });
      await connection.commit();
    } catch (error) {
      if (connection.inTransaction) await connection.rollback();
      throw error;
    } finally { connection.release(); }
    // Kroombox's metadata `url` may point at its Google Drive storage origin.
    // Keep that value in MySQL metadata, but only let the UI request delivery
    // URLs through the signed preview route.
    response.json({ assets: assets.map(({ url: _originUrl, ...asset }) => ({ ...asset, url: '' })), pagination: responsePagination });
  } catch (error) {
    const failureCode = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'UNCLASSIFIED';
    const failureType = typeof error?.name === 'string' && /^[A-Za-z]+Error$/.test(error.name) ? error.name : 'Error';
    console.error('Media listing failed:', failureCode, failureType);
    next(error);
  }
});

mediaRouter.get('/:workspaceId/media/:assetId/metadata', requireWorkspacePermission('content.read'), async (request, response, next) => {
  if (!CDN_API_KEY) return unavailable(response);
  try {
    const access = await requireWorkspaceCdnFile(request.params.workspaceId, request.params.assetId);
    if (access.error) return respondCdnFileAccessError(response, access.error);
    const upstream = await callCdn(`/api/bridge/files/${encodeURIComponent(request.params.assetId)}`);
    const asset = await upstream.json();
    asset.repositoryFileId = await saveAsset(pool, request.params.workspaceId, request.user.id, asset);
    const { url: _originUrl, ...safeAsset } = asset;
    response.json({ asset: { ...safeAsset, url: '' } });
  } catch (error) { next(error); }
});

mediaRouter.post('/:workspaceId/media/upload', requireWorkspacePermission('media.manage'), requirePhysicalUploadFolder, upload.single('file'), async (request, response, next) => {
  const file = request.file;
  if (!file) return response.status(400).json({ error: 'FILE_REQUIRED', message: 'Choose a file to upload.' });
  if (!CDN_API_KEY) {
    await unlink(file.path).catch(() => {});
    return unavailable(response);
  }
  const idempotencyKey = typeof request.get('Idempotency-Key') === 'string' ? request.get('Idempotency-Key').trim() : '';
  if (!idempotencyKey || idempotencyKey.length > 128) {
    await unlink(file.path).catch(() => {});
    return response.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Retry the upload from Media Library so UniFlow can safely identify this upload.' });
  }
  const fileHash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(file.path)) fileHash.update(chunk);
  } catch (error) { await unlink(file.path).catch(() => {}); return next(error); }
  const requestHash = createHash('sha256').update(JSON.stringify({
    parentId: request.cdnParentFolder.id, name: file.originalname, mimeType: file.mimetype,
    size: file.size, sha256: fileHash.digest('hex'),
  })).digest('hex');
  const attemptValues = [request.params.workspaceId, idempotencyKey, requestHash, file.originalname.slice(0, 255), file.mimetype || null, file.size];
  try {
    const [insert] = await pool.execute(
      `INSERT IGNORE INTO media_upload_requests (workspace_id,idempotency_key,request_hash,state,file_name,mime_type,size_bytes)
       VALUES (?,?,?,'uploading',?,?,?)`, attemptValues
    );
    let [[attempt]] = await pool.execute('SELECT * FROM media_upload_requests WHERE workspace_id=? AND idempotency_key=? LIMIT 1', [request.params.workspaceId, idempotencyKey]);
    if (!attempt || attempt.request_hash !== requestHash) return response.status(409).json({ error: 'IDEMPOTENCY_KEY_CONFLICT', message: 'This upload retry key is already associated with a different file or destination.' });
    if (attempt.state === 'complete') {
      const saved = typeof attempt.response_json === 'string' ? JSON.parse(attempt.response_json) : attempt.response_json;
      return response.status(202).json(saved);
    }
    if (attempt.state === 'accepted') {
      const repositoryFileId = await saveAsset(pool, request.params.workspaceId, request.user.id, { id: attempt.cdn_file_id, name: attempt.file_name, mimeType: attempt.mime_type, size: attempt.size_bytes, parentId: request.cdnParentFolder.id, cdnParentId: request.cdnParentFolder.id });
      const saved = { success: true, fileId: attempt.cdn_file_id, status: 'processing', repositoryFileId };
      await pool.execute("UPDATE media_upload_requests SET state='complete',response_json=? WHERE workspace_id=? AND idempotency_key=?", [JSON.stringify(saved), request.params.workspaceId, idempotencyKey]);
      return response.status(202).json(saved);
    }
    if (insert.affectedRows === 0 && attempt.state !== 'retryable') {
      return response.status(409).json({ error: 'UPLOAD_ALREADY_PROCESSING', message: 'This upload is already being processed. Wait a moment, then retry the same upload.' });
    }
    if (attempt.state === 'retryable') {
      await pool.execute("UPDATE media_upload_requests SET state='uploading' WHERE workspace_id=? AND idempotency_key=?", [request.params.workspaceId, idempotencyKey]);
    }

    const form = new FormData();
    form.append('file', await openAsBlob(file.path, { type: file.mimetype || 'application/octet-stream' }), file.originalname);
    form.append('fileName', file.originalname);
    form.append('mimeType', file.mimetype || 'application/octet-stream');
    if (CDN_PROJECT_ID) form.append('projectId', CDN_PROJECT_ID);
    form.append('parentId', request.cdnParentFolder.id);
    let upstream;
    try {
      upstream = await callCdn('/api/bridge/upload', { method: 'POST', headers: {}, body: form });
    } catch (error) {
      if (error.upstreamStatus >= 400 && error.upstreamStatus < 500) {
        await pool.execute("UPDATE media_upload_requests SET state='retryable' WHERE workspace_id=? AND idempotency_key=?", [request.params.workspaceId, idempotencyKey]);
      }
      throw error;
    }
    const result = await upstream.json().catch(() => null);
    if (!result?.success || typeof result.fileId !== 'string' || !result.fileId) {
      const error = new Error('Kroombox did not return an upload reference.');
      error.status = 502; error.code = 'CDN_INVALID_UPLOAD_RESPONSE'; throw error;
    }
    await pool.execute("UPDATE media_upload_requests SET state='accepted',cdn_file_id=? WHERE workspace_id=? AND idempotency_key=?", [result.fileId, request.params.workspaceId, idempotencyKey]);
    let repositoryFileId;
    try {
      repositoryFileId = await saveAsset(pool, request.params.workspaceId, request.user.id, { id: result.fileId, name: file.originalname, mimeType: file.mimetype, size: file.size, parentId: request.cdnParentFolder.id, cdnParentId: request.cdnParentFolder.id });
    } catch {
      const error = new Error('Kroombox accepted the upload, but UniFlow could not save its library record. Retry the same upload to finish saving it.');
      error.status = 503; error.code = 'MEDIA_METADATA_SAVE_FAILED'; throw error;
    }
    result.repositoryFileId = repositoryFileId;
    await pool.execute("UPDATE media_upload_requests SET state='complete',response_json=? WHERE workspace_id=? AND idempotency_key=?", [JSON.stringify(result), request.params.workspaceId, idempotencyKey]);
    response.status(202).json(result);
  } catch (error) {
    next(error);
  }
  finally { await unlink(file.path).catch(() => {}); }
});

const footageSections = new Set(['main_visual', 'a_roll', 'b_roll']);
mediaRouter.post('/:workspaceId/media/scenes/:sceneId/footage/:section', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  const { sceneId, section } = request.params;
  const repositoryFileId = request.body?.repositoryFileId;
  if (!footageSections.has(section) || typeof repositoryFileId !== 'string' || !repositoryFileId) return response.status(400).json({ error: 'INVALID_SCENE_FOOTAGE' });
  try {
    const [[scene]] = await pool.execute(
      `SELECT s.id FROM storyboard_scenes s JOIN storyboards b ON b.id=s.storyboard_id AND b.workspace_id=s.workspace_id
       WHERE s.workspace_id=? AND s.id=? LIMIT 1`, [request.params.workspaceId, sceneId]);
    const [[file]] = await pool.execute('SELECT id,storage_key FROM repository_files WHERE workspace_id=? AND id=? AND storage_provider=? LIMIT 1', [request.params.workspaceId, repositoryFileId, 'kroombox']);
    if (!scene || !file) return response.status(404).json({ error: 'SCENE_FOOTAGE_NOT_FOUND', message: 'Choose a Kroombox file from Media Library.' });
    const access = await requireWorkspaceCdnFile(request.params.workspaceId, file.storage_key);
    if (access.error) return respondCdnFileAccessError(response, access.error);
    await pool.execute('INSERT IGNORE INTO storyboard_scene_media_links (workspace_id,scene_id,footage_section,file_id,linked_by_user_id) VALUES (?,?,?,?,?)', [request.params.workspaceId, sceneId, section, repositoryFileId, request.user.id]);
    response.status(201).json({ linked: true });
  } catch (error) { next(error); }
});

mediaRouter.delete('/:workspaceId/media/scenes/:sceneId/footage/:section/:repositoryFileId', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  if (!footageSections.has(request.params.section)) return response.status(400).json({ error: 'INVALID_FOOTAGE_SECTION' });
  try {
    await pool.execute('DELETE FROM storyboard_scene_media_links WHERE workspace_id=? AND scene_id=? AND footage_section=? AND file_id=?', [request.params.workspaceId, request.params.sceneId, request.params.section, request.params.repositoryFileId]);
    response.status(204).end();
  } catch (error) { next(error); }
});

mediaRouter.get('/:workspaceId/media/:assetId/preview', requireWorkspacePermission('content.read'), async (request, response, next) => {
  if (!CDN_API_KEY) return unavailable(response);
  try {
    const access = await requireWorkspaceCdnFile(request.params.workspaceId, request.params.assetId);
    if (access.error) return respondCdnFileAccessError(response, access.error);
    const upstream = await callCdn(`/api/bridge/sign/${encodeURIComponent(request.params.assetId)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }),
    });
    const signed = await upstream.json().catch(() => null);
    if (!signed || typeof signed.url !== 'string') {
      const error = new Error('Kroombox returned an invalid signed preview.');
      error.status = 502; error.code = 'CDN_INVALID_SIGNED_URL'; throw error;
    }
    let url;
    try { url = new URL(signed.url, CDN_BASE_URL); }
    catch {
      const error = new Error('Kroombox returned an invalid signed preview URL.');
      error.status = 502; error.code = 'CDN_INVALID_SIGNED_URL'; throw error;
    }
    if (url.origin !== CDN_BASE_URL || !url.searchParams.get('sig') || !url.searchParams.get('exp')) {
      const error = new Error('Kroombox returned an invalid signed preview URL.');
      error.status = 502; error.code = 'CDN_INVALID_SIGNED_URL'; throw error;
    }
    const expectedPath = `/api/bridge/view/${encodeURIComponent(request.params.assetId)}`;
    if (url.pathname === '/api/bridge/view/' || url.pathname === '/api/bridge/view') url.pathname = expectedPath;
    if (url.pathname !== expectedPath) {
      const error = new Error('Kroombox returned a preview URL for a different asset.');
      error.status = 502; error.code = 'CDN_INVALID_SIGNED_URL'; throw error;
    }
    response.json({ ...signed, url: url.toString() });
  } catch (error) { next(error); }
});

// Serve preview bytes through UniFlow so browsers do not need direct access to
// Kroombox's delivery host (which can be blocked by hotlink or network rules).
mediaRouter.get('/:workspaceId/media/:assetId/preview/content', requireWorkspacePermission('content.read'), async (request, response, next) => {
  if (!CDN_API_KEY) return unavailable(response);
  try {
    const assetId = request.params.assetId;
    const access = await requireWorkspaceCdnFile(request.params.workspaceId, assetId);
    if (access.error) return respondCdnFileAccessError(response, access.error);
    const signedResponse = await callCdn(`/api/bridge/sign/${encodeURIComponent(assetId)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }),
    });
    const signed = await signedResponse.json().catch(() => null);
    if (!signed || typeof signed.url !== 'string') {
      const error = new Error('Kroombox returned an invalid signed preview.');
      error.status = 502; error.code = 'CDN_INVALID_SIGNED_URL'; throw error;
    }
    let url;
    try { url = new URL(signed.url, CDN_BASE_URL); }
    catch {
      const error = new Error('Kroombox returned an invalid signed preview URL.');
      error.status = 502; error.code = 'CDN_INVALID_SIGNED_URL'; throw error;
    }
    const expectedPath = `/api/bridge/view/${encodeURIComponent(assetId)}`;
    if (url.origin !== CDN_BASE_URL || !url.searchParams.get('sig') || !url.searchParams.get('exp')
      || url.pathname.toLowerCase() !== expectedPath.toLowerCase()) {
      const error = new Error('Kroombox returned an invalid signed preview URL.');
      error.status = 502; error.code = 'CDN_INVALID_SIGNED_URL'; throw error;
    }
    let preview;
    try { preview = await fetch(url, { signal: AbortSignal.timeout(45_000), redirect: 'error' }); }
    catch {
      const error = new Error('Kroombox preview could not be reached.');
      error.status = 502; error.code = 'CDN_PREVIEW_UNAVAILABLE'; throw error;
    }
    if (!preview.ok || !preview.body) {
      const error = new Error('Kroombox preview could not be loaded.');
      error.status = preview.status === 404 ? 404 : 502;
      error.code = preview.status === 404 ? 'CDN_ASSET_NOT_FOUND' : 'CDN_PREVIEW_UNAVAILABLE';
      throw error;
    }
    response.status(200);
    response.set({
      'Content-Type': preview.headers.get('content-type') || access.file.mime_type || 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    const contentLength = preview.headers.get('content-length');
    if (contentLength) response.set('Content-Length', contentLength);
    Readable.fromWeb(preview.body).on('error', () => response.destroy()).pipe(response);
  } catch (error) { next(error); }
});

mediaRouter.delete('/:workspaceId/media/:assetId', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  if (!CDN_API_KEY) return unavailable(response);
  try {
    const access = await requireWorkspaceCdnFile(request.params.workspaceId, request.params.assetId);
    if (access.error) return respondCdnFileAccessError(response, access.error);
    const upstream = await callCdn(`/api/bridge/files/${encodeURIComponent(request.params.assetId)}`, { method: 'DELETE' });
    const result = await upstream.json();
    await pool.execute('DELETE FROM repository_files WHERE workspace_id=? AND storage_provider=? AND storage_key=?', [request.params.workspaceId, 'kroombox', request.params.assetId]);
    response.json(result);
  } catch (error) { next(error); }
});

mediaRouter.post('/:workspaceId/media/:repositoryFileId/attach', requireWorkspacePermission('media.manage'), async (request, response, next) => {
  const { contentId } = request.body || {};
  if (typeof contentId !== 'string' || !contentId) return response.status(400).json({ error: 'CONTENT_REQUIRED' });
  try {
    const [[content]] = await pool.execute('SELECT id FROM content_plans WHERE workspace_id=? AND id=? LIMIT 1', [request.params.workspaceId, contentId]);
    const [[file]] = await pool.execute('SELECT id,storage_key FROM repository_files WHERE workspace_id=? AND id=? AND storage_provider=? LIMIT 1', [request.params.workspaceId, request.params.repositoryFileId, 'kroombox']);
    if (!content || !file) return response.status(404).json({ error: 'MEDIA_OR_CONTENT_NOT_FOUND' });
    const access = await requireWorkspaceCdnFile(request.params.workspaceId, file.storage_key);
    if (access.error) return respondCdnFileAccessError(response, access.error);
    await pool.execute('INSERT IGNORE INTO content_media_links (workspace_id,content_id,file_id,attached_by_user_id) VALUES (?,?,?,?)', [request.params.workspaceId, contentId, file.id, request.user.id]);
    response.status(204).end();
  } catch (error) { next(error); }
});

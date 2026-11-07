import React, { useEffect, useRef, useState } from 'react';
import {
  FolderArchive,
  Grid,
  List as ListIcon,
  Search,
  Upload,
  Copy,
  ExternalLink,
  Film,
  Music,
  Image as ImageIcon,
  FileText,
  HardDrive,
  Check,
  X,
  Play,
  Volume2,
  Paperclip,
  Plus,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { api, apiUrl, ApiError } from '../../api/client';
import { MediaAsset } from '../../types/cms';

type CdnFolder = { id: string; name: string; parentId?: string | null };
type ThumbnailState = { status: 'loading' | 'ready' | 'failed'; url?: string };

export const MediaLibraryView: React.FC = () => {
  const { contents, showToast, activeWorkspaceId } = useCMS();
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const workspaceRootRequestSequence = useRef(0);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false });

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [physicalBrowsePath, setPhysicalBrowsePath] = useState<CdnFolder[]>([]);
  const [physicalChildren, setPhysicalChildren] = useState<CdnFolder[]>([]);
  const [physicalChildrenLoading, setPhysicalChildrenLoading] = useState(false);
  const [physicalChildrenError, setPhysicalChildrenError] = useState('');
  const [workspaceCdnRoot, setWorkspaceCdnRoot] = useState<CdnFolder | null>(null);
  const [workspaceRootLoading, setWorkspaceRootLoading] = useState(false);
  const [workspaceRootError, setWorkspaceRootError] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected asset for detail drawer or preview modal
  const [detailAsset, setDetailAsset] = useState<MediaAsset | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showConnectRootModal, setShowConnectRootModal] = useState(false);
  const [connectingWorkspaceRoot, setConnectingWorkspaceRoot] = useState(false);
  const [connectRootError, setConnectRootError] = useState('');
  const [uploadFolderId, setUploadFolderId] = useState('');
  const [uploadFolderName, setUploadFolderName] = useState('');
  const [cdnFolderPath, setCdnFolderPath] = useState<CdnFolder[]>([]);
  const [cdnFolders, setCdnFolders] = useState<CdnFolder[]>([]);
  const [cdnFoldersLoading, setCdnFoldersLoading] = useState(false);
  const [cdnFoldersError, setCdnFoldersError] = useState('');
  const [cdnAssetBrowseFolderId, setCdnAssetBrowseFolderId] = useState('');
  const [cdnAssetBrowseFolderName, setCdnAssetBrowseFolderName] = useState('');
  const [attachContentId, setAttachContentId] = useState(contents[0]?.id || '');

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadAttempt = useRef<{ signature: string; key: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [detailPreviewUrl, setDetailPreviewUrl] = useState('');
  const [detailPreviewLoading, setDetailPreviewLoading] = useState(false);
  const [detailPreviewError, setDetailPreviewError] = useState('');
  const [thumbnailStates, setThumbnailStates] = useState<Record<string, ThumbnailState>>({});
  const signedPreviewCache = useRef(new Map<string, { url: string; expiresAt: number }>());
  const signedPreviewRequests = useRef(new Map<string, Promise<string>>());
  const thumbnailRetryKeys = useRef(new Set<string>());
  const detailPreviewRetryKeys = useRef(new Set<string>());
  const detailRequestSequence = useRef(0);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);

  const loadAssets = async (page = pagination.page, search = searchQuery, type = selectedType, physicalFolderId = cdnAssetBrowseFolderId) => {
    if (!activeWorkspaceId) return;
    const workspaceId = activeWorkspaceId;
    setLoading(true);
    setLoadError('');
    const query = new URLSearchParams({ page: String(page), limit: String(pagination.limit) });
    if (search.trim()) query.set('search', search.trim());
    if (type !== 'all') query.set('type', type === 'document' ? 'application' : type);
    if (physicalFolderId.trim()) query.set('folderId', physicalFolderId.trim());
    try {
      const result = await api<{ assets: Array<Record<string, unknown>>; pagination: typeof pagination }>(`/workspaces/${encodeURIComponent(workspaceId)}/media?${query}`);
      if (activeWorkspaceIdRef.current !== workspaceId) return;
      setMediaAssets(result.assets.map((asset) => {
        const mimeType = String(asset.mimeType || '');
        const typeValue = mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('image/') ? 'image' : 'document';
        const size = Number(asset.size || 0);
        // Asset metadata URLs can point to Kroombox's Google Drive storage origin.
        // Previewable media always gets a signed CDN delivery URL on demand.
        return { id: String(asset.id), repositoryFileId: String(asset.repositoryFileId || ''), name: String(asset.name || 'Unnamed asset'), type: typeValue, folder: String(asset.parentId || 'Root'), parentId: asset.parentId ? String(asset.parentId) : null, mimeType, sizeBytes: size, fileSizeMb: size / (1024 * 1024), url: '', cdnProvider: 'Kroombox CDN', uploadedAt: String(asset.createdAt || ''), duration: '', resolution: '' };
      }));
      setPagination(result.pagination || { page, limit: pagination.limit, total: 0, totalPages: 0, hasNext: false, hasPrev: page > 1 });
    } catch (error) {
      if (activeWorkspaceIdRef.current !== workspaceId) return;
      const message = error instanceof ApiError ? error.message : 'Could not load Kroombox assets.';
      setLoadError(message);
      setMediaAssets([]);
    } finally { if (activeWorkspaceIdRef.current === workspaceId) setLoading(false); }
  };

  const loadCdnFolders = async (parentId = '', forRootSelection = false) => {
    if (!activeWorkspaceId) return;
    setCdnFoldersLoading(true); setCdnFoldersError('');
    try {
      const query = new URLSearchParams({ page: '1', limit: '100' });
      if (parentId) query.set('folderId', parentId);
      if (forRootSelection) query.set('connect', '1');
      const result = await api<{ folders: CdnFolder[] }>(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/cdn-folders?${query}`);
      setCdnFolders(result.folders || []);
    } catch (error) {
      setCdnFolders([]);
      setCdnFoldersError(error instanceof Error ? error.message : 'Kroombox folders could not be loaded.');
    } finally { setCdnFoldersLoading(false); }
  };

  const loadPhysicalChildren = async (parentId = '') => {
    if (!activeWorkspaceId) return [] as CdnFolder[];
    const workspaceId = activeWorkspaceId;
    setPhysicalChildrenLoading(true); setPhysicalChildrenError('');
    try {
      const collected: CdnFolder[] = [];
      let page = 1; let hasNext = true;
      while (hasNext) {
        const query = new URLSearchParams({ page: String(page), limit: '100' });
        if (parentId) query.set('folderId', parentId);
        const result = await api<{ folders: CdnFolder[]; pagination?: { hasNext?: boolean; totalPages?: number } }>(`/workspaces/${encodeURIComponent(workspaceId)}/media/cdn-folders?${query}`);
        collected.push(...(result.folders || []));
        hasNext = Boolean(result.pagination?.hasNext) && page < (result.pagination?.totalPages || page);
        page += 1;
      }
      if (activeWorkspaceIdRef.current !== workspaceId) return null;
      setPhysicalChildren([...new Map(collected.map((folder) => [folder.id, folder])).values()]);
      return [...new Map(collected.map((folder) => [folder.id, folder])).values()];
    } catch (error) {
      if (activeWorkspaceIdRef.current !== workspaceId) return null;
      setPhysicalChildren([]);
      setPhysicalChildrenError(error instanceof Error ? error.message : 'Kroombox folders could not be loaded.');
      return null;
    } finally { if (activeWorkspaceIdRef.current === workspaceId) setPhysicalChildrenLoading(false); }
  };

  const openPhysicalFolder = (folder: CdnFolder, path = [...physicalBrowsePath, folder]) => {
    setPhysicalBrowsePath(path);
    setCdnAssetBrowseFolderId(folder.id); setCdnAssetBrowseFolderName(path.map((item) => item.name).join(' / '));
    void loadPhysicalChildren(folder.id);
    void loadAssets(1, searchQuery, selectedType, folder.id);
  };

  const openPhysicalRoot = () => {
    if (!workspaceCdnRoot) return;
    setPhysicalBrowsePath([workspaceCdnRoot]);
    setCdnAssetBrowseFolderId(workspaceCdnRoot.id); setCdnAssetBrowseFolderName(workspaceCdnRoot.name);
    void loadPhysicalChildren(workspaceCdnRoot.id);
    void loadAssets(1, searchQuery, selectedType, workspaceCdnRoot.id);
  };

  const loadWorkspaceCdnRoot = async (workspaceId: string, requestSequence: number) => {
    if (!workspaceId) {
      setWorkspaceCdnRoot(null); setPhysicalBrowsePath([]); setMediaAssets([]); setPhysicalChildren([]); setLoading(false); setWorkspaceRootLoading(false);
      return;
    }
    setWorkspaceRootLoading(true); setWorkspaceRootError('');
    setLoading(false);
    setWorkspaceCdnRoot(null); setPhysicalBrowsePath([]); setCdnAssetBrowseFolderId(''); setCdnAssetBrowseFolderName('');
    setShowUploadModal(false); setShowConnectRootModal(false); setConnectingWorkspaceRoot(false);
    setDetailAsset(null); setPreviewAsset(null); setPreviewUrl(''); setDetailPreviewUrl(''); setThumbnailStates({});
    setPhysicalChildrenError(''); setPagination((current) => ({ page: 1, limit: current.limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false }));
    setMediaAssets([]); setPhysicalChildren([]); setLoadError('');
    try {
      const result = await api<{ folder: CdnFolder | null }>(`/workspaces/${encodeURIComponent(workspaceId)}/media/cdn-root`);
      if (workspaceRootRequestSequence.current !== requestSequence || activeWorkspaceIdRef.current !== workspaceId) return;
      setWorkspaceCdnRoot(result.folder);
      if (result.folder) {
        const rootPath = [result.folder];
        setPhysicalBrowsePath(rootPath);
        setCdnAssetBrowseFolderId(result.folder.id); setCdnAssetBrowseFolderName(result.folder.name);
        await Promise.all([
          loadPhysicalChildren(result.folder.id),
          loadAssets(1, searchQuery, selectedType, result.folder.id),
        ]);
      } else {
        setPhysicalBrowsePath([]); setCdnAssetBrowseFolderId(''); setCdnAssetBrowseFolderName('');
      }
    } catch (error) {
      if (workspaceRootRequestSequence.current !== requestSequence || activeWorkspaceIdRef.current !== workspaceId) return;
      setWorkspaceCdnRoot(null);
      setWorkspaceRootError(error instanceof Error ? error.message : 'Workspace CDN folder could not be loaded.');
    } finally { if (workspaceRootRequestSequence.current === requestSequence && activeWorkspaceIdRef.current === workspaceId) setWorkspaceRootLoading(false); }
  };

  const openConnectRootModal = () => {
    setConnectingWorkspaceRoot(true); setConnectRootError(''); setCdnFolderPath([]);
    setShowConnectRootModal(true);
    void loadCdnFolders('', true);
  };

  const connectWorkspaceRoot = async () => {
    const selected = cdnFolderPath.at(-1);
    if (!activeWorkspaceId || !selected) return;
    const workspaceId = activeWorkspaceId;
    setConnectRootError('');
    try {
      const result = await api<{ folder: CdnFolder }>(`/workspaces/${encodeURIComponent(workspaceId)}/media/cdn-root`, {
        method: 'PUT', body: JSON.stringify({ cdnFolderId: selected.id }),
      });
      if (activeWorkspaceIdRef.current !== workspaceId) return;
      setWorkspaceCdnRoot(result.folder);
      setShowConnectRootModal(false); setConnectingWorkspaceRoot(false);
      setPhysicalBrowsePath([result.folder]);
      setCdnAssetBrowseFolderId(result.folder.id); setCdnAssetBrowseFolderName(result.folder.name);
      await Promise.all([loadPhysicalChildren(result.folder.id), loadAssets(1, searchQuery, selectedType, result.folder.id)]);
      showToast('success', 'CDN folder connected', `${result.folder.name} is now the physical root for this workspace.`);
    } catch (error) {
      setConnectRootError(error instanceof Error ? error.message : 'Could not connect this Kroombox folder.');
    }
  };

  /* Opens the mapped workspace root instead of the account-wide Kroombox root. */
  const browsePhysicalBreadcrumb = (index: number) => {
    const path = physicalBrowsePath.slice(0, index + 1);
    const folder = path.at(-1);
    if (folder) openPhysicalFolder(folder, path);
    else openPhysicalRoot();
  };

  const refreshCurrentFolder = () => {
    const parentId = physicalBrowsePath.at(-1)?.id || '';
    void loadPhysicalChildren(parentId);
    void loadAssets(1, searchQuery, selectedType, parentId);
  };

  const openUploadModal = () => {
    if (!workspaceCdnRoot) return;
    setConnectingWorkspaceRoot(false);
    const initialPath = [workspaceCdnRoot];
    setCdnFolderPath(initialPath); setUploadFolderId(''); setUploadFolderName('');
    setShowUploadModal(true);
    void loadCdnFolders(initialPath.at(-1)?.id || '');
  };

  const openCdnFolder = (folder: CdnFolder) => {
    setCdnFolderPath((path) => [...path, folder]);
    void loadCdnFolders(folder.id, connectingWorkspaceRoot);
  };

  const selectUploadDestination = () => {
    const selected = cdnFolderPath[cdnFolderPath.length - 1];
    if (!selected) return;
    setUploadFolderId(selected.id);
    setUploadFolderName(cdnFolderPath.map((folder) => folder.name).join(' / '));
  };

  useEffect(() => {
    const requestSequence = ++workspaceRootRequestSequence.current;
    void loadWorkspaceCdnRoot(activeWorkspaceId || '', requestSequence);
    return () => { if (workspaceRootRequestSequence.current === requestSequence) workspaceRootRequestSequence.current += 1; };
  }, [activeWorkspaceId]);
  const filteredAssets = mediaAssets;

  const handleCopyUrl = (url: string) => {
    navigator.clipboard?.writeText(url);
    showToast('success', 'Kroombox CDN Link Copied', url);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !activeWorkspaceId) return;
    const form = new FormData();
    form.append('file', uploadFile);
    if (!uploadFolderId) { showToast('error', 'Choose a destination', 'Select a physical Kroombox folder before uploading.'); return; }
    setIsUploading(true);
    try {
      const signature = `${uploadFile.name}:${uploadFile.size}:${uploadFile.lastModified}:${uploadFolderId}`;
      if (uploadAttempt.current?.signature !== signature) uploadAttempt.current = { signature, key: crypto.randomUUID() };
      const idempotencyKey = uploadAttempt.current?.key;
      if (!idempotencyKey) throw new Error('Could not prepare a safe upload retry key.');
      await api(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/upload?parentId=${encodeURIComponent(uploadFolderId)}`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: form });
      setShowUploadModal(false);
      setUploadFile(null);
      uploadAttempt.current = null;
      setPhysicalBrowsePath(cdnFolderPath);
      setCdnAssetBrowseFolderId(uploadFolderId); setCdnAssetBrowseFolderName(uploadFolderName);
      await loadPhysicalChildren(uploadFolderId);
      showToast('success', 'Upload accepted', 'Kroombox is processing the file. Refresh the library to see it when ready.');
      await loadAssets(1, searchQuery, selectedType, uploadFolderId);
    } catch (error) {
      showToast('error', 'Upload failed', error instanceof Error ? error.message : 'Kroombox upload failed.');
    } finally { setIsUploading(false); }
  };

  const getSignedPreviewUrl = (assetId: string, refresh = false): Promise<string> => {
    if (!activeWorkspaceId) return Promise.reject(new Error('Select a workspace before previewing media.'));
    const cacheKey = `${activeWorkspaceId}:${assetId}`;
    const cached = signedPreviewCache.current.get(cacheKey);
    if (refresh) signedPreviewCache.current.delete(cacheKey);
    else if (cached && cached.expiresAt > Date.now() + 30_000) return Promise.resolve(cached.url);
    const inFlight = signedPreviewRequests.current.get(cacheKey);
    if (inFlight) return inFlight;
    const request = api<{ url: string; expiresAt?: string; expiresIn?: number }>(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(assetId)}/preview`)
      .then((result) => {
        if (!result.url) throw new Error('Kroombox did not return a preview URL.');
        const expiry = result.expiresAt ? Date.parse(result.expiresAt) : Number.NaN;
        const fallbackLifetime = Math.max(60, Number(result.expiresIn) || 3600) * 1000;
        signedPreviewCache.current.set(cacheKey, { url: result.url, expiresAt: Number.isFinite(expiry) ? expiry : Date.now() + fallbackLifetime });
        return result.url;
      })
      .finally(() => { signedPreviewRequests.current.delete(cacheKey); });
    signedPreviewRequests.current.set(cacheKey, request);
    return request;
  };

  useEffect(() => {
    let cancelled = false;
    const previewable = mediaAssets.filter((asset) => asset.type === 'image' || asset.type === 'video');
    if (!previewable.length || !activeWorkspaceId) {
      setThumbnailStates({});
      return () => { cancelled = true; };
    }
    setThumbnailStates((current) => {
      const next = { ...current };
      for (const asset of previewable) {
        const cacheKey = `${activeWorkspaceId}:${asset.id}`;
        const cached = signedPreviewCache.current.get(cacheKey);
        next[asset.id] = cached && cached.expiresAt > Date.now() + 30_000
          ? { status: 'ready', url: cached.url }
          : { status: 'loading' };
      }
      return next;
    });
    for (const asset of previewable) {
      getSignedPreviewUrl(asset.id).then((url) => {
        if (!cancelled) setThumbnailStates((current) => ({ ...current, [asset.id]: { status: 'ready', url } }));
      }).catch(() => {
        if (!cancelled) setThumbnailStates((current) => ({ ...current, [asset.id]: { status: 'failed' } }));
      });
    }
    return () => { cancelled = true; };
  }, [activeWorkspaceId, mediaAssets]);

  const retryThumbnail = (asset: MediaAsset) => {
    const cacheKey = `${activeWorkspaceId}:${asset.id}`;
    if (!activeWorkspaceId || thumbnailRetryKeys.current.has(cacheKey)) {
      setThumbnailStates((current) => ({ ...current, [asset.id]: { status: 'failed' } }));
      return;
    }
    thumbnailRetryKeys.current.add(cacheKey);
    setThumbnailStates((current) => ({ ...current, [asset.id]: { status: 'loading' } }));
    void getSignedPreviewUrl(asset.id, true).then((url) => {
      setThumbnailStates((current) => ({ ...current, [asset.id]: { status: 'ready', url } }));
    }).catch(() => {
      setThumbnailStates((current) => ({ ...current, [asset.id]: { status: 'failed' } }));
    });
  };

  const openPreview = async (asset: MediaAsset) => {
    if (!activeWorkspaceId) { setPreviewError('Select a workspace before previewing media.'); return; }
    setPreviewAsset(asset); setPreviewUrl(''); setPreviewError(''); setPreviewLoading(true);
    try {
      setPreviewUrl(await getSignedPreviewUrl(asset.id));
    } catch (error) { setPreviewError(error instanceof Error ? error.message : 'Preview could not be prepared.'); }
    finally { setPreviewLoading(false); }
  };

  const copyAssetCdnUrl = async (asset: MediaAsset) => {
    try { handleCopyUrl(await getSignedPreviewUrl(asset.id)); }
    catch (error) { showToast('error', 'Preview URL unavailable', error instanceof Error ? error.message : 'Could not prepare a CDN preview URL.'); }
  };

  const refreshDetailPreview = async (asset: MediaAsset) => {
    const cacheKey = `${activeWorkspaceId}:${asset.id}`;
    if (!activeWorkspaceId || detailPreviewRetryKeys.current.has(cacheKey)) {
      setDetailPreviewError('Preview could not be loaded. Try closing and reopening this asset.');
      return;
    }
    detailPreviewRetryKeys.current.add(cacheKey);
    const requestSequence = detailRequestSequence.current;
    setDetailPreviewLoading(true); setDetailPreviewError('');
    try {
      const url = await getSignedPreviewUrl(asset.id, true);
      if (requestSequence === detailRequestSequence.current) setDetailPreviewUrl(url);
    } catch {
      if (requestSequence === detailRequestSequence.current) setDetailPreviewError('Preview could not be loaded. Try closing and reopening this asset.');
    } finally {
      if (requestSequence === detailRequestSequence.current) setDetailPreviewLoading(false);
    }
  };

  const openDetails = async (asset: MediaAsset) => {
    if (!activeWorkspaceId) { showToast('error', 'Workspace required', 'Select a workspace before opening media details.'); return; }
    const requestSequence = ++detailRequestSequence.current;
    detailPreviewRetryKeys.current.delete(`${activeWorkspaceId}:${asset.id}`);
    setDetailAsset(asset); setMetadata(null); setDetailPreviewUrl(''); setDetailPreviewError(''); setDetailPreviewLoading(true);
    const [metadataResult, previewResult] = await Promise.allSettled([
      api<{ asset: Record<string, unknown> }>(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(asset.id)}/metadata`),
      getSignedPreviewUrl(asset.id),
    ]);
    if (requestSequence !== detailRequestSequence.current) return;
    if (metadataResult.status === 'fulfilled') setMetadata(metadataResult.value.asset);
    else showToast('error', 'Metadata unavailable', metadataResult.reason instanceof Error ? metadataResult.reason.message : 'Could not retrieve asset metadata.');
    if (previewResult.status === 'fulfilled') setDetailPreviewUrl(previewResult.value);
    else setDetailPreviewError(previewResult.reason instanceof Error ? previewResult.reason.message : 'Could not prepare the signed CDN preview.');
    setDetailPreviewLoading(false);
  };

  const deleteAsset = async () => {
    if (!detailAsset || !activeWorkspaceId || !confirm(`Delete ${detailAsset.name} from Kroombox?`)) return;
    try {
      await api(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(detailAsset.id)}`, { method: 'DELETE' });
      setDetailAsset(null);
      showToast('success', 'Asset deleted', 'The asset was deleted from Kroombox.');
      await loadAssets(1);
    } catch (error) { showToast('error', 'Delete failed', error instanceof Error ? error.message : 'Kroombox delete failed.'); }
  };

  const attachAsset = async () => {
    if (!detailAsset?.repositoryFileId || !attachContentId || !activeWorkspaceId) return;
    try {
      await api(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(detailAsset.repositoryFileId)}/attach`, { method: 'POST', body: JSON.stringify({ contentId: attachContentId }) });
      showToast('success', 'Asset attached', 'The media file was linked to the selected content project.');
    } catch (error) { showToast('error', 'Could not attach asset', error instanceof Error ? error.message : 'The media file could not be attached.'); }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & CDN Status */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Digital Asset Management (DAM)
            </span>
            <span className="text-slate-300">·</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex items-center gap-1.5 ${loadError || workspaceRootError ? 'text-rose-700 bg-rose-50 border-rose-200' : workspaceRootLoading || loading ? 'text-slate-600 bg-slate-50 border-slate-200' : workspaceCdnRoot ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-800 bg-amber-50 border-amber-200'}`}>
              <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
              {loadError || workspaceRootError ? 'Media unavailable' : workspaceRootLoading || loading ? 'Connecting to media…' : workspaceCdnRoot ? 'Workspace CDN connected' : 'CDN folder required'}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Media Library & Footage Repository
          </h2>
          <p className="text-xs text-slate-500">{workspaceCdnRoot ? `Live Kroombox assets under ${workspaceCdnRoot.name}.` : 'Connect one physical Kroombox folder to isolate this workspace’s media.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {workspaceCdnRoot && <button type="button" onClick={openConnectRootModal} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Change CDN Folder</button>}
          {workspaceCdnRoot ? <button onClick={openUploadModal} className="flex items-center gap-1.5 rounded-lg bg-[#F5C518] px-3.5 py-2 text-xs font-bold text-[#111827] shadow-xs transition-all hover:bg-[#E5B510]"><Upload className="h-4 w-4 stroke-[2.5]" /><span>Upload Media</span></button> : <button onClick={openConnectRootModal} disabled={workspaceRootLoading} className="flex items-center gap-1.5 rounded-lg bg-[#F5C518] px-3.5 py-2 text-xs font-bold text-[#111827] shadow-xs transition-all hover:bg-[#E5B510] disabled:opacity-50"><HardDrive className="h-4 w-4" /><span>Connect CDN Folder</span></button>}
        </div>
      </div>

      {!workspaceCdnRoot && !workspaceRootLoading && <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">This workspace has no CDN root folder yet.</p><p className="mt-1">Connect an existing physical Kroombox folder. Its ID is stored against this workspace and remains stable if the workspace name changes.</p>{workspaceRootError && <p className="mt-1 text-rose-700">{workspaceRootError}</p>}</div><button type="button" onClick={openConnectRootModal} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white">Connect CDN Folder</button></div>}

      {workspaceCdnRoot && (loadError || loading || mediaAssets.length === 0) && (
        <div className={`rounded-xl border p-4 text-xs ${loadError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-600'}`}>
          {loading ? 'Loading Kroombox assets…' : loadError || 'No assets on this page. Try another folder or refresh the library.'}
          {loadError && <button onClick={() => void loadAssets(1)} className="ml-3 font-bold underline">Retry</button>}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <FolderArchive className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-800">File manager</span>
            <button type="button" disabled={!workspaceCdnRoot || loading} onClick={refreshCurrentFolder} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">Refresh</button>
            <button type="button" disabled title="Kroombox does not document physical folder creation. Browse or select an existing CDN folder instead." className="flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 font-semibold text-slate-400"><Plus className="h-3.5 w-3.5" /> Add Folder</button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="List View"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-[10px] text-slate-500">Add Folder is disabled because Kroombox does not document physical folder creation. Browse existing CDN folders or select one as an upload destination.</p>

        <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 text-[11px]">
          <button type="button" onClick={openPhysicalRoot} disabled={!workspaceCdnRoot} className="font-semibold text-indigo-700 disabled:opacity-40">Workspace CDN root</button>
          {physicalBrowsePath.slice(1).map((folder, index) => <React.Fragment key={folder.id}><span className="text-slate-400">/</span><button type="button" onClick={() => browsePhysicalBreadcrumb(index + 1)} className="font-semibold text-indigo-700">{folder.name}</button></React.Fragment>)}
        </div>

        <div className="rounded-lg border border-slate-100">
          {!workspaceCdnRoot ? <p className="p-3 text-xs text-slate-500">Connect a physical CDN root to browse folders and files for this workspace.</p> : physicalChildrenLoading ? <p className="p-3 text-xs text-slate-500">Loading Kroombox folders…</p> : physicalChildrenError ? <p className="p-3 text-xs text-rose-700">{physicalChildrenError}</p> : physicalChildren.length ? <div className="divide-y divide-slate-100">{physicalChildren.map((folder) => <button type="button" key={folder.id} onClick={() => openPhysicalFolder(folder)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"><FolderArchive className="h-4 w-4 text-amber-500" /><span className="flex-1 truncate text-xs font-semibold text-slate-800">{folder.name}</span><span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">CDN</span><span className="text-[10px] text-slate-400">Open ›</span></button>)}</div> : <p className="p-3 text-xs text-slate-500">No physical subfolders here. {mediaAssets.length ? 'Files in this location are listed below.' : 'This folder is empty.'}</p>}
        </div>

        {/* Search & Type filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="relative sm:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              disabled={!workspaceCdnRoot}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void loadAssets(1, searchQuery); }}
              placeholder="Search by file name, tag, or format..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#F5C518]"
            />
          </div>

          <select
            value={selectedType}
            disabled={!workspaceCdnRoot}
            onChange={(e) => { setSelectedType(e.target.value); void loadAssets(1, searchQuery, e.target.value); }}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#F5C518]"
          >
            <option value="all">All File Types</option>
            <option value="video">Video (MP4 / MOV)</option>
            <option value="audio">Audio (WAV / MP3)</option>
            <option value="image">Image (PNG / JPG)</option>
            <option value="document">Document (PDF)</option>
          </select>
        </div>
      </div>

      {/* GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAssets.map((asset) => {
            const thumbnail = thumbnailStates[asset.id];
            const hasThumb = thumbnail?.status === 'ready' && Boolean(thumbnail.url);
            return (
              <div
                key={asset.id}
                className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                {/* Thumbnail / Media Frame */}
                <div
                  onClick={() => void openPreview(asset)}
                  className="aspect-video bg-slate-900 relative cursor-pointer overflow-hidden flex items-center justify-center"
                >
                  {hasThumb && asset.type === 'image' ? (
                    <img
                      src={apiUrl(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(asset.id)}/preview/content`)}
                      alt={asset.name}
                      onLoad={() => thumbnailRetryKeys.current.delete(`${activeWorkspaceId}:${asset.id}`)}
                      onError={() => retryThumbnail(asset)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : hasThumb && asset.type === 'video' ? (
                    <video
                      src={thumbnail?.url}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(event) => {
                        const video = event.currentTarget;
                        video.currentTime = Math.min(1, Math.max(0, video.duration * 0.1));
                      }}
                      onLoadedData={() => thumbnailRetryKeys.current.delete(`${activeWorkspaceId}:${asset.id}`)}
                      onError={() => retryThumbnail(asset)}
                      className="w-full h-full object-cover"
                    />
                  ) : thumbnail?.status === 'loading' ? (
                    <div className="absolute inset-0 animate-pulse bg-slate-800">
                      <div className="absolute inset-0 flex items-center justify-center"><Film className="h-8 w-8 text-slate-600" /></div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 p-4 text-center text-slate-400">
                      {asset.type === 'image' ? <ImageIcon className="h-8 w-8 text-slate-500" /> : asset.type === 'audio' ? <Music className="h-8 w-8 text-[#F5C518]" /> : <Film className="h-8 w-8 text-slate-500" />}
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{thumbnail?.status === 'failed' ? 'Preview unavailable' : asset.folder}</span>
                    </div>
                  )}

                  {(asset.type === 'image' || asset.type === 'video') && <span className="absolute left-2 top-2 rounded-md bg-black/65 p-1 text-white" aria-label={asset.type === 'image' ? 'Image file' : 'Video file'} title={asset.type === 'image' ? 'Image' : 'Video'}>{asset.type === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}</span>}

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-3 py-1.5 bg-[#F5C518] text-[#111827] text-xs font-bold rounded-lg flex items-center gap-1 shadow-md">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Preview
                    </span>
                  </div>

                  {asset.duration && (
                    <span className="absolute bottom-2 right-2 bg-black/80 text-white font-mono text-[10px] px-1.5 py-0.5 rounded">
                      {asset.duration}
                    </span>
                  )}
                </div>

                {/* Info body */}
                <div className="p-3.5 space-y-2 text-xs flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                      {asset.folder}
                    </span>
                    <h3
                      onClick={() => void openDetails(asset)}
                      className="font-bold text-slate-900 hover:text-blue-600 cursor-pointer line-clamp-1 mt-0.5"
                      title={asset.name}
                    >
                      {asset.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 font-mono">
                      <span>{asset.fileSizeMb} MB</span>
                      <span>·</span>
                      <span>{asset.mimeType || '—'}</span>
                    </div>
                  </div>

                  {/* Quick copy URL button */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => void copyAssetCdnUrl(asset)}
                      className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 font-medium py-1 px-2 rounded hover:bg-slate-100"
                    >
                      <Copy className="w-3 h-3 text-slate-400" />
                      <span>Copy CDN</span>
                    </button>

                    <button
                      onClick={() => void openDetails(asset)}
                      className="text-[11px] font-bold text-[#111827] bg-[#F5C518]/20 hover:bg-[#F5C518] px-2 py-1 rounded transition-colors"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Asset Name</th>
                  <th className="py-3 px-3">Folder Category</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">File Size</th>
                  <th className="py-3 px-3">Resolution / Length</th>
                  <th className="py-3 px-3">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900 max-w-sm truncate">
                      <button
                        onClick={() => void openDetails(asset)}
                        className="hover:underline text-left text-slate-900 truncate block"
                      >
                        {asset.name}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{asset.folder}</td>
                    <td className="py-3 px-3 uppercase text-[10px] font-mono font-bold text-slate-500">
                      {asset.type}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-slate-700">
                      {asset.fileSizeMb} MB
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {asset.resolution || asset.duration || '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {asset.uploadedAt}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => void copyAssetCdnUrl(asset)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          title="Copy CDN Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                        onClick={() => void openPreview(asset)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          title="Preview"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                        onClick={() => void openDetails(asset)}
                          className="px-2 py-1 text-[11px] font-semibold text-[#111827] bg-[#F5C518] hover:bg-[#E5B510] rounded"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
        <span className="text-slate-500">Page {pagination.page}{pagination.totalPages ? ` of ${pagination.totalPages}` : ''} · {pagination.total} assets</span>
        <div className="flex gap-2">
          <button disabled={!pagination.hasPrev || loading} onClick={() => void loadAssets(pagination.page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40">Previous</button>
          <button disabled={!pagination.hasNext || loading} onClick={() => void loadAssets(pagination.page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40">Next</button>
          <button onClick={refreshCurrentFolder} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white">Refresh</button>
        </div>
      </div>

      {/* MODAL UPLOAD MEDIA */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Upload Media to Kroombox CDN</h3>
                <p className="text-xs text-slate-500">Upload is streamed through the UniFlow backend to Kroombox.</p>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Choose file</label>
                <input
                  type="file"
                  required
                  onChange={(event) => { setUploadFile(event.target.files?.[0] || null); uploadAttempt.current = null; }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Destination folder · Kroombox CDN</label>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-1 text-[11px]"><button type="button" onClick={() => { const rootPath = workspaceCdnRoot ? [workspaceCdnRoot] : []; setCdnFolderPath(rootPath); void loadCdnFolders(workspaceCdnRoot?.id || ''); }} className="font-semibold text-indigo-700">Workspace root</button>{cdnFolderPath.slice(1).map((folder, index) => <React.Fragment key={folder.id}><span className="text-slate-400">/</span><button type="button" onClick={() => { const next = cdnFolderPath.slice(0, index + 2); setCdnFolderPath(next); void loadCdnFolders(folder.id); }} className="font-semibold text-indigo-700">{folder.name}</button></React.Fragment>)}</div>
                  {cdnFoldersLoading ? <div className="p-4 text-center text-xs text-slate-500">Loading CDN folders…</div> : cdnFoldersError ? <div className="rounded bg-rose-50 p-3 text-xs text-rose-800">{cdnFoldersError}<button type="button" onClick={() => void loadCdnFolders(cdnFolderPath.at(-1)?.id || '')} className="ml-2 font-bold underline">Retry</button></div> : cdnFolders.length ? <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto">{cdnFolders.map((folder) => <button type="button" key={folder.id} onClick={() => openCdnFolder(folder)} className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs hover:bg-slate-50"><FolderArchive className="h-4 w-4 text-amber-500" /><span className="flex-1 truncate font-medium text-slate-800">{folder.name}</span><span className="text-[10px] text-slate-400">Open ›</span></button>)}</div> : <p className="py-2 text-center text-xs text-slate-500">No subfolders in this location.</p>}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2"><span className="truncate text-[10px] text-slate-600">{uploadFolderName ? `Selected: ${uploadFolderName}` : cdnFolderPath.length ? `Current: ${cdnFolderPath.map((folder) => folder.name).join(' / ')}` : 'Choose a physical folder'}</span><button type="button" disabled={!cdnFolderPath.length || cdnFoldersLoading} onClick={selectUploadDestination} className="shrink-0 rounded-md bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40">Use this folder</button></div>
                </div>
                {!uploadFolderId && <p className="mt-1 text-rose-700">Select a physical Kroombox folder before uploading.</p>}
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
                {uploadFile ? `${uploadFile.name} · ${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Kroombox will validate file type and size.'}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile || !uploadFolderId || Boolean(cdnFoldersError)}
                  className="px-4 py-2 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {isUploading ? 'Uploading to CDN...' : 'Upload File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConnectRootModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => { setShowConnectRootModal(false); setConnectingWorkspaceRoot(false); }}>
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div><h3 className="text-sm font-bold text-slate-900">Connect CDN Folder</h3><p className="mt-1 text-xs text-slate-500">Choose an existing physical Kroombox folder as this workspace’s root. The mapping uses the workspace ID, so workspace renames do not affect it.</p></div>
              <button type="button" onClick={() => { setShowConnectRootModal(false); setConnectingWorkspaceRoot(false); }} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-1 text-[11px]"><button type="button" onClick={() => { setCdnFolderPath([]); void loadCdnFolders('', true); }} className="font-semibold text-indigo-700">Kroombox folders</button>{cdnFolderPath.map((folder, index) => <React.Fragment key={folder.id}><span className="text-slate-400">/</span><button type="button" onClick={() => { const next = cdnFolderPath.slice(0, index + 1); setCdnFolderPath(next); void loadCdnFolders(folder.id, true); }} className="font-semibold text-indigo-700">{folder.name}</button></React.Fragment>)}</div>
              {cdnFoldersLoading ? <p className="p-4 text-center text-xs text-slate-500">Loading existing Kroombox folders…</p> : cdnFoldersError ? <p className="rounded bg-rose-50 p-3 text-xs text-rose-800">{cdnFoldersError}<button type="button" onClick={() => void loadCdnFolders(cdnFolderPath.at(-1)?.id || '', true)} className="ml-2 font-bold underline">Retry</button></p> : cdnFolders.length ? <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto">{cdnFolders.map((folder) => <button type="button" key={folder.id} onClick={() => openCdnFolder(folder)} className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs hover:bg-slate-50"><FolderArchive className="h-4 w-4 text-amber-500" /><span className="flex-1 truncate font-medium text-slate-800">{folder.name}</span><span className="text-[10px] text-slate-400">Open ›</span></button>)}</div> : <p className="py-2 text-center text-xs text-slate-500">No subfolders here. Select this folder if it is the intended workspace root.</p>}
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2"><span className="truncate text-[10px] text-slate-600">{cdnFolderPath.length ? cdnFolderPath.map((folder) => folder.name).join(' / ') : 'Select a physical folder'}</span><button type="button" disabled={!cdnFolderPath.length || cdnFoldersLoading} onClick={() => void connectWorkspaceRoot()} className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40">Connect this folder</button></div>
            </div>
            {connectRootError && <p className="rounded bg-rose-50 p-3 text-xs text-rose-800">{connectRootError}</p>}
            <p className="text-[10px] text-slate-500">Physical folder creation is not documented by Kroombox, so UniFlow only connects folders that already exist.</p>
          </div>
        </div>
      )}

      {/* ASSET DETAIL DRAWER */}
      {detailAsset && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white max-w-md w-full h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Asset Metadata & Storage</h3>
                <button onClick={() => setDetailAsset(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Preview frame */}
              <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
                {detailPreviewLoading ? <div className="h-full w-full animate-pulse bg-slate-800" /> : detailPreviewError ? <div className="flex flex-col items-center gap-2 p-4 text-center text-slate-400"><ImageIcon className="h-8 w-8" /><span className="text-xs">{detailPreviewError}</span></div> : detailAsset.type === 'image' && detailPreviewUrl ? <img src={apiUrl(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(detailAsset.id)}/preview/content`)} alt={detailAsset.name} onLoad={() => detailPreviewRetryKeys.current.delete(`${activeWorkspaceId}:${detailAsset.id}`)} onError={() => void refreshDetailPreview(detailAsset)} className="h-full w-full object-contain" /> : detailAsset.type === 'video' && detailPreviewUrl ? <video src={apiUrl(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(detailAsset.id)}/preview/content`)} controls playsInline preload="metadata" onLoadedData={() => detailPreviewRetryKeys.current.delete(`${activeWorkspaceId}:${detailAsset.id}`)} onError={() => void refreshDetailPreview(detailAsset)} className="h-full w-full object-contain" /> : <Film className="w-10 h-10 text-slate-600" />}
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">File Identifier</span>
                  <p className="font-bold text-slate-900 mt-0.5 break-all">{detailAsset.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-500 break-all">CDN ID: {detailAsset.id}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Folder Category</span>
                    <span className="font-semibold text-slate-800">{detailAsset.parentId || 'Root'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">File Size</span>
                    <span className="font-mono font-semibold text-slate-800">{detailAsset.fileSizeMb} MB</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Resolution</span>
                    <span className="font-mono text-slate-800">{detailAsset.mimeType || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Runtime</span>
                    <span className="font-mono text-slate-800">{String(metadata?.status || '—')}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                    Kroombox Edge Endpoint URL
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={detailPreviewUrl}
                      className="w-full text-[11px] font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-700"
                    />
                    <button
                      onClick={() => detailPreviewUrl && handleCopyUrl(detailPreviewUrl)}
                      disabled={!detailPreviewUrl}
                      className="p-1.5 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] rounded shadow-xs"
                      title="Copy Link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-[10px] text-emerald-600 mt-1 block">
                    {detailAsset.cdnProvider} {metadata ? '· Metadata loaded' : '· Loading metadata…'}{detailPreviewLoading ? ' · Preparing signed preview…' : detailPreviewError ? ' · Preview unavailable' : detailPreviewUrl ? ' · Signed CDN preview' : ''}
                  </span>
                </div>

                {/* Attach to content */}
                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 space-y-2">
                  <span className="font-bold text-slate-900 block">Attach to Active Project:</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={attachContentId}
                      onChange={(e) => setAttachContentId(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                    >
                      {contents.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => void attachAsset()}
                      className="px-3 py-1.5 bg-[#111827] text-white hover:bg-slate-800 font-semibold rounded-lg shrink-0"
                    >
                      Attach
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
            <button onClick={() => void openPreview(detailAsset)} className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl">Preview</button>
            <button onClick={() => void deleteAsset()} className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs rounded-xl">Delete from Kroombox</button>
            <button
              onClick={() => setDetailAsset(null)}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              Close Details
            </button>
            </div>
          </div>
        </div>
      )}

      {/* MEDIA PREVIEW MODAL */}
      {previewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-[#111827] text-white rounded-2xl max-w-xl w-full p-6 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-mono font-bold text-[#F5C518]">
                KROOMBOX CDN MEDIA PLAYER · {previewAsset.type.toUpperCase()}
              </span>
              <button onClick={() => { setPreviewAsset(null); setPreviewUrl(''); }} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="aspect-video bg-black rounded-xl border border-slate-800 relative overflow-hidden flex items-center justify-center">
              {previewLoading ? <span className="text-xs text-slate-300">Preparing signed preview…</span> : previewError ? <span className="p-4 text-center text-xs text-rose-300">{previewError}</span> : previewUrl && previewAsset.type === 'image' ? <img src={apiUrl(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(previewAsset.id)}/preview/content`)} alt={previewAsset.name} className="h-full w-full object-contain" /> : previewUrl && previewAsset.type === 'audio' ? <audio src={previewUrl} controls className="w-[90%]" /> : previewUrl && previewAsset.type === 'video' ? <video src={apiUrl(`/workspaces/${encodeURIComponent(activeWorkspaceId)}/media/${encodeURIComponent(previewAsset.id)}/preview/content`)} controls className="h-full w-full" /> : previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-[#F5C518] underline">Open document preview</a> : null}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>{previewAsset.name}</span>
                <span>{previewAsset.mimeType}</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => previewUrl && handleCopyUrl(previewUrl)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy CDN URL</span>
              </button>
              <button
                onClick={() => { setPreviewAsset(null); setPreviewUrl(''); }}
                className="px-4 py-1.5 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] text-xs font-bold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, Eye, Film, Folder, Grid2X2, Image as ImageIcon,
  List as ListIcon, Loader2, RefreshCw, Search, Trash2, X,
} from 'lucide-react';
import { api, apiUrl } from '../../api/client';
import { SceneFootageAsset } from '../../types/cms';

type Section = 'main_visual' | 'a_roll' | 'b_roll';
type CdnFolder = { id: string; name: string; parentId?: string | null };
type Asset = { id: string; repositoryFileId: string; name: string; mimeType: string; size: number; parentId?: string | null };
type Props = { label: string; workspaceId?: string; contentId: string; sceneId?: string; section: Section; linkedAssets?: SceneFootageAsset[] };
type Pagination = { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
type ViewMode = 'grid' | 'list';

const emptyPagination: Pagination = { page: 1, limit: 24, total: 0, totalPages: 0, hasNext: false, hasPrev: false };
const emptyLinks: SceneFootageAsset[] = [];

function assetPreviewUrl(workspaceId: string, assetId: string) {
  return apiUrl(`/workspaces/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(assetId)}/preview/content`);
}

function MediaPickerModal({
  workspaceId, currentAssetId, onClose, onConfirm,
}: {
  workspaceId: string;
  currentAssetId?: string;
  onClose: () => void;
  onConfirm: (asset: Asset) => Promise<void>;
}) {
  const [folderPath, setFolderPath] = useState<CdnFolder[]>([]);
  const [folders, setFolders] = useState<CdnFolder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Asset | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const currentFolderId = folderPath.at(-1)?.id || '';

  const loadFolder = useCallback(async (
    folderId: string,
    search: string,
    page: number,
    path: CdnFolder[],
  ) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    const base = `/workspaces/${encodeURIComponent(workspaceId)}/media`;
    const folderQuery = new URLSearchParams({ page: '1', limit: '100' });
    const fileQuery = new URLSearchParams({ page: String(page), limit: String(emptyPagination.limit) });
    if (folderId) { folderQuery.set('folderId', folderId); fileQuery.set('folderId', folderId); }
    if (search.trim()) { folderQuery.set('search', search.trim()); fileQuery.set('search', search.trim()); }
    try {
      const [folderResult, fileResult] = await Promise.all([
        api<{ folders: CdnFolder[] }>(`${base}/cdn-folders?${folderQuery}`),
        api<{ assets: Array<Record<string, unknown>>; pagination?: Pagination }>(`${base}?${fileQuery}`),
      ]);
      if (sequence !== requestSequence.current) return;
      setFolders(folderResult.folders || []);
      setAssets((fileResult.assets || []).map((item) => ({
        id: String(item.id),
        repositoryFileId: String(item.repositoryFileId || ''),
        name: String(item.name || 'Unnamed asset'),
        mimeType: String(item.mimeType || 'application/octet-stream'),
        size: Number(item.size || 0),
        parentId: item.parentId ? String(item.parentId) : null,
      })));
      setPagination(fileResult.pagination || { ...emptyPagination, page });
      setFolderPath(path);
      setSelected(null);
    } catch (cause) {
      if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : 'Media could not be loaded.');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadFolder('', '', 1, []);
    return () => { requestSequence.current += 1; };
  }, [loadFolder]);

  useEffect(() => {
    if (loading && !assets.length && !folders.length) return;
    const timer = window.setTimeout(() => void loadFolder(currentFolderId, searchQuery, 1, folderPath), 250);
    return () => window.clearTimeout(timer);
    // Search is intentionally debounced while keeping the current folder path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !confirming) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirming, onClose]);

  const openFolder = (folder: CdnFolder) => {
    void loadFolder(folder.id, searchQuery, 1, [...folderPath, folder]);
  };
  const openBreadcrumb = (index: number) => {
    const nextPath = index < 0 ? [] : folderPath.slice(0, index + 1);
    void loadFolder(nextPath.at(-1)?.id || '', searchQuery, 1, nextPath);
  };
  const changePage = (page: number) => void loadFolder(currentFolderId, searchQuery, page, folderPath);
  const confirm = async () => {
    if (!selected) return;
    setConfirming(true);
    try { await onConfirm(selected); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Footage could not be linked.'); }
    finally { setConfirming(false); }
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="media-picker-title" className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirming) onClose(); }}>
    <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div><h2 id="media-picker-title" className="text-lg font-bold text-slate-900">Select from Media Library</h2><p className="mt-0.5 text-xs text-slate-500">Choose one existing Kroombox file for this footage section.</p></div>
        <button type="button" onClick={onClose} disabled={confirming} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close media picker"><X className="h-5 w-5" /></button>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <nav aria-label="Folder breadcrumbs" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs">
          <button type="button" onClick={() => openBreadcrumb(-1)} className={`shrink-0 rounded px-1.5 py-1 font-semibold ${folderPath.length ? 'text-indigo-700 hover:bg-indigo-50' : 'text-slate-900'}`}>Workspace media</button>
          {folderPath.map((folder, index) => <React.Fragment key={folder.id}><ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" /><button type="button" onClick={() => openBreadcrumb(index)} className={`max-w-40 truncate rounded px-1.5 py-1 font-semibold ${index === folderPath.length - 1 ? 'text-slate-900' : 'text-indigo-700 hover:bg-indigo-50'}`}>{folder.name}</button></React.Fragment>)}
        </nav>
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search this folder" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></div>
        <div className="flex items-center rounded-lg border border-slate-200 p-0.5">
          <button type="button" onClick={() => setViewMode('grid')} aria-label="Grid view" aria-pressed={viewMode === 'grid'} className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><Grid2X2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => setViewMode('list')} aria-label="List view" aria-pressed={viewMode === 'list'} className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><ListIcon className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={() => void loadFolder(currentFolderId, searchQuery, pagination.page, folderPath)} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh folder"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {error && <div className="mx-5 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading && <div className="mb-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading folders and files…</div>}
        {folders.length > 0 && <div className="mb-4">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Folders</h3>
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4' : 'space-y-1'}>
            {folders.map((folder) => <button type="button" key={folder.id} onClick={() => openFolder(folder)} className={`flex min-w-0 items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-left hover:border-amber-300 hover:bg-amber-50 ${viewMode === 'list' ? 'w-full' : ''}`}><Folder className="h-5 w-5 shrink-0 fill-amber-200 text-amber-600" /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{folder.name}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></button>)}
          </div>
        </div>}
        {assets.length > 0 && <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Files <span className="font-normal normal-case">· {pagination.total}</span></h3>
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'space-y-1'}>
            {assets.map((asset) => {
              const active = selected?.id === asset.id;
              const isImage = asset.mimeType.startsWith('image/');
              const isVideo = asset.mimeType.startsWith('video/');
              return <button type="button" key={asset.id} onClick={() => setSelected(asset)} aria-pressed={active} className={`group min-w-0 overflow-hidden rounded-xl border text-left transition ${active ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'} ${viewMode === 'list' ? 'flex w-full items-center gap-3 p-2' : ''}`}>
                {viewMode === 'grid' ? <>
                  <div className="relative h-28 overflow-hidden bg-slate-900">
                    {(isImage || isVideo) ? isVideo ? <video src={assetPreviewUrl(workspaceId, asset.id)} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={assetPreviewUrl(workspaceId, asset.id)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-500"><Film className="h-8 w-8" /></div>}
                    <span className="absolute left-2 top-2 rounded-md bg-black/65 p-1 text-white">{isImage ? <ImageIcon className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}</span>
                    {active && <span className="absolute right-2 top-2 rounded-full bg-indigo-600 p-1 text-white"><Check className="h-3.5 w-3.5" /></span>}
                  </div>
                  <span className="block truncate px-3 py-2.5 text-xs font-semibold text-slate-800" title={asset.name}>{asset.name}</span>
                </> : <>
                  <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                    {(isImage || isVideo) ? isVideo ? <video src={assetPreviewUrl(workspaceId, asset.id)} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={assetPreviewUrl(workspaceId, asset.id)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-500"><Film className="h-5 w-5" /></div>}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{asset.name}</span><span className="shrink-0 text-xs text-slate-400">{asset.mimeType}</span>{active && <Check className="h-4 w-4 text-indigo-600" />}
                </>}
              </button>;
            })}
          </div>
        </div>}
        {!loading && !error && folders.length === 0 && assets.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-slate-400"><Folder className="h-10 w-10 text-slate-300" /><p className="text-sm font-semibold text-slate-600">No files in this folder</p><p className="text-xs">Choose another folder or clear the search.</p></div>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {pagination.totalPages > 1 && <><button type="button" onClick={() => changePage(pagination.page - 1)} disabled={!pagination.hasPrev || loading} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 font-semibold disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button type="button" onClick={() => changePage(pagination.page + 1)} disabled={!pagination.hasNext || loading} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 font-semibold disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button></>}
          {selected && <span className="max-w-[220px] truncate text-slate-700">Selected: {selected.name}</span>}
          {!selected && currentAssetId && <span>Choose one file to confirm.</span>}
        </div>
        <div className="ml-auto flex items-center gap-2"><button type="button" onClick={onClose} disabled={confirming} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" onClick={() => void confirm()} disabled={!selected || confirming} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{confirming && <Loader2 className="h-4 w-4 animate-spin" />}Confirm selection</button></div>
      </footer>
    </div>
  </div>;
}

export const SelectFootage: React.FC<Props> = ({ label, workspaceId, sceneId, section, linkedAssets }) => {
  const persistedLinks = linkedAssets || emptyLinks;
  const [currentLinks, setCurrentLinks] = useState<SceneFootageAsset[]>(persistedLinks);
  const [showPicker, setShowPicker] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<SceneFootageAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeAsset = currentLinks[0];

  useEffect(() => setCurrentLinks(persistedLinks), [persistedLinks]);

  const saveSelection = async (asset: Asset) => {
    if (!workspaceId || !sceneId) throw new Error('Save this scene before attaching footage.');
    if (!asset.repositoryFileId) throw new Error('This file is not available in the active workspace Media Library.');
    if (currentLinks.some((item) => item.cdnFileId === asset.id)) {
      setError('This file is already selected for this section.');
      return;
    }
    setBusy(true);
    setError('');
    const base = `/workspaces/${encodeURIComponent(workspaceId)}/media/scenes/${encodeURIComponent(sceneId)}/footage/${section}`;
    try {
      await api(base, { method: 'POST', body: JSON.stringify({ repositoryFileId: asset.repositoryFileId }) });
      await Promise.all(currentLinks.map((item) => api(`${base}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })));
      setCurrentLinks([{ id: asset.repositoryFileId, cdnFileId: asset.id, name: asset.name, mimeType: asset.mimeType, sizeBytes: asset.size, url: '' }]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save the selected footage.';
      setError(message);
      throw new Error(message);
    } finally { setBusy(false); }
  };

  const unlink = async () => {
    if (!workspaceId || !sceneId || !currentLinks.length) return;
    setBusy(true); setError('');
    try {
      const base = `/workspaces/${encodeURIComponent(workspaceId)}/media/scenes/${encodeURIComponent(sceneId)}/footage/${section}`;
      await Promise.all(currentLinks.map((item) => api(`${base}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })));
      setCurrentLinks([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not unlink footage.'); }
    finally { setBusy(false); }
  };

  return <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-600">{label} footage</span>
      <span className="text-[10px] text-slate-400">Optional · from Media Library</span>
    </div>
    {!sceneId ? <p className="mt-1 text-[10px] text-slate-500">Save the scene first to attach footage.</p> : <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!workspaceId || busy} onClick={() => { setError(''); setShowPicker(true); }} className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><Folder className="h-3.5 w-3.5" />Browse Media</button>
        {activeAsset ? <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-emerald-100 bg-white p-1.5">
          <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-slate-900">{activeAsset.mimeType.startsWith('image/') ? <img src={assetPreviewUrl(workspaceId || '', activeAsset.cdnFileId)} alt="" className="h-full w-full object-cover" /> : activeAsset.mimeType.startsWith('video/') ? <video src={assetPreviewUrl(workspaceId || '', activeAsset.cdnFileId)} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-500"><Film className="h-4 w-4" /></div>}</div>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700" title={activeAsset.name}>{activeAsset.name}{currentLinks.length > 1 ? ` +${currentLinks.length - 1} more` : ''}</span>
          <button type="button" disabled={busy} onClick={() => setPreviewAsset(activeAsset)} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />Preview</button>
          <button type="button" disabled={busy} onClick={() => void unlink()} title="Unlink footage; CDN file remains in Media Library" className="rounded p-1.5 text-rose-600 hover:bg-rose-50" aria-label={`Unlink ${label} footage`}><Trash2 className="h-4 w-4" /></button>
        </div> : <span className="text-xs text-slate-400">No footage selected</span>}
      </div>
      {error && <p role="alert" className="mt-1.5 text-[11px] text-rose-700">{error}</p>}
    </>}
    {showPicker && workspaceId && <MediaPickerModal workspaceId={workspaceId} currentAssetId={activeAsset?.cdnFileId} onClose={() => setShowPicker(false)} onConfirm={saveSelection} />}
    {previewAsset && workspaceId && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewAsset(null); }}><div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white p-4 shadow-2xl"><div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label} preview</p><h3 className="truncate text-sm font-bold text-slate-900">{previewAsset.name}</h3></div><button type="button" onClick={() => setPreviewAsset(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close preview"><X className="h-5 w-5" /></button></div><div className="flex max-h-[72vh] min-h-48 items-center justify-center overflow-hidden rounded-xl bg-slate-950">{previewAsset.mimeType.startsWith('image/') ? <img src={assetPreviewUrl(workspaceId, previewAsset.cdnFileId)} alt={previewAsset.name} className="max-h-[72vh] max-w-full object-contain" /> : <video src={assetPreviewUrl(workspaceId, previewAsset.cdnFileId)} controls autoPlay playsInline className="max-h-[72vh] w-full" />}</div><div className="mt-3 flex justify-end"><button type="button" onClick={() => setPreviewAsset(null)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Close</button></div></div></div>}
  </div>;
};

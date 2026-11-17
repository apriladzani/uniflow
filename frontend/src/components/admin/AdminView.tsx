import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Clapperboard, Image as ImageIcon, LoaderCircle, Palette, RefreshCw, Search, ShieldCheck, Trash2, Upload, Users } from 'lucide-react';
import { api, apiUrl } from '../../api/client';
import { useCMS } from '../../context/CMSContext';
import { setBranding } from '../../branding';

type AdminTab = 'users' | 'workspaces' | 'branding';
type BrandingAsset = 'logo' | 'favicon';

interface AdminUser {
  id: string;
  email: string;
  username: string;
  name: string;
  avatarUrl: string;
  status: string;
  isPlatformAdmin: boolean;
  signInMethods: string[];
  workspaceCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  contentCount: number;
  createdAt: string;
}

interface Overview { users: number; activeUsers: number; workspaces: number; contents: number }
interface AssetInfo { url: string; mime: string; updatedAt: string }
interface BrandingInfo { logo: AssetInfo | null; favicon: AssetInfo | null }

const ASSETS: Record<BrandingAsset, { title: string; help: string; accept: string; maxBytes: number }> = {
  logo: {
    title: 'Logo',
    help: 'Tampil di kiri atas sidebar dan di halaman login. Ruang kosong di sekeliling logo dipotong otomatis supaya logo terlihat jelas. Format PNG, JPG, atau WEBP, maksimal 512 KB.',
    accept: 'image/png,image/jpeg,image/webp',
    maxBytes: 512 * 1024,
  },
  favicon: {
    title: 'Favicon',
    help: 'Ikon kecil di tab browser, berlaku untuk semua pengunjung. Gunakan gambar persegi (disarankan 64×64 atau lebih) berformat PNG, ICO, JPG, atau WEBP, maksimal 512 KB.',
    accept: 'image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/webp,.ico',
    maxBytes: 512 * 1024,
  },
};

const assetSrc = (info: AssetInfo | null) => (info ? apiUrl(info.url.replace(/^\/api/, '')) : '');

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('File tidak bisa dibaca.'));
  reader.readAsDataURL(file);
});

/**
 * Makes an uploaded logo read well at sidebar size: trims the empty margin around the artwork
 * (transparent pixels, or pixels matching the corner background colour), keeps a small even
 * padding and the logo's own aspect ratio, and scales it to at most 512px wide/high as PNG.
 * Falls back to the original file on any failure.
 */
async function prepareLogo(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  try {
    const image = new Image();
    image.src = original;
    await image.decode();
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) return original;
    sourceContext.drawImage(image, 0, 0, width, height);
    const { data } = sourceContext.getImageData(0, 0, width, height);

    const [br, bg, bb, ba] = [data[0], data[1], data[2], data[3]];
    const transparentBackground = ba < 16;
    const isContent = (index: number) => {
      const alpha = data[index + 3];
      if (transparentBackground) return alpha > 16;
      if (alpha < 16) return false;
      return Math.abs(data[index] - br) + Math.abs(data[index + 1] - bg) + Math.abs(data[index + 2] - bb) > 48;
    };
    let top = height, left = width, right = -1, bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isContent((y * width + x) * 4)) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < 0) return original; // Blank image: nothing to trim.

    const cropWidth = right - left + 1;
    const cropHeight = bottom - top + 1;
    const padding = Math.round(Math.min(cropWidth, cropHeight) * 0.12);
    const fullWidth = cropWidth + padding * 2;
    const fullHeight = cropHeight + padding * 2;
    const ratio = Math.min(1, 512 / Math.max(fullWidth, fullHeight));
    const output = document.createElement('canvas');
    output.width = Math.round(fullWidth * ratio);
    output.height = Math.round(fullHeight * ratio);
    const context = output.getContext('2d');
    if (!context) return original;
    if (!transparentBackground) {
      context.fillStyle = `rgba(${br},${bg},${bb},${ba / 255})`;
      context.fillRect(0, 0, output.width, output.height);
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, left, top, cropWidth, cropHeight, padding * ratio, padding * ratio, cropWidth * ratio, cropHeight * ratio);
    return output.toDataURL('image/png');
  } catch {
    return original;
  }
}

export const AdminView: React.FC = () => {
  const { showToast } = useCMS();
  const [tab, setTab] = useState<AdminTab>('users');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [branding, setBrandingInfo] = useState<BrandingInfo>({ logo: null, favicon: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState<BrandingAsset | ''>('');
  const fileInputs = useRef<Record<BrandingAsset, HTMLInputElement | null>>({ logo: null, favicon: null });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [o, u, w, f] = await Promise.all([
        api<{ overview: Overview }>('/admin/overview'),
        api<{ users: AdminUser[] }>('/admin/users'),
        api<{ workspaces: AdminWorkspace[] }>('/admin/workspaces'),
        api<{ branding: BrandingInfo }>('/admin/branding'),
      ]);
      setOverview(o.overview);
      setUsers(u.users);
      setWorkspaces(w.workspaces);
      setBrandingInfo(f.branding);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Data admin gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const needle = query.trim().toLowerCase();
  const filteredUsers = useMemo(() => !needle ? users : users.filter((user) =>
    [user.name, user.email, user.username].some((value) => value?.toLowerCase().includes(needle))), [users, needle]);
  const filteredWorkspaces = useMemo(() => !needle ? workspaces : workspaces.filter((workspace) =>
    [workspace.name, workspace.slug, workspace.ownerName, workspace.ownerEmail].some((value) => value?.toLowerCase().includes(needle))), [workspaces, needle]);

  // Updates the admin cards and the live logo/favicon everywhere in the app.
  const applyBranding = (next: BrandingInfo) => {
    setBrandingInfo(next);
    setBranding({ logoUrl: next.logo?.url || '', faviconUrl: next.favicon?.url || '' });
  };

  const uploadAsset = async (asset: BrandingAsset, file: File) => {
    const rules = ASSETS[asset];
    if (file.size > rules.maxBytes) { showToast('error', 'File terlalu besar', `Ukuran ${rules.title.toLowerCase()} maksimal 512 KB.`); return; }
    setSaving(asset);
    try {
      const { branding: saved } = await api<{ branding: BrandingInfo }>(`/admin/branding/${asset}`, { method: 'PUT', body: JSON.stringify({ dataUrl: asset === 'logo' ? await prepareLogo(file) : await readAsDataUrl(file) }) });
      applyBranding(saved);
      showToast('success', `${rules.title} diperbarui`, `${rules.title} baru sudah aktif untuk semua pengguna.`);
    } catch (err) {
      showToast('error', `Gagal menyimpan ${rules.title.toLowerCase()}`, err instanceof Error ? err.message : 'Coba lagi.');
    } finally {
      setSaving('');
      const input = fileInputs.current[asset];
      if (input) input.value = '';
    }
  };

  const removeAsset = async (asset: BrandingAsset) => {
    const rules = ASSETS[asset];
    setSaving(asset);
    try {
      const { branding: saved } = await api<{ branding: BrandingInfo }>(`/admin/branding/${asset}`, { method: 'DELETE' });
      applyBranding(saved);
      showToast('success', `${rules.title} dihapus`, asset === 'logo' ? 'Kembali ke logo bawaan.' : 'Situs kembali tanpa favicon khusus.');
    } catch (err) {
      showToast('error', `Gagal menghapus ${rules.title.toLowerCase()}`, err instanceof Error ? err.message : 'Coba lagi.');
    } finally { setSaving(''); }
  };

  const tabs: { id: AdminTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'users', label: 'Users', icon: Users, count: users.length },
    { id: 'workspaces', label: 'Workspaces', icon: Building2, count: workspaces.length },
    { id: 'branding', label: 'Branding', icon: Palette },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><ShieldCheck size={14} /> Platform admin</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Admin</h1>
          <p className="mt-1 text-sm text-slate-500">Semua user dan workspace di UniFlow, serta logo dan favicon situs.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Total user', overview.users],
            ['User aktif', overview.activeUsers],
            ['Workspace', overview.workspaces],
            ['Konten', overview.contents],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex gap-1">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button key={id} onClick={() => setTab(id)} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === id ? 'border-[#F5C518] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              <Icon size={15} /> {label}
              {count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-xs tabular-nums text-slate-600">{count}</span>}
            </button>
          ))}
        </div>
        {tab !== 'branding' && (
          <label className="relative mb-2 w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === 'users' ? 'Cari nama, email, username' : 'Cari workspace atau owner'} className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F5C518]" />
          </label>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && !error && <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin" /> Memuat data…</div>}

      {!loading && !error && tab === 'users' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Login via</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Login terakhir</th><th className="px-4 py-3">Terdaftar</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.avatarUrl
                        ? <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                        : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{(user.name || user.email).slice(0, 1).toUpperCase()}</div>}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">{user.name}{user.isPlatformAdmin && <span className="rounded bg-[#F5C518]/25 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-800">Admin</span>}</div>
                        <div className="truncate text-xs text-slate-500">{user.email}{user.username ? ` · @${user.username}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.signInMethods.map((method) => method === 'google' ? 'Google' : 'Password').join(', ') || '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{user.workspaceCount}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{user.status}</span></td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(user.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(user.createdAt)}</td>
                </tr>
              ))}
              {!filteredUsers.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Tidak ada user yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && tab === 'workspaces' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Member</th><th className="px-4 py-3">Konten</th><th className="px-4 py-3">Dibuat</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWorkspaces.map((workspace) => (
                <tr key={workspace.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{workspace.name}</div>
                    <div className="text-xs text-slate-500">/{workspace.slug}{workspace.description ? ` · ${workspace.description}` : ''}</div>
                  </td>
                  <td className="px-4 py-3"><div className="text-slate-800">{workspace.ownerName || '—'}</div><div className="text-xs text-slate-500">{workspace.ownerEmail}</div></td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{workspace.memberCount}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{workspace.contentCount}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(workspace.createdAt)}</td>
                </tr>
              ))}
              {!filteredWorkspaces.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Tidak ada workspace yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && tab === 'branding' && (
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(ASSETS) as BrandingAsset[]).map((asset) => {
            const rules = ASSETS[asset];
            const info = branding[asset];
            const busy = saving === asset;
            return (
              <div key={asset} className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-base font-bold text-slate-900">{rules.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{rules.help}</p>
                <div className="mt-5 flex items-center gap-5">
                  <div className={`flex h-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 ${asset === 'logo' && info ? 'min-w-20 max-w-[180px] px-3' : 'w-20'}`}>
                    {info
                      ? <img src={assetSrc(info)} alt={`${rules.title} saat ini`} className={asset === 'logo' ? 'h-12 w-auto max-w-full rounded-lg object-contain' : 'h-10 w-10 object-contain'} />
                      : asset === 'logo'
                        ? <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#F5C518] text-[#111827]"><Clapperboard className="h-6 w-6" strokeWidth={2.2} /></div>
                        : <ImageIcon size={22} className="text-slate-400" />}
                  </div>
                  <div className="text-sm">
                    <div className="font-semibold text-slate-800">{info ? `${rules.title} khusus aktif` : asset === 'logo' ? 'Memakai logo bawaan' : 'Belum ada favicon khusus'}</div>
                    {info && <div className="text-xs text-slate-500">Diubah {formatDate(info.updatedAt)}</div>}
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <input ref={(element) => { fileInputs.current[asset] = element; }} type="file" accept={rules.accept} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(asset, file); }} />
                  <button onClick={() => fileInputs.current[asset]?.click()} disabled={Boolean(saving)} className="inline-flex items-center gap-2 rounded-lg bg-[#F5C518] px-4 py-2 text-sm font-semibold text-slate-900 hover:brightness-95 disabled:opacity-60">
                    {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />} {info ? `Ganti ${rules.title.toLowerCase()}` : `Upload ${rules.title.toLowerCase()}`}
                  </button>
                  {info && (
                    <button onClick={() => void removeAsset(asset)} disabled={Boolean(saving)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                      <Trash2 size={15} /> {asset === 'logo' ? 'Pakai logo bawaan' : 'Hapus'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

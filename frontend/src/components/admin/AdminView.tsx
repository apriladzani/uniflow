import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Image as ImageIcon, LoaderCircle, RefreshCw, Search, ShieldCheck, Trash2, Upload, Users } from 'lucide-react';
import { api, apiUrl } from '../../api/client';
import { useCMS } from '../../context/CMSContext';

type AdminTab = 'users' | 'workspaces' | 'favicon';

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
interface FaviconInfo { url: string; mime: string; updatedAt: string }

const FAVICON_ACCEPT = 'image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/webp,.ico';
const FAVICON_MAX_BYTES = 512 * 1024;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};

/** Points every <link rel="icon"> at the given URL (or the stored favicon endpoint). */
export function applyFavicon(url: string) {
  let links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  if (!links.length) {
    const link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
    links = [link];
  }
  links.forEach((link) => { link.href = url; });
}

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('File tidak bisa dibaca.'));
  reader.readAsDataURL(file);
});

export const AdminView: React.FC = () => {
  const { showToast } = useCMS();
  const [tab, setTab] = useState<AdminTab>('users');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [favicon, setFavicon] = useState<FaviconInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [o, u, w, f] = await Promise.all([
        api<{ overview: Overview }>('/admin/overview'),
        api<{ users: AdminUser[] }>('/admin/users'),
        api<{ workspaces: AdminWorkspace[] }>('/admin/workspaces'),
        api<{ favicon: FaviconInfo | null }>('/admin/favicon'),
      ]);
      setOverview(o.overview);
      setUsers(u.users);
      setWorkspaces(w.workspaces);
      setFavicon(f.favicon);
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

  const uploadFavicon = async (file: File) => {
    if (file.size > FAVICON_MAX_BYTES) { showToast('error', 'File terlalu besar', 'Ukuran favicon maksimal 512 KB.'); return; }
    setSaving(true);
    try {
      const { favicon: saved } = await api<{ favicon: FaviconInfo }>('/admin/favicon', { method: 'PUT', body: JSON.stringify({ dataUrl: await readAsDataUrl(file) }) });
      setFavicon(saved);
      applyFavicon(apiUrl(saved.url.replace(/^\/api/, '')));
      showToast('success', 'Favicon diperbarui', 'Favicon baru sudah aktif untuk semua pengguna.');
    } catch (err) {
      showToast('error', 'Gagal menyimpan favicon', err instanceof Error ? err.message : 'Coba lagi.');
    } finally {
      setSaving(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeFavicon = async () => {
    setSaving(true);
    try {
      await api('/admin/favicon', { method: 'DELETE' });
      setFavicon(null);
      applyFavicon('data:,');
      showToast('success', 'Favicon dihapus', 'Situs kembali tanpa favicon khusus.');
    } catch (err) {
      showToast('error', 'Gagal menghapus favicon', err instanceof Error ? err.message : 'Coba lagi.');
    } finally { setSaving(false); }
  };

  const tabs: { id: AdminTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'users', label: 'Users', icon: Users, count: users.length },
    { id: 'workspaces', label: 'Workspaces', icon: Building2, count: workspaces.length },
    { id: 'favicon', label: 'Favicon', icon: ImageIcon },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><ShieldCheck size={14} /> Platform admin</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Admin</h1>
          <p className="mt-1 text-sm text-slate-500">Semua user dan workspace di UniFlow, serta pengaturan favicon situs.</p>
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
        {tab !== 'favicon' && (
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

      {!loading && !error && tab === 'favicon' && (
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-bold text-slate-900">Favicon situs</h2>
          <p className="mt-1 text-sm text-slate-500">Ikon kecil di tab browser. Berlaku untuk semua pengunjung. Gunakan gambar persegi (disarankan 64×64 atau lebih) dengan format PNG, ICO, JPG, atau WEBP, maksimal 512 KB.</p>
          <div className="mt-5 flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
              {favicon ? <img src={apiUrl(favicon.url.replace(/^\/api/, ''))} alt="Favicon saat ini" className="h-12 w-12 object-contain" /> : <ImageIcon size={22} className="text-slate-400" />}
            </div>
            <div className="text-sm">
              <div className="font-semibold text-slate-800">{favicon ? 'Favicon khusus aktif' : 'Belum ada favicon khusus'}</div>
              {favicon && <div className="text-xs text-slate-500">Diubah {formatDate(favicon.updatedAt)}</div>}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <input ref={fileInput} type="file" accept={FAVICON_ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFavicon(file); }} />
            <button onClick={() => fileInput.current?.click()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[#F5C518] px-4 py-2 text-sm font-semibold text-slate-900 hover:brightness-95 disabled:opacity-60">
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />} {favicon ? 'Ganti favicon' : 'Upload favicon'}
            </button>
            {favicon && (
              <button onClick={() => void removeFavicon()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                <Trash2 size={15} /> Hapus
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

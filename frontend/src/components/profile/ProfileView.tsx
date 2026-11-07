import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CloudOff, BadgeCheck } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { api, apiUrl } from '../../api/client';
import { SectionCard, ViewField, FieldLabel, FieldError, inputClass } from './SectionCard';
import { AvatarCropModal } from './AvatarCropModal';

interface Profile {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  nickname: string;
  phone: string;
  bio: string;
  avatarUrl: string;
}

type CardId = 'personal' | 'bio';
type Draft = Record<string, string>;

const CARD_TITLES: Record<CardId, string> = { personal: 'Personal Info', bio: 'Bio' };

const AVATAR_TYPES = ['image/jpeg', 'image/png'];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MIN_SIDE = 800;
const AVATAR_HINT = 'Minimal 800×800 px. Format JPG atau PNG, maks 2 MB.';

const nationalPhone = (phone: string) => phone.replace(/^\+62/, '');

// Avatar URLs are stored as "/api/…"; route them through the configured API base.
const avatarSrc = (url: string) => (url.startsWith('/api/') ? apiUrl(url.slice(4)) : url);

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?';

function draftFor(card: CardId, profile: Profile): Draft {
  return card === 'personal'
    ? { name: profile.name, nickname: profile.nickname, phone: nationalPhone(profile.phone) }
    : { bio: profile.bio };
}

function payloadFor(card: CardId, draft: Draft) {
  if (card === 'bio') return draft;
  return { ...draft, phone: draft.phone ? `+62${draft.phone.replace(/^0/, '')}` : '' };
}

const outlineButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-40';

export const ProfileView: React.FC = () => {
  const { showToast, updateSignedInUser, refreshWorkspaceData } = useCMS();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  // Inline edit state: only one card at a time.
  const [editing, setEditing] = useState<CardId | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingCard, setPendingCard] = useState<CardId | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);

  const load = async () => {
    setLoadState('loading');
    try {
      const result = await api<{ profile: Profile }>('/profile');
      setProfile(result.profile);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  };

  useEffect(() => { void load(); }, []);

  const dirty = useMemo(
    () => Boolean(editing && profile && JSON.stringify(draft) !== JSON.stringify(draftFor(editing, profile))),
    [editing, draft, profile],
  );

  const startEditing = (card: CardId) => {
    if (!profile) return;
    setEditing(card);
    setDraft(draftFor(card, profile));
    setCardError(null);
    setFieldErrors({});
  };

  // Ask before discarding unsaved changes in the other card.
  const openCard = (card: CardId) => {
    if (dirty) setPendingCard(card);
    else startEditing(card);
  };

  const closeCard = () => {
    setEditing(null);
    setCardError(null);
    setFieldErrors({});
  };

  const setField = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const applyProfile = (next: Profile) => {
    setProfile(next);
    updateSignedInUser({ name: next.name, avatarUrl: next.avatarUrl });
    // Name and photo also appear in Team and storyboard member lists.
    refreshWorkspaceData();
  };

  const saveCard = async () => {
    if (!editing || !profile) return;
    const card = editing;
    if (card === 'personal') {
      if ((draft.name || '').trim().length < 2) return setFieldErrors({ name: 'Nama lengkap minimal 2 karakter' });
      const phone = (draft.phone || '').replace(/[\s-]/g, '');
      if (phone && !/^0?8\d{7,12}$/.test(phone)) return setFieldErrors({ phone: 'Nomor telepon tidak valid' });
    }
    setSaving(true);
    setCardError(null);
    try {
      const result = await api<{ profile: Profile }>('/profile', { method: 'PATCH', body: JSON.stringify(payloadFor(card, draft)) });
      const before = draftFor(card, profile);
      const after = draftFor(card, result.profile);
      applyProfile(result.profile);
      closeCard();
      showToast('success', 'Profil tersimpan');
      setHighlight(Object.keys(after).filter((key) => before[key] !== after[key]));
      window.setTimeout(() => setHighlight([]), 60);
    } catch (error) {
      const field = (error as { field?: string }).field;
      if (field) setFieldErrors({ [field]: error instanceof Error ? error.message : '' });
      else setCardError('Perubahan belum tersimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  if (loadState === 'loading') return <ProfileSkeleton />;
  if (loadState === 'error' || !profile) {
    return (
      <div className="mx-auto flex max-w-[880px] flex-col items-center rounded-2xl border border-line bg-surface py-14 text-center">
        <CloudOff className="h-10 w-10 text-subtle" />
        <p className="mt-3 text-[15px] font-semibold text-ink">Profil gagal dimuat</p>
        <button onClick={() => void load()} className={`${outlineButton} mt-4`}>Coba lagi</button>
      </div>
    );
  }

  const cardProps = (card: CardId) => ({
    id: card,
    title: CARD_TITLES[card],
    isEditing: editing === card,
    dirty: editing === card && dirty,
    saving,
    error: editing === card ? cardError : null,
    onEdit: () => openCard(card),
    onCancel: closeCard,
    onSave: () => void saveCard(),
  });

  return (
    <div className="max-w-[880px]">
      <h1 className="mb-6 text-[28px] font-bold leading-9 text-ink max-md:text-2xl">Edit Profile</h1>

      <div className="overflow-hidden rounded-3xl border border-line bg-surface max-md:rounded-2xl">
        <AvatarBlock profile={profile} onChange={applyProfile} />

        <div className="flex flex-col gap-4 p-8 max-md:p-4">
          <SectionCard
            {...cardProps('personal')}
            view={
              <dl className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                <ViewField label="Nama Lengkap" highlight={highlight.includes('name')}>{profile.name}</ViewField>
                <ViewField label="Nama Panggilan" highlight={highlight.includes('nickname')}>{profile.nickname}</ViewField>
                <ViewField label="Email">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-all">{profile.email}</span>
                    {profile.emailVerified && (
                      <span className="inline-flex h-6 items-center gap-1 rounded-lg bg-green-100 px-2 text-xs font-semibold text-green-600">
                        <BadgeCheck className="h-3.5 w-3.5" /> Terverifikasi
                      </span>
                    )}
                  </span>
                </ViewField>
                <ViewField label="No. Telepon" highlight={highlight.includes('phone')}>
                  {profile.phone && `+62 ${nationalPhone(profile.phone)}`}
                </ViewField>
              </dl>
            }
            edit={
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="profile-name">Nama Lengkap</FieldLabel>
                  <input id="profile-name" value={draft.name ?? ''} maxLength={120} onChange={(e) => setField('name', e.target.value)} aria-invalid={Boolean(fieldErrors.name)} className={inputClass} />
                  <FieldError message={fieldErrors.name} />
                </div>
                <div>
                  <FieldLabel htmlFor="profile-nickname">Nama Panggilan</FieldLabel>
                  <input id="profile-nickname" value={draft.nickname ?? ''} maxLength={60} onChange={(e) => setField('nickname', e.target.value)} aria-invalid={Boolean(fieldErrors.nickname)} className={inputClass} />
                  <FieldError message={fieldErrors.nickname} />
                </div>
                <div>
                  <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                  <input id="profile-email" value={profile.email} readOnly disabled className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="profile-phone">No. Telepon</FieldLabel>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-medium text-muted">+62</span>
                    <input
                      id="profile-phone"
                      type="tel"
                      inputMode="tel"
                      value={draft.phone ?? ''}
                      maxLength={16}
                      placeholder="812 3456 7890"
                      onChange={(e) => setField('phone', e.target.value.replace(/[^\d\s-]/g, ''))}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      className={`${inputClass} pl-12`}
                    />
                  </div>
                  <FieldError message={fieldErrors.phone} />
                </div>
              </div>
            }
          />

          <SectionCard
            {...cardProps('bio')}
            view={
              <dl>
                <ViewField label="Bio" highlight={highlight.includes('bio')}>
                  {profile.bio && <span className="block whitespace-pre-line text-[15px] font-normal leading-6 text-slate-700">{profile.bio}</span>}
                </ViewField>
              </dl>
            }
            edit={
              <div>
                <FieldLabel htmlFor="profile-bio">Bio</FieldLabel>
                <div className="relative">
                  <textarea
                    id="profile-bio"
                    value={draft.bio ?? ''}
                    maxLength={500}
                    rows={5}
                    placeholder="Ceritakan singkat tentang dirimu dan peranmu di tim konten…"
                    onChange={(e) => {
                      setField('bio', e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    aria-invalid={Boolean(fieldErrors.bio)}
                    className={`${inputClass} h-auto min-h-[140px] resize-none py-3 pb-8 leading-6`}
                  />
                  <span className="pointer-events-none absolute bottom-2.5 right-3.5 font-mono text-xs text-muted">{(draft.bio ?? '').length}/500</span>
                </div>
                <FieldError message={fieldErrors.bio} />
              </div>
            }
          />
        </div>
      </div>

      {pendingCard && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="presentation" onMouseDown={() => setPendingCard(null)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-[0_20px_40px_rgb(15_23_42/0.12)]"
          >
            <p id="discard-title" className="text-[15px] font-semibold text-ink">Buang perubahan di {CARD_TITLES[editing]}?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button autoFocus onClick={() => setPendingCard(null)} className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:text-ink">
                Lanjut edit
              </button>
              <button
                onClick={() => { const card = pendingCard; setPendingCard(null); startEditing(card); }}
                className="h-10 rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-600 hover:bg-red-100"
              >
                Buang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AvatarBlock: React.FC<{ profile: Profile; onChange: (profile: Profile) => void }> = ({ profile, onChange }) => {
  const { showToast } = useCMS();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickFile = () => fileInput.current?.click();

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) return setHintError('Format harus JPG atau PNG.');
    if (file.size > AVATAR_MAX_BYTES) return setHintError('Ukuran foto lebih dari 2 MB.');
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth < AVATAR_MIN_SIDE || image.naturalHeight < AVATAR_MIN_SIDE) {
          setHintError(`Foto terlalu kecil (${image.naturalWidth}×${image.naturalHeight} px). Minimal 800×800 px.`);
          return;
        }
        setHintError(null);
        setCropImage(image);
      };
      image.onerror = () => setHintError('Foto tidak bisa dibaca.');
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const upload = async (dataUrl: string) => {
    setCropImage(null);
    setBusy(true);
    try {
      const result = await api<{ profile: Profile }>('/profile/avatar', { method: 'PUT', body: JSON.stringify({ dataUrl }) });
      onChange(result.profile);
      showToast('success', 'Profil tersimpan', 'Foto profil diperbarui.');
    } catch (error) {
      setHintError(error instanceof Error ? error.message : 'Foto gagal diunggah.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await api<{ profile: Profile }>('/profile/avatar', { method: 'DELETE' });
      onChange(result.profile);
      showToast('success', 'Profil tersimpan', 'Foto profil dihapus.');
    } catch (error) {
      showToast('error', 'Foto gagal dihapus', error instanceof Error ? error.message : 'Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-6 border-b border-line p-8 max-md:flex-col max-md:items-start max-md:gap-4 max-md:p-5">
      <button
        type="button"
        onClick={pickFile}
        disabled={busy}
        aria-label="Ganti foto profil"
        className="group relative h-28 w-28 shrink-0 rounded-full ring-4 ring-surface outline outline-1 outline-line max-md:h-[88px] max-md:w-[88px]"
      >
        {profile.avatarUrl ? (
          <img src={avatarSrc(profile.avatarUrl)} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-4xl font-bold text-ink">{initials(profile.name)}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-6 w-6 text-white" />
        </span>
        {busy && (
          <svg className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] animate-spin" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="47" fill="none" stroke="var(--color-primary)" strokeWidth="4" strokeLinecap="round" strokeDasharray="80 300" />
          </svg>
        )}
      </button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={pickFile} disabled={busy} className={outlineButton}>Upload foto baru</button>
          {profile.avatarUrl && (
            <button type="button" onClick={() => void remove()} disabled={busy} className="h-11 rounded-xl px-4 text-sm font-medium text-muted hover:text-ink disabled:opacity-40">
              Hapus
            </button>
          )}
        </div>
        <p className={`mt-2 text-[13px] leading-[18px] ${hintError ? 'text-red-600' : 'text-muted'}`} role={hintError ? 'alert' : undefined}>
          {hintError || AVATAR_HINT}
        </p>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
      />
      {cropImage && <AvatarCropModal image={cropImage} onCancel={() => setCropImage(null)} onConfirm={(dataUrl) => void upload(dataUrl)} />}
    </div>
  );
};

const ProfileSkeleton: React.FC = () => (
  <div className="max-w-[880px] overflow-hidden rounded-3xl border border-line bg-surface" aria-busy="true" aria-label="Memuat profil">
    <div className="flex items-center gap-6 border-b border-line p-8">
      <div className="h-28 w-28 animate-pulse rounded-full bg-chip" />
      <div className="space-y-2">
        <div className="h-11 w-40 animate-pulse rounded-xl bg-chip" />
        <div className="h-3 w-64 animate-pulse rounded bg-chip" />
      </div>
    </div>
    <div className="space-y-4 p-8">
      {[0, 1].map((card) => (
        <div key={card} className="rounded-2xl border border-line p-6">
          <div className="mb-5 h-5 w-40 animate-pulse rounded bg-chip" />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {[0, 1].map((field) => (
              <div key={field} className="space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-chip" />
                <div className="h-4 w-32 animate-pulse rounded bg-chip" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

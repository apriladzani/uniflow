import React, { useEffect, useMemo, useState } from 'react';
import {
  Settings,
  HardDrive,
  Sparkles,
  Shield,
  Layers,
  Share2,
  Target,
  RefreshCw,
  Trash2,
  Check,
  Pencil,
  X,
  Lock,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useCMS } from '../../context/CMSContext';
import { api } from '../../api/client';
import { PlatformType } from '../../types/cms';

type SectionId = 'general' | 'pillars' | 'platforms' | 'targets' | 'permissions' | 'cdn' | 'ai';

interface RoleRow {
  id: string;
  key: string;
  name: string;
  locked: boolean;
  permissions: string[];
}

const ALL_PLATFORMS: PlatformType[] = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'X (Twitter)'];

const AI_MODELS: { id: string; label: string; note: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Best quality · $4 / $20 per 1M tokens' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Balanced · $2 / $10 per 1M tokens' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest & cheapest · $0.10 / $0.50 per 1M tokens' },
];

const PERMISSION_LABELS: Record<string, { label: string; hint: string }> = {
  'content.read': { label: 'View content', hint: 'See plans, calendar, storyboards' },
  'content.write': { label: 'Create & edit content', hint: 'Plans, scenes, tasks' },
  'media.manage': { label: 'Manage media', hint: 'Upload and delete CDN files' },
  'reviews.manage': { label: 'Editorial review', hint: 'Approve or request revisions' },
  'publishing.manage': { label: 'Verify publication', hint: 'Mark content as published' },
  'members.manage': { label: 'Manage team', hint: 'Invite members, set roles & targets' },
  'settings.manage': { label: 'Manage settings', hint: 'Everything on this page' },
  'workspace.manage': { label: 'Own workspace', hint: 'Owner only' },
};

const COMMON_TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'UTC'];

const card = 'bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-4';
const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5C518]/50 disabled:bg-slate-50 disabled:text-slate-500';
const primaryButton = 'flex items-center gap-1.5 px-4 py-2 bg-[#F5C518] hover:bg-[#E5B510] text-[#111827] font-bold rounded-lg shadow-xs disabled:opacity-50 disabled:cursor-not-allowed';

function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const SectionHeader: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div>
    <h3 className="text-sm font-bold text-slate-900">{title}</h3>
    <p className="text-xs text-slate-500">{description}</p>
  </div>
);

const ReadOnlyNotice: React.FC = () => (
  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 max-w-xl">
    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
    Your role can view these settings but not change them. Ask a workspace owner or manager.
  </div>
);

export const SettingsView: React.FC = () => {
  const {
    settings, settingsCanManage: canManage, settingsLoading, updateSettings, resetSettings,
    activeWorkspaceId, members, showToast, setActiveTab,
  } = useCMS();

  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [saving, setSaving] = useState(false);

  // General
  const [orgName, setOrgName] = useState(settings.organizationName);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [productionCycle, setProductionCycle] = useState(settings.productionCycle);
  // Pillars
  const [newPillar, setNewPillar] = useState('');
  const [editingPillar, setEditingPillar] = useState<{ index: number; value: string } | null>(null);
  // Targets
  const [weeklyTarget, setWeeklyTarget] = useState(settings.defaultWeeklyTarget);
  const [applyToMembers, setApplyToMembers] = useState(false);
  // AI
  const [aiModel, setAiModel] = useState(settings.aiModel);
  const [aiTone, setAiTone] = useState(settings.aiDefaultTone);
  // Roles
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [currentRoleId, setCurrentRoleId] = useState('');
  const [rolesLoading, setRolesLoading] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  // CDN
  const [cdnFolder, setCdnFolder] = useState<{ id: string; name: string } | null>(null);
  const [cdnLoading, setCdnLoading] = useState(false);

  // Keep the form drafts in sync whenever fresh settings arrive from the server.
  useEffect(() => {
    setOrgName(settings.organizationName);
    setTimezone(settings.timezone);
    setProductionCycle(settings.productionCycle);
    setWeeklyTarget(settings.defaultWeeklyTarget);
    setAiModel(settings.aiModel);
    setAiTone(settings.aiDefaultTone);
    setEditingPillar(null);
  }, [settings]);

  const workspacePath = '/workspaces/' + encodeURIComponent(activeWorkspaceId);

  const loadRoles = async () => {
    if (!activeWorkspaceId) return;
    setRolesLoading(true);
    try {
      const result = await api<{ roles: RoleRow[]; permissions: string[]; currentRoleId: string }>(workspacePath + '/settings/roles');
      setRoles(result.roles);
      setPermissionKeys(result.permissions);
      setCurrentRoleId(result.currentRoleId);
    } catch (error) {
      showToast('error', 'Roles could not be loaded', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRolesLoading(false);
    }
  };

  const loadCdn = async () => {
    if (!activeWorkspaceId) return;
    setCdnLoading(true);
    try {
      const result = await api<{ folder: { id: string; name: string } | null }>(workspacePath + '/media/cdn-root');
      setCdnFolder(result.folder);
    } catch {
      setCdnFolder(null);
    } finally {
      setCdnLoading(false);
    }
  };

  // Load only when the tab or workspace changes; the loaders are recreated every render.
  useEffect(() => {
    if (activeSection === 'permissions') void loadRoles();
    if (activeSection === 'cdn') void loadCdn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, activeWorkspaceId]);

  const save = async (updates: Parameters<typeof updateSettings>[0]) => {
    setSaving(true);
    try {
      return await updateSettings(updates);
    } finally {
      setSaving(false);
    }
  };

  const localTimePreview = useMemo(() => {
    if (!isValidTimezone(timezone)) return null;
    return new Intl.DateTimeFormat('id-ID', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  }, [timezone]);

  // ---- General ----
  const generalDirty = orgName !== settings.organizationName || timezone !== settings.timezone || productionCycle !== settings.productionCycle;
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orgName.trim().length < 2) {
      showToast('error', 'Name too short', 'Organization name must be at least 2 characters.');
      return;
    }
    if (!isValidTimezone(timezone.trim())) {
      showToast('error', 'Invalid timezone', 'Use an IANA timezone such as Asia/Jakarta.');
      return;
    }
    await save({ organizationName: orgName.trim(), timezone: timezone.trim(), productionCycle: productionCycle.trim() });
  };

  // ---- Pillars ----
  const pillarExists = (value: string, exceptIndex = -1) =>
    settings.contentPillars.some((pillar, index) => index !== exceptIndex && pillar.toLowerCase() === value.toLowerCase());

  const handleAddPillar = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = newPillar.trim();
    if (!value) return;
    if (pillarExists(value)) {
      showToast('warning', 'Pillar already exists', 'This content pillar is already registered.');
      return;
    }
    if (await save({ contentPillars: [...settings.contentPillars, value] })) setNewPillar('');
  };

  const handleRenamePillar = async () => {
    if (!editingPillar) return;
    const value = editingPillar.value.trim();
    if (!value || value === settings.contentPillars[editingPillar.index]) {
      setEditingPillar(null);
      return;
    }
    if (pillarExists(value, editingPillar.index)) {
      showToast('warning', 'Pillar already exists', 'Choose a different name.');
      return;
    }
    await save({ contentPillars: settings.contentPillars.map((pillar, index) => (index === editingPillar.index ? value : pillar)) });
  };

  const handleMovePillar = (index: number, direction: -1 | 1) => {
    const next = [...settings.contentPillars];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void save({ contentPillars: next });
  };

  const handleDeletePillar = async (pillar: string) => {
    if (settings.contentPillars.length <= 1) {
      showToast('error', 'Deletion prevented', 'At least 1 content pillar must remain.');
      return;
    }
    if (!confirm(`Delete the "${pillar}" pillar? Existing content keeps its current pillar label.`)) return;
    await save({ contentPillars: settings.contentPillars.filter((p) => p !== pillar) });
  };

  // ---- Platforms ----
  const handleTogglePlatform = (platform: PlatformType) => {
    const active = settings.platforms.includes(platform);
    if (active && settings.platforms.length <= 1) {
      showToast('error', 'Cannot disable', 'At least 1 platform must stay active.');
      return;
    }
    const next = active ? settings.platforms.filter((p) => p !== platform) : [...settings.platforms, platform];
    void save({ platforms: next });
  };

  // ---- Targets ----
  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applyToMembers && !confirm(`Set the weekly target of all ${members.filter((m) => m.active).length} active members to ${weeklyTarget}?`)) return;
    if (await save({ defaultWeeklyTarget: weeklyTarget, applyWeeklyTargetToMembers: applyToMembers })) setApplyToMembers(false);
  };

  // ---- Roles ----
  const handleTogglePermission = async (role: RoleRow, permission: string) => {
    const has = role.permissions.includes(permission);
    let next = has ? role.permissions.filter((p) => p !== permission) : [...role.permissions, permission];
    // Every other permission requires being able to view content.
    if (permission === 'content.read' && has) next = [];
    setSavingRoleId(role.id);
    try {
      const result = await api<{ roles: RoleRow[] }>(workspacePath + '/settings/roles/' + encodeURIComponent(role.id) + '/permissions', {
        method: 'PUT',
        body: JSON.stringify({ permissions: next }),
      });
      setRoles(result.roles);
      showToast('success', 'Permissions updated', `${role.name}: ${PERMISSION_LABELS[permission]?.label || permission} ${has ? 'removed' : 'granted'}.`);
    } catch (error) {
      showToast('error', 'Permissions not updated', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingRoleId(null);
    }
  };

  // ---- AI ----
  const handleSaveAi = async (e: React.FormEvent) => {
    e.preventDefault();
    await save({ aiModel, aiDefaultTone: aiTone.trim() });
  };

  const sections = [
    { id: 'general', label: 'General & Org', icon: Settings },
    { id: 'pillars', label: 'Content Pillars', icon: Layers },
    { id: 'platforms', label: 'Media Platforms', icon: Share2 },
    { id: 'targets', label: 'Weekly Quotas', icon: Target },
    { id: 'permissions', label: 'Roles & Permissions', icon: Shield },
    { id: 'cdn', label: 'Kroombox CDN', icon: HardDrive },
    { id: 'ai', label: 'AI Configuration', icon: Sparkles },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Workspace Settings</h2>
            <p className="text-xs text-slate-500">
              Settings are saved per workspace and apply to every member.{' '}
              <button onClick={() => setActiveTab('profile')} className="font-semibold text-slate-800 underline underline-offset-2">
                Edit your own profile
              </button>
            </p>
          </div>
          {(settingsLoading || saving) && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {saving ? 'Saving…' : 'Loading…'}
            </span>
          )}
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-4 mt-4 border-t border-slate-100 text-xs no-scrollbar">
          {sections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#F5C518]' : 'text-slate-400'}`} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION: GENERAL */}
      {activeSection === 'general' && (
        <div className={card}>
          <SectionHeader title="General Organization Settings" description="Workspace name, timezone, and the current production cycle." />
          {!canManage && <ReadOnlyNotice />}
          <form onSubmit={handleSaveGeneral} className="space-y-4 text-xs max-w-xl">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Organization / Workspace Name</label>
              <input
                type="text"
                value={orgName}
                maxLength={160}
                disabled={!canManage}
                onChange={(e) => setOrgName(e.target.value)}
                className={`${inputClass} font-semibold`}
              />
              <p className="text-[11px] text-slate-400 mt-1">Renames the workspace everywhere. The workspace URL stays the same.</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Production Timezone</label>
              <input
                type="text"
                list="settings-timezones"
                value={timezone}
                disabled={!canManage}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Asia/Jakarta"
                className={`${inputClass} font-mono`}
              />
              <datalist id="settings-timezones">
                {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}
              </datalist>
              <p className={`text-[11px] mt-1 ${localTimePreview ? 'text-slate-400' : 'text-rose-600'}`}>
                {localTimePreview ? `Local time now: ${localTimePreview}` : 'Not a valid timezone. Use a name like Asia/Jakarta.'}
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Academic Year / Production Cycle</label>
              <input
                type="text"
                value={productionCycle}
                maxLength={160}
                disabled={!canManage}
                onChange={(e) => setProductionCycle(e.target.value)}
                placeholder="e.g., 2026/2027 Fall Semester"
                className={inputClass}
              />
            </div>

            {canManage && (
              <button type="submit" disabled={!generalDirty || saving} className={primaryButton}>
                <Check className="w-3.5 h-3.5" />
                Save General Settings
              </button>
            )}
          </form>

          {canManage && (
            <div className="pt-6 border-t border-slate-200">
              <h4 className="text-xs font-bold text-rose-700 mb-1">Reset Settings to Default</h4>
              <p className="text-xs text-slate-500 mb-3">
                Restores timezone, pillars, platforms, weekly target, and AI configuration to their defaults.
                The workspace name, content, members, and media are not touched.
              </p>
              <button
                onClick={() => {
                  if (confirm('Reset all workspace settings to their defaults?')) void resetSettings();
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-xs transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Settings</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SECTION: PILLARS */}
      {activeSection === 'pillars' && (
        <div className={card}>
          <SectionHeader
            title="Content Pillar Taxonomy"
            description="Pillars shown when creating content, on the calendar, and on the production board."
          />
          {!canManage && <ReadOnlyNotice />}

          <div className="space-y-2 max-w-lg">
            {settings.contentPillars.map((pillar, index) => (
              <div key={pillar} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                {editingPillar?.index === index ? (
                  <form
                    className="flex flex-1 items-center gap-1.5"
                    onSubmit={(e) => { e.preventDefault(); void handleRenamePillar(); }}
                  >
                    <input
                      autoFocus
                      value={editingPillar.value}
                      maxLength={120}
                      onChange={(e) => setEditingPillar({ index, value: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Escape') setEditingPillar(null); }}
                      className={`${inputClass} py-1`}
                    />
                    <button type="submit" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" aria-label="Save pillar name">
                      <Check className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setEditingPillar(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded" aria-label="Cancel">
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="font-semibold text-slate-800">{pillar}</span>
                    {canManage && (
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => handleMovePillar(index, -1)} disabled={index === 0 || saving} className="p-1 text-slate-400 hover:text-slate-700 rounded disabled:opacity-30" aria-label="Move up">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleMovePillar(index, 1)} disabled={index === settings.contentPillars.length - 1 || saving} className="p-1 text-slate-400 hover:text-slate-700 rounded disabled:opacity-30" aria-label="Move down">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingPillar({ index, value: pillar })} className="p-1 text-slate-400 hover:text-slate-700 rounded" aria-label="Rename">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => void handleDeletePillar(pillar)} className="p-1 text-slate-400 hover:text-rose-600 rounded" aria-label="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {canManage && (
            <form onSubmit={handleAddPillar} className="flex gap-2 max-w-lg text-xs pt-2">
              <input
                type="text"
                value={newPillar}
                maxLength={120}
                onChange={(e) => setNewPillar(e.target.value)}
                placeholder="New pillar label (e.g., International Exchanges)..."
                className={`${inputClass} flex-1`}
              />
              <button type="submit" disabled={!newPillar.trim() || saving} className={primaryButton}>
                + Add Pillar
              </button>
            </form>
          )}
        </div>
      )}

      {/* SECTION: PLATFORMS */}
      {activeSection === 'platforms' && (
        <div className={card}>
          <SectionHeader
            title="Social Media Channels"
            description="Active platforms appear as choices when creating content and in the AI Assistant export."
          />
          {!canManage && <ReadOnlyNotice />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl text-xs">
            {ALL_PLATFORMS.map((platform) => {
              const active = settings.platforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  disabled={!canManage || saving}
                  onClick={() => handleTogglePlatform(platform)}
                  className={`p-3 border rounded-xl flex items-center justify-between text-left transition-colors disabled:cursor-default ${
                    active ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <span className="font-bold text-slate-900 block">{platform}</span>
                    <span className={`text-[11px] font-medium ${active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {active ? 'Active in content workflows' : 'Disabled'}
                    </span>
                  </div>
                  <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${active ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">Disabling a platform does not change existing content that already uses it.</p>
        </div>
      )}

      {/* SECTION: TARGETS */}
      {activeSection === 'targets' && (
        <div className={card}>
          <SectionHeader title="Weekly Quota & Content Debt Policy" description="Default number of published credits each member owes per week." />
          {!canManage && <ReadOnlyNotice />}
          <form onSubmit={handleSaveTargets} className="max-w-xl space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Default weekly target (credits per member)</label>
              <input
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={weeklyTarget}
                disabled={!canManage}
                onChange={(e) => setWeeklyTarget(Number(e.target.value))}
                className={`${inputClass} w-32`}
              />
              <p className="text-[11px] text-slate-400 mt-1">Used for newly added members. Between 1 and 10, in steps of 0.5.</p>
            </div>

            {canManage && (
              <label className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                <input type="checkbox" checked={applyToMembers} onChange={(e) => setApplyToMembers(e.target.checked)} className="mt-0.5 accent-[#F5C518]" />
                <span>
                  <span className="font-semibold text-slate-800 block">Also apply to all current active members</span>
                  <span className="text-slate-500">Overwrites each member's individual target. You can still adjust individuals on the Team page.</span>
                </span>
              </label>
            )}

            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2 text-slate-800">
              <span className="font-bold text-amber-900 block">Current credit policy</span>
              <p>• Standard individual baseline: <strong>{settings.defaultWeeklyTarget} published credits</strong> per week.</p>
              <p>• Unfulfilled deficits convert to content debt and roll over to the following weeks until settled.</p>
            </div>

            {canManage && (
              <button
                type="submit"
                disabled={saving || (weeklyTarget === settings.defaultWeeklyTarget && !applyToMembers)}
                className={primaryButton}
              >
                <Check className="w-3.5 h-3.5" />
                Save Weekly Target
              </button>
            )}
          </form>
        </div>
      )}

      {/* SECTION: PERMISSIONS */}
      {activeSection === 'permissions' && (
        <div className={card}>
          <div className="flex items-start justify-between gap-3">
            <SectionHeader
              title="Role & Permission Matrix"
              description="What each role in this workspace is allowed to do. Changes apply immediately."
            />
            <button onClick={() => void loadRoles()} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" aria-label="Reload roles">
              <RefreshCw className={`w-4 h-4 ${rolesLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {!canManage && <ReadOnlyNotice />}

          {rolesLoading && !roles.length ? (
            <p className="text-xs text-slate-500">Loading roles…</p>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Capability</th>
                    {roles.map((role) => (
                      <th key={role.id} className="py-2.5 px-3 text-center whitespace-nowrap">
                        {role.name}
                        {role.id === currentRoleId && <span className="block font-medium normal-case text-[#B8860B]">your role</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {permissionKeys.map((permission) => (
                    <tr key={permission}>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-800 block">{PERMISSION_LABELS[permission]?.label || permission}</span>
                        <span className="text-[11px] text-slate-400">{PERMISSION_LABELS[permission]?.hint}</span>
                      </td>
                      {roles.map((role) => {
                        const granted = role.permissions.includes(permission);
                        const locked = !canManage || role.locked || role.id === currentRoleId || permission === 'workspace.manage';
                        const lockReason = role.locked
                          ? 'The Owner role always has full access.'
                          : role.id === currentRoleId
                            ? 'You cannot change your own role.'
                            : permission === 'workspace.manage'
                              ? 'Only the Owner role can own the workspace.'
                              : undefined;
                        return (
                          <td key={role.id} className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={granted}
                              disabled={locked || savingRoleId === role.id}
                              title={lockReason}
                              onChange={() => void handleTogglePermission(role, permission)}
                              className="h-4 w-4 accent-[#F5C518] disabled:opacity-50"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            The Owner role and your own role are locked to prevent accidental lock-outs. Removing “View content” removes every permission from that role.
          </p>
        </div>
      )}

      {/* SECTION: KROOMBOX CDN */}
      {activeSection === 'cdn' && (
        <div className={card}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-[#F5C518] flex items-center justify-center font-bold">
              <HardDrive className="w-5 h-5" />
            </div>
            <SectionHeader title="Kroombox CDN Integration" description="Where this workspace stores its media files." />
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs max-w-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">CDN API</span>
              <span className="font-mono text-slate-800">https://api-cdn.kroombox.com</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Workspace Root Folder</span>
              {cdnLoading ? (
                <span className="text-slate-500">Checking…</span>
              ) : cdnFolder ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-800">{cdnFolder.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">({cdnFolder.id})</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-700">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Not connected yet
                </span>
              )}
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Credentials</span>
              <span className="text-slate-600">Stored on the server in <span className="font-mono">backend/.env</span>, never sent to the browser.</span>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('media')}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs"
          >
            <HardDrive className="w-3.5 h-3.5" />
            {cdnFolder ? 'Open Media Library' : 'Connect a folder in Media Library'}
          </button>
        </div>
      )}

      {/* SECTION: AI CONFIGURATION */}
      {activeSection === 'ai' && (
        <div className={card}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5C518] text-[#111827] flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <SectionHeader title="AI Assistant Configuration" description="Model and default voice used by the AI Assistant in this workspace." />
          </div>
          {!canManage && <ReadOnlyNotice />}

          <form onSubmit={handleSaveAi} className="space-y-4 text-xs max-w-xl">
            <div className="space-y-2">
              <span className="block font-semibold text-slate-700">Claude model</span>
              {AI_MODELS.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer ${
                    aiModel === model.id ? 'border-[#F5C518] bg-amber-50/50' : 'border-slate-200 bg-slate-50'
                  } ${!canManage ? 'cursor-default' : ''}`}
                >
                  <input
                    type="radio"
                    name="ai-model"
                    checked={aiModel === model.id}
                    disabled={!canManage}
                    onChange={() => setAiModel(model.id)}
                    className="mt-0.5 accent-[#F5C518]"
                  />
                  <span>
                    <span className="font-semibold text-slate-900 block">{model.label}</span>
                    <span className="text-slate-500">{model.note}</span>
                  </span>
                </label>
              ))}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Default tone of voice</label>
              <input
                type="text"
                value={aiTone}
                maxLength={60}
                disabled={!canManage}
                onChange={(e) => setAiTone(e.target.value)}
                placeholder="e.g., Casual, student friendly"
                className={inputClass}
              />
              <p className="text-[11px] text-slate-400 mt-1">Used when the Tone field in the AI Assistant is left empty.</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600">
              Each person enters their own Claude API key on the AI Assistant page. Keys are kept in that person's browser and are not stored here.
            </div>

            {canManage && (
              <button
                type="submit"
                disabled={saving || (aiModel === settings.aiModel && aiTone.trim() === settings.aiDefaultTone)}
                className={primaryButton}
              >
                <Check className="w-3.5 h-3.5" />
                Save AI Configuration
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

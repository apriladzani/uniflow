import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  ContentItem,
  Member,
  MediaAsset,
  ActivityLog,
  CMSSettings,
  SettingsUpdate,
  ProductionStage,
  DebtSummary,
  Scene,
  Task,
  ReviewComment,
} from '../types/cms';
import {
  INITIAL_SETTINGS,
} from '../data/initialData';
import confetti from 'canvas-confetti';
import { api } from '../api/client';
import { localDateKey, localDateTimeValue } from '../utils/date';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

interface WorkspaceRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  role: string;
  accent: string;
  status: 'Active' | 'Draft';
  contents: ContentItem[];
  members: Member[];
  mediaAssets: MediaAsset[];
  activityLogs: ActivityLog[];
  settings: CMSSettings;
  memberCount?: number;
  contentCount?: number;
}

export interface MemberCandidate {
  id: string;
  username: string;
  name: string;
  avatar: string;
}

export interface WorkspaceRoleOption {
  id: string;
  role_key: string;
  name: string;
}

interface WeeklyCreditSummary {
  weekStart: string;
  credits: number;
}

export interface ContentCreditHistory {
  id: string;
  contentId: string;
  contentTitle: string;
  userId: string;
  userName: string;
  platform: string;
  credits: number;
  status: 'pending' | 'awarded' | 'revoked';
  awardedAt: string;
  publishedUrl: string;
}

interface CMSContextType {
  // Data
  contents: ContentItem[];
  members: Member[];
  weeklyCreditHistory: WeeklyCreditSummary[];
  creditHistory: ContentCreditHistory[];
  mediaAssets: MediaAsset[];
  activityLogs: ActivityLog[];
  settings: CMSSettings;
  selectedContentId: string | null;
  activeTab: string;
  sidebarOpen: boolean;
  toasts: ToastMessage[];
  workspaces: WorkspaceRecord[];
  activeWorkspaceId: string;
  currentWorkspace: WorkspaceRecord | null;
  isAuthenticated: boolean;
  showWorkspacePicker: boolean;
  userProfile: SignedInUser;
  updateSignedInUser: (updates: Partial<SignedInUser>) => void;
  /** Re-reads content and members for the active workspace (e.g. after a profile change). */
  refreshWorkspaceData: () => void;

  // Navigation & UI state
  setActiveTab: (tab: string) => void;
  setSelectedContentId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  showToast: (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) => void;
  removeToast: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, username: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  setShowWorkspacePicker: (value: boolean) => void;
  selectWorkspace: (workspaceId: string) => void;
  createWorkspace: (data: { name: string; description: string; role: string; accent?: string }) => Promise<WorkspaceRecord>;
  joinWorkspace: (inviteCode: string) => Promise<void>;
  authLoading: boolean;
  contentLoading: boolean;
  membersLoading: boolean;
  contentLoadError: string;
  membersLoadError: string;
  searchMemberCandidates: (query: string) => Promise<MemberCandidate[]>;
  getAssignableMemberRoles: () => Promise<WorkspaceRoleOption[]>;

  // Content actions
  addContent: (content: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt' | 'scenes' | 'scriptBlocks' | 'tasks' | 'reviewComments' | 'attachedAssetIds'>) => Promise<ContentItem>;
  updateContent: (id: string, updates: Partial<ContentItem>) => Promise<boolean>;
  deleteContent: (id: string) => Promise<void>;
  changeContentStatus: (id: string, newStatus: ProductionStage) => Promise<boolean>;

  // Publishing verification
  verifyAndPublishContent: (
    contentId: string,
    url: string,
    actualPublishDate: string,
    verifiedContributorIds: string[]
  ) => Promise<{ success: boolean; error?: string }>;

  // Storyboard & Script actions
  addScene: (contentId: string, scene: Omit<Scene, 'id' | 'sceneNumber'>) => Promise<boolean>;
  updateScene: (contentId: string, sceneId: string, updates: Partial<Scene>) => Promise<boolean>;
  deleteScene: (contentId: string, sceneId: string) => Promise<boolean>;
  duplicateScene: (contentId: string, sceneId: string) => Promise<boolean>;
  reorderScenes: (contentId: string, scenes: Scene[]) => Promise<boolean>;
  appendScenes: (content: ContentItem, scenes: Omit<Scene, 'id' | 'sceneNumber'>[]) => Promise<boolean>;

  // Task actions
  addTask: (contentId: string, title: string, assigneeId: string, dueDate: string) => Promise<boolean>;
  toggleTask: (contentId: string, taskId: string) => Promise<boolean>;
  deleteTask: (contentId: string, taskId: string) => Promise<boolean>;

  // Review actions
  addReviewComment: (contentId: string, text: string, status: 'Comment' | 'Needs Revision' | 'Approved', authorId: string) => Promise<boolean>;

  // Media assets
  addMediaAsset: (asset: Omit<MediaAsset, 'id' | 'uploadedAt'>) => void;
  attachAssetToContent: (contentId: string, assetId: string) => void;
  detachAssetFromContent: (contentId: string, assetId: string) => void;

  // Member management
  addMember: (data: { userId: string; roleId: string; weeklyTarget: number }) => Promise<void>;
  updateMember: (id: string, updates: { roleId?: string; weeklyTarget?: number; active?: boolean }) => Promise<void>;
  toggleMemberActive: (id: string) => Promise<void>;

  // Settings & Period Closing
  settingsCanManage: boolean;
  settingsLoading: boolean;
  updateSettings: (updates: SettingsUpdate) => Promise<boolean>;
  resetSettings: () => Promise<boolean>;
  closeWeeklyPeriod: () => void;

  // Computed metrics
  debtSummaries: DebtSummary[];
  totalPublishedCount: number;
  totalInProductionCount: number;
  totalWaitingReviewCount: number;
  totalOverdueCount: number;
  totalTeamPublishedCredits: number;
  totalTeamDebt: number;
}

export interface SignedInUser {
  name: string;
  email: string;
  avatarUrl: string;
}

interface SettingsResponse {
  settings: CMSSettings;
  canManage: boolean;
}

const STORAGE_KEYS = {
  WORKSPACES: 'uim_workspaces_v1',
  ACTIVE_WORKSPACE: 'uim_active_workspace_v1',
  LAST_WORKSPACE: 'uim_last_workspace_v1',
  AUTH_STATE: 'uim_auth_state_v1',
  MEDIA: 'uim_cms_media_v1',
  LOGS: 'uim_cms_logs_v1',
  SETTINGS: 'uim_cms_settings_v1',
};

const CMSContext = createContext<CMSContextType | undefined>(undefined);

export const CMSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [contentLoadError, setContentLoadError] = useState('');
  const [membersLoadError, setMembersLoadError] = useState('');

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKSPACE);
      if (saved) return saved;
    } catch {
      // ignore
    }
    return '';
  });

  const [contents, setContents] = useState<ContentItem[]>([]);
  const [weeklyCreditHistory, setWeeklyCreditHistory] = useState<WeeklyCreditSummary[]>([]);
  const [creditHistory, setCreditHistory] = useState<ContentCreditHistory[]>([]);
  // Prevent an older workspace GET from restoring a content row after a newer mutation.
  const contentRevision = useRef(0);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const [members, setMembers] = useState<Member[]>([]);

  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MEDIA);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  // Settings live in MySQL (workspace_settings) and are loaded per workspace.
  const [settings, setSettings] = useState<CMSSettings>(INITIAL_SETTINGS);
  const [settingsCanManage, setSettingsCanManage] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [signedInUser, setSignedInUser] = useState<SignedInUser>({ name: '', email: '', avatarUrl: '' });

  const [showWorkspacePicker, setShowWorkspacePicker] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const currentWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const userProfile = signedInUser;
  const updateSignedInUser = (updates: Partial<SignedInUser>) => setSignedInUser((prev) => ({ ...prev, ...updates }));

  const contentEndpoint = (workspaceId: string) => '/workspaces/' + encodeURIComponent(workspaceId) + '/content';
  const memberEndpoint = (workspaceId: string) => '/workspaces/' + encodeURIComponent(workspaceId) + '/members';
  const settingsEndpoint = (workspaceId: string) => '/workspaces/' + encodeURIComponent(workspaceId) + '/settings';
  const contentPayload = (content: Partial<ContentItem>) => ({
    title: content.title || '',
    description: content.description || '',
    platform: content.platform || 'Instagram',
    format: content.format || 'Reels',
    pillar: content.pillar || '',
    priority: content.priority || 'Medium',
    status: content.status || 'Planning',
    picId: content.picId || '',
    contributorIds: content.contributorIds || [],
    targetPublishDate: content.targetPublishDate || '',
    actualPublishDate: content.actualPublishDate || '',
    publishedUrl: content.publishedUrl || '',
    verifiedAt: content.verifiedAt || '',
    scriptNotes: content.scriptNotes || '',
  });

  const searchMemberCandidates = useCallback(async (query: string) => {
    if (!activeWorkspaceId || query.trim().length < 2) return [];
    const result = await api<{ users: MemberCandidate[] }>(
      '/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/member-candidates?q=' + encodeURIComponent(query.trim())
    );
    return result.users;
  }, [activeWorkspaceId]);

  const getAssignableMemberRoles = useCallback(async () => {
    if (!activeWorkspaceId) return [];
    const result = await api<{ roles: WorkspaceRoleOption[] }>(
      '/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/member-roles'
    );
    return result.roles;
  }, [activeWorkspaceId]);

  useEffect(() => {
    try {
      localStorage.removeItem('uim_cms_contents_v1');
      localStorage.removeItem('uim_cms_members_v1');
    } catch { /* Local cache is no longer used for these database-backed modules. */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user } = await api<{ user: { id: string; name: string; email: string; avatarUrl?: string | null } }>('/auth/me');
        const { workspaces: rows } = await api<{ workspaces: Array<{ id: string; slug: string; name: string; description: string | null; role: string; memberCount: number; contentCount: number }> }>('/workspaces');
        if (cancelled) return;
        const loaded = rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, description: row.description || '', role: row.role, accent: '#F5C518', status: 'Active' as const, contents: [], members: [], mediaAssets: [], activityLogs: [], settings: { ...INITIAL_SETTINGS, organizationName: row.name }, memberCount: row.memberCount, contentCount: row.contentCount }));
        setSignedInUser({ name: user.name, email: user.email, avatarUrl: user.avatarUrl || '' });
        setWorkspaces(loaded);
        setIsAuthenticated(true);
        const last = localStorage.getItem(STORAGE_KEYS.LAST_WORKSPACE);
        const target = loaded.find((row) => row.id === last) || loaded[0];
        if (target) { setActiveWorkspaceId(target.id); setShowWorkspacePicker(false); }
        else setShowWorkspacePicker(true);
      } catch {
        if (!cancelled) { setIsAuthenticated(false); setWorkspaces([]); }
      } finally { if (!cancelled) setAuthLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!currentWorkspace) return;
    setMediaAssets(currentWorkspace.mediaAssets);
    setActivityLogs(currentWorkspace.activityLogs);
  }, [currentWorkspace]);

  useEffect(() => {
    if (!isAuthenticated || !activeWorkspaceId) {
      setContents([]);
      setMembers([]);
      setWeeklyCreditHistory([]);
      setCreditHistory([]);
      setContentLoading(false);
      setMembersLoading(false);
      return;
    }
    let cancelled = false;
    setContents([]);
    setMembers([]);
    setWeeklyCreditHistory([]);
    setCreditHistory([]);
    setContentLoadError('');
    setMembersLoadError('');
    setContentLoading(true);
    setMembersLoading(true);
    const requestRevision = contentRevision.current;
    Promise.all([
      api<{ contents: ContentItem[] }>(contentEndpoint(activeWorkspaceId)),
      api<{ members: Member[]; weeklyCredits: WeeklyCreditSummary[]; creditHistory: ContentCreditHistory[] }>(memberEndpoint(activeWorkspaceId)),
    ]).then(([contentResult, memberResult]) => {
      if (cancelled || requestRevision !== contentRevision.current) return;
      // The endpoint is workspace scoped; keep the workspace key explicit in UI state too.
      const workspaceContents = contentResult.contents
        .filter((item) => !item.workspaceId || item.workspaceId === activeWorkspaceId)
        .map((item) => ({ ...item, workspaceId: activeWorkspaceId }));
      setContents(workspaceContents);
      setMembers(memberResult.members);
      setWeeklyCreditHistory(memberResult.weeklyCredits || []);
      setCreditHistory(memberResult.creditHistory || []);
      setSelectedContentId((previous) => workspaceContents.some((item) => item.id === previous)
        ? previous
        : workspaceContents[0]?.id ?? null);
    }).catch((error) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : 'Unable to load workspace data.';
      setContentLoadError(message);
      setMembersLoadError(message);
      showToast('error', 'Workspace data could not be loaded', message);
    }).finally(() => {
      if (!cancelled) {
        setContentLoading(false);
        setMembersLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [activeWorkspaceId, isAuthenticated]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKSPACE, activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MEDIA, JSON.stringify(mediaAssets));
  }, [mediaAssets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(activityLogs));
  }, [activityLogs]);

  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEYS.SETTINGS); } catch { /* Settings are database-backed now. */ }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !activeWorkspaceId) return;
    let cancelled = false;
    const workspaceId = activeWorkspaceId;
    setSettingsLoading(true);
    api<SettingsResponse>(settingsEndpoint(workspaceId))
      .then((result) => {
        if (cancelled) return;
        setSettings(result.settings);
        setSettingsCanManage(result.canManage);
      })
      .catch(() => {
        if (!cancelled) setSettingsCanManage(false);
      })
      .finally(() => { if (!cancelled) setSettingsLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, activeWorkspaceId]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const showToast = (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => removeToast(id), 4500);
  };

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const loadWorkspaces = async () => {
    const { workspaces: rows } = await api<{ workspaces: Array<{ id: string; slug: string; name: string; description: string | null; role: string; memberCount: number; contentCount: number }> }>('/workspaces');
    const loaded = rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, description: row.description || '', role: row.role, accent: '#F5C518', status: 'Active' as const, contents: [], members: [], mediaAssets: [], activityLogs: [], settings: { ...INITIAL_SETTINGS, organizationName: row.name }, memberCount: row.memberCount, contentCount: row.contentCount }));
    setWorkspaces(loaded);
    const last = localStorage.getItem(STORAGE_KEYS.LAST_WORKSPACE);
    const target = loaded.find((row) => row.id === last) || loaded[0];
    if (target) { setActiveWorkspaceId(target.id); setShowWorkspacePicker(false); }
    else setShowWorkspacePicker(true);
    setActiveTab('dashboard');
  };

  const login = async (email: string, password: string) => {
    const { user } = await api<{ user: { name: string; email: string; avatarUrl?: string } }>('/auth/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) });
    await loadWorkspaces(); setSignedInUser({ name: user.name, email: user.email, avatarUrl: user.avatarUrl || '' }); setIsAuthenticated(true);
    showToast('success', 'Login successful', 'Your workspaces are ready.');
  };

  const register = async (name: string, username: string, email: string, password: string) => {
    const { user } = await api<{ user: { name: string; email: string } }>('/auth/sign-up', { method: 'POST', body: JSON.stringify({ name, username, email, password }) });
    await loadWorkspaces(); setSignedInUser({ name: user.name, email: user.email, avatarUrl: '' }); setIsAuthenticated(true);
    showToast('success', 'Account created', 'Create or join a workspace to get started.');
  };

  const loginWithGoogle = async (credential: string, password?: string) => {
    const { user, created } = await api<{ user: { name: string; email: string; avatarUrl?: string }; created: boolean }>('/auth/google', { method: 'POST', body: JSON.stringify({ credential, password }) });
    await loadWorkspaces(); setSignedInUser({ name: user.name, email: user.email, avatarUrl: user.avatarUrl || '' }); setIsAuthenticated(true);
    showToast('success', created ? 'Account created' : 'Login successful', created ? 'Create or join a workspace to get started.' : 'Your workspaces are ready.');
  };

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear local session state even if the API is unavailable. */ }
    window.history.replaceState(null, '', window.location.pathname);
    setIsAuthenticated(false);
    setSignedInUser({ name: '', email: '', avatarUrl: '' }); setWorkspaces([]); setActiveWorkspaceId('');
    setShowWorkspacePicker(false);
    setActiveTab('dashboard');
    showToast('info', 'Logged out', 'You have been signed out.');
  };

  const selectWorkspace = (workspaceId: string) => {
    const nextWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!nextWorkspace) return;
    setActiveWorkspaceId(workspaceId);
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_WORKSPACE, workspaceId);
    } catch {
      // Keep the workspace switch functional without persistence.
    }
    setShowWorkspacePicker(false);
    setActiveTab('dashboard');
    showToast('info', 'Active workspace changed', `${nextWorkspace.name} was selected.`);
  };

  const createWorkspace = async (data: { name: string; description: string; role: string; accent?: string }) => {
    const { workspace: row } = await api<{ workspace: { id: string; slug: string; name: string; description: string; role: string; memberCount: number; contentCount: number } }>('/workspaces', { method: 'POST', body: JSON.stringify({ name: data.name, description: data.description }) });
    const newWorkspace: WorkspaceRecord = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      role: row.role,
      accent: data.accent || '#F5C518',
      status: 'Active',
      contents: [],
      members: [],
      mediaAssets: [],
      activityLogs: [],
      settings: {
        ...INITIAL_SETTINGS,
        organizationName: data.name,
        contentPillars: ['Brand Story', 'Campaign Design', 'Community'],
      },
    };

    newWorkspace.memberCount = row.memberCount;
    newWorkspace.contentCount = row.contentCount;

    setWorkspaces((prev) => [newWorkspace, ...prev]);
    setActiveWorkspaceId(row.id);
    setShowWorkspacePicker(false);
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_WORKSPACE, row.id);
    } catch {
      // Keep the new workspace active for this session.
    }
    setActiveTab(showWorkspacePicker || workspaces.length === 0 ? 'dashboard' : 'workspace-management');
    showToast('success', 'Workspace created', `${data.name} is ready to use.`);
    return newWorkspace;
  };

  const joinWorkspace = async (inviteCode: string) => {
    await api('/workspaces/join', { method: 'POST', body: JSON.stringify({ inviteCode }) });
    await loadWorkspaces();
  };

  const memberCreditMap = new Map<string, number>();
  members.forEach((member) => memberCreditMap.set(member.id, member.totalPublishedCredits || 0));
  const publishedContents = contents.filter((content) => content.status === 'Published');

  const debtSummaries: DebtSummary[] = members.map((member) => {
    const eligibleCredits = memberCreditMap.get(member.id) || 0;
    const weeklyTarget = member.weeklyTarget || settings.defaultWeeklyTarget;
    const previousDebt = member.previousDebt || 0;
    const calculatedDebt = member.currentDebt || 0;
    const pendingCount = contents.filter(
      (content) => content.status !== 'Published' && content.contributorIds.includes(member.id)
    ).length;
    const achievementRate = weeklyTarget > 0 ? Math.min(100, Math.round((eligibleCredits / weeklyTarget) * 100)) : 100;

    return {
      memberId: member.id,
      memberName: member.name,
      role: member.role,
      avatar: member.avatar,
      weeklyTarget,
      previousDebt,
      eligibleCredits,
      currentDebt: calculatedDebt,
      pendingPublicationCount: pendingCount,
      achievementRate,
      history: member.debtHistory || [],
    };
  });

  const totalPublishedCount = publishedContents.length;
  const totalInProductionCount = contents.filter(
    (content) => content.status !== 'Published' && content.status !== 'Planning'
  ).length;
  const totalWaitingReviewCount = contents.filter(
    (content) => content.status === 'Review' || content.status === 'Revision'
  ).length;
  const todayStr = localDateKey();
  const totalOverdueCount = contents.filter(
    (content) => content.status !== 'Published' && content.targetPublishDate < todayStr
  ).length;
  const totalTeamPublishedCredits = Array.from(memberCreditMap.values()).reduce((memo, item) => memo + item, 0);
  const totalTeamDebt = debtSummaries.reduce((memo, item) => memo + item.currentDebt, 0);

  const addContent = async (
    data: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt' | 'scenes' | 'scriptBlocks' | 'tasks' | 'reviewComments' | 'attachedAssetIds'>
  ): Promise<ContentItem> => {
    if (!activeWorkspaceId) throw new Error('Select a workspace before creating content.');
    const workspaceId = activeWorkspaceId;
    const result = await api<{ content: ContentItem }>(contentEndpoint(workspaceId), {
      method: 'POST',
      body: JSON.stringify(contentPayload(data)),
    });
    if (activeWorkspaceIdRef.current === workspaceId) {
      contentRevision.current += 1;
      setContents((prev) => [result.content, ...prev.filter((item) => item.id !== result.content.id)]);
      void refreshContentsFromDatabase(workspaceId, contentRevision.current);
      setSelectedContentId(result.content.id);
    }
    showToast('success', 'Content created', '"' + result.content.title + '" was saved to the workspace.');
    return result.content;
  };

  const updateContent = async (id: string, updates: Partial<ContentItem>): Promise<boolean> => {
    const current = contents.find((item) => item.id === id);
    if (!activeWorkspaceId || !current || (current.workspaceId && current.workspaceId !== activeWorkspaceId)) return false;
    const workspaceId = activeWorkspaceId;
    try {
      const hasStudioChanges = ['scenes', 'scriptBlocks', 'tasks', 'reviewComments']
        .some((key) => Object.prototype.hasOwnProperty.call(updates, key));
      const studioOnly = hasStudioChanges && !Object.keys(updates).some((key) =>
        ['title', 'description', 'platform', 'format', 'pillar', 'priority', 'status', 'picId', 'contributorIds', 'targetPublishDate', 'actualPublishDate', 'publishedUrl', 'verifiedAt', 'scriptNotes'].includes(key)
      );
      const result = await api<{ content: ContentItem }>(
        contentEndpoint(workspaceId) + '/' + encodeURIComponent(id) + (studioOnly ? '/studio' : ''),
        {
        method: studioOnly ? 'PUT' : 'PATCH',
        body: JSON.stringify(updates),
        }
      );
      if (activeWorkspaceIdRef.current !== workspaceId) return true;
      contentRevision.current += 1;
      // The API response is reloaded from MySQL and contains the canonical state for
      // Calendar, Workspace, Storyboard, and Production Board.
      setContents((prev) => prev.map((item) => item.id === id ? result.content : item));
      void refreshContentsFromDatabase(workspaceId, contentRevision.current);
      return true;
    } catch (error) {
      showToast('error', 'Content was not saved', error instanceof Error ? error.message : 'Please try again.');
      return false;
    }
  };

  const deleteContent = async (id: string) => {
    if (!activeWorkspaceId) return;
    const workspaceId = activeWorkspaceId;
    const item = contents.find((content) => content.id === id);
    if (item?.workspaceId && item.workspaceId !== workspaceId) return;
    try {
      await api(contentEndpoint(workspaceId) + '/' + encodeURIComponent(id), { method: 'DELETE' });
      if (activeWorkspaceIdRef.current !== workspaceId) {
        showToast('success', 'Content deleted', item ? '"' + item.title + '" was removed.' : 'Content was removed.');
        return;
      }
      contentRevision.current += 1;
      setContents((prev) => prev.filter((content) => content.id !== id));
      if (selectedContentId === id) setSelectedContentId(null);
      void refreshContentsFromDatabase(activeWorkspaceId, contentRevision.current);
      showToast('success', 'Content deleted', item ? '"' + item.title + '" was removed.' : 'Content was removed.');
    } catch (error) {
      showToast('error', 'Content was not deleted', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const refreshContentsFromDatabase = async (workspaceId: string, expectedRevision: number) => {
    try {
      const [result, memberResult] = await Promise.all([
        api<{ contents: ContentItem[] }>(contentEndpoint(workspaceId)),
        api<{ members: Member[]; weeklyCredits: WeeklyCreditSummary[]; creditHistory: ContentCreditHistory[] }>(memberEndpoint(workspaceId)),
      ]);
      if (activeWorkspaceIdRef.current !== workspaceId || contentRevision.current !== expectedRevision) return;
      const workspaceContents = result.contents
        .filter((item) => !item.workspaceId || item.workspaceId === workspaceId)
        .map((item) => ({ ...item, workspaceId }));
      setContents(workspaceContents);
      setMembers(memberResult.members);
      setWeeklyCreditHistory(memberResult.weeklyCredits || []);
      setCreditHistory(memberResult.creditHistory || []);
      setWorkspaces((previous) => previous.map((workspace) => workspace.id === workspaceId
        ? { ...workspace, contentCount: workspaceContents.length }
        : workspace));
      setSelectedContentId((previous) => workspaceContents.some((item) => item.id === previous)
        ? previous
        : workspaceContents[0]?.id ?? null);
    } catch {
      // Keep the successful mutation response in shared state if this follow-up read fails.
    }
  };

  const refreshWorkspaceData = () => {
    if (activeWorkspaceId) void refreshContentsFromDatabase(activeWorkspaceId, contentRevision.current);
  };

  const changeContentStatus = async (id: string, newStatus: ProductionStage): Promise<boolean> => {
    const target = contents.find((content) => content.id === id);
    if (!target) return false;

    if (newStatus === 'Published' && (!target.publishedUrl || !target.actualPublishDate || !target.verifiedAt || target.contributorIds.length === 0)) {
      showToast(
        'error',
        'Verification required',
        'Content cannot be published without completing publication verification and selecting contributors.'
      );
      setSelectedContentId(id);
      setActiveTab('workspace');
      return false;
    }

    const saved = await updateContent(id, { status: newStatus });
    if (!saved) return false;
    if (newStatus === 'Published' && activeWorkspaceIdRef.current === activeWorkspaceId) {
      await refreshContentsFromDatabase(activeWorkspaceId, contentRevision.current);
    }

    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      contentId: id,
      contentTitle: target.title,
      actorId: target.picId,
      actorName: members.find((member) => member.id === target.picId)?.name || 'Workspace Producer',
      action: `Moved production stage to "${newStatus}"`,
      timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
      badgeType: newStatus === 'Published' ? 'success' : 'info',
    };
    setActivityLogs((prev) => [newLog, ...prev]);

    showToast('info', 'Stage updated', `Content was moved to "${newStatus}".`);
    return true;
  };

  const verifyAndPublishContent = async (
    contentId: string,
    url: string,
    actualPublishDate: string,
    verifiedContributorIds: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    const target = contents.find((content) => content.id === contentId);
    if (!target) return { success: false, error: 'Content not found.' };

    if (!url || !url.startsWith('http')) {
      return { success: false, error: 'Please enter a valid active URL.' };
    }

    if (!actualPublishDate) {
      return { success: false, error: 'Please specify the actual publish date.' };
    }

    if (!verifiedContributorIds || verifiedContributorIds.length === 0) {
      return { success: false, error: 'Select at least one verified contributor.' };
    }

    const verifiedAt = localDateTimeValue();
    const nowTimeStr = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

    const saved = await updateContent(contentId, {
      status: 'Published',
      publishedUrl: url,
      actualPublishDate,
      verifiedAt,
      contributorIds: verifiedContributorIds,
    });
    if (!saved) return { success: false, error: 'The publication was not saved. Please try again.' };
    if (activeWorkspaceIdRef.current === activeWorkspaceId) {
      await refreshContentsFromDatabase(activeWorkspaceId, contentRevision.current);
    }

    const contributorNames = verifiedContributorIds
      .map((id) => members.find((member) => member.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      contentId,
      contentTitle: target.title,
      actorId: target.picId,
      actorName: members.find((member) => member.id === target.picId)?.name || 'Workspace Admin',
      action: `Published content officially at ${url}. Credits assigned to: ${contributorNames}.`,
      timestamp: nowTimeStr,
      badgeType: 'success',
    };
    setActivityLogs((prev) => [newLog, ...prev]);

    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#F5C518', '#111827', '#10B981'],
      });
    } catch {
      // safe fallback
    }

    showToast('success', 'Content published successfully!', `Publication credits were assigned to ${verifiedContributorIds.length} contributors.`);
    return { success: true };
  };

  const addScene = async (contentId: string, sceneData: Omit<Scene, 'id' | 'sceneNumber'>) => {
    const content = contents.find((item) => item.id === contentId);
    if (!content) return false;
    const saved = await updateContent(contentId, { scenes: [...content.scenes, { ...sceneData, id: '', sceneNumber: content.scenes.length + 1 }] });
    if (saved) showToast('success', 'Scene added', 'A new scene was saved to the storyboard.');
    return saved;
  };

  const updateScene = async (contentId: string, sceneId: string, updates: Partial<Scene>) => {
    const content = contents.find((item) => item.id === contentId);
    if (!content) return false;
    const saved = await updateContent(contentId, { scenes: content.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...updates } : scene) });
    if (saved) showToast('info', 'Scene updated', 'Scene details were saved.');
    return saved;
  };

  const deleteScene = async (contentId: string, sceneId: string) => {
    const content = contents.find((item) => item.id === contentId);
    if (!content) return false;
    const scenes = content.scenes.filter((scene) => scene.id !== sceneId).map((scene, idx) => ({ ...scene, sceneNumber: idx + 1 }));
    const saved = await updateContent(contentId, { scenes });
    if (saved) showToast('warning', 'Scene deleted', 'The scene was removed from the storyboard.');
    return saved;
  };

  const duplicateScene = async (contentId: string, sceneId: string) => {
    const content = contents.find((item) => item.id === contentId);
    const target = content?.scenes.find((scene) => scene.id === sceneId);
    if (!content || !target) return false;
    // Keep the extra checklist property inferred before passing this object to the Scene[] API.
    const duplicate = {
      ...target,
      id: '',
      title: `${target.title} (Duplicate)`,
      sceneNumber: content.scenes.length + 1,
      isCompleted: false,
    };
    const saved = await updateContent(contentId, { scenes: [...content.scenes, duplicate] });
    if (saved) showToast('info', 'Scene duplicated', 'A scene copy was saved.');
    return saved;
  };

  const reorderScenes = async (contentId: string, scenes: Scene[]) => {
    const renumbered = scenes.map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
    return updateContent(contentId, { scenes: renumbered });
  };

  // Takes the content record directly (e.g. straight from addContent) so it also
  // works for content that is not in the `contents` state of this render yet.
  const appendScenes = async (content: ContentItem, newScenes: Omit<Scene, 'id' | 'sceneNumber'>[]) => {
    if (!activeWorkspaceId) return false;
    const workspaceId = activeWorkspaceId;
    const scenes = [...content.scenes, ...newScenes.map((scene) => ({ ...scene, id: '' }))]
      .map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
    try {
      const result = await api<{ content: ContentItem }>(
        contentEndpoint(workspaceId) + '/' + encodeURIComponent(content.id) + '/studio',
        { method: 'PUT', body: JSON.stringify({ scenes }) }
      );
      if (activeWorkspaceIdRef.current !== workspaceId) return true;
      contentRevision.current += 1;
      setContents((prev) => prev.some((item) => item.id === content.id)
        ? prev.map((item) => item.id === content.id ? result.content : item)
        : [result.content, ...prev]);
      void refreshContentsFromDatabase(workspaceId, contentRevision.current);
      return true;
    } catch (error) {
      showToast('error', 'Scenes were not saved', error instanceof Error ? error.message : 'Please try again.');
      return false;
    }
  };

  const addTask = async (contentId: string, title: string, assigneeId: string, dueDate: string) => {
    const content = contents.find((item) => item.id === contentId);
    if (!content) return false;
    const newTask: Task = {
      id: '',
      contentId,
      title,
      assigneeId,
      completed: false,
      dueDate,
    };

    const saved = await updateContent(contentId, { tasks: [...content.tasks, newTask] });
    if (saved) showToast('success', 'Task created', `"${title}" was assigned.`);
    return saved;
  };

  const toggleTask = async (contentId: string, taskId: string) => {
    const content = contents.find((item) => item.id === contentId);
    if (!content) return false;
    return updateContent(contentId, { tasks: content.tasks.map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task) });
  };

  const deleteTask = async (contentId: string, taskId: string) => {
    const content = contents.find((item) => item.id === contentId);
    if (!content) return false;
    return updateContent(contentId, { tasks: content.tasks.filter((task) => task.id !== taskId) });
  };

  const addReviewComment = async (
    contentId: string,
    text: string,
    status: 'Comment' | 'Needs Revision' | 'Approved',
    authorId: string
  ) => {
    const content = contents.find((item) => item.id === contentId);
    if (!content) return false;
    const author = members.find((member) => member.id === authorId);
    const newComment: ReviewComment = {
      id: '',
      contentId,
      authorId,
      authorName: author ? author.name : 'Reviewer Workspace',
      authorAvatar: author ? author.avatar : '',
      text,
      status,
      createdAt: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
    };

    const producedStatus = status === 'Approved' ? 'Approved' : status === 'Needs Revision' ? 'Revision' : content.status;
    const saved = await updateContent(contentId, { status: producedStatus as ProductionStage, reviewComments: [newComment, ...content.reviewComments] });
    if (saved) showToast('info', 'Review posted', `Review marked as "${status}".`);
    return saved;
  };

  const addMediaAsset = (assetData: Omit<MediaAsset, 'id' | 'uploadedAt'>) => {
    const newAsset: MediaAsset = {
      ...assetData,
      id: 'med-' + Date.now(),
      uploadedAt: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
    };
    setMediaAssets((prev) => [newAsset, ...prev]);
    showToast('success', 'Asset uploaded', `"${newAsset.name}" was saved to the Kroombox CDN.`);
  };

  const attachAssetToContent = (contentId: string, assetId: string) => {
    setContents((prev) =>
      prev.map((content) => {
        if (content.id !== contentId) return content;
        if (content.attachedAssetIds.includes(assetId)) return content;
        return { ...content, attachedAssetIds: [...content.attachedAssetIds, assetId] };
      })
    );
    showToast('info', 'Related asset', 'The media has been linked to this content.');
  };

  const detachAssetFromContent = (contentId: string, assetId: string) => {
    setContents((prev) =>
      prev.map((content) => {
        if (content.id !== contentId) return content;
        return { ...content, attachedAssetIds: content.attachedAssetIds.filter((id) => id !== assetId) };
      })
    );
  };

  const addMember = async (data: { userId: string; roleId: string; weeklyTarget: number }) => {
    if (!activeWorkspaceId) throw new Error('Select a workspace before adding a team member.');
    const result = await api<{ members: Member[] }>(memberEndpoint(activeWorkspaceId), {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setMembers(result.members);
    const added = result.members.find((member) => member.id === data.userId);
    showToast('success', 'Member added', (added?.name || 'The user') + ' was added to this workspace.');
  };

  const updateMember = async (id: string, updates: { roleId?: string; weeklyTarget?: number; active?: boolean }) => {
    if (!activeWorkspaceId) throw new Error('Select a workspace before editing members.');
    const result = await api<{ members: Member[] }>(memberEndpoint(activeWorkspaceId) + '/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setMembers(result.members);
    showToast('success', 'Member details saved', 'The workspace member record was updated.');
  };

  const toggleMemberActive = async (id: string) => {
    const member = members.find((item) => item.id === id);
    if (!member) return;
    try {
      await updateMember(id, { active: !member.active });
    } catch (error) {
      showToast('error', 'Member status was not changed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const applySettingsResponse = (workspaceId: string, result: SettingsResponse) => {
    if (activeWorkspaceIdRef.current !== workspaceId) return;
    setSettings(result.settings);
    setSettingsCanManage(result.canManage);
    setWorkspaces((prev) => prev.map((workspace) => workspace.id === workspaceId
      ? { ...workspace, name: result.settings.organizationName, settings: result.settings }
      : workspace));
  };

  const updateSettings = async (updates: SettingsUpdate) => {
    if (!activeWorkspaceId) return false;
    const workspaceId = activeWorkspaceId;
    try {
      const result = await api<SettingsResponse>(settingsEndpoint(workspaceId), { method: 'PATCH', body: JSON.stringify(updates) });
      applySettingsResponse(workspaceId, result);
      if (updates.applyWeeklyTargetToMembers) void refreshContentsFromDatabase(workspaceId, contentRevision.current);
      showToast('success', 'Settings saved', 'Workspace settings were saved.');
      return true;
    } catch (error) {
      showToast('error', 'Settings were not saved', error instanceof Error ? error.message : 'Please try again.');
      return false;
    }
  };

  const resetSettings = async () => {
    if (!activeWorkspaceId) return false;
    const workspaceId = activeWorkspaceId;
    try {
      const result = await api<SettingsResponse>(settingsEndpoint(workspaceId), { method: 'DELETE' });
      applySettingsResponse(workspaceId, result);
      showToast('info', 'Settings reset', 'All workspace settings were restored to their defaults.');
      return true;
    } catch (error) {
      showToast('error', 'Settings were not reset', error instanceof Error ? error.message : 'Please try again.');
      return false;
    }
  };

  const closeWeeklyPeriod = () => {
    setMembers((prev) =>
      prev.map((member) => {
        const eligibleCredits = memberCreditMap.get(member.id) || 0;
        const target = member.weeklyTarget || settings.defaultWeeklyTarget;
        const newDebt = Math.max(0, member.currentDebt + target - eligibleCredits);
        return { ...member, currentDebt: newDebt };
      })
    );

    const newLog: ActivityLog = {
      id: 'log-' + Date.now(),
      actorId: 'admin',
      actorName: 'CMS System',
      action: 'Executed the weekly period close and refreshed content debt.',
      timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
      badgeType: 'alert',
    };
    setActivityLogs((prev) => [newLog, ...prev]);

    showToast('info', 'Weekly period closed', 'Content credits and debt have been updated.');
  };

  return (
    <CMSContext.Provider
      value={{
        contents,
        members,
        weeklyCreditHistory,
        creditHistory,
        mediaAssets,
        activityLogs,
        settings,
        selectedContentId,
        activeTab,
        sidebarOpen,
        toasts,
        workspaces,
        activeWorkspaceId,
        currentWorkspace,
        isAuthenticated,
        showWorkspacePicker,
        userProfile,
        updateSignedInUser,
        refreshWorkspaceData,
        setActiveTab,
        setSelectedContentId,
        setSidebarOpen,
        toggleSidebar,
        showToast,
        removeToast,
        login,
        register,
        loginWithGoogle,
        logout,
        setShowWorkspacePicker,
        selectWorkspace,
        createWorkspace,
        joinWorkspace,
        authLoading,
        contentLoading,
        membersLoading,
        contentLoadError,
        membersLoadError,
        searchMemberCandidates,
        getAssignableMemberRoles,
        addContent,
        updateContent,
        deleteContent,
        changeContentStatus,
        verifyAndPublishContent,
        addScene,
        updateScene,
        deleteScene,
        duplicateScene,
        reorderScenes,
        appendScenes,
        addTask,
        toggleTask,
        deleteTask,
        addReviewComment,
        addMediaAsset,
        attachAssetToContent,
        detachAssetFromContent,
        addMember,
        updateMember,
        toggleMemberActive,
        settingsCanManage,
        settingsLoading,
        updateSettings,
        resetSettings,
        closeWeeklyPeriod,
        debtSummaries,
        totalPublishedCount,
        totalInProductionCount,
        totalWaitingReviewCount,
        totalOverdueCount,
        totalTeamPublishedCredits,
        totalTeamDebt,
      }}
    >
      {children}
    </CMSContext.Provider>
  );
};

export const useCMS = () => {
  const context = useContext(CMSContext);
  if (!context) {
    throw new Error('useCMS must be used within a CMSProvider');
  }
  return context;
};

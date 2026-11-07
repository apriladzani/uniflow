export type ProductionStage =
  | 'Planning'
  | 'Scripting'
  | 'Shooting'
  | 'Editing'
  | 'Review'
  | 'Revision'
  | 'Approved'
  | 'Scheduled'
  | 'Published';

export type PlatformType = 'Instagram' | 'TikTok' | 'YouTube' | 'LinkedIn' | 'X (Twitter)';

export type ContentFormat = 'Reels' | 'Carousel' | 'Shorts' | 'Long-form Video' | 'Infographic Post' | 'Thread';

export type PriorityLevel = 'Low' | 'Medium' | 'High';

export interface Member {
  id: string;
  username?: string;
  roleId?: string;
  name: string;
  role: string;
  email: string;
  avatar: string;
  weeklyTarget: number; // default: 2 credits
  active: boolean;
  totalPublishedCredits: number;
  currentDebt: number;
  previousDebt?: number;
  debtHistory?: { week: string; target: number; credits: number; debt: number }[];
}

export interface Scene {
  id: string;
  sceneNumber: number;
  title: string;
  durationSeconds: number;
  visualDirection: string;
  aRollDirection?: string;
  bRollDirection?: string;
  footageReferences?: { mainVisual?: string; aRoll?: string; bRoll?: string };
  footageAssets?: {
    mainVisual: SceneFootageAsset[];
    aRoll: SceneFootageAsset[];
    bRoll: SceneFootageAsset[];
  };
  voiceOver: string;
  onScreenText: string;
  cameraAngle: 'Wide Shot' | 'Medium Shot' | 'Close-Up' | 'POV' | 'Over the Shoulder' | 'Drone / High Angle';
  transition: 'Cut' | 'Dissolve' | 'Wipe' | 'Zoom In' | 'Fade to Black';
  footageRef?: string;
  editorNotes?: string;
  isCompleted?: boolean;
  assignedMemberId?: string;
}

export interface SceneFootageAsset {
  id: string;
  cdnFileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface VirtualMediaFolder {
  id: string;
  parentFolderId?: string | null;
  name: string;
  identityKey?: string | null;
  cdnFolderId?: string | null;
  folderType: 'virtual';
}

export interface Task {
  id: string;
  contentId: string;
  title: string;
  assigneeId: string;
  completed: boolean;
  dueDate: string;
}

export interface ReviewComment {
  id: string;
  contentId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  status: 'Comment' | 'Needs Revision' | 'Approved';
  createdAt: string;
}

export interface ScriptBlock {
  id: string;
  cue: string;
  visual: string;
  audio: string;
  durationSec: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'document';
  folder: string;
  parentId?: string | null;
  repositoryFileId?: string;
  mimeType?: string;
  sizeBytes?: number;
  fileSizeMb: number;
  duration?: string;
  resolution?: string;
  url: string;
  cdnProvider: string;
  uploadedAt: string;
  thumbnail?: string;
}

export interface ContentItem {
  id: string;
  /** Stable shareable URL slug; the UUID remains the internal identifier. */
  slug?: string;
  /** Workspace that owns this record, supplied by the API. */
  workspaceId?: string;
  title: string;
  description: string;
  platform: PlatformType;
  format: ContentFormat;
  pillar: string;
  priority: PriorityLevel;
  status: ProductionStage;
  picId: string; // Person In Charge
  contributorIds: string[]; // Team members who receive credit upon verified publication
  targetPublishDate: string; // YYYY-MM-DD
  actualPublishDate?: string;
  publishedUrl?: string;
  verifiedAt?: string;
  scenes: Scene[];
  scriptBlocks: ScriptBlock[];
  scriptNotes?: string;
  tasks: Task[];
  reviewComments: ReviewComment[];
  attachedAssetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DebtSummary {
  memberId: string;
  memberName: string;
  role: string;
  avatar: string;
  weeklyTarget: number;
  previousDebt: number;
  eligibleCredits: number;
  currentDebt: number; // MAX(0, previousDebt + weeklyTarget - eligibleCredits)
  pendingPublicationCount: number;
  achievementRate: number; // (eligibleCredits / weeklyTarget) * 100
  history: {
    week: string;
    target: number;
    credits: number;
    debt: number;
  }[];
}

export interface ActivityLog {
  id: string;
  contentId?: string;
  contentTitle?: string;
  actorId: string;
  actorName: string;
  action: string;
  timestamp: string;
  badgeType?: 'info' | 'success' | 'warning' | 'alert';
}

export interface CMSSettings {
  organizationName: string;
  timezone: string;
  productionCycle: string;
  defaultWeeklyTarget: number;
  contentPillars: string[];
  platforms: PlatformType[];
  aiModel: string;
  aiDefaultTone: string;
}

export interface SettingsUpdate extends Partial<CMSSettings> {
  /** Also set every active member's weekly target to defaultWeeklyTarget. */
  applyWeeklyTargetToMembers?: boolean;
}

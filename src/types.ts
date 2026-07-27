export enum SpaceId {
  Personal = 'personal',
  Shared = 'shared',
  ProjectA = 'projectA',
  ProjectB = 'projectB'
}

export interface ProjectSpace {
  id: SpaceId;
  name: string;
  extensionCount: number;
  assetCount: number;
  description: string;
}

export enum AppId {
  Blender = 'blender',
  Photoshop = 'photoshop',
  Maya = 'maya',
  Max3ds = 'max3ds',
  Houdini = 'houdini'
}

export type ExtensionHostId =
  | AppId
  | 'comfyui'
  | 'substance-painter'
  | 'motionbuilder'
  | 'unreal-engine'
  | 'unity'
  | 'exe'
  | 'web';

export type ComfyUISubtype = 'node' | 'workflow';

export enum AppStatus {
  NotReady = 'NOT_READY', // 未就绪
  InstalledOffline = 'INSTALLED_OFFLINE', // 已安装·离线
  Connecting = 'CONNECTING', // 检测中
  Connected = 'CONNECTED', // 已连接
  ConnectionFailed = 'CONNECTION_FAILED' // 连接失败
}

export interface AppConfig {
  id: AppId;
  name: string;
  isPlatformHosted: boolean; // true = open-source DCC, false = commercial DCC
  status: AppStatus;
  version: string;
  newVersion?: string; // If 'newVersion' exists, update badge is active
  isOld?: boolean; // For business software, indicates orange "version out of date" badge
  installPath?: string;
  diskRequiredGB: number;
  downloadProgress?: number; // 0-100
  sizeGB: number;
}

export type ExtensionLifecycle = 'not_downloaded' | 'installed_latest' | 'update_available';
export type ExtensionArtStage =
  | 'character_concept'
  | 'scene_concept'
  | 'character_model'
  | 'scene_model'
  | 'animation'
  | 'vfx'
  | 'ued';

export interface ExtensionShareGrant {
  email: string;
  name: string;
  sharedAt: string;
}

export interface DccExtension {
  id: string;
  name: string;
  dccId: ExtensionHostId;
  version: string;
  latestVersion: string;
  desc: string;
  author: string;
  ownerEmail: string;
  spaceId: SpaceId;
  stage: ExtensionArtStage;
  lifecycle: ExtensionLifecycle;
  fileSizeMB: number;
  thumbnail: string;
  previewUrl: string;
  updatedAt: string;
  needsRestart: boolean;
  isActivated: boolean;
  sharedWith: ExtensionShareGrant[];
  minimumHostVersion?: string;
  packagePath?: string;
  command?: string;
  webUrl?: string;
  comfySubtype?: ComfyUISubtype;
  thumbnailFileName?: string;
  simulateHotLoadFailure?: boolean;
}

export enum AssetCategory {
  All = 'all',
  CharConcept = 'char_concept', // 角色原画
  SceneConcept = 'scene_concept', // 场景原画
  CharModel = 'char_model', // 角色模型
  SceneModel = 'scene_model', // 场景模型
  Animation = 'animation', // 动画
  Video = 'video', // 视频
  GUI = 'gui' // GUI
}

export interface ArtAsset {
  id: string;
  name: string;
  category: AssetCategory;
  format: string; // PNG, JPG, FBX, OBJ, blend, ma, mb, max, MP4, MOV, etc.
  sizeMB: number;
  thumbnail: string;
  previewUrl: string; // Larger image for display
  author: string;
  platform: string; // 来源平台 (e.g., IT Asset System, DCC Export, CG Share)
  desc: string;
  tags: string[];
  createdAt?: string; // ISO timestamp; used by combined filters for time range + sorting
  width?: number; // pixel dimensions; used by the size (longest-edge px) filter
  height?: number;
  org?: string; // 组织架构（部门/项目组），用于筛选
  taskStatus?: AssetTaskStatus; // 任务状态，用于筛选
  durationSec?: number; // 视频/音频时长（秒），用于时长筛选
}

// 任务状态枚举（占位：待处理/制作中/待审核/已通过/已驳回）
export type AssetTaskStatus = 'pending' | 'producing' | 'reviewing' | 'approved' | 'rejected';

export type PersonalUploadType = 'image' | 'gif' | 'video';

export interface PersonalUploadedAsset extends ArtAsset {
  uploadType: PersonalUploadType;
  sourceFileName: string;
  uploadedAt: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt?: string;
}

export type CanvasRole = 'owner' | 'editor' | 'viewer';

export interface CanvasFolder {
  id: string;
  name: string;
  parentId: string | null;
  spaceId: SpaceId;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
}

export interface CanvasDocument {
  id: string;
  name: string;
  folderId: string | null;
  spaceId: SpaceId;
  ownerEmail: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  thumbnailColor: string;
  elementCount: number;
  isDeleted?: boolean;
}

export interface CanvasShareGrant {
  canvasId: string;
  granteeEmail: string;
  granteeName: string;
  role: Exclude<CanvasRole, 'owner'>;
  sharedByEmail: string;
  sharedAt: string;
  viaGroup?: SpaceId;
}

export interface CanvasHistoryEntry {
  id: string;
  canvasId: string;
  actorName: string;
  createdAt: string;
  summary: string;
}

export interface CanvasCommentThread {
  id: string;
  canvasId: string;
  x: number;
  y: number;
  authorName: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
}

export type CanvasElementKind = 'text' | 'shape' | 'image' | 'audio' | 'video' | 'model';

export interface CanvasElement {
  id: string;
  canvasId: string;
  kind: CanvasElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body?: string;
  color: string;
  createdByName: string;
  createdAt: string;
}

export type NotificationNode =
  | 'canvas-share'
  | 'discussion-invite'
  | 'discussion-summary'
  | 'comment-mention'
  | 'tool-personal-grant'
  | 'tool-project-grant';
export type NotificationDomain = 'canvas' | 'asset' | 'tool';

export interface NotificationDelivery {
  inApp: 'delivered';
  dingtalk: 'delivered' | 'failed';
}

export interface NotificationAction {
  label: string;
  tab: 'extensions';
  spaceId: SpaceId;
  extensionId?: string;
  href: string;
}

export interface AppNotification {
  id: string;
  domain: NotificationDomain;
  node: NotificationNode;
  trigger: string;
  recipient: string;
  title: string;
  content: string;
  canvasName?: string;
  resourceLabel?: string;
  resourceName?: string;
  actorName: string;
  delivery: NotificationDelivery;
  action?: NotificationAction;
  createdAt: string;
  unread: boolean;
}

export type NotificationInput = Omit<AppNotification, 'id' | 'createdAt' | 'unread' | 'delivery'> & {
  createdAt?: string;
  unread?: boolean;
  delivery?: Partial<NotificationDelivery>;
};

export interface DownloadTask {
  assetId: string;
  progress: number; // 0-100
  status: 'pending' | 'downloading' | 'completed' | 'failed';
}

export interface SystemCache {
  appsGB: number;
  extensionsGB: number;
  assetsGB: number;
  tempGB: number;
}

// 项目组权限管理：角色 + 平台用户池 + 项目成员
export type ProjectRole = 'admin' | 'member'; // 管理员 / 项目成员

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  isFormer?: boolean; // 已离职人员标记
  department?: string; // 所属部门，登录后左下角展示
}

// 登录会话：钉钉扫码登录后生成，持久化到 localStorage。
export interface AuthSession {
  token: string;
  userId: string;
  name: string;
  email: string;
  department: string;
  issuedAt: number; // 签发时间戳 (ms)
  expiresAt: number; // 过期时间戳 (ms)，签发 + 7 天
}

export interface ProjectMember {
  id: string;
  name: string;
  email: string;
  role: ProjectRole;
  joinedAt: string; // ISO timestamp
}

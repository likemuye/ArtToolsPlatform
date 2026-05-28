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
  ComfyUI = 'comfyui',
  Blender = 'blender',
  Photoshop = 'photoshop',
  Maya = 'maya',
  Max3ds = 'max3ds'
}

export enum AppStatus {
  NotReady = 'NOT_READY', // 未就绪
  InstalledOffline = 'INSTALLED_OFFLINE', // 已安装·离线
  Connecting = 'CONNECTING', // 连接中
  Connected = 'CONNECTED' // 已连接
}

export interface AppConfig {
  id: AppId;
  name: string;
  isPlatformHosted: boolean; // true = comfyui/blender, false = ps/maya/3dsmax
  status: AppStatus;
  version: string;
  newVersion?: string; // If 'newVersion' exists, update badge is active
  isOld?: boolean; // For business software, indicates orange "version out of date" badge
  installPath?: string;
  diskRequiredGB: number;
  downloadProgress?: number; // 0-100
  sizeGB: number;
}

export interface DccExtension {
  id: string;
  name: string;
  dccId: AppId;
  version: string;
  desc: string;
  author: string;
  installed: boolean;
  needsRestart: boolean; // True to require restarted DCC to apply
  isActivated: boolean; // True if active
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
  platform: string; // 来源平台 (e.g., IT Asset System, ComfyUI Export, CG Share)
  desc: string;
  tags: string[];
}

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

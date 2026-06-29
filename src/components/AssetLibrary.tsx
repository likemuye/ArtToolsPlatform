import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Archive,
  Check,
  Upload,
  Sparkles,
  Tag,
  Loader2,
  FolderOpen, 
  Folder,
  FolderPlus,
  Search, 
  Download, 
  CornerDownRight, 
  CheckCircle, 
  Clock,
  Shuffle,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Pencil,
  Trash2,
  Plus,
  Files,
  Send,
  Link2,
  MoreHorizontal,
  FolderInput,
  User,
  Users,
  Boxes,
  Globe,
  ScanSearch,
  Camera,
  Eye,
  Package
} from 'lucide-react';
import { AppId, AppStatus, AppConfig, ArtAsset, AssetCategory, SpaceId, ProjectSpace, AssetFolder, PersonalUploadedAsset, PersonalUploadType, AssetTaskStatus, PlatformUser, ProjectMember } from '../types';
import { INITIAL_ASSET_FOLDERS_PROJECT_A, INITIAL_ASSET_FOLDER_ASSIGNMENTS_PROJECT_A, PROJECT_SPACES, ASSET_ORG_OPTIONS, ASSET_TASK_STATUS_LABELS, PLATFORM_USERS, INITIAL_PROJECT_MEMBERS, CURRENT_USER_EMAIL } from '../data';

interface AssetLibraryProps {
  currentSpace: ProjectSpace;
  setCurrentSpace: (space: ProjectSpace) => void;
  apps: AppConfig[];
  assets: ArtAsset[];
  personalAssets: PersonalUploadedAsset[];
  setPersonalAssets: React.Dispatch<React.SetStateAction<PersonalUploadedAsset[]>>;
  downloadedAssetIds: Set<string>;
  setDownloadedAssetIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  simulatedDiskGB: number;
  setSimulatedDiskGB: React.Dispatch<React.SetStateAction<number>>;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error', options?: { toast?: boolean }) => void;
}

interface PendingPersonalUploadItem {
  id: string;
  fileName: string;
  sourceFileName: string;
  sizeBytes: number;
  format: string;
  uploadType: PersonalUploadType;
  category: AssetCategory;
  previewUrl: string;
  tags: string[];
  status: 'tagging' | 'ready';
}

interface PersonalUploadDraft {
  items: PendingPersonalUploadItem[];
  totalBytes: number;
  isTagging: boolean;
}

type ExternalAssetType = 'model_anim' | 'image_texture' | 'video' | 'audio' | 'project';
type ExternalAssetSource = 'artstation' | 'pinterest' | 'huaban';

interface ExternalAsset extends ArtAsset {
  externalType: ExternalAssetType;
  source: ExternalAssetSource;
  sourceUrl: string;
  createdAt: string;
  width: number;
  height: number;
  nonCommercialNotice: string;
}

// Simulated active download task structure for queue management
interface ActiveDownload {
  assetId: string;
  progress: number;
  status: 'downloading' | 'queued';
  targetDccImportAfterDownload?: AppId; // If triggered by import click, remembers DCC target
}

const LEGACY_ASSET_FOLDER_STORAGE_KEY = 'art-launcher-asset-folders-v1';
const LEGACY_ASSET_FOLDER_ASSIGNMENT_STORAGE_KEY = 'art-launcher-asset-folder-assignments-v1';
const ASSET_FOLDER_STORAGE_KEY = 'art-launcher-asset-folders-v2';
const ASSET_FOLDER_ASSIGNMENT_STORAGE_KEY = 'art-launcher-asset-folder-assignments-v2';
const ASSET_FOLDER_PANE_WIDTH_STORAGE_KEY = 'art-launcher-folder-pane-width-v1';
const ASSET_ITEMS_PER_PAGE_STORAGE_KEY = 'art-launcher-items-per-page-v1';
const ASSET_SHARES_STORAGE_KEY = 'art-launcher-asset-shares-v1';
const PROJECT_MEMBERS_STORAGE_KEY = 'art-launcher-project-members-v1';
const REMOVED_DEFAULT_FOLDER_IDS = new Set(['folder-browser', 'folder-cloud-local']);
const REMOVED_SYSTEM_FOLDER_IDS = new Set(['space-root-project-group']);
const FOLDER_SCOPE_SEPARATOR = '::';
const DEFAULT_ASSET_FOLDER_BASE_ID = 'folder-primary';
const PERSONAL_SPACE_FOLDER_ID = 'space-root-personal';
const SHARED_SPACE_FOLDER_ID = 'space-root-shared';
const EXTERNAL_ASSET_FOLDER_ID = 'space-root-external';
const TUYOO_COMMON_FOLDER_ID = 'space-root-tuyoo-common';
const PROJECT_A_SPACE_FOLDER_ID = 'space-node-projectA';
const PROJECT_B_SPACE_FOLDER_ID = 'space-node-projectB';
const SPACE_PRIMARY_FOLDER_LABELS: Record<SpaceId, string> = {
  [SpaceId.ProjectA]: '三国：冰河时代',
  [SpaceId.ProjectB]: '项目空间B',
  [SpaceId.Personal]: '个人空间',
  [SpaceId.Shared]: '与我共享'
};
const SPACE_ANCHOR_FOLDER_IDS: Record<SpaceId, string> = {
  [SpaceId.ProjectA]: PROJECT_A_SPACE_FOLDER_ID,
  [SpaceId.ProjectB]: PROJECT_B_SPACE_FOLDER_ID,
  [SpaceId.Personal]: PERSONAL_SPACE_FOLDER_ID,
  [SpaceId.Shared]: SHARED_SPACE_FOLDER_ID
};
const SYSTEM_FOLDER_ORDER: Record<string, number> = {
  [PERSONAL_SPACE_FOLDER_ID]: 0,
  [TUYOO_COMMON_FOLDER_ID]: 1,
  [SHARED_SPACE_FOLDER_ID]: 2,
  [PROJECT_A_SPACE_FOLDER_ID]: 3,
  [PROJECT_B_SPACE_FOLDER_ID]: 4,
  [EXTERNAL_ASSET_FOLDER_ID]: 5
};
const SYSTEM_FOLDERS: AssetFolder[] = [
  { id: PERSONAL_SPACE_FOLDER_ID, name: '个人空间', parentId: null },
  { id: TUYOO_COMMON_FOLDER_ID, name: '途游通用', parentId: null },
  { id: SHARED_SPACE_FOLDER_ID, name: '与我共享', parentId: null },
  { id: EXTERNAL_ASSET_FOLDER_ID, name: '外部素材', parentId: null },
  { id: PROJECT_A_SPACE_FOLDER_ID, name: SPACE_PRIMARY_FOLDER_LABELS[SpaceId.ProjectA], parentId: null },
  { id: PROJECT_B_SPACE_FOLDER_ID, name: SPACE_PRIMARY_FOLDER_LABELS[SpaceId.ProjectB], parentId: null }
];
const SYSTEM_FOLDER_IDS = new Set(SYSTEM_FOLDERS.map(folder => folder.id));

// Per-space visual identity for the four top-level folders.
// `icon` distinguishes the space at a glance; `accent` is the icon/active color.
const ROOT_FOLDER_VISUALS: Record<string, { icon: typeof User; accent: string }> = {
  [PERSONAL_SPACE_FOLDER_ID]: { icon: User, accent: '#38bdf8' }, // 个人空间 - sky
  [SHARED_SPACE_FOLDER_ID]: { icon: Users, accent: '#a78bfa' }, // 与我共享 - violet
  [TUYOO_COMMON_FOLDER_ID]: { icon: Package, accent: '#facc15' }, // 途游通用 - amber
  [PROJECT_A_SPACE_FOLDER_ID]: { icon: Boxes, accent: '#00ff00' }, // 项目空间 - green
  [PROJECT_B_SPACE_FOLDER_ID]: { icon: Boxes, accent: '#00ff00' }, // 项目空间 - green
  [EXTERNAL_ASSET_FOLDER_ID]: { icon: Globe, accent: '#fb923c' } // 外部素材 - orange
};
const DEFAULT_ASSET_FOLDER_ID = `${SpaceId.ProjectA}${FOLDER_SCOPE_SEPARATOR}${DEFAULT_ASSET_FOLDER_BASE_ID}`;
const CREATED_FOLDER_ID_PATTERN = /^folder-(\d{10,})$/;
const PERSONAL_UPLOAD_MAX_COUNT = 500;
const PERSONAL_UPLOAD_MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;
const BYTES_IN_MB = 1024 * 1024;
const DEFAULT_FOLDER_PANE_WIDTH = 304;
const MIN_FOLDER_PANE_WIDTH = 240;
const MAX_FOLDER_PANE_WIDTH = 520;
const DEFAULT_ITEMS_PER_PAGE = 50;
const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100];
const PREVIEW_ZOOM_STEP = 1.2;
// 素材卡片宽度调节：滑动条区间 140~1200px，默认 240px。
const CARD_WIDTH_STORAGE_KEY = 'art-launcher-card-width-v1';
const CARD_WIDTH_MIN = 140;
const CARD_WIDTH_MAX = 1200;
const DEFAULT_CARD_WIDTH = 240;

// Folder name validation rules: length cap, illegal chars, reserved names, sibling uniqueness
const FOLDER_NAME_MAX_LENGTH = 32;
const PERSONAL_ASSET_NAME_MAX_LENGTH = 64;
const ILLEGAL_FOLDER_NAME_CHARS_REGEX = /[\\/:*?"<>|]/;
const RESERVED_FOLDER_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

const personalTypeLabel: Record<PersonalUploadType, string> = {
  image: '图片',
  gif: '动图',
  video: '视频'
};

const ASSET_CATEGORY_TABS: Array<{ id: AssetCategory; name: string }> = [
  { id: AssetCategory.All, name: '全部' },
  { id: AssetCategory.CharConcept, name: '角色原画' },
  { id: AssetCategory.SceneConcept, name: '场景原画' },
  { id: AssetCategory.CharModel, name: '角色模型' },
  { id: AssetCategory.SceneModel, name: '场景模型' },
  { id: AssetCategory.Animation, name: '动画序列' },
  { id: AssetCategory.Video, name: '粒子视频' },
  { id: AssetCategory.GUI, name: 'GUI 切图' }
];

const inferCategoryForUpload = (
  fileName: string,
  uploadType: PersonalUploadType,
  aiTags: string[] = []
): AssetCategory => {
  const corpus = `${fileName} ${aiTags.join(' ')}`.toLowerCase();
  const hasAny = (keywords: string[]) => keywords.some(keyword => corpus.includes(keyword));

  const uiKeywords = ['ui', 'hud', 'icon', 'button', 'panel', 'atlas', 'sprite', 'gui', '界面', '图标', '按钮', '切图', '控件', '贴图'];
  const characterKeywords = ['char', 'character', 'hero', 'npc', 'role', '角色', '人物', '立绘', '皮肤', '头像'];
  const sceneKeywords = ['scene', 'env', 'environment', 'level', 'map', 'terrain', 'building', '场景', '环境', '地图', '地形', '建筑', '关卡'];
  const modelKeywords = ['model', 'mesh', 'topology', 'rig', 'fbx', 'obj', 'blend', '模型', '网格', '骨骼', '绑定'];
  const animationKeywords = ['anim', 'animation', 'motion', 'walk', 'run', 'idle', 'attack', 'loop', '动画', '动作', '序列', '帧', '动效'];

  if (uploadType === 'video') {
    if (hasAny(animationKeywords)) return AssetCategory.Animation;
    return AssetCategory.Video;
  }

  if (uploadType === 'gif') {
    if (hasAny(uiKeywords)) return AssetCategory.GUI;
    return AssetCategory.Animation;
  }

  if (hasAny(uiKeywords)) return AssetCategory.GUI;
  if (hasAny(animationKeywords)) return AssetCategory.Animation;

  const hasModel = hasAny(modelKeywords);
  if (hasModel && hasAny(characterKeywords)) return AssetCategory.CharModel;
  if (hasModel && hasAny(sceneKeywords)) return AssetCategory.SceneModel;
  if (hasAny(characterKeywords)) return AssetCategory.CharConcept;
  if (hasAny(sceneKeywords)) return AssetCategory.SceneConcept;

  return AssetCategory.GUI;
};

const normalizeTag = (tag: string) => tag.trim().replace(/^#+/, '');

const dedupeTags = (tags: string[]) => {
  const seen = new Set<string>();
  const next: string[] = [];

  tags.forEach((tag) => {
    const cleaned = normalizeTag(tag);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    next.push(cleaned);
  });

  return next;
};

const fuzzyTagMatch = (candidate: string, query: string) => {
  const source = candidate.toLowerCase();
  const target = query.toLowerCase();
  if (!target) return false;
  if (source.includes(target)) return true;

  let pointer = 0;
  for (const ch of source) {
    if (ch === target[pointer]) pointer += 1;
    if (pointer === target.length) return true;
  }
  return false;
};

const EXTERNAL_TYPE_OPTIONS: Array<{ id: ExternalAssetType; label: string }> = [
  { id: 'model_anim', label: '模型/动画' },
  { id: 'image_texture', label: '图像/贴图' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: 'project', label: '工程' }
];

const EXTERNAL_SOURCE_OPTIONS: Array<{ id: ExternalAssetSource; label: string }> = [
  { id: 'artstation', label: 'ArtStation' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'huaban', label: '花瓣' }
];

const EXTERNAL_TYPE_LABELS: Record<ExternalAssetType, string> = Object.fromEntries(
  EXTERNAL_TYPE_OPTIONS.map(option => [option.id, option.label])
) as Record<ExternalAssetType, string>;

const EXTERNAL_SOURCE_META: Record<ExternalAssetSource, { label: string; logo: string; badgeClassName: string; dotClassName: string }> = {
  artstation: {
    label: 'ArtStation',
    logo: 'AS',
    badgeClassName: 'border-sky-400/40 bg-sky-500/15 text-sky-100',
    dotClassName: 'bg-sky-300'
  },
  pinterest: {
    label: 'Pinterest',
    logo: 'P',
    badgeClassName: 'border-rose-400/40 bg-rose-500/15 text-rose-100',
    dotClassName: 'bg-rose-300'
  },
  huaban: {
    label: '花瓣',
    logo: '花',
    badgeClassName: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
    dotClassName: 'bg-emerald-300'
  }
};

const EXTERNAL_CATEGORY_BY_TYPE: Record<ExternalAssetType, AssetCategory> = {
  model_anim: AssetCategory.CharModel,
  image_texture: AssetCategory.SceneConcept,
  video: AssetCategory.Video,
  audio: AssetCategory.Video,
  project: AssetCategory.SceneModel
};

const EXTERNAL_NON_COMMERCIAL_NOTICE = '素材来源于外部采集平台，仅用于内部参考与创意评审，默认不可商用。';

// Combined-filter taxonomy for the internal spaces (个人/共享/项目).
// Each type owns a set of file formats; an asset's type is inferred from its format.
type InternalAssetType = 'model_anim' | 'image_texture' | 'video' | 'audio' | 'project';

const INTERNAL_TYPE_OPTIONS: Array<{ id: InternalAssetType; label: string; formats: string[] }> = [
  { id: 'model_anim', label: '模型/动画', formats: ['FBX', 'OBJ', 'ABC', 'USD', 'GLTF', 'GLB'] },
  { id: 'image_texture', label: '图像/贴图', formats: ['PNG', 'JPG', 'TGA', 'EXR', 'TIFF', 'PSD', 'DDS', 'HDR'] },
  { id: 'video', label: '视频', formats: ['MOV', 'MP4', 'AVI', 'MXF'] },
  { id: 'audio', label: '音频', formats: ['WAV', 'MP3', 'OGG', 'AAC'] },
  { id: 'project', label: '工程', formats: ['MA', 'MB', 'BLEND', 'MAX', 'HIP', 'SPP', 'NK', 'AEP', 'ZTL', 'ZPR', 'C4D'] }
];

const INTERNAL_TYPE_LABELS: Record<InternalAssetType, string> = Object.fromEntries(
  INTERNAL_TYPE_OPTIONS.map(option => [option.id, option.label])
) as Record<InternalAssetType, string>;

const INTERNAL_FORMAT_TO_TYPE: Record<string, InternalAssetType> = INTERNAL_TYPE_OPTIONS.reduce(
  (acc, option) => {
    option.formats.forEach(format => { acc[format] = option.id; });
    return acc;
  },
  {} as Record<string, InternalAssetType>
);

// --- 内容类型 tab（全部/图片/视频/3D/工业/文档/音频）-------------------------
// Top-level content-type tabs (mutually exclusive). An asset's tab is inferred from its
// file extension. Shared by internal spaces and external assets.
type AssetTypeTab = 'all' | 'image' | 'video' | 'model' | 'project' | 'doc' | 'audio';

const ASSET_TYPE_TABS: Array<{ id: AssetTypeTab; label: string; formats: string[] }> = [
  { id: 'all', label: '全部', formats: [] },
  { id: 'image', label: '图片', formats: ['PNG', 'JPG', 'JPEG', 'TGA', 'EXR', 'TIFF', 'TIF', 'PSD', 'DDS', 'HDR', 'GIF', 'BMP', 'WEBP'] },
  { id: 'video', label: '视频', formats: ['MOV', 'MP4', 'AVI', 'MXF', 'MKV', 'WEBM'] },
  { id: 'model', label: '3D', formats: ['FBX', 'OBJ', 'ABC', 'USD', 'GLTF', 'GLB'] },
  { id: 'project', label: '工业', formats: ['MA', 'MB', 'BLEND', 'MAX', 'HIP', 'SPP', 'NK', 'AEP', 'ZTL', 'ZPR', 'C4D', 'PRPROJ', 'FIG'] },
  { id: 'doc', label: '文档', formats: ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX', 'TXT', 'MD'] },
  { id: 'audio', label: '音频', formats: ['WAV', 'MP3', 'OGG', 'AAC', 'FLAC'] }
];

const ASSET_FORMAT_TO_TAB: Record<string, AssetTypeTab> = ASSET_TYPE_TABS.reduce(
  (acc, tab) => {
    tab.formats.forEach(format => { acc[format] = tab.id; });
    return acc;
  },
  {} as Record<string, AssetTypeTab>
);

const getAssetTypeTab = (format: string): AssetTypeTab | null => (
  ASSET_FORMAT_TO_TAB[format.trim().toUpperCase()] ?? null
);

// All general-filter dropdown keys (shared union for internal & external open-filter state).
type FilterKey = 'author' | 'format' | 'tag' | 'org' | 'created' | 'fileSize' | 'status' | 'size' | 'shape' | 'duration' | 'color' | 'source' | 'sort';

// 形状：横图/竖图/方图/水平全景/垂直全景，by width/height ratio
type AssetShape = 'landscape' | 'portrait' | 'square' | 'pano-h' | 'pano-v';
const ASSET_SHAPE_OPTIONS: Array<{ id: AssetShape; label: string }> = [
  { id: 'landscape', label: '横图' },
  { id: 'portrait', label: '竖图' },
  { id: 'square', label: '方图' },
  { id: 'pano-h', label: '水平全景' },
  { id: 'pano-v', label: '垂直全景' }
];
const getAssetShape = (asset: ArtAsset): AssetShape | null => {
  if (!asset.width || !asset.height) return null;
  const ratio = asset.width / asset.height;
  if (ratio >= 2) return 'pano-h';
  if (ratio <= 0.5) return 'pano-v';
  if (ratio > 1) return 'landscape';
  if (ratio < 1) return 'portrait';
  return 'square';
};

// AI 标签判定：个人上传打标用 'AI自动打标'，或以 AI 前缀的标签视为 AI 标签。
const isAiTag = (tag: string): boolean => {
  const t = tag.trim();
  return t === 'AI自动打标' || /^ai/i.test(t);
};

// 文件大小预设桶（MB）
const FILE_SIZE_BUCKETS: Array<{ id: string; label: string; test: (mb: number) => boolean }> = [
  { id: 'lt1', label: '< 1MB', test: mb => mb < 1 },
  { id: '1to10', label: '1MB - 10MB', test: mb => mb >= 1 && mb < 10 },
  { id: '10to100', label: '10MB - 100MB', test: mb => mb >= 10 && mb < 100 },
  { id: '100to1024', label: '100MB - 1GB', test: mb => mb >= 100 && mb < 1024 },
  { id: 'gt1024', label: '> 1GB', test: mb => mb >= 1024 }
];

// 尺寸预设桶（按长边 px）
const DIMENSION_BUCKETS: Array<{ id: string; label: string; test: (edge: number) => boolean }> = [
  { id: 'sm', label: '小 (长边 < 640)', test: e => e < 640 },
  { id: 'md', label: '中 (640 - 1920)', test: e => e >= 640 && e < 1920 },
  { id: 'lg', label: '大 (1920 - 4096)', test: e => e >= 1920 && e < 4096 },
  { id: 'xl', label: '超大 (> 4096)', test: e => e >= 4096 }
];

// 时长预设桶（秒）
const DURATION_BUCKETS: Array<{ id: string; label: string; test: (s: number) => boolean }> = [
  { id: 'lt30', label: '< 30s', test: s => s < 30 },
  { id: '30to60', label: '30s - 1min', test: s => s >= 30 && s < 60 },
  { id: '60to180', label: '1min - 3min', test: s => s >= 60 && s < 180 },
  { id: '180to1800', label: '3min - 30min', test: s => s >= 180 && s < 1800 },
  { id: 'gt1800', label: '> 30min', test: s => s >= 1800 }
];

// 日期预设（id → 相对今天的天数区间；'custom' 用自定义区间）
const DATE_PRESETS: Array<{ id: string; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'today', label: '今天' },
  { id: 'yesterday', label: '昨天' },
  { id: '7d', label: '最近 7 天' },
  { id: '30d', label: '最近 30 天' },
  { id: '90d', label: '最近 90 天' },
  { id: '1y', label: '最近一年' },
  { id: 'custom', label: '自定义范围' }
];

// Shared bucket/size/shape predicate set for an asset against the active filter facets.
interface FacetFilters {
  fileSizeBuckets: Set<string>;
  sizeBuckets: Set<string>;
  sizeWMin: string; sizeWMax: string; sizeHMin: string; sizeHMax: string;
  durationBuckets: Set<string>;
  shapeFilters: Set<string>;
}
const passesFacetFilters = (asset: ArtAsset, f: FacetFilters): boolean => {
  // 文件大小桶（任一命中）
  if (f.fileSizeBuckets.size > 0) {
    const ok = FILE_SIZE_BUCKETS.some(b => f.fileSizeBuckets.has(b.id) && b.test(asset.sizeMB));
    if (!ok) return false;
  }
  // 尺寸预设桶（按长边）+ 宽高自定义区间（AND）
  if (f.sizeBuckets.size > 0) {
    const edge = getAssetLongestEdge(asset);
    if (edge === null) return false;
    const ok = DIMENSION_BUCKETS.some(b => f.sizeBuckets.has(b.id) && b.test(edge));
    if (!ok) return false;
  }
  const wMin = f.sizeWMin.trim() === '' ? null : Number(f.sizeWMin);
  const wMax = f.sizeWMax.trim() === '' ? null : Number(f.sizeWMax);
  const hMin = f.sizeHMin.trim() === '' ? null : Number(f.sizeHMin);
  const hMax = f.sizeHMax.trim() === '' ? null : Number(f.sizeHMax);
  if (wMin !== null || wMax !== null || hMin !== null || hMax !== null) {
    if (!asset.width || !asset.height) return false;
    if (wMin !== null && Number.isFinite(wMin) && asset.width < wMin) return false;
    if (wMax !== null && Number.isFinite(wMax) && asset.width > wMax) return false;
    if (hMin !== null && Number.isFinite(hMin) && asset.height < hMin) return false;
    if (hMax !== null && Number.isFinite(hMax) && asset.height > hMax) return false;
  }
  // 时长桶
  if (f.durationBuckets.size > 0) {
    if (asset.durationSec === undefined) return false;
    const ok = DURATION_BUCKETS.some(b => f.durationBuckets.has(b.id) && b.test(asset.durationSec as number));
    if (!ok) return false;
  }
  // 形状
  if (f.shapeFilters.size > 0) {
    const shape = getAssetShape(asset);
    if (!shape || !f.shapeFilters.has(shape)) return false;
  }
  return true;
};

// 颜色色板：固定色相，资产主色按 RGB 距离归入最近色板。
const COLOR_SWATCHES: Array<{ id: string; label: string; rgb: { r: number; g: number; b: number } }> = [
  { id: 'red', label: '红', rgb: { r: 220, g: 38, b: 38 } },
  { id: 'orange', label: '橙', rgb: { r: 234, g: 88, b: 12 } },
  { id: 'yellow', label: '黄', rgb: { r: 234, g: 179, b: 8 } },
  { id: 'green', label: '绿', rgb: { r: 22, g: 163, b: 74 } },
  { id: 'cyan', label: '青', rgb: { r: 8, g: 145, b: 178 } },
  { id: 'blue', label: '蓝', rgb: { r: 37, g: 99, b: 235 } },
  { id: 'purple', label: '紫', rgb: { r: 124, g: 58, b: 237 } },
  { id: 'pink', label: '粉', rgb: { r: 219, g: 39, b: 119 } },
  { id: 'white', label: '白', rgb: { r: 240, g: 240, b: 240 } },
  { id: 'black', label: '黑', rgb: { r: 24, g: 24, b: 27 } },
  { id: 'gray', label: '灰', rgb: { r: 128, g: 128, b: 128 } }
];
const COLOR_SWATCH_HEX: Record<string, string> = {
  red: '#dc2626', orange: '#ea580c', yellow: '#eab308', green: '#16a34a',
  cyan: '#0891b2', blue: '#2563eb', purple: '#7c3aed', pink: '#db2777',
  white: '#f0f0f0', black: '#18181b', gray: '#808080'
};
const nearestColorSwatchId = (rgb: { r: number; g: number; b: number }): string => {
  let best = COLOR_SWATCHES[0];
  let bestDist = Infinity;
  COLOR_SWATCHES.forEach((swatch) => {
    const d = (rgb.r - swatch.rgb.r) ** 2 + (rgb.g - swatch.rgb.g) ** 2 + (rgb.b - swatch.rgb.b) ** 2;
    if (d < bestDist) { bestDist = d; best = swatch; }
  });
  return best.id;
};


const getInternalAssetType = (format: string): InternalAssetType | null => (
  INTERNAL_FORMAT_TO_TYPE[format.trim().toUpperCase()] ?? null
);

// Longest pixel edge used by the 尺寸 filter. Prefers explicit width/height, then a
// "1920x1080"-style resolution tag (personal uploads tag this during AI labeling).
const getAssetLongestEdge = (asset: ArtAsset): number | null => {
  if (asset.width && asset.height) return Math.max(asset.width, asset.height);
  const resolutionTag = asset.tags.find(tag => /^\d{2,5}[xX]\d{2,5}$/.test(tag));
  if (resolutionTag) {
    const [w, h] = resolutionTag.toLowerCase().split('x').map(Number);
    if (Number.isFinite(w) && Number.isFinite(h)) return Math.max(w, h);
  }
  return null;
};

// --- 图片搜索（以图搜图）: feature extraction + similarity scoring -----------
type RGB = { r: number; g: number; b: number };

interface ImageSearchQuery {
  previewUrl: string;
  color: RGB;
  width: number;
  height: number;
  category: AssetCategory;
  tags: string[];
  fileName: string;
}

const hexToRgb = (hex: string): RGB | null => {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 6) return null;
  const num = Number.parseInt(cleaned, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

// Deterministic fallback color derived from an asset id, so scoring stays stable
// when a thumbnail can't be sampled (network/CORS failure).
const hashColorFallback = (seed: string): RGB => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return { r: hash & 255, g: (hash >> 8) & 255, b: (hash >> 16) & 255 };
};

// Average pixel color from a downscaled canvas sample. Returns null on CORS/load failure.
const sampleImageDominantColor = (src: string, allowCrossOrigin: boolean): Promise<RGB | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    if (allowCrossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 16) continue; // skip transparent
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1;
        }
        if (count === 0) { resolve(null); return; }
        resolve({ r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) });
      } catch {
        resolve(null); // tainted canvas
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
};

// Dominant color of a local File (upload query) — same averaging via object URL.
const getImageDominantColor = (file: File): Promise<RGB | null> => {
  const objectUrl = URL.createObjectURL(file);
  return sampleImageDominantColor(objectUrl, false).then((color) => {
    URL.revokeObjectURL(objectUrl);
    return color;
  });
};

const colorScore = (a: RGB, b: RGB): number => {
  const dist = Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  return Math.max(0, 1 - dist / 441.6729559300637); // sqrt(255^2*3)
};

const aspectScore = (qw: number, qh: number, aw?: number, ah?: number): number => {
  if (!qw || !qh || !aw || !ah) return 0;
  const arQuery = qw / qh;
  const arAsset = aw / ah;
  return Math.max(0, 1 - Math.min(1, Math.abs(arQuery - arAsset) / arQuery));
};

const tagOverlapScore = (queryTags: string[], assetTags: string[]): number => {
  if (queryTags.length === 0 || assetTags.length === 0) return 0;
  const q = new Set(queryTags.map(t => t.toLowerCase()));
  const a = new Set(assetTags.map(t => t.toLowerCase()));
  let intersection = 0;
  q.forEach(tag => { if (a.has(tag)) intersection += 1; });
  const union = new Set([...q, ...a]).size;
  return union === 0 ? 0 : intersection / union;
};

// Weighted 0~100 similarity: color 40 + aspect 20 + category 20 + tags 20.
const computeImageSimilarity = (query: ImageSearchQuery, asset: ArtAsset, assetColor: RGB): number => {
  const score =
    colorScore(query.color, assetColor) * 40 +
    aspectScore(query.width, query.height, asset.width, asset.height) * 20 +
    (asset.category === query.category ? 1 : 0) * 20 +
    tagOverlapScore(query.tags, asset.tags) * 20;
  return Math.round(score);
};

interface ExternalAssetSeed {
  id: string;
  name: string;
  format: string;
  type: ExternalAssetType;
  source: ExternalAssetSource;
  sourceUrl: string;
  tags: string[];
  createdAt: string;
  width: number;
  height: number;
  sizeMB: number;
  accentFrom: string;
  accentTo: string;
}

const buildExternalThumbnail = (name: string, format: string, colorFrom: string, colorTo: string) => {
  const shortName = name.length > 30 ? `${name.slice(0, 30)}...` : name;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${colorFrom}" />
      <stop offset="100%" stop-color="${colorTo}" />
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)" />
  <rect x="18" y="18" width="604" height="324" rx="18" fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.24)" />
  <text x="40" y="178" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">${shortName}</text>
  <text x="40" y="214" fill="rgba(255,255,255,0.86)" font-family="Arial, Helvetica, sans-serif" font-size="16">${format.toUpperCase()}</text>
</svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const EXTERNAL_ASSET_SEEDS: ExternalAssetSeed[] = [
  {
    id: 'dragon-hero-rig',
    name: 'Dragon Hero Rig',
    format: 'fbx',
    type: 'model_anim',
    source: 'artstation',
    sourceUrl: 'https://www.artstation.com/',
    tags: ['dragon', 'hero', 'rig', 'fantasy'],
    createdAt: '2026-05-22T10:20:00.000Z',
    width: 2048,
    height: 2048,
    sizeMB: 186.4,
    accentFrom: '#1f3a8a',
    accentTo: '#4338ca'
  },
  {
    id: 'mecha-walk-cycle',
    name: 'Mecha Walk Cycle',
    format: 'glb',
    type: 'model_anim',
    source: 'artstation',
    sourceUrl: 'https://www.artstation.com/',
    tags: ['mecha', 'walk', 'animation', 'robot'],
    createdAt: '2026-05-18T03:40:00.000Z',
    width: 1920,
    height: 1080,
    sizeMB: 132.9,
    accentFrom: '#0f766e',
    accentTo: '#0891b2'
  },
  {
    id: 'ink-cloud-brush-atlas',
    name: 'Ink Cloud Brush Atlas',
    format: 'png',
    type: 'image_texture',
    source: 'huaban',
    sourceUrl: 'https://huaban.com/',
    tags: ['ink', 'brush', 'atlas', 'cloud'],
    createdAt: '2026-06-09T08:12:00.000Z',
    width: 4096,
    height: 4096,
    sizeMB: 48.2,
    accentFrom: '#1d4ed8',
    accentTo: '#2563eb'
  },
  {
    id: 'bronze-pattern-tile',
    name: 'Bronze Pattern Tile',
    format: 'tiff',
    type: 'image_texture',
    source: 'huaban',
    sourceUrl: 'https://huaban.com/',
    tags: ['bronze', 'tile', 'pattern', 'pbr'],
    createdAt: '2026-05-29T14:05:00.000Z',
    width: 8192,
    height: 8192,
    sizeMB: 274.5,
    accentFrom: '#92400e',
    accentTo: '#b45309'
  },
  {
    id: 'palace-night-cinematic',
    name: 'Palace Night Cinematic',
    format: 'mp4',
    type: 'video',
    source: 'pinterest',
    sourceUrl: 'https://www.pinterest.com/',
    tags: ['palace', 'night', 'cinematic', 'shot'],
    createdAt: '2026-06-12T06:36:00.000Z',
    width: 3840,
    height: 2160,
    sizeMB: 325.1,
    accentFrom: '#111827',
    accentTo: '#1f2937'
  },
  {
    id: 'fire-spell-loop',
    name: 'Fire Spell Loop',
    format: 'mov',
    type: 'video',
    source: 'artstation',
    sourceUrl: 'https://www.artstation.com/',
    tags: ['fire', 'spell', 'fx', 'loop'],
    createdAt: '2026-06-04T02:18:00.000Z',
    width: 1920,
    height: 1080,
    sizeMB: 144.7,
    accentFrom: '#b91c1c',
    accentTo: '#ef4444'
  },
  {
    id: 'guzheng-ambient-loop',
    name: 'Guzheng Ambient Loop',
    format: 'wav',
    type: 'audio',
    source: 'pinterest',
    sourceUrl: 'https://www.pinterest.com/',
    tags: ['guzheng', 'ambient', 'loop', 'music'],
    createdAt: '2026-05-31T11:30:00.000Z',
    width: 1600,
    height: 900,
    sizeMB: 82.4,
    accentFrom: '#3730a3',
    accentTo: '#4f46e5'
  },
  {
    id: 'battle-ui-click-sfx',
    name: 'Battle UI Click SFX',
    format: 'mp3',
    type: 'audio',
    source: 'huaban',
    sourceUrl: 'https://huaban.com/',
    tags: ['ui', 'click', 'sfx', 'battle'],
    createdAt: '2026-06-01T09:48:00.000Z',
    width: 1200,
    height: 675,
    sizeMB: 6.7,
    accentFrom: '#0f766e',
    accentTo: '#10b981'
  },
  {
    id: 'temple-environment-pack',
    name: 'Temple Environment Pack',
    format: 'blend',
    type: 'project',
    source: 'artstation',
    sourceUrl: 'https://www.artstation.com/',
    tags: ['temple', 'environment', 'blend', 'scene'],
    createdAt: '2026-05-14T13:16:00.000Z',
    width: 2560,
    height: 1440,
    sizeMB: 512.6,
    accentFrom: '#111827',
    accentTo: '#334155'
  },
  {
    id: 'dynasty-city-layout',
    name: 'Dynasty City Layout',
    format: 'max',
    type: 'project',
    source: 'pinterest',
    sourceUrl: 'https://www.pinterest.com/',
    tags: ['city', 'layout', 'max', 'urban'],
    createdAt: '2026-04-30T17:40:00.000Z',
    width: 2400,
    height: 1350,
    sizeMB: 421.8,
    accentFrom: '#6b21a8',
    accentTo: '#7e22ce'
  },
  {
    id: 'horse-armor-set',
    name: 'Horse Armor Set',
    format: 'obj',
    type: 'model_anim',
    source: 'artstation',
    sourceUrl: 'https://www.artstation.com/',
    tags: ['horse', 'armor', 'obj', 'mount'],
    createdAt: '2026-05-20T07:02:00.000Z',
    width: 2048,
    height: 1536,
    sizeMB: 97.8,
    accentFrom: '#1f2937',
    accentTo: '#475569'
  },
  {
    id: 'phoenix-idle-anim',
    name: 'Phoenix Idle Anim',
    format: 'fbx',
    type: 'model_anim',
    source: 'pinterest',
    sourceUrl: 'https://www.pinterest.com/',
    tags: ['phoenix', 'idle', 'animation', 'myth'],
    createdAt: '2026-06-11T12:20:00.000Z',
    width: 1920,
    height: 1080,
    sizeMB: 114.2,
    accentFrom: '#be123c',
    accentTo: '#e11d48'
  },
  {
    id: 'silk-pattern-kit',
    name: 'Silk Pattern Kit',
    format: 'psd',
    type: 'image_texture',
    source: 'huaban',
    sourceUrl: 'https://huaban.com/',
    tags: ['silk', 'pattern', 'fabric', 'ornament'],
    createdAt: '2026-06-08T05:14:00.000Z',
    width: 6000,
    height: 4000,
    sizeMB: 201.3,
    accentFrom: '#9f1239',
    accentTo: '#be185d'
  },
  {
    id: 'fog-volume-sequence',
    name: 'Fog Volume Sequence',
    format: 'exr',
    type: 'image_texture',
    source: 'artstation',
    sourceUrl: 'https://www.artstation.com/',
    tags: ['fog', 'volume', 'sequence', 'render'],
    createdAt: '2026-05-25T15:44:00.000Z',
    width: 4096,
    height: 2160,
    sizeMB: 358.7,
    accentFrom: '#0f172a',
    accentTo: '#1e293b'
  },
  {
    id: 'river-shot-timelapse',
    name: 'River Shot Timelapse',
    format: 'mp4',
    type: 'video',
    source: 'huaban',
    sourceUrl: 'https://huaban.com/',
    tags: ['river', 'timelapse', 'nature', 'cinematic'],
    createdAt: '2026-06-10T16:26:00.000Z',
    width: 3840,
    height: 2160,
    sizeMB: 280.2,
    accentFrom: '#075985',
    accentTo: '#0284c7'
  },
  {
    id: 'thunder-drums-stem',
    name: 'Thunder Drums Stem',
    format: 'flac',
    type: 'audio',
    source: 'artstation',
    sourceUrl: 'https://www.artstation.com/',
    tags: ['drum', 'thunder', 'stem', 'combat'],
    createdAt: '2026-05-15T09:12:00.000Z',
    width: 1600,
    height: 900,
    sizeMB: 92.5,
    accentFrom: '#1e293b',
    accentTo: '#475569'
  },
  {
    id: 'battlepass-ui-kit',
    name: 'Battlepass UI Kit',
    format: 'fig',
    type: 'project',
    source: 'pinterest',
    sourceUrl: 'https://www.pinterest.com/',
    tags: ['battlepass', 'ui', 'kit', 'layout'],
    createdAt: '2026-06-02T11:42:00.000Z',
    width: 1920,
    height: 1080,
    sizeMB: 77.9,
    accentFrom: '#0f766e',
    accentTo: '#14b8a6'
  },
  {
    id: 'terrain-blockout-scene',
    name: 'Terrain Blockout Scene',
    format: 'ma',
    type: 'project',
    source: 'artstation',
    sourceUrl: 'https://www.artstation.com/',
    tags: ['terrain', 'blockout', 'maya', 'layout'],
    createdAt: '2026-05-06T04:36:00.000Z',
    width: 2560,
    height: 1440,
    sizeMB: 244.8,
    accentFrom: '#14532d',
    accentTo: '#15803d'
  },
  {
    id: 'cloth-sim-reference',
    name: 'Cloth Sim Reference',
    format: 'jpg',
    type: 'image_texture',
    source: 'pinterest',
    sourceUrl: 'https://www.pinterest.com/',
    tags: ['cloth', 'sim', 'reference', 'fold'],
    createdAt: '2026-06-07T19:08:00.000Z',
    width: 4096,
    height: 2731,
    sizeMB: 16.2,
    accentFrom: '#7c2d12',
    accentTo: '#ea580c'
  },
  {
    id: 'marketing-storyboard-proj',
    name: 'Marketing Storyboard',
    format: 'prproj',
    type: 'project',
    source: 'huaban',
    sourceUrl: 'https://huaban.com/',
    tags: ['storyboard', 'marketing', 'video', 'sequence'],
    createdAt: '2026-06-03T01:18:00.000Z',
    width: 1920,
    height: 1080,
    sizeMB: 268.4,
    accentFrom: '#4c1d95',
    accentTo: '#6d28d9'
  }
];

const EXTERNAL_TASK_STATUS_CYCLE: AssetTaskStatus[] = ['approved', 'reviewing', 'producing', 'pending', 'rejected'];
const EXTERNAL_TIME_BASED_FORMATS = new Set(['MOV', 'MP4', 'AVI', 'MXF', 'WAV', 'MP3', 'OGG', 'AAC', 'FLAC']);

const EXTERNAL_ASSETS: ExternalAsset[] = EXTERNAL_ASSET_SEEDS.map((seed, index) => {
  const sourceMeta = EXTERNAL_SOURCE_META[seed.source];
  const format = seed.format.toUpperCase();
  const thumbnail = buildExternalThumbnail(seed.name, format, seed.accentFrom, seed.accentTo);
  const isTimeBased = EXTERNAL_TIME_BASED_FORMATS.has(format);

  return {
    id: `external-${seed.id}`,
    name: seed.name,
    category: EXTERNAL_CATEGORY_BY_TYPE[seed.type],
    format,
    sizeMB: seed.sizeMB,
    thumbnail,
    previewUrl: thumbnail,
    author: sourceMeta.label,
    platform: sourceMeta.label,
    desc: `采集来源：${sourceMeta.label}，用于内部灵感参考。`,
    tags: dedupeTags([...seed.tags, EXTERNAL_TYPE_LABELS[seed.type], format]),
    externalType: seed.type,
    source: seed.source,
    sourceUrl: seed.sourceUrl,
    createdAt: seed.createdAt,
    width: seed.width,
    height: seed.height,
    org: ASSET_ORG_OPTIONS[index % ASSET_ORG_OPTIONS.length],
    taskStatus: EXTERNAL_TASK_STATUS_CYCLE[index % EXTERNAL_TASK_STATUS_CYCLE.length],
    durationSec: isTimeBased ? 8 + (index * 17) % 172 : undefined,
    nonCommercialNotice: EXTERNAL_NON_COMMERCIAL_NOTICE
  };
});

// Dominant-color lookup for external assets (from seed accent), used by 图片搜索 scoring
// without canvas sampling (external thumbnails are SVG data-URIs).
const EXTERNAL_ASSET_ACCENT: Record<string, string> = Object.fromEntries(
  EXTERNAL_ASSET_SEEDS.map(seed => [`external-${seed.id}`, seed.accentFrom])
);

const getFileExtension = (fileName: string) => {
  const ext = fileName.split('.').pop();
  return ext ? ext.toLowerCase() : '';
};

const getFileBaseName = (fileName: string) => {
  return fileName.replace(/\.[^/.]+$/, '');
};

const toDisplayMB = (bytes: number) => {
  return Math.max(0.1, Number((bytes / BYTES_IN_MB).toFixed(1)));
};

const formatUploadTotal = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDetailDateTime = (source?: string) => {
  if (!source) return '--';
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return '--';

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
};

const inferUploadType = (file: File): PersonalUploadType | null => {
  const ext = getFileExtension(file.name);

  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'image/gif' || ext === 'gif') return 'gif';
  if (file.type.startsWith('image/')) return 'image';

  return null;
};

const readImageDimensions = (file: File): Promise<{ width: number; height: number } | null> => {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
};

const readVideoMetadata = (file: File): Promise<{ width: number; height: number; duration: number } | null> => {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    video.src = objectUrl;
  });
};

const extractNameTags = (fileName: string) => {
  const baseName = getFileBaseName(fileName);
  const zhSegments = baseName.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  const enSegments = baseName
    .split(/[\s_\-.()[\]{}]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !/^\d+$/.test(token));

  return [...zhSegments, ...enSegments].slice(0, 4);
};

const getFolderBaseId = (folderId: string) => {
  const [head, tail] = folderId.split(FOLDER_SCOPE_SEPARATOR);
  if (!tail) return head;
  return tail;
};

const buildScopedFolderId = (spaceId: SpaceId, folderId: string) => `${spaceId}${FOLDER_SCOPE_SEPARATOR}${folderId}`;

const getDefaultFolderIdBySpace = (spaceId: SpaceId) => buildScopedFolderId(spaceId, DEFAULT_ASSET_FOLDER_BASE_ID);

const isPersonalAssetId = (assetId: string) => assetId.startsWith('personal-asset-');

const getDefaultFolderIdByAssetId = (assetId: string) => (
  isPersonalAssetId(assetId)
    ? getDefaultFolderIdBySpace(SpaceId.Personal)
    : getDefaultFolderIdBySpace(SpaceId.ProjectA)
);

const inferSpaceIdFromFolderId = (folderId: string): SpaceId | null => {
  if (folderId.startsWith(`${SpaceId.ProjectA}${FOLDER_SCOPE_SEPARATOR}`)) return SpaceId.ProjectA;
  if (folderId.startsWith(`${SpaceId.ProjectB}${FOLDER_SCOPE_SEPARATOR}`)) return SpaceId.ProjectB;
  if (folderId.startsWith(`${SpaceId.Personal}${FOLDER_SCOPE_SEPARATOR}`)) return SpaceId.Personal;
  if (folderId.startsWith(`${SpaceId.Shared}${FOLDER_SCOPE_SEPARATOR}`)) return SpaceId.Shared;
  return null;
};

const scopeFoldersForSpace = (sourceFolders: AssetFolder[], spaceId: SpaceId) => {
  const anchorFolderId = SPACE_ANCHOR_FOLDER_IDS[spaceId];
  return sourceFolders.map(folder => ({
    id: buildScopedFolderId(spaceId, folder.id),
    name: folder.name,
    parentId: folder.parentId ? buildScopedFolderId(spaceId, folder.parentId) : anchorFolderId
  }));
};

const normalizeFolders = (folders: AssetFolder[]) => {
  const merged = new Map<string, AssetFolder>();
  SYSTEM_FOLDERS.forEach(folder => merged.set(folder.id, folder));

  folders.forEach((folder) => {
    if (SYSTEM_FOLDER_IDS.has(folder.id)) return;
    if (REMOVED_SYSTEM_FOLDER_IDS.has(folder.id)) return;
    if (REMOVED_DEFAULT_FOLDER_IDS.has(getFolderBaseId(folder.id))) return;
    if (folder.parentId === null || REMOVED_SYSTEM_FOLDER_IDS.has(folder.parentId)) {
      const inferredSpaceId = inferSpaceIdFromFolderId(folder.id) ?? SpaceId.ProjectA;
      const fallbackRootParent = SPACE_ANCHOR_FOLDER_IDS[inferredSpaceId];
      merged.set(folder.id, { ...folder, parentId: fallbackRootParent });
      return;
    }
    merged.set(folder.id, folder);
  });

  const normalized = [...merged.values()];
  const folderIds = new Set(normalized.map(folder => folder.id));
  return normalized.filter(folder => folder.parentId === null || folderIds.has(folder.parentId));
};

const normalizeFolderAssignments = (assignments: Record<string, string>) => {
  return Object.fromEntries(
    Object.entries(assignments).map(([assetId, folderId]) => {
      if (typeof folderId !== 'string' || folderId.trim() === '') {
        return [assetId, getDefaultFolderIdByAssetId(assetId)];
      }

      if (SYSTEM_FOLDER_IDS.has(folderId)) {
        return [assetId, getDefaultFolderIdByAssetId(assetId)];
      }

      const baseFolderId = getFolderBaseId(folderId);
      if (REMOVED_DEFAULT_FOLDER_IDS.has(baseFolderId)) {
        return [assetId, getDefaultFolderIdByAssetId(assetId)];
      }

      if (folderId.includes(FOLDER_SCOPE_SEPARATOR)) {
        return [assetId, folderId];
      }

      return [assetId, buildScopedFolderId(SpaceId.ProjectA, baseFolderId)];
    })
  );
};

const getInitialScopedProjectAssignments = () => {
  return Object.fromEntries(
    Object.entries(INITIAL_ASSET_FOLDER_ASSIGNMENTS_PROJECT_A).map(([assetId, folderId]) => [
      assetId,
      buildScopedFolderId(SpaceId.ProjectA, folderId)
    ])
  );
};

const buildDefaultFolderTree = () => {
  const seedFolders = INITIAL_ASSET_FOLDERS_PROJECT_A.filter(
    folder => !REMOVED_DEFAULT_FOLDER_IDS.has(folder.id)
  );
  return normalizeFolders([
    ...SYSTEM_FOLDERS,
    ...scopeFoldersForSpace(seedFolders, SpaceId.ProjectA),
    ...scopeFoldersForSpace(seedFolders, SpaceId.ProjectB),
    ...scopeFoldersForSpace(seedFolders, SpaceId.Personal),
    ...scopeFoldersForSpace(seedFolders, SpaceId.Shared)
  ]);
};

const getInitialFolders = () => {
  const defaultFolders = buildDefaultFolderTree();

  try {
    const stored = localStorage.getItem(ASSET_FOLDER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as AssetFolder[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeFolders(parsed);
      }
    }

    const legacyStored = localStorage.getItem(LEGACY_ASSET_FOLDER_STORAGE_KEY);
    if (legacyStored) {
      const parsedLegacy = JSON.parse(legacyStored) as AssetFolder[];
      if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
        const legacyFolders = parsedLegacy.filter(folder => (
          !!folder &&
          typeof folder.id === 'string' &&
          typeof folder.name === 'string' &&
          (folder.parentId === null || typeof folder.parentId === 'string')
        ));
        return normalizeFolders([
          ...SYSTEM_FOLDERS,
          ...scopeFoldersForSpace(legacyFolders, SpaceId.ProjectA),
          ...scopeFoldersForSpace(legacyFolders, SpaceId.ProjectB),
          ...scopeFoldersForSpace(legacyFolders, SpaceId.Personal),
          ...scopeFoldersForSpace(legacyFolders, SpaceId.Shared)
        ]);
      }
    }

    return defaultFolders;
  } catch {
    return defaultFolders;
  }
};

const getInitialFolderAssignments = () => {
  const defaultAssignments = getInitialScopedProjectAssignments();

  try {
    const stored = localStorage.getItem(ASSET_FOLDER_ASSIGNMENT_STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_ASSET_FOLDER_ASSIGNMENT_STORAGE_KEY);
    if (!stored) return defaultAssignments;

    const parsed = JSON.parse(stored) as Record<string, string>;
    if (!parsed || typeof parsed !== 'object') return defaultAssignments;
    return normalizeFolderAssignments({ ...defaultAssignments, ...parsed });
  } catch {
    return defaultAssignments;
  }
};

const clampFolderPaneWidth = (width: number) => {
  return Math.max(MIN_FOLDER_PANE_WIDTH, Math.min(MAX_FOLDER_PANE_WIDTH, width));
};

const getInitialFolderPaneWidth = () => {
  try {
    const stored = localStorage.getItem(ASSET_FOLDER_PANE_WIDTH_STORAGE_KEY);
    if (!stored) return DEFAULT_FOLDER_PANE_WIDTH;

    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return DEFAULT_FOLDER_PANE_WIDTH;
    return clampFolderPaneWidth(parsed);
  } catch {
    return DEFAULT_FOLDER_PANE_WIDTH;
  }
};

type PaginationToken = number | 'ellipsis-left' | 'ellipsis-right';

// --- 创建时间筛选器 (date-range) helpers ---------------------------------
const toLocalDateInputValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Resolve a date preset id to an inclusive [fromTs, toTs] (ms) range, or null for 'all'.
// 'custom' uses the provided from/to date strings.
const resolveDatePresetRange = (
  preset: string,
  customFrom: string,
  customTo: string
): { fromTs: number | null; toTs: number | null } => {
  if (preset === 'all' || !preset) return { fromTs: null, toTs: null };
  if (preset === 'custom') {
    return {
      fromTs: customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null,
      toTs: customTo ? new Date(`${customTo}T23:59:59`).getTime() : null
    };
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
  const DAY = 24 * 60 * 60 * 1000;
  switch (preset) {
    case 'today': return { fromTs: startOfToday, toTs: endOfToday };
    case 'yesterday': return { fromTs: startOfToday - DAY, toTs: startOfToday - 1 };
    case '7d': return { fromTs: startOfToday - 6 * DAY, toTs: endOfToday };
    case '30d': return { fromTs: startOfToday - 29 * DAY, toTs: endOfToday };
    case '90d': return { fromTs: startOfToday - 89 * DAY, toTs: endOfToday };
    case '1y': return { fromTs: startOfToday - 364 * DAY, toTs: endOfToday };
    default: return { fromTs: null, toTs: null };
  }
};

interface CreatedRangePreset {
  id: string;
  label: string;
  getRange: () => { from: string; to: string };
}

const CREATED_RANGE_PRESETS: CreatedRangePreset[] = [
  {
    id: '7d',
    label: '近 7 天',
    getRange: () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { from: toLocalDateInputValue(start), to: toLocalDateInputValue(today) };
    }
  },
  {
    id: '30d',
    label: '近 30 天',
    getRange: () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return { from: toLocalDateInputValue(start), to: toLocalDateInputValue(today) };
    }
  },
  {
    id: '90d',
    label: '近 90 天',
    getRange: () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 89);
      return { from: toLocalDateInputValue(start), to: toLocalDateInputValue(today) };
    }
  },
  {
    id: 'year',
    label: '今年',
    getRange: () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), 0, 1);
      return { from: toLocalDateInputValue(start), to: toLocalDateInputValue(today) };
    }
  }
];

const formatCreatedRangeSummary = (from: string, to: string) => {
  if (from && to) return `${from} ~ ${to}`;
  if (from) return `${from} 起`;
  if (to) return `截至 ${to}`;
  return '';
};

// Shared dropdown body for the 创建时间 range filter (used by both internal & external bars).
// Quick presets + labeled, mutually-constrained from/to date inputs + inline clear.
interface CreatedRangePanelProps {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}

const CreatedRangePanel: React.FC<CreatedRangePanelProps> = ({ from, to, onChange }) => {
  const todayValue = toLocalDateInputValue(new Date());
  const activePresetId = CREATED_RANGE_PRESETS.find((preset) => {
    const range = preset.getRange();
    return range.from === from && range.to === to;
  })?.id ?? null;
  const summary = formatCreatedRangeSummary(from, to);

  return (
    <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded border border-zinc-700 bg-[#0c0c0e] p-2.5 shadow-xl shadow-black/60">
      <div className="grid grid-cols-2 gap-1.5">
        {CREATED_RANGE_PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.getRange())}
              className={`rounded border px-2 py-1 text-[10px] transition-colors ${
                isActive
                  ? 'border-[#00ff00]/60 bg-[#00ff00]/10 text-[#00ff00]'
                  : 'border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-wide text-zinc-500">开始日期</span>
          <input
            type="date"
            value={from}
            max={to || todayValue}
            onChange={(event) => onChange({ from: event.target.value, to })}
            className="w-full rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-wide text-zinc-500">结束日期</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            max={todayValue}
            onChange={(event) => onChange({ from, to: event.target.value })}
            className="w-full rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]"
          />
        </label>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800 pt-2">
        <span className="truncate text-[9px] text-zinc-500">{summary || '未设置时间区间'}</span>
        <button
          type="button"
          onClick={() => onChange({ from: '', to: '' })}
          disabled={!from && !to}
          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] text-zinc-400 transition-colors hover:text-[#00ff00] disabled:cursor-not-allowed disabled:opacity-40"
        >
          清除
        </button>
      </div>
    </div>
  );
};

// Reusable multi-select dropdown body (创建人/标签/后缀/组织架构/任务状态/形状). Renders the
// panel only (caller owns the trigger button + relative wrapper).
interface FilterOption {
  value: string;
  label: string;
  badge?: string;   // 如「已离职」
  dimmed?: boolean; // 灰显
}
interface FilterOptionGroup {
  title: string;
  options: FilterOption[];
}
interface MultiSelectFilterPanelProps {
  options?: FilterOption[];
  groups?: FilterOptionGroup[]; // 分组渲染（后缀按类型 / 标签按 AI 分组）
  selected: Set<string>;
  onToggle: (value: string) => void;
  singleSelect?: boolean; // 单选模式（创建人）：点选即唯一
  searchable?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  width?: string;
}

const MultiSelectFilterPanel: React.FC<MultiSelectFilterPanelProps> = ({
  options, groups, selected, onToggle, singleSelect, searchable, searchValue, onSearchChange, searchPlaceholder, emptyText, width
}) => {
  const renderOption = (option: FilterOption) => (
    <label key={option.value} className={`flex items-center gap-1.5 text-[10px] ${option.dimmed ? 'text-zinc-600' : 'text-zinc-400'}`}>
      <input
        type={singleSelect ? 'radio' : 'checkbox'}
        checked={selected.has(option.value)}
        onChange={() => onToggle(option.value)}
        className="h-3 w-3 rounded border-zinc-700 bg-black text-[#00ff00] focus:ring-[#00ff00]/50"
      />
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.badge && (
        <span className="shrink-0 rounded bg-zinc-800 px-1 text-[8.5px] text-zinc-500">{option.badge}</span>
      )}
    </label>
  );
  const hasContent = (groups && groups.some(g => g.options.length > 0)) || (options && options.length > 0);
  return (
    <div className={`absolute left-0 top-full z-30 mt-1.5 ${width ?? 'w-52'} rounded border border-zinc-700 bg-[#0c0c0e] p-2 shadow-xl shadow-black/60`}>
      {searchable && (
        <div className="relative mb-2">
          <Search size={11} className="absolute left-2 top-1.5 text-zinc-600" />
          <input
            type="text"
            value={searchValue ?? ''}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder ?? '搜索'}
            className="w-full rounded border border-zinc-800 bg-black py-1 pl-7 pr-2 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00]"
          />
        </div>
      )}
      <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
        {hasContent ? (
          groups ? groups.filter(g => g.options.length > 0).map(group => (
            <div key={group.title} className="space-y-1">
              <p className="px-0.5 pt-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">{group.title}</p>
              {group.options.map(renderOption)}
            </div>
          )) : (options ?? []).map(renderOption)
        ) : (
          <p className="text-[10px] text-zinc-600">{emptyText ?? '暂无可选项'}</p>
        )}
      </div>
    </div>
  );
};

// 日期预设单选面板（含自定义范围展开）
interface DatePresetPanelProps {
  preset: string;
  from: string;
  to: string;
  onPresetChange: (preset: string) => void;
  onCustomChange: (next: { from: string; to: string }) => void;
}
const DatePresetPanel: React.FC<DatePresetPanelProps> = ({ preset, from, to, onPresetChange, onCustomChange }) => (
  <div className="absolute left-0 top-full z-30 mt-1.5 w-56 rounded border border-zinc-700 bg-[#0c0c0e] p-2 shadow-xl shadow-black/60">
    <div className="space-y-1">
      {DATE_PRESETS.map(p => (
        <label key={p.id} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <input
            type="radio"
            checked={preset === p.id}
            onChange={() => onPresetChange(p.id)}
            className="h-3 w-3 border-zinc-700 bg-black text-[#00ff00] focus:ring-[#00ff00]/50"
          />
          <span>{p.label}</span>
        </label>
      ))}
    </div>
    {preset === 'custom' && (
      <div className="mt-2 space-y-1.5 border-t border-zinc-800 pt-2">
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-wide text-zinc-500">开始日期</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => onCustomChange({ from: e.target.value, to })}
            className="w-full rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-wide text-zinc-500">结束日期</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => onCustomChange({ from, to: e.target.value })}
            className="w-full rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]"
          />
        </label>
      </div>
    )}
  </div>
);

// 尺寸面板：预设桶多选 + 宽高自定义区间
interface SizeFilterPanelProps {
  buckets: Set<string>;
  onToggleBucket: (id: string) => void;
  wMin: string; wMax: string; hMin: string; hMax: string;
  onChange: (field: 'wMin' | 'wMax' | 'hMin' | 'hMax', value: string) => void;
}
const SizeFilterPanel: React.FC<SizeFilterPanelProps> = ({ buckets, onToggleBucket, wMin, wMax, hMin, hMax, onChange }) => (
  <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded border border-zinc-700 bg-[#0c0c0e] p-2 shadow-xl shadow-black/60">
    <div className="space-y-1">
      {DIMENSION_BUCKETS.map(b => (
        <label key={b.id} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <input
            type="checkbox"
            checked={buckets.has(b.id)}
            onChange={() => onToggleBucket(b.id)}
            className="h-3 w-3 rounded border-zinc-700 bg-black text-[#00ff00] focus:ring-[#00ff00]/50"
          />
          <span>{b.label}</span>
        </label>
      ))}
    </div>
    <div className="mt-2 border-t border-zinc-800 pt-2">
      <p className="mb-1 text-[9px] uppercase tracking-wide text-zinc-500">自定义（px）</p>
      <div className="grid grid-cols-2 gap-1.5">
        <input type="number" min={0} value={wMin} onChange={e => onChange('wMin', e.target.value)} placeholder="宽 最小" className="rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]" />
        <input type="number" min={0} value={wMax} onChange={e => onChange('wMax', e.target.value)} placeholder="宽 最大" className="rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]" />
        <input type="number" min={0} value={hMin} onChange={e => onChange('hMin', e.target.value)} placeholder="高 最小" className="rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]" />
        <input type="number" min={0} value={hMax} onChange={e => onChange('hMax', e.target.value)} placeholder="高 最大" className="rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]" />
      </div>
    </div>
  </div>
);

// Reusable numeric min/max range dropdown body (文件大小/尺寸/时长).
interface RangeFilterPanelProps {
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  hint?: string;
  width?: string;
}

const RangeFilterPanel: React.FC<RangeFilterPanelProps> = ({
  min, max, onMinChange, onMaxChange, minPlaceholder, maxPlaceholder, hint, width
}) => (
  <div className={`absolute left-0 top-full z-30 mt-1.5 ${width ?? 'w-56'} rounded border border-zinc-700 bg-[#0c0c0e] p-2 shadow-xl shadow-black/60`}>
    <div className="grid grid-cols-2 gap-1.5">
      <input
        type="number"
        min={0}
        value={min}
        onChange={(event) => onMinChange(event.target.value)}
        placeholder={minPlaceholder ?? '最小'}
        className="rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]"
      />
      <input
        type="number"
        min={0}
        value={max}
        onChange={(event) => onMaxChange(event.target.value)}
        placeholder={maxPlaceholder ?? '最大'}
        className="rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-[#00ff00] [color-scheme:dark]"
      />
    </div>
    {hint && <p className="mt-1 text-[9px] text-zinc-600">{hint}</p>}
  </div>
);

// Reusable color-swatch grid dropdown body (颜色).
interface ColorFilterPanelProps {
  selected: Set<string>;
  onToggle: (id: string) => void;
}

const ColorFilterPanel: React.FC<ColorFilterPanelProps> = ({ selected, onToggle }) => (
  <div className="absolute left-0 top-full z-30 mt-1.5 w-52 rounded border border-zinc-700 bg-[#0c0c0e] p-2 shadow-xl shadow-black/60">
    <div className="grid grid-cols-4 gap-1.5">
      {COLOR_SWATCHES.map((swatch) => {
        const isActive = selected.has(swatch.id);
        return (
          <button
            key={swatch.id}
            type="button"
            onClick={() => onToggle(swatch.id)}
            className={`flex flex-col items-center gap-1 rounded border p-1.5 transition-colors ${
              isActive ? 'border-[#00ff00] bg-[#00ff00]/10' : 'border-zinc-800 hover:border-zinc-600'
            }`}
          >
            <span
              className="h-5 w-5 rounded-full border border-white/20"
              style={{ backgroundColor: COLOR_SWATCH_HEX[swatch.id] }}
            />
            <span className="text-[9px] text-zinc-400">{swatch.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const getInitialItemsPerPage = () => {
  try {
    const stored = localStorage.getItem(ASSET_ITEMS_PER_PAGE_STORAGE_KEY);
    if (!stored) return DEFAULT_ITEMS_PER_PAGE;

    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return DEFAULT_ITEMS_PER_PAGE;
    if (!ITEMS_PER_PAGE_OPTIONS.includes(parsed)) return DEFAULT_ITEMS_PER_PAGE;
    return parsed;
  } catch {
    return DEFAULT_ITEMS_PER_PAGE;
  }
};

const clampCardWidth = (width: number) => Math.max(CARD_WIDTH_MIN, Math.min(CARD_WIDTH_MAX, width));
const getInitialCardWidth = () => {
  try {
    const stored = localStorage.getItem(CARD_WIDTH_STORAGE_KEY);
    if (!stored) return DEFAULT_CARD_WIDTH;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return DEFAULT_CARD_WIDTH;
    return clampCardWidth(parsed);
  } catch {
    return DEFAULT_CARD_WIDTH;
  }
};

const buildPaginationTokens = (currentPage: number, totalPages: number): PaginationToken[] => {
  if (totalPages <= 0) return [];
  if (totalPages < 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 'ellipsis-right', totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, 'ellipsis-left', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis-left', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-right', totalPages];
};

// --- 素材分享授权（项目空间 → 与我共享）---------------------------------
type ShareScope = 'user' | 'group';
interface AssetShareGrant {
  assetId: string;
  granteeEmail: string;
  granteeName: string;
  role: 'viewer'; // 授权类型固定「使用者」
  sharedAt: string;
  via?: string; // 按项目组分享时标注来源组名
}

const getInitialAssetShares = (): AssetShareGrant[] => {
  try {
    const stored = localStorage.getItem(ASSET_SHARES_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((g): g is AssetShareGrant => (
      !!g && typeof g.assetId === 'string' && typeof g.granteeEmail === 'string'
    ));
  } catch {
    return [];
  }
};

// Read project members (synced with PermissionManager's storage), falling back to seed data.
const readProjectMembers = (): Record<SpaceId, ProjectMember[]> => {
  const base: Record<SpaceId, ProjectMember[]> = {
    [SpaceId.ProjectA]: [...INITIAL_PROJECT_MEMBERS[SpaceId.ProjectA]],
    [SpaceId.ProjectB]: [...INITIAL_PROJECT_MEMBERS[SpaceId.ProjectB]],
    [SpaceId.Shared]: [],
    [SpaceId.Personal]: []
  };
  try {
    const stored = localStorage.getItem(PROJECT_MEMBERS_STORAGE_KEY);
    if (!stored) return base;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return base;
    ([SpaceId.ProjectA, SpaceId.ProjectB] as SpaceId[]).forEach((sid) => {
      if (Array.isArray(parsed[sid])) base[sid] = parsed[sid];
    });
    return base;
  } catch {
    return base;
  }
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHARE_MAX_USERS = 20;

export default function AssetLibrary({
  currentSpace,
  setCurrentSpace,
  apps,
  assets,
  personalAssets,
  setPersonalAssets,
  downloadedAssetIds,
  setDownloadedAssetIds,
  simulatedDiskGB,
  setSimulatedDiskGB,
  addLog
}: AssetLibraryProps) {
  // Navigation & filter states
  const [keyword, setKeyword] = useState<string>('');
  // 批量操作（多选删除）
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingBatchDelete, setPendingBatchDelete] = useState<boolean>(false);
  const [batchDeleteProgress, setBatchDeleteProgress] = useState<{ done: number; total: number } | null>(null);
  // 图片搜索（以图搜图）: active query + async color-sampling cache & version trigger
  const [imageSearchQuery, setImageSearchQuery] = useState<ImageSearchQuery | null>(null);
  const [isImageSearchProcessing, setIsImageSearchProcessing] = useState<boolean>(false);
  const [assetColorVersion, setAssetColorVersion] = useState<number>(0);
  const imageSearchInputRef = useRef<HTMLInputElement | null>(null);
  const assetColorCacheRef = useRef<Map<string, RGB>>(new Map());
  const [externalKeyword, setExternalKeyword] = useState<string>('');
  const [externalTypeFilters, setExternalTypeFilters] = useState<Set<ExternalAssetType>>(() => new Set());
  const [externalFormatKeyword, setExternalFormatKeyword] = useState<string>('');
  const [externalFormatFilters, setExternalFormatFilters] = useState<Set<string>>(() => new Set());
  const [externalSourceFilters, setExternalSourceFilters] = useState<Set<ExternalAssetSource>>(() => new Set());
  const [externalCreatedFrom, setExternalCreatedFrom] = useState<string>('');
  const [externalCreatedTo, setExternalCreatedTo] = useState<string>('');
  const [externalDatePreset, setExternalDatePreset] = useState<string>('all');
  const [externalSortOrder, setExternalSortOrder] = useState<'asc' | 'desc'>('desc');
  // 外部素材新增筛选维度
  const [externalAuthorFilter, setExternalAuthorFilter] = useState<string>(''); // 创建人：单选
  const [externalAuthorKeyword, setExternalAuthorKeyword] = useState<string>('');
  const [externalTagFilters, setExternalTagFilters] = useState<Set<string>>(() => new Set());
  const [externalTagKeyword, setExternalTagKeyword] = useState<string>('');
  const [externalOrgFilters, setExternalOrgFilters] = useState<Set<string>>(() => new Set());
  const [externalStatusFilters, setExternalStatusFilters] = useState<Set<string>>(() => new Set());
  const [externalShapeFilters, setExternalShapeFilters] = useState<Set<string>>(() => new Set());
  const [externalColorFilters, setExternalColorFilters] = useState<Set<string>>(() => new Set());
  const [externalFileSizeBuckets, setExternalFileSizeBuckets] = useState<Set<string>>(() => new Set());
  const [externalSizeBuckets, setExternalSizeBuckets] = useState<Set<string>>(() => new Set());
  const [externalSizeWMin, setExternalSizeWMin] = useState<string>('');
  const [externalSizeWMax, setExternalSizeWMax] = useState<string>('');
  const [externalSizeHMin, setExternalSizeHMin] = useState<string>('');
  const [externalSizeHMax, setExternalSizeHMax] = useState<string>('');
  const [externalDurationBuckets, setExternalDurationBuckets] = useState<Set<string>>(() => new Set());
  const [openExternalFilter, setOpenExternalFilter] = useState<FilterKey | null>(null);
  const externalFilterBarRef = useRef<HTMLDivElement | null>(null);
  // 内容类型 tab（全部/图片/视频/3D/工业/文档/音频），内外共用
  const [activeTypeTab, setActiveTypeTab] = useState<AssetTypeTab>('all');
  // Internal combined filters (个人空间 / 与我共享 / 项目空间)
  const [internalFormatKeyword, setInternalFormatKeyword] = useState<string>('');
  const [internalFormatFilters, setInternalFormatFilters] = useState<Set<string>>(() => new Set());
  const [internalCreatedFrom, setInternalCreatedFrom] = useState<string>('');
  const [internalCreatedTo, setInternalCreatedTo] = useState<string>('');
  const [internalDatePreset, setInternalDatePreset] = useState<string>('all');
  const [internalSortOrder, setInternalSortOrder] = useState<'asc' | 'desc'>('desc');
  // 内部空间新增筛选维度
  const [internalAuthorFilter, setInternalAuthorFilter] = useState<string>(''); // 创建人：单选
  const [internalAuthorKeyword, setInternalAuthorKeyword] = useState<string>('');
  const [internalTagFilters, setInternalTagFilters] = useState<Set<string>>(() => new Set());
  const [internalTagKeyword, setInternalTagKeyword] = useState<string>('');
  const [internalOrgFilters, setInternalOrgFilters] = useState<Set<string>>(() => new Set());
  const [internalStatusFilters, setInternalStatusFilters] = useState<Set<string>>(() => new Set());
  const [internalShapeFilters, setInternalShapeFilters] = useState<Set<string>>(() => new Set());
  const [internalColorFilters, setInternalColorFilters] = useState<Set<string>>(() => new Set());
  const [internalFileSizeBuckets, setInternalFileSizeBuckets] = useState<Set<string>>(() => new Set());
  const [internalSizeBuckets, setInternalSizeBuckets] = useState<Set<string>>(() => new Set());
  const [internalSizeWMin, setInternalSizeWMin] = useState<string>('');
  const [internalSizeWMax, setInternalSizeWMax] = useState<string>('');
  const [internalSizeHMin, setInternalSizeHMin] = useState<string>('');
  const [internalSizeHMax, setInternalSizeHMax] = useState<string>('');
  const [internalDurationBuckets, setInternalDurationBuckets] = useState<Set<string>>(() => new Set());
  const [openInternalFilter, setOpenInternalFilter] = useState<FilterKey | null>(null);
  const internalFilterBarRef = useRef<HTMLDivElement | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<ArtAsset | null>(null);
  const [assetDetailNameDraft, setAssetDetailNameDraft] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(getInitialItemsPerPage);
  const [cardWidth, setCardWidth] = useState<number>(getInitialCardWidth);
  // 卡片元信息功能暂时停用，保留原渲染逻辑便于后续快速恢复。
  // const [showAssetCardInfo, setShowAssetCardInfo] = useState<boolean>(true);
  const showAssetCardInfo = false;
  const [folderKeyword, setFolderKeyword] = useState<string>('');
  const [isFolderSearchActive, setIsFolderSearchActive] = useState<boolean>(false);
  const [folders, setFolders] = useState<AssetFolder[]>(getInitialFolders);
  const [folderAssignments, setFolderAssignments] = useState<Record<string, string>>(getInitialFolderAssignments);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(SPACE_ANCHOR_FOLDER_IDS[SpaceId.ProjectA]);
  // Folder browse history (stack of previously-visited folder ids) so users can step back
  // to the directory they came from. Populated by watching selectedFolderId transitions,
  // so every selection entry point (tree click, card click, upload, delete fallback) is covered.
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const previousFolderIdRef = useRef<string>(SPACE_ANCHOR_FOLDER_IDS[SpaceId.ProjectA]);
  const isNavigatingBackRef = useRef<boolean>(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set([
      PROJECT_A_SPACE_FOLDER_ID,
      PERSONAL_SPACE_FOLDER_ID,
      SHARED_SPACE_FOLDER_ID,
      getDefaultFolderIdBySpace(SpaceId.ProjectA),
      getDefaultFolderIdBySpace(SpaceId.Personal)
    ])
  );
  const [includeSubfolderAssets, setIncludeSubfolderAssets] = useState<boolean>(true);
  const [folderEditor, setFolderEditor] = useState<{
    mode: 'create' | 'rename';
    parentId: string | null;
    folderId?: string;
    name: string;
  } | null>(null);
  const [isFolderEditorSubmitAttempted, setIsFolderEditorSubmitAttempted] = useState<boolean>(false);
  const [folderContextMenu, setFolderContextMenu] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);
  const [assetContextMenu, setAssetContextMenu] = useState<{
    assetId: string;
    x: number;
    y: number;
  } | null>(null);
  // 素材分享授权（项目空间 → 与我共享）
  const [assetShares, setAssetShares] = useState<AssetShareGrant[]>(getInitialAssetShares);
  const [shareModalTarget, setShareModalTarget] = useState<{ kind: 'asset' | 'folder'; id: string; name: string; format?: string; thumbnail?: string } | null>(null);
  const [shareScope, setShareScope] = useState<ShareScope>('user');
  const [shareUserQuery, setShareUserQuery] = useState<string>('');
  const [shareSelectedUsers, setShareSelectedUsers] = useState<PlatformUser[]>([]);
  const [shareSelectedGroup, setShareSelectedGroup] = useState<SpaceId>(SpaceId.ProjectA);
  const [shareError, setShareError] = useState<string>('');
  // 查看权限弹窗（素材/文件夹）
  const [permissionViewTarget, setPermissionViewTarget] = useState<{ kind: 'asset' | 'folder'; id: string; name: string } | null>(null);
  const [permissionViewTab, setPermissionViewTab] = useState<'members' | 'groups'>('members');
  const [pendingPermissionRemoval, setPendingPermissionRemoval] = useState<{ scope: 'member' | 'group'; targetId: string; name: string; email?: string; groupName?: string } | null>(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<{
    folderId: string;
    folderName: string;
    childFolderCount: number;
    affectedAssetCount: number;
    fallbackFolderId?: string;
    fallbackFolderName?: string;
  } | null>(null);
  const [pendingPersonalAssetDelete, setPendingPersonalAssetDelete] = useState<{
    assetId: string;
    assetName: string;
  } | null>(null);
  const [projectAssetNameOverrides, setProjectAssetNameOverrides] = useState<Record<string, string>>({});
  const [projectRemovedAssetIds, setProjectRemovedAssetIds] = useState<Set<string>>(new Set());
  const [personalAssetMoveEditor, setPersonalAssetMoveEditor] = useState<{
    assetId: string;
    targetFolderId: string;
  } | null>(null);
  const [personalAssetRenameEditor, setPersonalAssetRenameEditor] = useState<{
    assetId: string;
    name: string;
  } | null>(null);
  const [isPersonalAssetRenameSubmitAttempted, setIsPersonalAssetRenameSubmitAttempted] = useState<boolean>(false);
  const [isPersonalUploadInfoOpen, setIsPersonalUploadInfoOpen] = useState<boolean>(false);
  const [isPersonalUploadDropzoneActive, setIsPersonalUploadDropzoneActive] = useState<boolean>(false);
  const [personalUploadDraft, setPersonalUploadDraft] = useState<PersonalUploadDraft | null>(null);
  const [pendingTagInputs, setPendingTagInputs] = useState<Record<string, string>>({});
  const [folderPaneWidth, setFolderPaneWidth] = useState<number>(getInitialFolderPaneWidth);
  const [isResizingFolderPane, setIsResizingFolderPane] = useState<boolean>(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => window.innerWidth >= 1024);
  const assetLayoutRef = useRef<HTMLDivElement | null>(null);
  const personalUploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadSessionRef = useRef<number>(0);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(1);
  const [previewMode, setPreviewMode] = useState<'fit' | 'zoomed'>('fit');
  const [previewViewportSize, setPreviewViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [previewNaturalSize, setPreviewNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Reset page when filters or space change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    keyword,
    currentSpace,
    selectedFolderId,
    includeSubfolderAssets,
    activeTypeTab,
    internalFormatFilters,
    internalAuthorFilter,
    internalTagFilters,
    internalOrgFilters,
    internalStatusFilters,
    internalShapeFilters,
    internalColorFilters,
    internalCreatedFrom,
    internalCreatedTo,
    internalDatePreset,
    internalSizeBuckets,
    internalSizeWMin,
    internalSizeWMax,
    internalSizeHMin,
    internalSizeHMax,
    internalFileSizeBuckets,
    internalDurationBuckets,
    internalSortOrder,
    externalKeyword,
    externalFormatFilters,
    externalSourceFilters,
    externalAuthorFilter,
    externalTagFilters,
    externalOrgFilters,
    externalStatusFilters,
    externalShapeFilters,
    externalColorFilters,
    externalCreatedFrom,
    externalCreatedTo,
    externalDatePreset,
    externalSizeBuckets,
    externalSizeWMin,
    externalSizeWMax,
    externalSizeHMin,
    externalSizeHMax,
    externalFileSizeBuckets,
    externalDurationBuckets,
    externalSortOrder
  ]);

  // 跨页约束：切换页码/筛选/文件夹/空间/子文件夹开关 → 退出批量操作。
  useEffect(() => {
    if (isBatchMode) {
      setIsBatchMode(false);
      setBatchSelectedIds(new Set());
      setPendingBatchDelete(false);
      setBatchDeleteProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    currentSpace,
    selectedFolderId,
    includeSubfolderAssets,
    keyword,
    activeTypeTab,
    internalFormatFilters,
    internalAuthorFilter,
    internalTagFilters,
    internalOrgFilters,
    internalStatusFilters,
    internalShapeFilters,
    internalColorFilters,
    internalDatePreset,
    internalSizeBuckets,
    internalFileSizeBuckets,
    internalDurationBuckets,
    externalKeyword,
    externalFormatFilters,
    externalSourceFilters
  ]);

  // ESC 退出批量操作（删除确认/进度中不响应，避免误触）。
  useEffect(() => {
    if (!isBatchMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingBatchDelete && !batchDeleteProgress) {
        exitBatchMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isBatchMode, pendingBatchDelete, batchDeleteProgress]);

  useEffect(() => {
    setSelectedAsset(null);
    setAssetContextMenu(null);
    setPendingPersonalAssetDelete(null);
    setPersonalAssetMoveEditor(null);
    setPersonalAssetRenameEditor(null);
    setIsPersonalAssetRenameSubmitAttempted(false);
    setShareModalTarget(null);
    setShareError('');
    setPermissionViewTarget(null);
    setPendingPermissionRemoval(null);
  }, [currentSpace]);

  useEffect(() => {
    if (!folderContextMenu && !assetContextMenu) return;

    const closeContextMenu = () => {
      setFolderContextMenu(null);
      setAssetContextMenu(null);
    };
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [folderContextMenu, assetContextMenu]);

  useEffect(() => {
    if (!openExternalFilter) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (externalFilterBarRef.current && !externalFilterBarRef.current.contains(event.target as Node)) {
        setOpenExternalFilter(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenExternalFilter(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openExternalFilter]);

  useEffect(() => {
    if (!openInternalFilter) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (internalFilterBarRef.current && !internalFilterBarRef.current.contains(event.target as Node)) {
        setOpenInternalFilter(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenInternalFilter(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openInternalFilter]);

  useEffect(() => {
    localStorage.setItem(ASSET_FOLDER_STORAGE_KEY, JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem(ASSET_FOLDER_ASSIGNMENT_STORAGE_KEY, JSON.stringify(folderAssignments));
  }, [folderAssignments]);

  useEffect(() => {
    localStorage.setItem(ASSET_FOLDER_PANE_WIDTH_STORAGE_KEY, String(folderPaneWidth));
  }, [folderPaneWidth]);

  useEffect(() => {
    localStorage.setItem(ASSET_ITEMS_PER_PAGE_STORAGE_KEY, String(itemsPerPage));
  }, [itemsPerPage]);

  useEffect(() => {
    localStorage.setItem(CARD_WIDTH_STORAGE_KEY, String(cardWidth));
  }, [cardWidth]);

  useEffect(() => {
    localStorage.setItem(ASSET_SHARES_STORAGE_KEY, JSON.stringify(assetShares));
  }, [assetShares]);

  useEffect(() => {
    const cleanedFolders = normalizeFolders(folders);
    if (cleanedFolders.length !== folders.length) {
      setFolders(cleanedFolders);
    }

    const validFolderIds = new Set(cleanedFolders.map(folder => folder.id));
    const cleanedAssignments = Object.fromEntries(
      Object.entries(normalizeFolderAssignments(folderAssignments)).map(([assetId, folderId]) => {
        if (validFolderIds.has(folderId)) return [assetId, folderId];
        return [assetId, getDefaultFolderIdByAssetId(assetId)];
      })
    );
    if (Object.entries(cleanedAssignments).some(([assetId, folderId]) => folderAssignments[assetId] !== folderId)) {
      setFolderAssignments(cleanedAssignments);
    }
  }, [folders, folderAssignments]);

  useEffect(() => {
    const handleWindowResize = () => {
      setIsDesktopLayout(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    if (!isDesktopLayout && isResizingFolderPane) {
      setIsResizingFolderPane(false);
    }
  }, [isDesktopLayout, isResizingFolderPane]);

  useEffect(() => {
    if (!isResizingFolderPane) return;

    const handleMouseMove = (event: MouseEvent) => {
      const containerRect = assetLayoutRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const rawWidth = event.clientX - containerRect.left;
      const maxWidthByContainer = Math.max(MIN_FOLDER_PANE_WIDTH, containerRect.width - 360);
      const constrainedWidth = Math.min(rawWidth, maxWidthByContainer);
      setFolderPaneWidth(clampFolderPaneWidth(constrainedWidth));
    };

    const stopResizing = () => {
      setIsResizingFolderPane(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingFolderPane]);

  useEffect(() => {
    if (folders.some(folder => folder.id === selectedFolderId)) return;

    const fallbackFolder = folders.find(folder => folder.id === SPACE_ANCHOR_FOLDER_IDS[currentSpace.id])
      ?? folders.find(folder => folder.id === DEFAULT_ASSET_FOLDER_ID)
      ?? folders.find(folder => folder.parentId === null)
      ?? folders[0];
    if (fallbackFolder) {
      setSelectedFolderId(fallbackFolder.id);
    }
  }, [folders, selectedFolderId, currentSpace.id]);

  useEffect(() => {
    if (!selectedAsset) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedAsset(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedAsset]);

  useEffect(() => {
    if (!selectedAsset) return;
    setPreviewZoom(1);
    setPreviewMode('fit');
    setPreviewNaturalSize({ width: 0, height: 0 });
  }, [selectedAsset]);

  useEffect(() => {
    setAssetDetailNameDraft(selectedAsset?.name ?? '');
  }, [selectedAsset?.id, selectedAsset?.name]);

  useEffect(() => {
    if (!selectedAsset || !previewViewportRef.current) return;

    const element = previewViewportRef.current;
    const syncSize = () => {
      const rect = element.getBoundingClientRect();
      setPreviewViewportSize({
        width: rect.width,
        height: rect.height
      });
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedAsset]);

  // Download simulation engine states (queue F9 rule)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  
  // Custom dialog popups - "可选" mode selections
  const [importOptionsConfig, setImportOptionsConfig] = useState<{ asset: ArtAsset, dccId: AppId } | null>(null);
  const [selectedImportMode, setSelectedImportMode] = useState<string>('');

  const isProjectA = currentSpace.id === SpaceId.ProjectA;
  const isPersonalSpace = currentSpace.id === SpaceId.Personal;
  const projectScopedAssets = useMemo<ArtAsset[]>(() => {
    return assets
      .filter(asset => !projectRemovedAssetIds.has(asset.id))
      .map(asset => {
        const overrideName = projectAssetNameOverrides[asset.id];
        if (!overrideName || overrideName === asset.name) return asset;
        return { ...asset, name: overrideName };
      });
  }, [assets, projectAssetNameOverrides, projectRemovedAssetIds]);
  // Assets shared TO the current user — surfaced in the 与我共享 space.
  const sharedToMeAssets = useMemo<ArtAsset[]>(() => {
    const myAssetIds = new Set(
      assetShares.filter(g => g.granteeEmail.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase()).map(g => g.assetId)
    );
    if (myAssetIds.size === 0) return [];
    return assets.filter(asset => myAssetIds.has(asset.id));
  }, [assetShares, assets]);
  const activeAssets: ArtAsset[] = useMemo(() => {
    if (currentSpace.id === SpaceId.Personal) return personalAssets;
    if (currentSpace.id === SpaceId.ProjectA) return projectScopedAssets;
    if (currentSpace.id === SpaceId.Shared) return sharedToMeAssets;
    return [];
  }, [currentSpace.id, personalAssets, projectScopedAssets, sharedToMeAssets]);
  // Current user is admin of the active project group (synced from PermissionManager storage).
  const isCurrentUserProjectAdmin = useMemo(() => {
    if (!isProjectA) return false;
    const members = readProjectMembers()[SpaceId.ProjectA] ?? [];
    return members.some(m => m.email.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase() && m.role === 'admin');
  }, [isProjectA, shareModalTarget, assetContextMenu]);

  // Resolve an asset's dominant color for 图片搜索 scoring: cached sample → external accent
  // → deterministic id-hash fallback. Never blocks; the async effect fills the cache.
  const getAssetColor = (asset: ArtAsset): RGB => {
    const cached = assetColorCacheRef.current.get(asset.id);
    if (cached) return cached;
    const accent = EXTERNAL_ASSET_ACCENT[asset.id];
    if (accent) {
      const rgb = hexToRgb(accent);
      if (rgb) return rgb;
    }
    return hashColorFallback(asset.id);
  };

  const handleImageSearchSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件用于以图搜图。');
      return;
    }

    setIsImageSearchProcessing(true);
    addLog(`🔍 已选择参考图【${file.name}】，开始提取视觉特征并匹配相似素材。`, 'info');

    const [color, dimensions] = await Promise.all([
      getImageDominantColor(file),
      readImageDimensions(file)
    ]);
    const fileBaseName = getFileBaseName(file.name);
    const tags = extractNameTags(file.name);

    setImageSearchQuery({
      previewUrl: URL.createObjectURL(file),
      color: color ?? { r: 128, g: 128, b: 128 },
      width: dimensions?.width ?? 0,
      height: dimensions?.height ?? 0,
      category: inferCategoryForUpload(fileBaseName, 'image', tags),
      tags,
      fileName: file.name
    });
    // Text search and image search are mutually exclusive — image search takes over.
    setKeyword('');
    setExternalKeyword('');
    setIsImageSearchProcessing(false);
    addLog(`🤖 参考图特征解析完成，已按相似度对素材重新排序。`, 'success');
  };

  const clearImageSearch = () => {
    setImageSearchQuery(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const openImageSearchPicker = () => {
    imageSearchInputRef.current?.click();
  };

  // 图片搜索 / 颜色筛选: asynchronously sample dominant colors for candidate assets not yet
  // cached (external assets use their accent and are skipped), then bump the version to
  // trigger a re-sort/re-filter with real colors. Runs when image search OR a color filter
  // is active.
  const colorFilterActive = internalColorFilters.size > 0 || externalColorFilters.size > 0;
  useEffect(() => {
    if (!imageSearchQuery && !colorFilterActive) return;
    let cancelled = false;

    const candidates = [...activeAssets, ...EXTERNAL_ASSETS].filter(asset => (
      !assetColorCacheRef.current.has(asset.id) && !EXTERNAL_ASSET_ACCENT[asset.id]
    ));
    if (candidates.length === 0) return;

    (async () => {
      let sampledAny = false;
      for (const asset of candidates) {
        if (cancelled) return;
        const color = await sampleImageDominantColor(asset.thumbnail, true);
        assetColorCacheRef.current.set(asset.id, color ?? hashColorFallback(asset.id));
        sampledAny = true;
      }
      if (!cancelled && sampledAny) {
        setAssetColorVersion(v => v + 1);
      }
    })();

    return () => { cancelled = true; };
  }, [imageSearchQuery, colorFilterActive, activeAssets]);
  const existingTagPool = useMemo(() => {
    const sourceTags = assets.flatMap(asset => asset.tags);
    const personalTags = personalAssets.flatMap(asset => asset.tags);
    return dedupeTags([...sourceTags, ...personalTags]);
  }, [assets, personalAssets]);
  const externalAssetById = useMemo(() => {
    return EXTERNAL_ASSETS.reduce<Map<string, ExternalAsset>>((map, asset) => {
      map.set(asset.id, asset);
      return map;
    }, new Map<string, ExternalAsset>());
  }, []);
  // 创建人：平台所有用户（含离职），按姓名拼音排序；离职者带徽章+灰显。共用于内外。
  const buildAuthorOptions = (keyword: string): FilterOption[] => {
    const query = keyword.trim().toLowerCase();
    return [...PLATFORM_USERS]
      .filter(u => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      .map(u => ({
        value: u.email,
        label: `${u.name}（${u.email}）`,
        badge: u.isFormer ? '已离职' : undefined,
        dimmed: u.isFormer
      }));
  };
  const externalAuthorOptions = useMemo(() => buildAuthorOptions(externalAuthorKeyword), [externalAuthorKeyword]);
  const internalAuthorOptions = useMemo(() => buildAuthorOptions(internalAuthorKeyword), [internalAuthorKeyword]);
  // 标签：平台所有标签，按 AI/手动 分两组；支持搜索。
  const buildTagGroups = (pool: string[], keyword: string): FilterOptionGroup[] => {
    const query = keyword.trim().toLowerCase();
    const filtered = pool.filter(t => !query || t.toLowerCase().includes(query));
    const ai = filtered.filter(isAiTag).map(t => ({ value: t, label: t }));
    const manual = filtered.filter(t => !isAiTag(t)).map(t => ({ value: t, label: t }));
    return [
      { title: 'AI 标签', options: ai },
      { title: '手动标签', options: manual }
    ];
  };
  const externalTagGroups = useMemo(() => (
    buildTagGroups(dedupeTags(EXTERNAL_ASSETS.flatMap(a => a.tags)), externalTagKeyword)
  ), [externalTagKeyword]);
  const internalTagGroups = useMemo(() => (
    buildTagGroups(dedupeTags(activeAssets.flatMap(a => a.tags)), internalTagKeyword)
  ), [activeAssets, internalTagKeyword]);
  // 后缀：按内容类型分组（图片/视频/3D/工业/文档/音频），按搜索过滤。
  const buildFormatGroups = (keyword: string): FilterOptionGroup[] => {
    const query = keyword.trim().toUpperCase();
    return ASSET_TYPE_TABS.filter(tab => tab.id !== 'all').map(tab => ({
      title: tab.label,
      options: tab.formats
        .filter(f => !query || f.includes(query))
        .map(f => ({ value: f, label: f }))
    })).filter(g => g.options.length > 0);
  };
  const formatGroups = useMemo(() => buildFormatGroups(internalFormatKeyword), [internalFormatKeyword]);
  const externalFormatGroups = useMemo(() => buildFormatGroups(externalFormatKeyword), [externalFormatKeyword]);
  const externalOrgOptions = useMemo(() => (
    Array.from(new Set(EXTERNAL_ASSETS.map(a => a.org).filter((o): o is string => !!o)))
  ), []);
  const internalOrgOptions = useMemo(() => (
    Array.from(new Set(activeAssets.map(a => a.org).filter((o): o is string => !!o)))
  ), [activeAssets]);
  // Fit scale in CSS pixels at zoom=1. When zoom <= 1 we treat preview as fit mode.
  const previewFitScale = useMemo(() => {
    if (
      previewNaturalSize.width <= 0 ||
      previewNaturalSize.height <= 0 ||
      previewViewportSize.width <= 0 ||
      previewViewportSize.height <= 0
    ) {
      return 1;
    }

    return Math.min(
      previewViewportSize.width / previewNaturalSize.width,
      previewViewportSize.height / previewNaturalSize.height
    );
  }, [previewNaturalSize, previewViewportSize]);
  // Max zoom: cap at 3x of the asset's native (100%) resolution.
  const previewMaxZoom = useMemo(() => {
    return Math.max(1, 3 / previewFitScale);
  }, [previewFitScale]);
  const isPreviewZoomAtMin = previewZoom <= 1 + 1e-3;
  const isPreviewZoomAtMax = previewZoom >= previewMaxZoom - 1e-3;

  const applyPreviewZoom = (nextZoom: number) => {
    const clampedZoom = Math.max(1, Math.min(previewMaxZoom, nextZoom));
    // Any zoom <= fit baseline falls back to fit mode.
    if (clampedZoom <= 1 + 1e-3) {
      setPreviewZoom(1);
      setPreviewMode('fit');
      return;
    }

    setPreviewZoom(clampedZoom);
    setPreviewMode('zoomed');
  };

  const stepPreviewZoom = (direction: 'in' | 'out') => {
    const factor = direction === 'in' ? PREVIEW_ZOOM_STEP : 1 / PREVIEW_ZOOM_STEP;
    applyPreviewZoom(previewZoom * factor);
  };

  const handlePreviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.deltaY < 0) {
      stepPreviewZoom('in');
      return;
    }
    if (event.deltaY > 0) {
      stepPreviewZoom('out');
    }
  };

  useEffect(() => {
    if (previewZoom > previewMaxZoom) {
      applyPreviewZoom(previewMaxZoom);
    }
  }, [previewMaxZoom, previewZoom]);

  const buildAiTagsForUpload = async (file: File, uploadType: PersonalUploadType) => {
    const format = getFileExtension(file.name).toUpperCase() || 'BIN';
    const tags: string[] = [
      personalTypeLabel[uploadType],
      format,
      'AI自动打标',
      ...extractNameTags(file.name)
    ];

    if (file.size >= 200 * BYTES_IN_MB) {
      tags.push('大体积');
    } else if (file.size <= 5 * BYTES_IN_MB) {
      tags.push('轻量');
    }

    if (uploadType === 'video') {
      const metadata = await readVideoMetadata(file);
      if (metadata) {
        tags.push(`${metadata.width}x${metadata.height}`);
        if (metadata.duration <= 10) tags.push('短视频');
        else if (metadata.duration >= 60) tags.push('长视频');
        else tags.push('中视频');
      }
    } else {
      const dimensions = await readImageDimensions(file);
      if (dimensions) {
        tags.push(`${dimensions.width}x${dimensions.height}`);
        if (dimensions.width > dimensions.height) tags.push('横版');
        else if (dimensions.width < dimensions.height) tags.push('竖版');
        else tags.push('方图');
      }
    }

    return dedupeTags(tags).slice(0, 8);
  };

  const closePersonalUploadDraft = () => {
    uploadSessionRef.current += 1;
    setPersonalUploadDraft(null);
    setPendingTagInputs({});
  };

  const resetPersonalUploadDraftToInitial = () => {
    closePersonalUploadDraft();
    setIsPersonalUploadInfoOpen(true);
  };

  const updateDraftItemTags = (itemId: string, updater: (tags: string[]) => string[]) => {
    setPersonalUploadDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item => (
          item.id === itemId
            ? { ...item, tags: dedupeTags(updater(item.tags)).slice(0, 12) }
            : item
        ))
      };
    });
  };

  const updateDraftItemCategory = (itemId: string, category: AssetCategory) => {
    setPersonalUploadDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item => (
          item.id === itemId
            ? { ...item, category }
            : item
        ))
      };
    });
  };

  const updateDraftItemName = (itemId: string, nextName: string) => {
    setPersonalUploadDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item => (
          item.id === itemId
            ? { ...item, fileName: nextName.replace(/\r?\n/g, '').slice(0, 80) }
            : item
        ))
      };
    });
  };

  const addDraftTag = (itemId: string) => {
    const value = normalizeTag(pendingTagInputs[itemId] ?? '');
    if (!value) return;
    updateDraftItemTags(itemId, tags => [...tags, value]);
    setPendingTagInputs(prev => ({ ...prev, [itemId]: '' }));
  };

  const getTagSuggestions = (itemId: string) => {
    const query = normalizeTag(pendingTagInputs[itemId] ?? '');
    if (!query) return [];

    const currentItem = personalUploadDraft?.items.find(item => item.id === itemId);
    const exists = new Set((currentItem?.tags ?? []).map(tag => tag.toLowerCase()));

    return existingTagPool
      .filter(tag => !exists.has(tag.toLowerCase()))
      .filter(tag => fuzzyTagMatch(tag, query))
      .slice(0, 8);
  };

  const removeDraftTag = (itemId: string, tagToRemove: string) => {
    updateDraftItemTags(itemId, tags => tags.filter(tag => tag !== tagToRemove));
  };

  const removeDraftItem = (itemId: string, fileName: string) => {
    const isRemovingLastDraftItem = (
      !!personalUploadDraft &&
      personalUploadDraft.items.length === 1 &&
      personalUploadDraft.items[0].id === itemId
    );

    if (isRemovingLastDraftItem) {
      URL.revokeObjectURL(personalUploadDraft.items[0].previewUrl);
      resetPersonalUploadDraftToInitial();
      addLog(`🗑️ 已从上传草稿移除素材: ${fileName}`, 'warning');
      return;
    }

    setPersonalUploadDraft(prev => {
      if (!prev) return prev;

      const target = prev.items.find(item => item.id === itemId);
      if (!target) return prev;

      // The removed draft item will no longer be used, release its object URL.
      URL.revokeObjectURL(target.previewUrl);
      const nextItems = prev.items.filter(item => item.id !== itemId);

      return {
        ...prev,
        items: nextItems,
        totalBytes: nextItems.reduce((sum, item) => sum + item.sizeBytes, 0),
        isTagging: nextItems.length > 0 ? prev.isTagging : false
      };
    });

    setPendingTagInputs(prev => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    addLog(`🗑️ 已从上传草稿移除素材: ${fileName}`, 'warning');
  };

  const editDraftTag = (itemId: string, currentTag: string) => {
    const nextTag = window.prompt('编辑标签', currentTag);
    if (nextTag === null) return;

    const normalized = normalizeTag(nextTag);
    if (!normalized) {
      removeDraftTag(itemId, currentTag);
      return;
    }

    updateDraftItemTags(itemId, tags => tags.map(tag => tag === currentTag ? normalized : tag));
  };

  const confirmPersonalUpload = () => {
    if (!personalUploadDraft || personalUploadDraft.isTagging) return;
    const personalDefaultFolderId = getDefaultFolderIdBySpace(SpaceId.Personal);

    const timestampBase = Date.now();
    const newAssets: PersonalUploadedAsset[] = personalUploadDraft.items.map((item, index) => ({
      id: `personal-asset-${timestampBase}-${index}`,
      name: item.fileName.trim() || getFileBaseName(item.sourceFileName),
      category: item.category,
      format: item.format,
      sizeMB: toDisplayMB(item.sizeBytes),
      thumbnail: item.previewUrl,
      previewUrl: item.previewUrl,
      author: '当前用户',
      platform: '个人空间·置顶目录',
      desc: `用户上传文件 ${item.sourceFileName}，已完成 AI 自动识别与标签确认。`,
      tags: dedupeTags(item.tags),
      uploadType: item.uploadType,
      sourceFileName: item.sourceFileName,
      uploadedAt: new Date().toISOString()
    }));

    setPersonalAssets(prev => [...newAssets, ...prev]);
    setFolderAssignments(prev => {
      const next = { ...prev };
      newAssets.forEach((asset) => {
        next[asset.id] = personalDefaultFolderId;
      });
      return next;
    });
    setSelectedFolderId(personalDefaultFolderId);
    setExpandedFolderIds(prev => new Set(prev).add(personalDefaultFolderId));
    addLog(`📤 个人空间上传完成：${newAssets.length} 条素材已归档到【置顶目录】。`, 'success');
    closePersonalUploadDraft();
  };

  const startPersonalUploadFromFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const unsupported = files.filter(file => inferUploadType(file) === null);
    if (unsupported.length > 0) {
      alert(`仅支持上传图片、动图(GIF)和视频文件。\n\n当前包含 ${unsupported.length} 个不支持的文件。`);
      addLog(`❌ 个人空间上传被拦截：存在 ${unsupported.length} 个不支持格式文件。`, 'error', { toast: false });
      return;
    }

    if (files.length > PERSONAL_UPLOAD_MAX_COUNT) {
      alert(`单次最多上传 ${PERSONAL_UPLOAD_MAX_COUNT} 条素材。\n当前选择 ${files.length} 条，请分批上传。`);
      addLog(`❌ 个人空间上传被拦截：单次上传数量 ${files.length} 超过上限 ${PERSONAL_UPLOAD_MAX_COUNT}。`, 'error', { toast: false });
      return;
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > PERSONAL_UPLOAD_MAX_TOTAL_BYTES) {
      alert(`单次上传总大小不能超过 10 GB。\n当前选择总大小：${formatUploadTotal(totalBytes)}。`);
      addLog(`❌ 个人空间上传被拦截：批量体积 ${formatUploadTotal(totalBytes)} 超过 10 GB。`, 'error', { toast: false });
      return;
    }

    setIsPersonalUploadInfoOpen(false);

    const sessionId = Date.now();
    uploadSessionRef.current = sessionId;
    addLog(`📤 已选择 ${files.length} 个文件，开始执行上传预处理与 AI 自动打标。`, 'info');

    const initialItems: PendingPersonalUploadItem[] = files.map((file, index) => {
      const uploadType = inferUploadType(file) ?? 'image';
      const fileBaseName = getFileBaseName(file.name);
      return {
        id: `pending-${sessionId}-${index}`,
        fileName: fileBaseName,
        sourceFileName: file.name,
        sizeBytes: file.size,
        format: getFileExtension(file.name).toUpperCase() || 'BIN',
        uploadType,
        category: inferCategoryForUpload(fileBaseName, uploadType),
        previewUrl: URL.createObjectURL(file),
        tags: [],
        status: 'tagging'
      };
    });

    setPendingTagInputs({});
    setPersonalUploadDraft({
      items: initialItems,
      totalBytes,
      isTagging: true
    });

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const itemId = initialItems[index].id;
      const uploadType = inferUploadType(file) ?? 'image';
      const aiTags = await buildAiTagsForUpload(file, uploadType);

      if (uploadSessionRef.current !== sessionId) return;

      setPersonalUploadDraft(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => (
            item.id === itemId
              ? { ...item, tags: aiTags, category: inferCategoryForUpload(item.fileName, item.uploadType, aiTags), status: 'ready' }
              : item
          ))
        };
      });
    }

    if (uploadSessionRef.current !== sessionId) return;

    setPersonalUploadDraft(prev => prev ? { ...prev, isTagging: false } : prev);
    addLog(`🤖 AI 自动打标完成：${files.length} 条素材可确认标签后入库。`, 'success');
  };

  const handlePersonalFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    await startPersonalUploadFromFiles(files);
  };

  const handlePersonalUploadDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsPersonalUploadDropzoneActive(false);

    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    void startPersonalUploadFromFiles(files);
  };

  const handlePersonalUploadDragEnter = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsPersonalUploadDropzoneActive(true);
  };

  const handlePersonalUploadDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isPersonalUploadDropzoneActive) {
      setIsPersonalUploadDropzoneActive(true);
    }
  };

  const handlePersonalUploadDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
      setIsPersonalUploadDropzoneActive(false);
    }
  };

  const openPersonalUploadPicker = () => {
    personalUploadInputRef.current?.click();
  };

  const openPersonalUploadInfo = () => {
    setIsPersonalUploadDropzoneActive(false);
    setIsPersonalUploadInfoOpen(true);
  };

  // Filter categories list matching PRD
  const categoryTabs = ASSET_CATEGORY_TABS;
  const uploadCategoryOptions = categoryTabs.filter(tab => tab.id !== AssetCategory.All);

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, AssetFolder[]>();
    folders.forEach((folder) => {
      const list = map.get(folder.parentId) ?? [];
      list.push(folder);
      map.set(folder.parentId, list);
    });

    const getCreatedFolderOrder = (folder: AssetFolder) => {
      const match = CREATED_FOLDER_ID_PATTERN.exec(getFolderBaseId(folder.id));
      return match ? Number(match[1]) : null;
    };

    map.forEach((list) => {
      list.sort((a, b) => {
        const aSystemOrder = SYSTEM_FOLDER_ORDER[a.id];
        const bSystemOrder = SYSTEM_FOLDER_ORDER[b.id];
        const hasSystemOrder = aSystemOrder !== undefined || bSystemOrder !== undefined;
        if (hasSystemOrder) {
          if (aSystemOrder === undefined) return 1;
          if (bSystemOrder === undefined) return -1;
          if (aSystemOrder !== bSystemOrder) return aSystemOrder - bSystemOrder;
        }

        const aCreatedOrder = getCreatedFolderOrder(a);
        const bCreatedOrder = getCreatedFolderOrder(b);

        if (aCreatedOrder !== null || bCreatedOrder !== null) {
          if (aCreatedOrder === null) return -1;
          if (bCreatedOrder === null) return 1;
          return aCreatedOrder - bCreatedOrder;
        }

        return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
      });
    });

    return map;
  }, [folders]);

  // Folder name validation: empty / length / illegal chars / leading dot / reserved / sibling duplicate.
  // Returns an error message string, or '' when the name is valid. Used both to block submit and to
  // show live inline feedback in the editor.
  const validateFolderName = (
    rawName: string,
    editor: { mode: 'create' | 'rename'; parentId: string | null; folderId?: string }
  ): string => {
    const name = rawName.trim();
    if (!name) return '文件夹名称不能为空';

    const charCount = [...name].length;
    if (charCount > FOLDER_NAME_MAX_LENGTH) {
      return `文件夹名称不能超过 ${FOLDER_NAME_MAX_LENGTH} 个字符（当前 ${charCount} 个）`;
    }
    if (ILLEGAL_FOLDER_NAME_CHARS_REGEX.test(name)) {
      return '名称不能包含 \\ / : * ? " < > | 等特殊字符';
    }
    if (name.startsWith('.')) {
      return '名称不能以 "." 开头';
    }
    if (RESERVED_FOLDER_NAMES.has(name.toUpperCase())) {
      return '不能使用系统保留名（如 CON、NUL、COM1 等）';
    }

    const siblings = foldersByParent.get(editor.parentId) ?? [];
    const hasConflict = siblings.some(folder => (
      folder.id !== editor.folderId &&
      folder.name.trim().toLowerCase() === name.toLowerCase()
    ));
    if (hasConflict) return '该目录下已存在同名文件夹';

    return '';
  };

  const validatePersonalAssetName = (rawName: string, assetId: string, sourceAssets: ArtAsset[]): string => {
    const name = rawName.trim();
    if (!name) return '素材名称不能为空';

    const charCount = [...name].length;
    if (charCount > PERSONAL_ASSET_NAME_MAX_LENGTH) {
      return `素材名称不能超过 ${PERSONAL_ASSET_NAME_MAX_LENGTH} 个字符（当前 ${charCount} 个）`;
    }
    if (ILLEGAL_FOLDER_NAME_CHARS_REGEX.test(name)) {
      return '名称不能包含 \\ / : * ? " < > | 等特殊字符';
    }
    if (name.startsWith('.')) {
      return '名称不能以 "." 开头';
    }

    const hasConflict = sourceAssets.some(asset => (
      asset.id !== assetId &&
      asset.name.trim().toLowerCase() === name.toLowerCase()
    ));
    if (hasConflict) return '个人空间内已存在同名素材';

    return '';
  };

  const folderById = useMemo(() => {
    return folders.reduce<Record<string, AssetFolder>>((acc, folder) => {
      acc[folder.id] = folder;
      return acc;
    }, {});
  }, [folders]);

  const getFolderSpaceId = (folderId: string): SpaceId | null => {
    const visited = new Set<string>();
    let cursor: AssetFolder | undefined = folderById[folderId];

    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      if (cursor.id === PROJECT_A_SPACE_FOLDER_ID) return SpaceId.ProjectA;
      if (cursor.id === PROJECT_B_SPACE_FOLDER_ID) return SpaceId.ProjectB;
      if (cursor.id === PERSONAL_SPACE_FOLDER_ID) return SpaceId.Personal;
      if (cursor.id === SHARED_SPACE_FOLDER_ID) return SpaceId.Shared;
      cursor = cursor.parentId ? folderById[cursor.parentId] : undefined;
    }

    return null;
  };

  const getResolvedAssetFolderId = (asset: ArtAsset) => {
    // In 与我共享, shared-in assets live under the shared space's default folder regardless
    // of their origin project assignment.
    if (currentSpace.id === SpaceId.Shared) {
      const sharedDefault = getDefaultFolderIdBySpace(SpaceId.Shared);
      return folderById[sharedDefault] ? sharedDefault : SHARED_SPACE_FOLDER_ID;
    }

    const assignedFolderId = folderAssignments[asset.id];
    if (assignedFolderId && folderById[assignedFolderId]) {
      return assignedFolderId;
    }

    const fallbackFolderId = isPersonalAssetId(asset.id)
      ? getDefaultFolderIdBySpace(SpaceId.Personal)
      : getDefaultFolderIdBySpace(SpaceId.ProjectA);
    return folderById[fallbackFolderId] ? fallbackFolderId : DEFAULT_ASSET_FOLDER_ID;
  };

  const selectedFolder = folderById[selectedFolderId] ?? folderById[SPACE_ANCHOR_FOLDER_IDS[currentSpace.id]];
  const isExternalRootSelected = selectedFolder?.id === EXTERNAL_ASSET_FOLDER_ID;
  // 批量删除权限：个人空间始终可删；项目空间需管理员；外部素材只读不可批量。
  const canBatchDelete = !isExternalRootSelected && (isPersonalSpace || (isProjectA && isCurrentUserProjectAdmin));
  // The toolbar "+" creates a child of whatever folder is currently selected. The external
  // root is read-only (no space id), so child creation is disabled there.
  const canCreateChildOfSelected = !!selectedFolder && getFolderSpaceId(selectedFolder.id) !== null;

  // Record folder navigation so the back button can step through visited directories.
  // When selectedFolderId changes via a normal selection we push the prior folder; when it
  // changes because the user clicked "back" we skip the push (the stack was just popped).
  useEffect(() => {
    const previousFolderId = previousFolderIdRef.current;
    if (previousFolderId === selectedFolderId) return;

    if (isNavigatingBackRef.current) {
      isNavigatingBackRef.current = false;
    } else if (folderById[previousFolderId]) {
      setFolderHistory(prev => (
        prev[prev.length - 1] === previousFolderId ? prev : [...prev, previousFolderId]
      ));
    }

    previousFolderIdRef.current = selectedFolderId;
  }, [selectedFolderId, folderById]);

  const goToPreviousFolder = () => {
    setFolderHistory(prev => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      if (folderById[target]) {
        isNavigatingBackRef.current = true;
        setSelectedFolderId(target);
      }
      return prev.slice(0, -1);
    });
  };

  const previousFolderName = folderHistory.length > 0
    ? folderById[folderHistory[folderHistory.length - 1]]?.name ?? null
    : null;

  const selectedFolderSpaceId = selectedFolder ? getFolderSpaceId(selectedFolder.id) : null;
  const selectedFolderSpaceAnchorId = selectedFolderSpaceId ? SPACE_ANCHOR_FOLDER_IDS[selectedFolderSpaceId] : null;
  const getAssetsBySpaceId = (spaceId: SpaceId | null): ArtAsset[] => {
    if (spaceId === SpaceId.Personal) return personalAssets;
    if (spaceId === SpaceId.ProjectA) return projectScopedAssets;
    if (spaceId === SpaceId.Shared) return sharedToMeAssets;
    return [];
  };
  const isSystemFolder = (folderId: string) => SYSTEM_FOLDER_IDS.has(folderId);
  const resolveCreateFolderParentId = (parentId: string | null) => {
    if (parentId) return parentId;
    return selectedFolderSpaceAnchorId ?? SPACE_ANCHOR_FOLDER_IDS[currentSpace.id];
  };
  // Generic toggle for a Set-based filter state.
  const makeSetToggle = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>) => (value: T) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };
  const toggleExternalFormatFilter = makeSetToggle(setExternalFormatFilters);
  const toggleExternalSourceFilter = makeSetToggle(setExternalSourceFilters);
  const toggleExternalTagFilter = makeSetToggle(setExternalTagFilters);
  const toggleExternalOrgFilter = makeSetToggle(setExternalOrgFilters);
  const toggleExternalStatusFilter = makeSetToggle(setExternalStatusFilters);
  const toggleExternalShapeFilter = makeSetToggle(setExternalShapeFilters);
  const toggleExternalColorFilter = makeSetToggle(setExternalColorFilters);
  const toggleExternalFileSizeBucket = makeSetToggle(setExternalFileSizeBuckets);
  const toggleExternalSizeBucket = makeSetToggle(setExternalSizeBuckets);
  const toggleExternalDurationBucket = makeSetToggle(setExternalDurationBuckets);
  const clearExternalFilters = () => {
    setExternalKeyword('');
    setActiveTypeTab('all');
    setExternalFormatKeyword('');
    setExternalFormatFilters(new Set());
    setExternalSourceFilters(new Set());
    setExternalCreatedFrom('');
    setExternalCreatedTo('');
    setExternalDatePreset('all');
    setExternalSortOrder('desc');
    setExternalAuthorFilter('');
    setExternalAuthorKeyword('');
    setExternalTagFilters(new Set());
    setExternalTagKeyword('');
    setExternalOrgFilters(new Set());
    setExternalStatusFilters(new Set());
    setExternalShapeFilters(new Set());
    setExternalColorFilters(new Set());
    setExternalFileSizeBuckets(new Set());
    setExternalSizeBuckets(new Set());
    setExternalSizeWMin(''); setExternalSizeWMax(''); setExternalSizeHMin(''); setExternalSizeHMax('');
    setExternalDurationBuckets(new Set());
  };
  const toggleInternalFormatFilter = makeSetToggle(setInternalFormatFilters);
  const toggleInternalTagFilter = makeSetToggle(setInternalTagFilters);
  const toggleInternalOrgFilter = makeSetToggle(setInternalOrgFilters);
  const toggleInternalStatusFilter = makeSetToggle(setInternalStatusFilters);
  const toggleInternalShapeFilter = makeSetToggle(setInternalShapeFilters);
  const toggleInternalColorFilter = makeSetToggle(setInternalColorFilters);
  const toggleInternalFileSizeBucket = makeSetToggle(setInternalFileSizeBuckets);
  const toggleInternalSizeBucket = makeSetToggle(setInternalSizeBuckets);
  const toggleInternalDurationBucket = makeSetToggle(setInternalDurationBuckets);
  const clearInternalFilters = () => {
    setKeyword('');
    setActiveTypeTab('all');
    setInternalFormatKeyword('');
    setInternalFormatFilters(new Set());
    setInternalCreatedFrom('');
    setInternalCreatedTo('');
    setInternalDatePreset('all');
    setInternalSortOrder('desc');
    setInternalAuthorFilter('');
    setInternalAuthorKeyword('');
    setInternalTagFilters(new Set());
    setInternalTagKeyword('');
    setInternalOrgFilters(new Set());
    setInternalStatusFilters(new Set());
    setInternalShapeFilters(new Set());
    setInternalColorFilters(new Set());
    setInternalFileSizeBuckets(new Set());
    setInternalSizeBuckets(new Set());
    setInternalSizeWMin(''); setInternalSizeWMax(''); setInternalSizeHMin(''); setInternalSizeHMax('');
    setInternalDurationBuckets(new Set());
  };

  useEffect(() => {
    if (!selectedFolderSpaceId || selectedFolderSpaceId === currentSpace.id) return;
    const nextSpace = PROJECT_SPACES.find(space => space.id === selectedFolderSpaceId);
    if (!nextSpace) return;
    setCurrentSpace(nextSpace);
  }, [selectedFolderSpaceId, currentSpace.id, setCurrentSpace]);

  const getDescendantFolderIds = (folderId: string): string[] => {
    const childFolders = foldersByParent.get(folderId) ?? [];
    return childFolders.flatMap(folder => [folder.id, ...getDescendantFolderIds(folder.id)]);
  };

  const getFolderAssetCount = (folderId: string, includeDescendants = true) => {
    const folderIds = new Set([folderId]);
    if (includeDescendants) {
      getDescendantFolderIds(folderId).forEach(id => folderIds.add(id));
    }

    const scopedAssets = getAssetsBySpaceId(getFolderSpaceId(folderId));
    return scopedAssets.filter(asset => folderIds.has(getResolvedAssetFolderId(asset))).length;
  };

  const getFolderDepth = (folderId: string) => {
    let depth = 0;
    let cursor = folderById[folderId];

    while (cursor?.parentId) {
      depth += 1;
      cursor = folderById[cursor.parentId];
    }

    return depth;
  };

  const getFolderPathLabel = (folderId: string): string => {
    const segments: string[] = [];
    const visited = new Set<string>();
    let cursor = folderById[folderId];

    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      segments.unshift(cursor.name);
      cursor = cursor.parentId ? folderById[cursor.parentId] : undefined;
    }

    return segments.join(' / ') || folderId;
  };

  const getFolderDeleteContext = (folderId: string) => {
    const targetFolder = folderById[folderId];
    if (!targetFolder) return null;

    const deletedFolderIds = new Set([targetFolder.id, ...getDescendantFolderIds(targetFolder.id)]);
    const remainingFolders = folders.filter(folder => !deletedFolderIds.has(folder.id));
    const targetSpaceId = getFolderSpaceId(targetFolder.id);
    const fallbackFolder = (targetFolder.parentId && remainingFolders.some(folder => folder.id === targetFolder.parentId))
      ? folderById[targetFolder.parentId]
      : (
        targetSpaceId
          ? remainingFolders.find(folder => folder.id === SPACE_ANCHOR_FOLDER_IDS[targetSpaceId])
          : remainingFolders.find(folder => folder.parentId === null)
      );
    const fallbackFolderId = fallbackFolder?.id;
    const fallbackFolderName = fallbackFolder?.name;
    const scopedAssets = getAssetsBySpaceId(targetSpaceId);
    const affectedAssetCount = scopedAssets.filter(asset => deletedFolderIds.has(getResolvedAssetFolderId(asset))).length;

    return {
      targetFolder,
      deletedFolderIds,
      remainingFolders,
      fallbackFolderId,
      fallbackFolderName,
      affectedAssetCount
    };
  };

  const visibleFolderIds = useMemo(() => {
    const normalizedKeyword = folderKeyword.trim().toLowerCase();
    if (!normalizedKeyword) return null;

    const matches = new Set<string>();
    folders.forEach((folder) => {
      if (!folder.name.toLowerCase().includes(normalizedKeyword)) return;

      let cursor: AssetFolder | undefined = folder;
      while (cursor) {
        matches.add(cursor.id);
        cursor = cursor.parentId ? folderById[cursor.parentId] : undefined;
      }
    });

    return matches;
  }, [folderById, folderKeyword, folders]);

  // Queue Concurrency Handler (Max 3 concurrent downloading)
  useEffect(() => {
    const downloadingCount = activeDownloads.filter(d => d.status === 'downloading').length;
    
    // If we have under 3 active, and have queued tasks, promote the first queued task
    if (downloadingCount < 3) {
      const nextQueuedIdx = activeDownloads.findIndex(d => d.status === 'queued');
      if (nextQueuedIdx !== -1) {
        const targetId = activeDownloads[nextQueuedIdx].assetId;
        
        // Promote to downloading status
        setActiveDownloads(prev => prev.map((item, idx) => {
          if (idx === nextQueuedIdx) {
            return { ...item, status: 'downloading' };
          }
          return item;
        }));

        simulateDownloadProgress(targetId);
      }
    }
  }, [activeDownloads]);

  // Download logic worker
  const simulateDownloadProgress = (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    addLog(`📥 (队列启动) 开始下载美术源文件: ${asset.name}...`, 'info');

    let prog = 0;
    const interval = setInterval(() => {
      prog += 10;
      
      setActiveDownloads(prev => {
        const exists = prev.some(d => d.assetId === assetId);
        if (!exists) {
          clearInterval(interval);
          return prev;
        }

        if (prog >= 100) {
          clearInterval(interval);
          
          // Complete download
          setDownloadedAssetIds(prevIds => {
            const nextSet = new Set(prevIds);
            nextSet.add(assetId);
            return nextSet;
          });

          // Subtract disk size (convert MB to GB)
          const fileGB = asset.sizeMB / 1024;
          setSimulatedDiskGB(d => Math.max(0.1, d - fileGB));

          addLog(`✅ 素材 ${asset.name} 下载完毕！本地安全隔离包定位完成。`, 'success');

          // Check if we need to auto trigger DCC import after this download (Path B override)
          const currentTask = prev.find(d => d.assetId === assetId);
          if (currentTask?.targetDccImportAfterDownload) {
            const dccTarget = currentTask.targetDccImportAfterDownload;
            // Delay slightly to look realistic
            setTimeout(() => {
              triggerDirectImport(asset, dccTarget);
            }, 600);
          }

          // Clean up this task
          return prev.filter(d => d.assetId !== assetId);
        } else {
          return prev.map(d => {
            if (d.assetId === assetId) {
              return { ...d, progress: prog };
            }
            return d;
          });
        }
      });
    }, 200);
  };

  // Trigger Local Download Action - F9 Path A
  const handleLocalDownload = (asset: ArtAsset) => {
    if (downloadedAssetIds.has(asset.id)) {
      addLog(`📁 打开本地资源目录，定位文件夹: C:\\Program Files\\ArtPlatform\\downloads\\${asset.id}`, 'info');
      alert(`[定位文件夹]\n已在 Windows 资源管理器中高亮定位到素材目录:\nC:\\Program Files\\ArtPlatform\\downloads\\${asset.id}\\${asset.name}.${asset.format.toLowerCase()}`);
      return;
    }

    // Disk space check
    const requiredGB = asset.sizeMB / 1024;
    if (simulatedDiskGB < requiredGB) {
      addLog(`❌ 下载空间受阻：可用空间不足。下载大小为 ${asset.sizeMB} MB，当前剩余 ${simulatedDiskGB.toFixed(2)} GB。`, 'error');
      alert(`[暂无下载配额]\n无法开始素材下载：硬盘 D: 磁盘空间已达到阻断阀值。\n\n素材所需空间: ${asset.sizeMB} MB (${requiredGB.toFixed(2)} GB)\n当前尚有可用: ${simulatedDiskGB.toFixed(2)} GB\n\n请在“设置”页清理历史临时分发文件，或扩展虚拟模拟配置。`);
      return;
    }

    // Check if copy task is already active
    if (activeDownloads.some(d => d.assetId === asset.id)) {
      return;
    }

    // Push into active tasks
    const downloadingCount = activeDownloads.filter(d => d.status === 'downloading').length;
    const initialStatus = downloadingCount < 3 ? 'downloading' : 'queued';

    setActiveDownloads(prev => [...prev, {
      assetId: asset.id,
      progress: 0,
      status: initialStatus
    }]);

    if (initialStatus === 'queued') {
      addLog(`⏳ (下载队满) 队列负荷中，素材 ${asset.name} 已安全置入第 ${activeDownloads.length - downloadingCount + 1} 位缓冲等候列中...`, 'warning');
    } else {
      simulateDownloadProgress(asset.id);
    }
  };

  // Check compatibility Matrix for Import DCC - F9 Path B
  const checkCompatibility = (format: string, appId: AppId): { compatible: boolean; reason?: string } => {
    const fmt = format.toLowerCase();
    
    // ComfyUI (PNG, JPG, MP4, MOV, Sequence)
    if (appId === AppId.ComfyUI) {
      const allowed = ['png', 'jpg', 'jpeg', 'mp4', 'mov'];
      if (allowed.includes(fmt)) return { compatible: true };
      return { compatible: false, reason: 'ComfyUI 仅支持JPG/PNG图像及MP4/MOV视频输入加载' };
    }

    // Photoshop (PNG, JPG)
    if (appId === AppId.Photoshop) {
      const allowed = ['png', 'jpg', 'jpeg'];
      if (allowed.includes(fmt)) return { compatible: true };
      return { compatible: false, reason: 'Photoshop 仅支持 JPG 和 PNG 经典平面栅格格式置入' };
    }

    // Blender (FBX, OBJ, blend) + flat images (PNG, JPG) for Reference Plane
    if (appId === AppId.Blender) {
      const allowedModels = ['fbx', 'obj', 'blend'];
      const allowedImages = ['png', 'jpg', 'jpeg'];
      if (allowedModels.includes(fmt)) return { compatible: true };
      if (allowedImages.includes(fmt)) return { compatible: true }; // for flat image reference planes
      return { compatible: false, reason: 'Blender 无法理解 .ma、.mb 或 .max 专有DCC场景网格' };
    }

    // Maya (FBX, OBJ, ma, mb) + flat images for Image Plane
    if (appId === AppId.Maya) {
      const allowedModels = ['fbx', 'obj', 'ma', 'mb'];
      const allowedImages = ['png', 'jpg', 'jpeg'];
      if (allowedModels.includes(fmt)) return { compatible: true };
      if (allowedImages.includes(fmt)) return { compatible: true };
      return { compatible: false, reason: 'Maya 面板不接收 .blend 及 .max 格式，请预先执行转换' };
    }

    // 3ds Max (FBX, OBJ, max) + flat images for Viewport Background
    if (appId === AppId.Max3ds) {
      const allowedModels = ['fbx', 'obj', 'max'];
      const allowedImages = ['png', 'jpg', 'jpeg'];
      if (allowedModels.includes(fmt)) return { compatible: true };
      if (allowedImages.includes(fmt)) return { compatible: true };
      return { compatible: false, reason: '3ds Max 架构下不支持 .ma / .mb、.blend，导入中止' };
    }

    return { compatible: false, reason: '非法或者并不兼容格式格式' };
  };

  // Get matching UI labels for compatibility import methods
  const getImportActionLabel = (format: string, appId: AppId): string => {
    const fmt = format.toLowerCase();
    const isImg = ['png', 'jpg', 'jpeg'].includes(fmt);

    if (appId === AppId.ComfyUI) {
      return isImg ? '投射至输入图像节点' : '投射至视频加载器';
    }
    if (appId === AppId.Photoshop) {
      return '导入 (热图层置入) 可选';
    }
    if (appId === AppId.Blender) {
      return isImg ? '置入为视图参考面' : '加载或追加三维网格 可选';
    }
    if (appId === AppId.Maya) {
      return isImg ? '置入为正视图像平面' : '导入当前 Dagger 层 可选';
    }
    if (appId === AppId.Max3ds) {
      return isImg ? '置入为物理视口背景' : '追加加载合并三维场景 可选';
    }
    return '直接流式置入';
  };

  // Click on Import DCC Button
  const handleImportDccTrigger = (asset: ArtAsset, appId: AppId) => {
    // 1. Is DCC connected?
    const dcc = apps.find(a => a.id === appId);
    if (!dcc || dcc.status !== AppStatus.Connected) {
      alert(`[一键导入失败]\nDCC 软件 【${appId.toUpperCase()}】 尚未连接。\n\n请在边栏左下方切至“应用管理”页面，检查版本匹配并点击【启动软件】，等候端口通讯响应变更为“已连接”后再执行导入。`);
      return;
    }

    // 2. Is material downloaded?
    const downloaded = downloadedAssetIds.has(asset.id);
    if (!downloaded) {
      // PRD: If not downloaded, auto download first then run import!
      addLog(`📥 触发一键导入: 检测到本地文件暂欠缺。 launcher 将先行自动拉取下载...`, 'warning');
      
      // Auto queue download, setting custom hook for import trigger on complete!
      const requiredGB = asset.sizeMB / 1024;
      if (simulatedDiskGB < requiredGB) {
        addLog(`❌ 存储限制：一键导入下载缓存失败。`, 'error');
        alert(`一键导入遭到磁盘限制阻断，空间需要 ${asset.sizeMB} MB，当前磁盘不足。`);
        return;
      }

      // Add to active download queue with target app override hook!
      const downloadingCount = activeDownloads.filter(d => d.status === 'downloading').length;
      const initialStatus = downloadingCount < 3 ? 'downloading' : 'queued';

      setActiveDownloads(prev => [...prev, {
        assetId: asset.id,
        progress: 0,
        status: initialStatus,
        targetDccImportAfterDownload: appId
      }]);

      if (initialStatus === 'queued') {
        addLog(`⏳ ${asset.name} 离线拉取队列排队中，素材下载完后将立刻自动推送至 ${dcc.name}...`, 'warning');
      } else {
        simulateDownloadProgress(asset.id);
      }
      return;
    }

    // 3. Asset is already downloaded, directly proceed
    triggerDirectImport(asset, appId);
  };

  const triggerDirectImport = (asset: ArtAsset, appId: AppId) => {
    const isOptional = ['photoshop', 'blender', 'maya', 'max3ds'].includes(appId) && 
      !['png', 'jpg', 'jpeg'].includes(asset.format.toLowerCase()); // Flat images behave normally, models are "可选"

    const isImgPs = appId === AppId.Photoshop; // Images to PS are also "可选" enligt matrix

    if (isOptional || isImgPs) {
      // Pop up import choice dialog
      setImportOptionsConfig({ asset, dccId: appId });
      
      // Seed default option
      if (appId === AppId.Photoshop) {
        setSelectedImportMode('layer');
      } else if (appId === AppId.Blender) {
        setSelectedImportMode('append');
      } else if (appId === AppId.Maya) {
        setSelectedImportMode('importScene');
      } else if (appId === AppId.Max3ds) {
        setSelectedImportMode('merge');
      }
    } else {
      // Immediate non-optional import execution
      showImportSuccessNotification(asset, appId, 'default');
    }
  };

  const showImportSuccessNotification = (asset: ArtAsset, appId: AppId, mode: string) => {
    const dcc = apps.find(a => a.id === appId);
    let modeText = 'API数据直达';
    if (mode === 'layer') modeText = '智能多重蒙版图层置入';
    if (mode === 'artboard') modeText = '新建汉代UI独立画板排布';
    if (mode === 'append') modeText = '网格树几何追加';
    if (mode === 'link') modeText = '场景外部网格关联引用';
    if (mode === 'importScene') modeText = '导入激活的 Dagger 大纲坐标组中';
    if (mode === 'newScene') modeText = '强制覆盖新建原始DCC大场景';
    if (mode === 'merge') modeText = '追加融合至选中多边形顶点';

    addLog(`🚀 [一键热导入] ${asset.name} 格式为.${asset.format} 已通过专属IT通道，以【${modeText}】模式向 ${dcc?.name} 进程发送热推送！已确认在建模/绘图视窗内实例化就绪。`, 'success');
    alert(`[DCC 一键热导入成功]\n\n素材: ${asset.name}\n已投送至: ${dcc?.name}\n投送模式: ${modeText}\n\n可在DCC的当前激活面板或编辑器大纲视图(Outliner)中直接进行细节调整。`);
  };

  // Close Optional Dialog and complete
  const submitOptionalImport = () => {
    if (!importOptionsConfig) return;
    showImportSuccessNotification(importOptionsConfig.asset, importOptionsConfig.dccId, selectedImportMode);
    setImportOptionsConfig(null);
  };

  // Clear specific download task in queue
  const cancelActiveDownload = (id: string) => {
    setActiveDownloads(prev => prev.filter(d => d.assetId !== id));
    addLog(`⚠️ 已从后台下载排队中移除该素材缓存下载操作。`, 'warning');
  };

  const closeFolderEditor = () => {
    setFolderEditor(null);
    setIsFolderEditorSubmitAttempted(false);
  };

  const openCreateFolderEditor = (parentId: string | null) => {
    const nextParentId = resolveCreateFolderParentId(parentId);
    setFolderContextMenu(null);
    setIsFolderEditorSubmitAttempted(false);
    // Expand the target parent so its inline create-input row (rendered as the last child) is visible.
    if (nextParentId) {
      setExpandedFolderIds(prev => new Set(prev).add(nextParentId));
    }
    setFolderEditor({
      mode: 'create',
      parentId: nextParentId,
      name: ''
    });
  };

  const openRenameFolderEditor = (folderId = selectedFolderId) => {
    const folder = folderById[folderId];
    if (!folder || isSystemFolder(folder.id)) return;

    setFolderContextMenu(null);
    setSelectedFolderId(folder.id);
    setIsFolderEditorSubmitAttempted(false);
    setFolderEditor({
      mode: 'rename',
      parentId: folder.parentId,
      folderId: folder.id,
      name: folder.name
    });
  };

  const submitFolderEditor = () => {
    if (!folderEditor) return;

    setIsFolderEditorSubmitAttempted(true);
    const error = validateFolderName(folderEditor.name, folderEditor);
    if (error) {
      addLog(`❌ 文件夹操作被拦截：${error}`, 'error', { toast: false });
      return;
    }

    const folderName = folderEditor.name.trim();

    if (folderEditor.mode === 'create') {
      const targetSpaceId = folderEditor.parentId ? getFolderSpaceId(folderEditor.parentId) : currentSpace.id;
      const newFolderSpaceId = targetSpaceId ?? currentSpace.id;
      const newFolder: AssetFolder = {
        id: buildScopedFolderId(newFolderSpaceId, `folder-${Date.now()}`),
        name: folderName,
        parentId: folderEditor.parentId ?? SPACE_ANCHOR_FOLDER_IDS[newFolderSpaceId]
      };

      setFolders(prev => [...prev, newFolder]);
      setSelectedFolderId(newFolder.id);
      if (folderEditor.parentId) {
        setExpandedFolderIds(prev => new Set(prev).add(folderEditor.parentId));
      }
      addLog(`📁 已新建素材文件夹: ${folderName}`, 'success');
    } else if (folderEditor.folderId) {
      const originalName = folderById[folderEditor.folderId]?.name ?? '未命名文件夹';
      setFolders(prev => prev.map(folder => (
        folder.id === folderEditor.folderId ? { ...folder, name: folderName } : folder
      )));
      addLog(`✏️ 文件夹已重命名: ${originalName} → ${folderName}`, 'success');
    }

    closeFolderEditor();
  };

  const openDeleteFolderConfirm = (folderId = selectedFolderId) => {
    if (isSystemFolder(folderId)) return;
    setFolderContextMenu(null);
    const context = getFolderDeleteContext(folderId);
    if (!context) return;

    setPendingFolderDelete({
      folderId,
      folderName: context.targetFolder.name,
      childFolderCount: context.deletedFolderIds.size - 1,
      affectedAssetCount: context.affectedAssetCount,
      fallbackFolderId: context.fallbackFolderId,
      fallbackFolderName: context.fallbackFolderName
    });
  };

  const confirmDeleteFolder = () => {
    if (!pendingFolderDelete) return;

    const context = getFolderDeleteContext(pendingFolderDelete.folderId);
    if (!context) {
      setPendingFolderDelete(null);
      return;
    }

    const {
      targetFolder,
      deletedFolderIds,
      remainingFolders,
      fallbackFolderId
    } = context;

    setFolders(remainingFolders);
    setFolderAssignments(prev => {
      const next = { ...prev };
      Object.entries(next).forEach(([assetId, folderId]) => {
        if (!deletedFolderIds.has(folderId)) return;
        if (fallbackFolderId) {
          next[assetId] = fallbackFolderId;
        } else {
          delete next[assetId];
        }
      });
      return next;
    });
    if (fallbackFolderId) {
      setSelectedFolderId(fallbackFolderId);
    }
    setPendingFolderDelete(null);
    addLog(
      `🗑️ 已删除素材文件夹: ${targetFolder.name}，${fallbackFolderId ? '相关素材已移动到上级目录。' : '文件夹目录已清空。'}`,
      'warning'
    );
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const openFolderContextMenu = (event: React.MouseEvent, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setAssetContextMenu(null);
    // Right-click only opens the menu; it must not select/enter the folder.
    setFolderContextMenu({
      folderId,
      x: event.clientX,
      y: event.clientY
    });
  };

  const openAssetContextMenu = (event: React.MouseEvent, assetId: string) => {
    if (!isPersonalSpace && !isProjectA) return;
    event.preventDefault();
    event.stopPropagation();
    const x = event.clientX;
    const y = event.clientY;
    const menuWidth = 176;
    const viewportPadding = 8;
    const clampedX = Math.max(viewportPadding, Math.min(x, window.innerWidth - menuWidth - viewportPadding));
    const clampedY = Math.max(viewportPadding, Math.min(y, window.innerHeight - viewportPadding - 40));
    setFolderContextMenu(null);
    setAssetContextMenu({
      assetId,
      x: clampedX,
      y: clampedY
    });
  };

  const openAssetMoreMenu = (event: React.MouseEvent<HTMLButtonElement>, assetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    openAssetContextMenu(event, assetId);
  };

  const openPersonalAssetDeleteConfirm = (assetId: string) => {
    const targetAsset = activeAssets.find(asset => asset.id === assetId);
    if (!targetAsset) return;
    setAssetContextMenu(null);
    setPendingPersonalAssetDelete({
      assetId: targetAsset.id,
      assetName: targetAsset.name
    });
  };

  const openPersonalAssetMoveEditor = (assetId: string) => {
    const targetAsset = activeAssets.find(asset => asset.id === assetId);
    if (!targetAsset) return;
    setAssetContextMenu(null);
    setPersonalAssetMoveEditor({
      assetId: targetAsset.id,
      targetFolderId: getResolvedAssetFolderId(targetAsset)
    });
  };

  const submitPersonalAssetMove = () => {
    if (!personalAssetMoveEditor) return;

    const targetAsset = activeAssets.find(asset => asset.id === personalAssetMoveEditor.assetId);
    if (!targetAsset) {
      setPersonalAssetMoveEditor(null);
      return;
    }

    const targetFolder = folderById[personalAssetMoveEditor.targetFolderId];
    if (!targetFolder) {
      addLog('❌ 移动失败：目标文件夹不存在。', 'error');
      return;
    }

    const originalFolderId = getResolvedAssetFolderId(targetAsset);
    if (originalFolderId === targetFolder.id) {
      setPersonalAssetMoveEditor(null);
      return;
    }

    setFolderAssignments(prev => ({
      ...prev,
      [targetAsset.id]: targetFolder.id
    }));
    setPersonalAssetMoveEditor(null);
    addLog(
      `📦 已移动素材: ${targetAsset.name}（${folderById[originalFolderId]?.name ?? '未分类'} → ${targetFolder.name}）`,
      'success'
    );
  };

  const closePersonalAssetRenameEditor = () => {
    setPersonalAssetRenameEditor(null);
    setIsPersonalAssetRenameSubmitAttempted(false);
  };

  const applyAssetRename = (assetId: string, rawName: string) => {
    const targetAsset = activeAssets.find(asset => asset.id === assetId);
    if (!targetAsset) return { ok: false as const };

    const validationError = validatePersonalAssetName(rawName, targetAsset.id, activeAssets);
    if (validationError) {
      addLog(`❌ 素材重命名失败：${validationError}`, 'error', { toast: false });
      return { ok: false as const, nextName: targetAsset.name };
    }

    const nextName = rawName.trim();
    if (nextName === targetAsset.name) {
      return { ok: true as const, nextName };
    }

    if (isPersonalSpace) {
      setPersonalAssets(prev => prev.map(asset => (
        asset.id === targetAsset.id
          ? { ...asset, name: nextName }
          : asset
      )));
    } else {
      const baseName = assets.find(asset => asset.id === targetAsset.id)?.name;
      setProjectAssetNameOverrides(prev => {
        const next = { ...prev };
        if (baseName && nextName === baseName) {
          delete next[targetAsset.id];
        } else {
          next[targetAsset.id] = nextName;
        }
        return next;
      });
    }
    setSelectedAsset(prev => (
      prev?.id === targetAsset.id
        ? { ...prev, name: nextName }
        : prev
    ));
    addLog(`✏️ 素材已重命名: ${targetAsset.name} → ${nextName}`, 'success');

    return { ok: true as const, nextName };
  };

  const submitAssetDetailNameEdit = () => {
    if (!selectedAsset) return;

    const result = applyAssetRename(selectedAsset.id, assetDetailNameDraft);
    if (!result.ok) {
      setAssetDetailNameDraft(selectedAsset.name);
      return;
    }
    setAssetDetailNameDraft(result.nextName);
  };

  const openPersonalAssetRenameEditor = (assetId: string) => {
    const targetAsset = activeAssets.find(asset => asset.id === assetId);
    if (!targetAsset) return;
    setAssetContextMenu(null);
    setIsPersonalAssetRenameSubmitAttempted(false);
    setPersonalAssetRenameEditor({
      assetId: targetAsset.id,
      name: targetAsset.name
    });
  };

  const submitPersonalAssetRename = () => {
    if (!personalAssetRenameEditor) return;
    setIsPersonalAssetRenameSubmitAttempted(true);

    const result = applyAssetRename(personalAssetRenameEditor.assetId, personalAssetRenameEditor.name);
    if (!result.ok) return;
    closePersonalAssetRenameEditor();
  };

  const getPersonalAssetShareUrl = (asset: ArtAsset) => (
    isPersonalSpace
      ? `${window.location.origin}/personal-space/assets/${asset.id}`
      : `${window.location.origin}/project-space/${currentSpace.id}/assets/${asset.id}`
  );

  const handleSharePersonalAsset = async (asset: ArtAsset) => {
    if (!isPersonalSpace) return;

    setAssetContextMenu(null);
    const shareUrl = getPersonalAssetShareUrl(asset);

    const supportsNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    if (supportsNativeShare) {
      try {
        await navigator.share({
          title: asset.name,
          text: `分享素材：${asset.name}`,
          url: shareUrl
        });
        addLog(`📤 已触发系统分享: ${asset.name}`, 'success');
        return;
      } catch {
        // If the user cancels sharing, we simply keep the current state.
      }
    }

    window.alert(`[分享链接]\n${shareUrl}`);
    addLog(`📤 已生成分享链接: ${asset.name}`, 'info');
  };

  // 个人空间文件夹分享：与个人素材分享一致，走系统分享 / 链接兜底。
  const handleSharePersonalFolder = async (folder: AssetFolder) => {
    if (!isPersonalSpace) return;

    setFolderContextMenu(null);
    const shareUrl = `${window.location.origin}/personal-space/folders/${folder.id}`;

    const supportsNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    if (supportsNativeShare) {
      try {
        await navigator.share({
          title: folder.name,
          text: `分享文件夹：${folder.name}`,
          url: shareUrl
        });
        addLog(`📤 已触发系统分享: ${folder.name}`, 'success');
        return;
      } catch {
        // 用户取消分享时保持现状。
      }
    }

    window.alert(`[分享链接]\n${shareUrl}`);
    addLog(`📤 已生成文件夹分享链接: ${folder.name}`, 'info');
  };

  const handleCopyPersonalAssetLink = async (asset: ArtAsset) => {
    if (!isPersonalSpace && !isProjectA) return;

    const shareUrl = getPersonalAssetShareUrl(asset);

    try {
      await navigator.clipboard.writeText(shareUrl);
      addLog(`🔗 已复制链接: ${asset.name}`, 'success');
    } catch {
      window.alert(`[复制失败，请手动复制]\n${shareUrl}`);
      addLog(`🔗 已提供可复制链接: ${asset.name}`, 'info');
    }
  };

  // --- 项目空间分享（管理员）：素材 + 文件夹 ---------------------------
  const resetShareModalFields = () => {
    setShareScope('user');
    setShareUserQuery('');
    setShareSelectedUsers([]);
    setShareSelectedGroup(SpaceId.ProjectA);
    setShareError('');
  };
  const openShareModal = (asset: ArtAsset) => {
    setAssetContextMenu(null);
    resetShareModalFields();
    setShareModalTarget({ kind: 'asset', id: asset.id, name: asset.name, format: asset.format, thumbnail: asset.thumbnail });
  };
  const openFolderShareModal = (folder: AssetFolder) => {
    setFolderContextMenu(null);
    resetShareModalFields();
    setShareModalTarget({ kind: 'folder', id: folder.id, name: folder.name });
  };

  const closeShareModal = () => {
    setShareModalTarget(null);
    setShareError('');
  };

  // Platform users matching the fuzzy query (name or email), excluding the current user.
  const shareUserMatches = useMemo(() => {
    const query = shareUserQuery.trim().toLowerCase();
    const picked = new Set(shareSelectedUsers.map(u => u.email.toLowerCase()));
    const pool = PLATFORM_USERS.filter(u => (
      u.email.toLowerCase() !== CURRENT_USER_EMAIL.toLowerCase() && !picked.has(u.email.toLowerCase())
    ));
    if (!query) return pool.slice(0, 8);
    return pool.filter(u => (
      u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
    )).slice(0, 8);
  }, [shareUserQuery, shareSelectedUsers]);

  // Users who already have access to the modal's target (shares + current project members).
  const shareExistingGrantees = useMemo(() => {
    if (!shareModalTarget) return [] as Array<{ name: string; email: string; source: string }>;
    const seen = new Map<string, { name: string; email: string; source: string }>();
    assetShares
      .filter(g => g.assetId === shareModalTarget.id)
      .forEach(g => seen.set(g.granteeEmail.toLowerCase(), { name: g.granteeName, email: g.granteeEmail, source: g.via ? `${g.via}·分享` : '已分享' }));
    (readProjectMembers()[SpaceId.ProjectA] ?? []).forEach(m => {
      const key = m.email.toLowerCase();
      if (!seen.has(key)) seen.set(key, { name: m.name, email: m.email, source: '项目组成员' });
    });
    return Array.from(seen.values());
  }, [shareModalTarget, assetShares]);

  const projectGroupOptions = useMemo(() => (
    PROJECT_SPACES.filter(s => s.id === SpaceId.ProjectA || s.id === SpaceId.ProjectB)
  ), []);

  const confirmShare = () => {
    if (!shareModalTarget) return;
    const target = shareModalTarget;
    const targetLabel = target.kind === 'folder' ? '目录' : '素材';
    const now = new Date().toISOString();

    if (shareScope === 'user') {
      // Collect targets: all chip-selected users, plus a trailing typed exact match if any.
      const targets: PlatformUser[] = [...shareSelectedUsers];
      const query = shareUserQuery.trim();
      if (query) {
        const typed = PLATFORM_USERS.find(u => (
          u.email.toLowerCase() === query.toLowerCase() || u.name === query
        ));
        if (!typed) {
          if (EMAIL_PATTERN.test(query)) {
            setShareError(`账号校验失败：「${query}」不是平台用户，无法分享。`);
          } else {
            setShareError('请从下拉中选择有效的平台用户（支持姓名/邮箱模糊匹配）。');
          }
          return;
        }
        if (!targets.some(t => t.email.toLowerCase() === typed.email.toLowerCase())) {
          targets.push(typed);
        }
      }
      if (targets.length === 0) {
        setShareError('请至少添加 1 位协作者（支持姓名/邮箱模糊匹配）。');
        return;
      }
      if (targets.length > SHARE_MAX_USERS) {
        setShareError(`单次最多同时添加 ${SHARE_MAX_USERS} 人，当前已选 ${targets.length} 人。`);
        return;
      }
      const fresh = targets.filter(t => (
        !assetShares.some(g => g.assetId === target.id && g.granteeEmail.toLowerCase() === t.email.toLowerCase())
      ));
      if (fresh.length === 0) {
        setShareError(`所选协作者均已拥有该${targetLabel}权限，请勿重复分享。`);
        return;
      }
      setAssetShares(prev => [...prev, ...fresh.map(t => ({
        assetId: target.id,
        granteeEmail: t.email,
        granteeName: t.name,
        role: 'viewer' as const,
        sharedAt: now
      }))]);
      const skipped = targets.length - fresh.length;
      addLog(`📤 已将${targetLabel}【${target.name}】分享给 ${fresh.length} 位协作者，授权：使用者。${skipped > 0 ? `（${skipped} 人已有权限，已跳过）` : ''}`, 'success');
      closeShareModal();
      return;
    }

    // group scope: grant to every member of the selected project group (skip duplicates).
    const group = projectGroupOptions.find(g => g.id === shareSelectedGroup);
    const members = readProjectMembers()[shareSelectedGroup] ?? [];
    if (members.length === 0) {
      setShareError('该项目组暂无成员，无法分享。');
      return;
    }
    const fresh = members.filter(m => (
      !assetShares.some(g => g.assetId === target.id && g.granteeEmail.toLowerCase() === m.email.toLowerCase())
    ));
    if (fresh.length === 0) {
      setShareError(`该项目组成员均已拥有该${targetLabel}权限。`);
      return;
    }
    setAssetShares(prev => [...prev, ...fresh.map(m => ({
      assetId: target.id,
      granteeEmail: m.email,
      granteeName: m.name,
      role: 'viewer' as const,
      sharedAt: now,
      via: group?.name
    }))]);
    addLog(`📤 已将${targetLabel}【${target.name}】分享给项目组「${group?.name}」的 ${fresh.length} 名成员，授权：使用者。`, 'success');
    closeShareModal();
  };

  // --- 查看权限（素材/文件夹）------------------------------------------
  const openPermissionView = (kind: 'asset' | 'folder', id: string, name: string) => {
    setAssetContextMenu(null);
    setFolderContextMenu(null);
    setPermissionViewTab('members');
    setPermissionViewTarget({ kind, id, name });
  };
  const closePermissionView = () => setPermissionViewTarget(null);

  // 移除权限二次确认：member=移除单个分享授权；group=移除某分享项目组（该组全部成员的分享授权）
  const requestRemoveMemberGrant = (email: string, name: string) => {
    if (!permissionViewTarget) return;
    setPendingPermissionRemoval({ scope: 'member', targetId: permissionViewTarget.id, email, name });
  };
  const requestRemoveGroupGrant = (groupName: string) => {
    if (!permissionViewTarget) return;
    setPendingPermissionRemoval({ scope: 'group', targetId: permissionViewTarget.id, groupName, name: groupName });
  };
  const confirmPermissionRemoval = () => {
    const req = pendingPermissionRemoval;
    if (!req) return;
    const targetLabel = permissionViewTarget?.kind === 'folder' ? '目录' : '素材';
    if (req.scope === 'member') {
      setAssetShares(prev => prev.filter(g => !(g.assetId === req.targetId && g.granteeEmail.toLowerCase() === (req.email ?? '').toLowerCase())));
      addLog(`🛑 已移除【${req.name}】对该${targetLabel}的访问权限，授权立即失效。`, 'warning');
    } else {
      setAssetShares(prev => prev.filter(g => !(g.assetId === req.targetId && g.via === req.groupName)));
      addLog(`🛑 已取消项目组「${req.groupName}」对该${targetLabel}的共享，相关成员授权立即失效。`, 'warning');
    }
    setPendingPermissionRemoval(null);
  };

  const handleCopyFolderLink = async (folder: AssetFolder) => {
    const url = `${window.location.origin}/project-space/${currentSpace.id}/folders/${folder.id}`;
    setFolderContextMenu(null);
    try {
      await navigator.clipboard.writeText(url);
      addLog(`🔗 已复制目录链接: ${folder.name}`, 'success');
    } catch {
      window.alert(`[复制失败，请手动复制]\n${url}`);
      addLog(`🔗 已提供可复制目录链接: ${folder.name}`, 'info');
    }
  };

  // 查看权限弹窗的可访问成员清单：项目组成员（实时）+ 分享授权（可移除），按邮箱去重（成员优先）。
  const permissionGrantees = useMemo(() => {
    if (!permissionViewTarget) return [] as Array<{ name: string; email: string; role: string; removable: boolean }>;
    const list: Array<{ name: string; email: string; role: string; removable: boolean }> = [];
    const seen = new Set<string>();
    (readProjectMembers()[SpaceId.ProjectA] ?? []).forEach(m => {
      const key = m.email.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ name: m.name, email: m.email, role: m.role === 'admin' ? '管理员' : '项目成员', removable: false });
    });
    assetShares.filter(g => g.assetId === permissionViewTarget.id).forEach(g => {
      const key = g.granteeEmail.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ name: g.granteeName, email: g.granteeEmail, role: '使用者', removable: true });
    });
    return list;
  }, [permissionViewTarget, assetShares]);

  // 查看权限弹窗的项目组清单：当前所属项目组 + 通过分享授权带来的项目组（via），去重。
  const permissionGroups = useMemo(() => {
    if (!permissionViewTarget) return [] as Array<{ id: string; name: string; memberCount: number; source: string; removable: boolean }>;
    const members = readProjectMembers();
    const list: Array<{ id: string; name: string; memberCount: number; source: string; removable: boolean }> = [];
    const seen = new Set<string>();
    // 当前所属项目组（素材/文件夹本身所在的项目组）—— 不可移除
    const ownGroup = PROJECT_SPACES.find(s => s.id === currentSpace.id);
    if (ownGroup) {
      seen.add(ownGroup.id);
      list.push({ id: ownGroup.id, name: ownGroup.name, memberCount: (members[ownGroup.id] ?? []).length, source: '所属项目组', removable: false });
    }
    // 通过「按项目组分享」带来的其它项目组 —— 可移除
    assetShares.filter(g => g.assetId === permissionViewTarget.id && g.via).forEach(g => {
      const grp = PROJECT_SPACES.find(s => s.name === g.via);
      if (!grp || seen.has(grp.id)) return;
      seen.add(grp.id);
      list.push({ id: grp.id, name: grp.name, memberCount: (members[grp.id] ?? []).length, source: '分享共享', removable: true });
    });
    return list;
  }, [permissionViewTarget, assetShares, currentSpace.id]);

  const confirmPersonalAssetDelete = () => {
    if (!pendingPersonalAssetDelete) return;

    const targetAsset = activeAssets.find(asset => asset.id === pendingPersonalAssetDelete.assetId);
    if (!targetAsset) {
      setPendingPersonalAssetDelete(null);
      return;
    }

    if (isPersonalSpace) {
      setPersonalAssets(prev => prev.filter(asset => asset.id !== targetAsset.id));
    } else {
      setProjectRemovedAssetIds(prev => {
        const next = new Set(prev);
        next.add(targetAsset.id);
        return next;
      });
      setProjectAssetNameOverrides(prev => {
        if (!(targetAsset.id in prev)) return prev;
        const next = { ...prev };
        delete next[targetAsset.id];
        return next;
      });
    }
    setFolderAssignments(prev => {
      const next = { ...prev };
      delete next[targetAsset.id];
      return next;
    });
    setDownloadedAssetIds(prev => {
      const next = new Set(prev);
      next.delete(targetAsset.id);
      return next;
    });
    setActiveDownloads(prev => prev.filter(task => task.assetId !== targetAsset.id));
    if (selectedAsset?.id === targetAsset.id) {
      setSelectedAsset(null);
    }
    if (targetAsset.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(targetAsset.previewUrl);
    }

    setPendingPersonalAssetDelete(null);
    setPersonalAssetMoveEditor(prev => (prev?.assetId === targetAsset.id ? null : prev));
    setPersonalAssetRenameEditor(prev => (prev?.assetId === targetAsset.id ? null : prev));
    addLog(`🗑️ 已删除素材: ${targetAsset.name}`, 'warning');
  };

  // --- 批量操作 -------------------------------------------------------
  const enterBatchMode = () => {
    setBatchSelectedIds(new Set());
    setSelectedAsset(null);
    setAssetContextMenu(null);
    setIsBatchMode(true);
  };
  const exitBatchMode = () => {
    setIsBatchMode(false);
    setBatchSelectedIds(new Set());
    setPendingBatchDelete(false);
    setBatchDeleteProgress(null);
  };
  const toggleBatchSelect = (assetId: string) => {
    setBatchSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  // Remove a single asset by id (shared by single + batch delete). Returns true on success.
  const removeAssetById = (assetId: string): boolean => {
    const target = activeAssets.find(asset => asset.id === assetId);
    if (!target) return false;
    if (isPersonalSpace) {
      setPersonalAssets(prev => prev.filter(asset => asset.id !== assetId));
    } else {
      setProjectRemovedAssetIds(prev => {
        const next = new Set(prev);
        next.add(assetId);
        return next;
      });
      setProjectAssetNameOverrides(prev => {
        if (!(assetId in prev)) return prev;
        const next = { ...prev };
        delete next[assetId];
        return next;
      });
    }
    setFolderAssignments(prev => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
    setDownloadedAssetIds(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
    setActiveDownloads(prev => prev.filter(task => task.assetId !== assetId));
    if (target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    return true;
  };

  // Execute batch delete: progress → 三态反馈（全成功/部分失败/全失败）→ 自动退出。
  const runBatchDelete = async () => {
    const ids = Array.from(batchSelectedIds);
    if (ids.length === 0) return;
    setPendingBatchDelete(false);
    setBatchDeleteProgress({ done: 0, total: ids.length });

    let success = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i += 1) {
      // 演示用：默认全部成功（removeAssetById 仅在素材不存在时返回 false）。
      const ok = removeAssetById(ids[i]);
      if (ok) success += 1; else failed += 1;
      // small async tick so the progress bar is visible
      await new Promise(resolve => setTimeout(resolve, 120));
      setBatchDeleteProgress({ done: i + 1, total: ids.length });
    }

    if (selectedAsset && batchSelectedIds.has(selectedAsset.id)) setSelectedAsset(null);

    if (failed === 0) {
      addLog(`🗑️ 批量删除完成：成功删除 ${success} 个素材。`, 'success');
    } else if (success === 0) {
      addLog(`❌ 批量删除失败：${failed} 个素材均未能删除，请重试。`, 'error');
    } else {
      addLog(`⚠️ 批量删除部分完成：成功 ${success} 个，失败 ${failed} 个。`, 'warning');
    }
    exitBatchMode();
  };

  const startFolderPaneResize = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktopLayout) return;

    const containerRect = assetLayoutRef.current?.getBoundingClientRect();
    if (containerRect) {
      const rawWidth = event.clientX - containerRect.left;
      const maxWidthByContainer = Math.max(MIN_FOLDER_PANE_WIDTH, containerRect.width - 360);
      const constrainedWidth = Math.min(rawWidth, maxWidthByContainer);
      setFolderPaneWidth(clampFolderPaneWidth(constrainedWidth));
    }

    event.preventDefault();
    setIsResizingFolderPane(true);
  };

  const directChildFolders = selectedFolder ? (foldersByParent.get(selectedFolder.id) ?? []) : [];
  const scopedFolderIds = new Set<string>(
    selectedFolder
      ? [selectedFolder.id, ...(includeSubfolderAssets ? getDescendantFolderIds(selectedFolder.id) : [])]
      : []
  );

  const folderEditorValidationError = folderEditor ? validateFolderName(folderEditor.name, folderEditor) : '';
  const shouldShowFolderEditorError = isFolderEditorSubmitAttempted && !!folderEditorValidationError;
  const personalAssetRenameValidationError = personalAssetRenameEditor
    ? validatePersonalAssetName(personalAssetRenameEditor.name, personalAssetRenameEditor.assetId, activeAssets)
    : '';
  const shouldShowPersonalAssetRenameError = isPersonalAssetRenameSubmitAttempted && !!personalAssetRenameValidationError;
  const moveEditorAsset = personalAssetMoveEditor
    ? activeAssets.find(asset => asset.id === personalAssetMoveEditor.assetId) ?? null
    : null;
  const renameEditorAsset = personalAssetRenameEditor
    ? activeAssets.find(asset => asset.id === personalAssetRenameEditor.assetId) ?? null
    : null;

  // Filtering calculation
  // 图片搜索: per-asset similarity score (0~100) for the active query. Recomputed when the
  // query changes or async color sampling bumps assetColorVersion. Empty when inactive.
  const imageSimilarityById = useMemo(() => {
    const map = new Map<string, number>();
    if (!imageSearchQuery) return map;
    void assetColorVersion; // re-run after async color cache fills
    [...activeAssets, ...EXTERNAL_ASSETS].forEach((asset) => {
      map.set(asset.id, computeImageSimilarity(imageSearchQuery, asset, getAssetColor(asset)));
    });
    return map;
  }, [imageSearchQuery, assetColorVersion, activeAssets]);

  const filteredInternalAssets = useMemo(() => {
    if (isExternalRootSelected) return [];

    const { fromTs: createdFromTs, toTs: createdToTs } = resolveDatePresetRange(internalDatePreset, internalCreatedFrom, internalCreatedTo);
    const kw = keyword.trim().toLowerCase();
    const isImageSearch = imageSearchQuery !== null;
    void assetColorVersion; // re-run color matching after async sampling

    const filtered = activeAssets.filter((asset) => {
      if (!scopedFolderIds.has(getResolvedAssetFolderId(asset))) return false;

      // 类型 tab（按后缀归类）
      if (activeTypeTab !== 'all' && getAssetTypeTab(asset.format) !== activeTypeTab) return false;
      if (internalFormatFilters.size > 0 && !internalFormatFilters.has(asset.format.trim().toUpperCase())) return false;
      if (internalAuthorFilter && asset.author !== internalAuthorFilter) return false;
      if (internalTagFilters.size > 0 && !asset.tags.some(t => internalTagFilters.has(t))) return false;
      if (internalOrgFilters.size > 0 && (!asset.org || !internalOrgFilters.has(asset.org))) return false;
      if (internalStatusFilters.size > 0 && (!asset.taskStatus || !internalStatusFilters.has(asset.taskStatus))) return false;
      if (internalColorFilters.size > 0 && !internalColorFilters.has(nearestColorSwatchId(getAssetColor(asset)))) return false;

      if (createdFromTs !== null || createdToTs !== null) {
        const createdTs = asset.createdAt ? new Date(asset.createdAt).getTime() : NaN;
        if (Number.isNaN(createdTs)) return false;
        if (createdFromTs !== null && createdTs < createdFromTs) return false;
        if (createdToTs !== null && createdTs > createdToTs) return false;
      }

      if (!passesFacetFilters(asset, {
        fileSizeBuckets: internalFileSizeBuckets,
        sizeBuckets: internalSizeBuckets,
        sizeWMin: internalSizeWMin, sizeWMax: internalSizeWMax, sizeHMin: internalSizeHMin, sizeHMax: internalSizeHMax,
        durationBuckets: internalDurationBuckets,
        shapeFilters: internalShapeFilters
      })) return false;

      // Text keyword and image search are mutually exclusive; skip kw when image search is active.
      if (!isImageSearch && kw) {
        const matchTitle = asset.name.toLowerCase().includes(kw);
        const matchTags = asset.tags.some(t => t.toLowerCase().includes(kw));
        if (!matchTitle && !matchTags) return false;
      }

      return true;
    });

    if (isImageSearch) {
      return [...filtered].sort((a, b) => (
        (imageSimilarityById.get(b.id) ?? 0) - (imageSimilarityById.get(a.id) ?? 0)
      ));
    }

    const getTime = (asset: ArtAsset) => (asset.createdAt ? new Date(asset.createdAt).getTime() : 0);
    return [...filtered].sort((a, b) => {
      const aTime = getTime(a);
      const bTime = getTime(b);
      if (aTime !== bTime) {
        return internalSortOrder === 'asc' ? aTime - bTime : bTime - aTime;
      }
      return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
    });
  }, [
    activeAssets,
    scopedFolderIds,
    isExternalRootSelected,
    keyword,
    activeTypeTab,
    internalFormatFilters,
    internalAuthorFilter,
    internalTagFilters,
    internalOrgFilters,
    internalStatusFilters,
    internalShapeFilters,
    internalColorFilters,
    internalCreatedFrom,
    internalCreatedTo,
    internalDatePreset,
    internalSizeBuckets,
    internalSizeWMin,
    internalSizeWMax,
    internalSizeHMin,
    internalSizeHMax,
    internalFileSizeBuckets,
    internalDurationBuckets,
    internalSortOrder,
    imageSearchQuery,
    imageSimilarityById,
    assetColorVersion
  ]);
  const filteredExternalAssets = useMemo(() => {
    const normalizedKeyword = externalKeyword.trim().toLowerCase();
    const isImageSearch = imageSearchQuery !== null;
    const { fromTs: createdFromTs, toTs: createdToTs } = resolveDatePresetRange(externalDatePreset, externalCreatedFrom, externalCreatedTo);
    void assetColorVersion;

    const filtered = EXTERNAL_ASSETS.filter((asset) => {
      if (!isImageSearch && normalizedKeyword) {
        const matchName = asset.name.toLowerCase().includes(normalizedKeyword);
        const matchTags = asset.tags.some(tag => tag.toLowerCase().includes(normalizedKeyword));
        if (!matchName && !matchTags) return false;
      }

      if (activeTypeTab !== 'all' && getAssetTypeTab(asset.format) !== activeTypeTab) return false;
      if (externalFormatFilters.size > 0 && !externalFormatFilters.has(asset.format)) return false;
      if (externalSourceFilters.size > 0 && !externalSourceFilters.has(asset.source)) return false;
      if (externalAuthorFilter && asset.author !== externalAuthorFilter) return false;
      if (externalTagFilters.size > 0 && !asset.tags.some(t => externalTagFilters.has(t))) return false;
      if (externalOrgFilters.size > 0 && (!asset.org || !externalOrgFilters.has(asset.org))) return false;
      if (externalStatusFilters.size > 0 && (!asset.taskStatus || !externalStatusFilters.has(asset.taskStatus))) return false;
      if (externalColorFilters.size > 0 && !externalColorFilters.has(nearestColorSwatchId(getAssetColor(asset)))) return false;

      const createdAtTs = new Date(asset.createdAt).getTime();
      if (createdFromTs !== null && Number.isFinite(createdFromTs) && createdAtTs < createdFromTs) return false;
      if (createdToTs !== null && Number.isFinite(createdToTs) && createdAtTs > createdToTs) return false;

      if (!passesFacetFilters(asset, {
        fileSizeBuckets: externalFileSizeBuckets,
        sizeBuckets: externalSizeBuckets,
        sizeWMin: externalSizeWMin, sizeWMax: externalSizeWMax, sizeHMin: externalSizeHMin, sizeHMax: externalSizeHMax,
        durationBuckets: externalDurationBuckets,
        shapeFilters: externalShapeFilters
      })) return false;

      return true;
    });

    if (isImageSearch) {
      return [...filtered].sort((a, b) => (
        (imageSimilarityById.get(b.id) ?? 0) - (imageSimilarityById.get(a.id) ?? 0)
      ));
    }

    filtered.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      if (aTime !== bTime) {
        return externalSortOrder === 'asc' ? aTime - bTime : bTime - aTime;
      }
      return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
    });

    return filtered;
  }, [
    externalKeyword,
    activeTypeTab,
    externalFormatFilters,
    externalSourceFilters,
    externalAuthorFilter,
    externalTagFilters,
    externalOrgFilters,
    externalStatusFilters,
    externalShapeFilters,
    externalColorFilters,
    externalCreatedFrom,
    externalCreatedTo,
    externalDatePreset,
    externalSizeBuckets,
    externalSizeWMin,
    externalSizeWMax,
    externalSizeHMin,
    externalSizeHMax,
    externalFileSizeBuckets,
    externalDurationBuckets,
    externalSortOrder,
    imageSearchQuery,
    imageSimilarityById,
    assetColorVersion
  ]);
  const hasExternalActiveFilters = (
    externalKeyword.trim() !== '' ||
    activeTypeTab !== 'all' ||
    externalFormatFilters.size > 0 ||
    externalSourceFilters.size > 0 ||
    externalAuthorFilter !== '' ||
    externalTagFilters.size > 0 ||
    externalOrgFilters.size > 0 ||
    externalStatusFilters.size > 0 ||
    externalShapeFilters.size > 0 ||
    externalColorFilters.size > 0 ||
    externalDatePreset !== 'all' ||
    externalSizeBuckets.size > 0 ||
    externalSizeWMin.trim() !== '' || externalSizeWMax.trim() !== '' ||
    externalSizeHMin.trim() !== '' || externalSizeHMax.trim() !== '' ||
    externalFileSizeBuckets.size > 0 ||
    externalDurationBuckets.size > 0 ||
    externalSortOrder !== 'desc'
  );

  const externalDateCount = externalDatePreset !== 'all' ? 1 : 0;
  const externalSizeCount = externalSizeBuckets.size
    + (externalSizeWMin.trim() !== '' || externalSizeWMax.trim() !== '' || externalSizeHMin.trim() !== '' || externalSizeHMax.trim() !== '' ? 1 : 0);
  const externalFileSizeCount = externalFileSizeBuckets.size;
  const externalDurationCount = externalDurationBuckets.size;
  const externalSortCount = externalSortOrder !== 'desc' ? 1 : 0;

  const hasInternalActiveFilters = (
    keyword.trim() !== '' ||
    activeTypeTab !== 'all' ||
    internalFormatFilters.size > 0 ||
    internalAuthorFilter !== '' ||
    internalTagFilters.size > 0 ||
    internalOrgFilters.size > 0 ||
    internalStatusFilters.size > 0 ||
    internalShapeFilters.size > 0 ||
    internalColorFilters.size > 0 ||
    internalDatePreset !== 'all' ||
    internalSizeBuckets.size > 0 ||
    internalSizeWMin.trim() !== '' || internalSizeWMax.trim() !== '' ||
    internalSizeHMin.trim() !== '' || internalSizeHMax.trim() !== '' ||
    internalFileSizeBuckets.size > 0 ||
    internalDurationBuckets.size > 0 ||
    internalSortOrder !== 'desc'
  );
  const internalDateCount = internalDatePreset !== 'all' ? 1 : 0;
  const internalSizeCount = internalSizeBuckets.size
    + (internalSizeWMin.trim() !== '' || internalSizeWMax.trim() !== '' || internalSizeHMin.trim() !== '' || internalSizeHMax.trim() !== '' ? 1 : 0);
  const internalFileSizeCount = internalFileSizeBuckets.size;
  const internalDurationCount = internalDurationBuckets.size;
  const internalSortCount = internalSortOrder !== 'desc' ? 1 : 0;

  const personalReadyTaggingCount = personalUploadDraft
    ? personalUploadDraft.items.filter(item => item.status === 'ready').length
    : 0;

  // 卡片宽度调节：auto-fill + minmax 让卡片按设定宽度排布；宽度超过内容区时自动退化为单列填满。
  const assetGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${Math.min(cardWidth, 1200)}px, 1fr))`,
    gap: '1rem'
  };

  const totalItems = isExternalRootSelected ? filteredExternalAssets.length : filteredInternalAssets.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const effectivePage = totalPages === 0 ? 1 : Math.min(currentPage, totalPages);
  const startIndex = (effectivePage - 1) * itemsPerPage;
  const endIndexExclusive = startIndex + itemsPerPage;
  const pageTokens = buildPaginationTokens(effectivePage, totalPages);
  const paginatedInternalAssets = isExternalRootSelected
    ? []
    : filteredInternalAssets.slice(startIndex, endIndexExclusive);
  const paginatedExternalAssets = isExternalRootSelected
    ? filteredExternalAssets.slice(startIndex, endIndexExclusive)
    : [];

  useEffect(() => {
    if (totalPages === 0) {
      if (currentPage !== 1) setCurrentPage(1);
      return;
    }
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const selectedExternalAsset = selectedAsset
    ? externalAssetById.get(selectedAsset.id) ?? null
    : null;
  const isSelectedExternalAsset = !!selectedExternalAsset;
  const selectedExternalSourceMeta = selectedExternalAsset
    ? EXTERNAL_SOURCE_META[selectedExternalAsset.source]
    : null;
  const selectedAssetTask = selectedAsset && !isSelectedExternalAsset
    ? activeDownloads.find(task => task.assetId === selectedAsset.id)
    : null;
  const projectDetailTimestampLabel = useMemo(() => formatDetailDateTime(new Date().toISOString()), []);
  const selectedPersonalAsset = selectedAsset
    ? personalAssets.find(asset => asset.id === selectedAsset.id) ?? null
    : null;
  const selectedAssetResolutionFromTag = selectedAsset
    ? selectedAsset.tags.find(tag => /^\d{2,5}[xX]\d{2,5}$/.test(tag))
    : '';
  const selectedAssetDimensionLabel = selectedExternalAsset
    ? `${selectedExternalAsset.width}*${selectedExternalAsset.height}`
    : (
      previewNaturalSize.width > 0 && previewNaturalSize.height > 0
        ? `${previewNaturalSize.width}*${previewNaturalSize.height}`
        : (selectedAssetResolutionFromTag ? selectedAssetResolutionFromTag.replace(/[xX]/, '*') : '--')
    );
  // 创建时间 = 素材上传至平台的时间（外部用采集时间，个人用上传时间，项目用占位时间）。
  const selectedAssetCreatedAtLabel = selectedExternalAsset
    ? formatDetailDateTime(selectedExternalAsset.createdAt)
    : (
      selectedPersonalAsset
        ? formatDetailDateTime(selectedPersonalAsset.uploadedAt)
        : projectDetailTimestampLabel
    );
  // 文件夹信息：素材所属目录的完整路径。
  const selectedAssetFolderLabel = selectedAsset
    ? getFolderPathLabel(getResolvedAssetFolderId(selectedAsset))
    : '--';
  // 时长：仅视频/音频类有 durationSec 的素材显示，格式 mm:ss。
  const selectedAssetDurationLabel = selectedAsset && selectedAsset.durationSec !== undefined
    ? `${Math.floor(selectedAsset.durationSec / 60)}:${String(selectedAsset.durationSec % 60).padStart(2, '0')}`
    : null;
  // 地区：按素材 id 哈希稳定映射到 北京/上海/广州（mock）。
  const selectedAssetRegionLabel = selectedAsset
    ? (['北京', '上海', '广州'][hashColorFallback(selectedAsset.id).r % 3])
    : '--';
  const contextMenuAsset = assetContextMenu
    ? activeAssets.find(asset => asset.id === assetContextMenu.assetId)
    : null;
  const contextMenuFolder = folderContextMenu
    ? folderById[folderContextMenu.folderId] ?? null
    : null;
  const canCreateSiblingFolder = !!contextMenuFolder
    && !isSystemFolder(contextMenuFolder.id)
    && contextMenuFolder.parentId !== null;
  const canCreateChildFolder = !!contextMenuFolder
    && getFolderSpaceId(contextMenuFolder.id) !== null;
  const canMutateContextFolder = !!contextMenuFolder && !isSystemFolder(contextMenuFolder.id);

  const renderInlineFolderEditor = (depth: number): React.ReactNode => {
    if (!folderEditor) return null;
    const isRename = folderEditor.mode === 'rename';

    return (
      <div className="py-1 pr-2" style={{ paddingLeft: `${8 + depth * 16}px` }}>
        <div className="flex items-center gap-1.5">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-700">
            {isRename ? <Pencil size={11} /> : <CornerDownRight size={12} />}
          </span>
          <Folder size={14} className="shrink-0 text-zinc-500" />
          <input
            autoFocus
            maxLength={FOLDER_NAME_MAX_LENGTH}
            value={folderEditor.name}
            onChange={(event) => setFolderEditor(prev => prev ? { ...prev, name: event.target.value } : prev)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitFolderEditor();
              if (event.key === 'Escape') closeFolderEditor();
            }}
            placeholder={isRename ? '重命名' : '文件夹名称'}
            className={`min-w-0 flex-1 rounded border bg-[#0c0c0e] px-2 py-1 text-xs text-zinc-200 outline-none transition-colors ${
              shouldShowFolderEditorError
                ? 'border-red-500/70 focus:border-red-500'
                : 'border-zinc-800 focus:border-[#00ff00]'
            }`}
          />
          <button
            type="button"
            title={shouldShowFolderEditorError ? folderEditorValidationError : '确认'}
            disabled={shouldShowFolderEditorError}
            onClick={submitFolderEditor}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
              shouldShowFolderEditorError
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-[#00ff00] text-black'
            }`}
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            title="取消"
            onClick={closeFolderEditor}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:text-white"
          >
            <X size={12} />
          </button>
        </div>
        {shouldShowFolderEditorError && (
          <p className="mt-1 pl-6 text-[10px] font-mono leading-relaxed text-red-400">
            {folderEditorValidationError}
          </p>
        )}
      </div>
    );
  };

  const renderFolderTree = (parentId: string | null, depth = 0): React.ReactNode => {
    const childFolders = (foldersByParent.get(parentId) ?? []).filter(folder => (
      !visibleFolderIds || visibleFolderIds.has(folder.id)
    ));
    // Inline create-editor renders as the last child of its target parent.
    const isCreatingHere = folderEditor?.mode === 'create' && folderEditor.parentId === parentId;

    const renderedChildren = childFolders.map((folder) => {
      const children = foldersByParent.get(folder.id) ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = expandedFolderIds.has(folder.id);
      const isSelected = selectedFolderId === folder.id;
      const nestedCount = getFolderAssetCount(folder.id);
      // Force-expand the subtree when the inline create-editor targets this folder,
      // even if it currently has no children, so the input row is visible.
      const isCreatingInThisFolder = folderEditor?.mode === 'create' && folderEditor.parentId === folder.id;
      const shouldRenderSubtree = (isExpanded && hasChildren) || isCreatingInThisFolder;

      const isRoot = depth === 0;
      const rootVisual = isRoot ? ROOT_FOLDER_VISUALS[folder.id] : undefined;
      const accent = rootVisual?.accent ?? '#00ff00';
      const RootIcon = rootVisual?.icon;
      const isRenamingThisFolder = folderEditor?.mode === 'rename' && folderEditor.folderId === folder.id;

      return (
        <div key={folder.id}>
          {isRenamingThisFolder ? (
            renderInlineFolderEditor(depth)
          ) : (
          <button
            type="button"
            onClick={() => setSelectedFolderId(folder.id)}
            onContextMenu={(event) => openFolderContextMenu(event, folder.id)}
            className={`group/folder flex w-full items-center gap-1.5 rounded text-left transition-all px-2 ${
              isRoot ? 'py-2 text-[13px] font-semibold' : 'py-1.5 text-xs'
            } ${
              isSelected
                ? 'bg-[#18181b] text-white border-l-2'
                : `border-l-2 border-transparent ${isRoot ? 'text-zinc-300' : 'text-zinc-400'} hover:bg-[#0c0c0e] hover:text-white`
            }`}
            style={{
              paddingLeft: `${8 + depth * 16}px`,
              borderLeftColor: isSelected ? accent : undefined
            }}
          >
            <span
              role="button"
              tabIndex={0}
              aria-label={isExpanded ? '收起文件夹' : '展开文件夹'}
              onClick={(event) => {
                event.stopPropagation();
                if (hasChildren) toggleFolderExpanded(folder.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (hasChildren) toggleFolderExpanded(folder.id);
                }
              }}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors ${
                hasChildren ? 'text-zinc-500 hover:text-[#00ff00]' : 'text-zinc-700'
              }`}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
              ) : (
                <span className="h-1 w-1 rounded-full bg-current" />
              )}
            </span>
            {isRoot && RootIcon ? (
              <RootIcon size={15} style={{ color: accent }} className="shrink-0" />
            ) : isExpanded && hasChildren ? (
              <FolderOpen size={14} className={isSelected ? 'text-zinc-300' : 'text-zinc-500 group-hover/folder:text-zinc-300'} />
            ) : (
              <Folder size={14} className={isSelected ? 'text-zinc-300' : 'text-zinc-500 group-hover/folder:text-zinc-300'} />
            )}
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            <span
              className="font-mono text-[10px]"
              style={{ color: isSelected ? accent : undefined }}
            >
              <span className={isSelected ? '' : 'text-zinc-500'}>{nestedCount}</span>
            </span>
          </button>
          )}
          {shouldRenderSubtree && renderFolderTree(folder.id, depth + 1)}
        </div>
      );
    });

    if (!isCreatingHere) return renderedChildren;

    return (
      <>
        {renderedChildren}
        {renderInlineFolderEditor(depth)}
      </>
    );
  };

  // Generic filter trigger button + popover wrapper for the toolbar.
  const renderFilterDropdown = (
    scope: 'internal' | 'external',
    key: FilterKey,
    label: string,
    count: number,
    panel: React.ReactNode
  ) => {
    const open = scope === 'internal' ? openInternalFilter : openExternalFilter;
    const setOpen = scope === 'internal' ? setOpenInternalFilter : setOpenExternalFilter;
    const isOpen = open === key;
    const active = count > 0 || isOpen;
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(prev => (prev === key ? null : key))}
          className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[10.5px] transition-colors ${
            active
              ? 'border-[#00ff00]/60 bg-[#00ff00]/10 text-[#00ff00]'
              : 'border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <span>{label}</span>
          {count > 0 && (
            <span className="rounded-full bg-[#00ff00]/20 px-1 text-[9px] leading-none py-0.5">{count}</span>
          )}
          <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && panel}
      </div>
    );
  };

  // The unified general-filter toolbar (内容类型 tab 行 + 通用筛选行). Shared by internal & external.
  const renderFilterToolbar = (scope: 'internal' | 'external') => {
    const isInternal = scope === 'internal';
    const barRef = isInternal ? internalFilterBarRef : externalFilterBarRef;

    // Per-scope state bindings
    const formatFilters = isInternal ? internalFormatFilters : externalFormatFilters;
    const toggleFormat = isInternal ? toggleInternalFormatFilter : toggleExternalFormatFilter;
    const formatKeyword = isInternal ? internalFormatKeyword : externalFormatKeyword;
    const setFormatKeyword = isInternal ? setInternalFormatKeyword : setExternalFormatKeyword;
    const formatGroupsForScope = isInternal ? formatGroups : externalFormatGroups;
    const authorFilter = isInternal ? internalAuthorFilter : externalAuthorFilter;
    const setAuthorFilter = isInternal ? setInternalAuthorFilter : setExternalAuthorFilter;
    const authorOptions = isInternal ? internalAuthorOptions : externalAuthorOptions;
    const authorKeyword = isInternal ? internalAuthorKeyword : externalAuthorKeyword;
    const setAuthorKeyword = isInternal ? setInternalAuthorKeyword : setExternalAuthorKeyword;
    const tagFilters = isInternal ? internalTagFilters : externalTagFilters;
    const toggleTag = isInternal ? toggleInternalTagFilter : toggleExternalTagFilter;
    const tagKeyword = isInternal ? internalTagKeyword : externalTagKeyword;
    const setTagKeyword = isInternal ? setInternalTagKeyword : setExternalTagKeyword;
    const tagGroups = isInternal ? internalTagGroups : externalTagGroups;
    const orgFilters = isInternal ? internalOrgFilters : externalOrgFilters;
    const toggleOrg = isInternal ? toggleInternalOrgFilter : toggleExternalOrgFilter;
    const orgOptions = isInternal ? internalOrgOptions : externalOrgOptions;
    const statusFilters = isInternal ? internalStatusFilters : externalStatusFilters;
    const toggleStatus = isInternal ? toggleInternalStatusFilter : toggleExternalStatusFilter;
    const shapeFilters = isInternal ? internalShapeFilters : externalShapeFilters;
    const toggleShape = isInternal ? toggleInternalShapeFilter : toggleExternalShapeFilter;
    const colorFilters = isInternal ? internalColorFilters : externalColorFilters;
    const toggleColor = isInternal ? toggleInternalColorFilter : toggleExternalColorFilter;
    const datePreset = isInternal ? internalDatePreset : externalDatePreset;
    const setDatePreset = isInternal ? setInternalDatePreset : setExternalDatePreset;
    const createdFrom = isInternal ? internalCreatedFrom : externalCreatedFrom;
    const createdTo = isInternal ? internalCreatedTo : externalCreatedTo;
    const setCreatedFrom = isInternal ? setInternalCreatedFrom : setExternalCreatedFrom;
    const setCreatedTo = isInternal ? setInternalCreatedTo : setExternalCreatedTo;
    const fileSizeBuckets = isInternal ? internalFileSizeBuckets : externalFileSizeBuckets;
    const toggleFileSizeBucket = isInternal ? toggleInternalFileSizeBucket : toggleExternalFileSizeBucket;
    const sizeBuckets = isInternal ? internalSizeBuckets : externalSizeBuckets;
    const toggleSizeBucket = isInternal ? toggleInternalSizeBucket : toggleExternalSizeBucket;
    const sizeWMin = isInternal ? internalSizeWMin : externalSizeWMin;
    const sizeWMax = isInternal ? internalSizeWMax : externalSizeWMax;
    const sizeHMin = isInternal ? internalSizeHMin : externalSizeHMin;
    const sizeHMax = isInternal ? internalSizeHMax : externalSizeHMax;
    const setSizeField = (field: 'wMin' | 'wMax' | 'hMin' | 'hMax', value: string) => {
      if (isInternal) {
        if (field === 'wMin') setInternalSizeWMin(value);
        else if (field === 'wMax') setInternalSizeWMax(value);
        else if (field === 'hMin') setInternalSizeHMin(value);
        else setInternalSizeHMax(value);
      } else {
        if (field === 'wMin') setExternalSizeWMin(value);
        else if (field === 'wMax') setExternalSizeWMax(value);
        else if (field === 'hMin') setExternalSizeHMin(value);
        else setExternalSizeHMax(value);
      }
    };
    const durationBuckets = isInternal ? internalDurationBuckets : externalDurationBuckets;
    const toggleDurationBucket = isInternal ? toggleInternalDurationBucket : toggleExternalDurationBucket;
    const sortOrder = isInternal ? internalSortOrder : externalSortOrder;
    const setSortOrder = isInternal ? setInternalSortOrder : setExternalSortOrder;
    const dateCount = isInternal ? internalDateCount : externalDateCount;
    const fileSizeCount = isInternal ? internalFileSizeCount : externalFileSizeCount;
    const sizeCount = isInternal ? internalSizeCount : externalSizeCount;
    const durationCount = isInternal ? internalDurationCount : externalDurationCount;
    const sortCount = isInternal ? internalSortCount : externalSortCount;
    const hasActive = isInternal ? hasInternalActiveFilters : hasExternalActiveFilters;
    const clearAll = isInternal ? clearInternalFilters : clearExternalFilters;

    const dd = (key: FilterKey, label: string, count: number, panel: React.ReactNode) =>
      renderFilterDropdown(scope, key, label, count, panel);

    return (
      <div ref={barRef} className="flex flex-col gap-2 font-mono">
        {/* 内容类型 tab 行 */}
        <div className="flex flex-wrap items-center gap-1">
          {ASSET_TYPE_TABS.map((tab) => {
            const isActive = activeTypeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTypeTab(tab.id)}
                className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
                  isActive ? 'bg-[#00ff00]/15 text-[#00ff00] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 通用筛选行 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] text-zinc-500">通用筛选</span>
          {dd('author', '创建人', authorFilter ? 1 : 0, (
            <MultiSelectFilterPanel
              options={authorOptions}
              selected={new Set(authorFilter ? [authorFilter] : [])}
              onToggle={(v) => { setAuthorFilter(authorFilter === v ? '' : v); }}
              singleSelect
              searchable
              searchValue={authorKeyword}
              onSearchChange={setAuthorKeyword}
              searchPlaceholder="搜索创建人"
              emptyText="没有匹配的创建人"
              width="w-60"
            />
          ))}
          {dd('format', '后缀', formatFilters.size, (
            <MultiSelectFilterPanel
              groups={formatGroupsForScope}
              selected={formatFilters}
              onToggle={toggleFormat}
              searchable
              searchValue={formatKeyword}
              onSearchChange={setFormatKeyword}
              searchPlaceholder="搜索格式"
              emptyText="没有匹配的格式"
            />
          ))}
          {dd('tag', '标签', tagFilters.size, (
            <MultiSelectFilterPanel
              groups={tagGroups}
              selected={tagFilters}
              onToggle={toggleTag}
              searchable
              searchValue={tagKeyword}
              onSearchChange={setTagKeyword}
              searchPlaceholder="搜索标签"
              emptyText="没有匹配的标签"
            />
          ))}
          {dd('org', '组织架构', orgFilters.size, (
            <MultiSelectFilterPanel
              options={orgOptions.map(o => ({ value: o, label: o }))}
              selected={orgFilters}
              onToggle={toggleOrg}
              emptyText="暂无组织架构"
            />
          ))}
          {dd('created', '日期', dateCount, (
            <DatePresetPanel
              preset={datePreset}
              from={createdFrom}
              to={createdTo}
              onPresetChange={setDatePreset}
              onCustomChange={({ from, to }) => { setCreatedFrom(from); setCreatedTo(to); }}
            />
          ))}
          {dd('fileSize', '文件大小', fileSizeCount, (
            <MultiSelectFilterPanel
              options={FILE_SIZE_BUCKETS.map(b => ({ value: b.id, label: b.label }))}
              selected={fileSizeBuckets}
              onToggle={toggleFileSizeBucket}
              width="w-44"
            />
          ))}
          {dd('status', '任务状态', statusFilters.size, (
            <MultiSelectFilterPanel
              options={(Object.keys(ASSET_TASK_STATUS_LABELS) as AssetTaskStatus[]).map(s => ({ value: s, label: ASSET_TASK_STATUS_LABELS[s] }))}
              selected={statusFilters}
              onToggle={toggleStatus}
              width="w-40"
            />
          ))}
          {dd('size', '尺寸', sizeCount, (
            <SizeFilterPanel
              buckets={sizeBuckets}
              onToggleBucket={toggleSizeBucket}
              wMin={sizeWMin} wMax={sizeWMax} hMin={sizeHMin} hMax={sizeHMax}
              onChange={setSizeField}
            />
          ))}
          {dd('shape', '形状', shapeFilters.size, (
            <MultiSelectFilterPanel
              options={ASSET_SHAPE_OPTIONS.map(s => ({ value: s.id, label: s.label }))}
              selected={shapeFilters}
              onToggle={toggleShape}
              width="w-40"
            />
          ))}
          {dd('duration', '时长', durationCount, (
            <MultiSelectFilterPanel
              options={DURATION_BUCKETS.map(b => ({ value: b.id, label: b.label }))}
              selected={durationBuckets}
              onToggle={toggleDurationBucket}
              width="w-44"
            />
          ))}
          {dd('color', '颜色', colorFilters.size, (
            <ColorFilterPanel selected={colorFilters} onToggle={toggleColor} />
          ))}
          {!isInternal && dd('source', '来源', externalSourceFilters.size, (
            <MultiSelectFilterPanel
              options={EXTERNAL_SOURCE_OPTIONS.map(o => ({ value: o.id, label: o.label }))}
              selected={externalSourceFilters as Set<string>}
              onToggle={(v) => toggleExternalSourceFilter(v as ExternalAssetSource)}
              width="w-40"
            />
          ))}
          {dd('sort', '排序', sortCount, (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-44 rounded border border-zinc-700 bg-[#0c0c0e] p-2 shadow-xl shadow-black/60">
              <div className="space-y-1">
                {([
                  { value: 'desc' as const, label: '创建时间降序（默认）' },
                  { value: 'asc' as const, label: '创建时间升序' }
                ]).map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <input
                      type="radio"
                      checked={sortOrder === opt.value}
                      onChange={() => setSortOrder(opt.value)}
                      className="h-3 w-3 border-zinc-700 bg-black text-[#00ff00] focus:ring-[#00ff00]/50"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={clearAll}
            disabled={!hasActive}
            className={`rounded border px-2.5 py-1.5 text-[10.5px] transition-colors ${
              hasActive
                ? 'border-zinc-700 bg-black text-zinc-300 hover:border-[#00ff00]/60 hover:text-white'
                : 'border-zinc-800 bg-black text-zinc-600 cursor-not-allowed'
            }`}
          >
            重置筛选
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col font-sans">

      <input
        ref={personalUploadInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.gif"
        onChange={handlePersonalFileSelection}
        className="hidden"
      />

      <input
        ref={imageSearchInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSearchSelection}
        className="hidden"
      />

      {/* Main body content */}
      <div ref={assetLayoutRef} className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {assetContextMenu && contextMenuAsset && (
            <div
              className="fixed z-50 w-44 overflow-hidden rounded border border-[#27272a] bg-[#0c0c0e] py-1 shadow-xl font-mono text-[11px]"
              style={{ left: assetContextMenu.x, top: assetContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {isProjectA && isCurrentUserProjectAdmin && (
                <>
                  {/* 项目空间分享功能隐藏：项目文件的可见性/可操作性通过「权限管理 → 成员管理」控制
                  <button
                    type="button"
                    onClick={() => openShareModal(contextMenuAsset)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                  >
                    <Send size={12} className="text-[#00ff00]" />
                    分享
                  </button>
                  */}
                  <button
                    type="button"
                    onClick={() => { void handleCopyPersonalAssetLink(contextMenuAsset); setAssetContextMenu(null); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                  >
                    <Link2 size={12} className="text-zinc-400" />
                    复制链接
                  </button>
                  <button
                    type="button"
                    onClick={() => openPermissionView('asset', contextMenuAsset.id, contextMenuAsset.name)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                  >
                    <Eye size={12} className="text-zinc-400" />
                    查看权限
                  </button>
                  <div className="my-1 border-t border-zinc-900" />
                </>
              )}
              {/* V1：移动功能暂时停用
              <button
                type="button"
                onClick={() => openPersonalAssetMoveEditor(contextMenuAsset.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
              >
                <FolderInput size={12} className="text-zinc-400" />
                移动
              </button>
              */}
              <button
                type="button"
                onClick={() => { handleLocalDownload(contextMenuAsset); setAssetContextMenu(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
              >
                <Download size={12} className="text-[#00ff00]" />
                {downloadedAssetIds.has(contextMenuAsset.id) ? '打开本地目录' : '下载到本地'}
              </button>
              <button
                type="button"
                onClick={() => openPersonalAssetRenameEditor(contextMenuAsset.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
              >
                <Pencil size={12} className="text-zinc-400" />
                重命名
              </button>
              <div className="my-1 border-t border-zinc-900" />
              <button
                type="button"
                onClick={() => openPersonalAssetDeleteConfirm(contextMenuAsset.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-400 transition-colors hover:bg-red-950/30 hover:text-red-300"
              >
                <Trash2 size={12} />
                删除素材
              </button>
            </div>
          )}

          {folderContextMenu && contextMenuFolder && (canCreateSiblingFolder || canCreateChildFolder || canMutateContextFolder) && (
            <div
              className="fixed z-50 w-44 overflow-hidden rounded border border-[#27272a] bg-[#0c0c0e] py-1 shadow-xl font-mono text-[11px]"
              style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {canCreateSiblingFolder && (
                <button
                  type="button"
                  onClick={() => openCreateFolderEditor(contextMenuFolder.parentId)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                >
                  <Plus size={12} className="text-[#00ff00]" />
                  新建同级文件夹
                </button>
              )}
              {canCreateChildFolder && (
                <button
                  type="button"
                  onClick={() => openCreateFolderEditor(contextMenuFolder.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                >
                  <FolderPlus size={12} className="text-[#00ff00]" />
                  新建子文件夹
                </button>
              )}
              {canMutateContextFolder && (
                <>
                  {(canCreateSiblingFolder || canCreateChildFolder) && <div className="my-1 border-t border-zinc-900" />}
                  {isProjectA && isCurrentUserProjectAdmin && (
                    <>
                      {/* 项目空间分享功能隐藏：项目文件夹的可见性/可操作性通过「权限管理 → 成员管理」控制
                      <button
                        type="button"
                        onClick={() => openFolderShareModal(contextMenuFolder)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                      >
                        <Send size={12} className="text-[#00ff00]" />
                        分享
                      </button>
                      */}
                      <button
                        type="button"
                        onClick={() => { void handleCopyFolderLink(contextMenuFolder); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                      >
                        <Link2 size={12} className="text-zinc-400" />
                        复制链接
                      </button>
                      <button
                        type="button"
                        onClick={() => openPermissionView('folder', contextMenuFolder.id, contextMenuFolder.name)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                      >
                        <Eye size={12} className="text-zinc-400" />
                        查看权限
                      </button>
                    </>
                  )}
                  {isPersonalSpace && (
                    <button
                      type="button"
                      onClick={() => { void handleSharePersonalFolder(contextMenuFolder); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                    >
                      <Send size={12} className="text-[#00ff00]" />
                      分享
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openRenameFolderEditor(contextMenuFolder.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
                  >
                    <Pencil size={12} className="text-zinc-400" />
                    重命名
                  </button>
                  <div className="my-1 border-t border-zinc-900" />
                  <button
                    type="button"
                    onClick={() => openDeleteFolderConfirm(contextMenuFolder.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-400 transition-colors hover:bg-red-950/30 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                    删除文件夹
                  </button>
                </>
              )}
            </div>
          )}

          <aside
            className="w-full shrink-0 border-b lg:border-b-0 border-[#27272a] bg-[#070708] flex flex-col min-h-0"
            style={isDesktopLayout ? { width: `${folderPaneWidth}px` } : undefined}
          >
            <div className="p-3 border-b border-[#1c1c1f]">
              {isFolderSearchActive ? (
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
                  <input
                    autoFocus
                    type="text"
                    value={folderKeyword}
                    onChange={(event) => setFolderKeyword(event.target.value)}
                    onBlur={() => {
                      if (!folderKeyword.trim()) {
                        setIsFolderSearchActive(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setFolderKeyword('');
                        setIsFolderSearchActive(false);
                      }
                    }}
                    placeholder="搜索目录"
                    className="w-full rounded border border-zinc-800 bg-[#0c0c0e] py-2 pl-8 pr-8 text-xs text-zinc-200 outline-none transition-colors focus:border-[#00ff00]"
                  />
                  <button
                    type="button"
                    title="关闭目录搜索"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setFolderKeyword('');
                      setIsFolderSearchActive(false);
                    }}
                    className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Archive size={15} className="text-[#00ff00]" />
                    <span className="text-xs font-bold text-white truncate">文件目录</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="搜索目录"
                      onClick={() => setIsFolderSearchActive(true)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-[#0c0c0e] text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00]"
                    >
                      <Search size={13} />
                    </button>
                    <button
                      type="button"
                      title={canCreateChildOfSelected ? `在「${selectedFolder?.name ?? '当前目录'}」下新建子文件夹` : '当前目录不支持新建文件夹'}
                      disabled={!canCreateChildOfSelected}
                      onClick={() => openCreateFolderEditor(selectedFolderId)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-[#0c0c0e] text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 max-h-[240px] lg:max-h-none">
              <div className="space-y-1">
                {folders.length === 0 ? (
                  <div className="rounded border border-dashed border-[#27272a] bg-[#0c0c0e]/30 px-3 py-4 text-center text-[11px] text-zinc-500 font-mono">
                    暂无文件夹，点击上方 <span className="text-[#00ff00] font-bold">+</span> 新建。
                  </div>
                ) : renderFolderTree(null)}
              </div>
            </div>
          </aside>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整目录结构宽度"
            onMouseDown={startFolderPaneResize}
            className="group relative hidden w-2 shrink-0 cursor-col-resize lg:block"
          >
            <div
              className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors ${
                isResizingFolderPane ? 'bg-[#00ff00]' : 'bg-[#27272a] group-hover:bg-[#00ff00]/70'
              }`}
            />
          </div>

          <section className="flex-1 overflow-hidden flex flex-col min-w-0">
            <div className="asset-content-toolbar shrink-0 border-b border-[#27272a] bg-[#0c0c0e]/60 px-4 py-2">
              <div className="flex flex-col gap-2.5">
                {isBatchMode ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-2 text-sm font-bold text-white">
                        <CheckCircle size={16} className="text-[#00ff00]" />
                        已选中 {batchSelectedIds.size} 个
                      </span>
                      {(() => {
                        const allIds = filteredInternalAssets.map(a => a.id);
                        const allSelected = allIds.length > 0 && allIds.every(id => batchSelectedIds.has(id));
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setBatchSelectedIds(allSelected ? new Set() : new Set(allIds));
                            }}
                            disabled={allIds.length === 0 || !!batchDeleteProgress}
                            className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-black px-2.5 py-1.5 text-[10.5px] font-mono text-zinc-300 transition-colors hover:border-[#00ff00]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle size={12} className={allSelected ? 'text-[#00ff00]' : ''} />
                            {allSelected ? '取消全选' : `全选（${allIds.length}）`}
                          </button>
                        );
                      })()}
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPendingBatchDelete(true)}
                        disabled={batchSelectedIds.size === 0 || !!batchDeleteProgress}
                        className="inline-flex items-center gap-1.5 rounded border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-[10.5px] font-mono font-semibold text-red-400 transition-colors hover:border-red-500 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
                      >
                        <Trash2 size={12} />
                        删除{batchSelectedIds.size > 0 ? `（${batchSelectedIds.size}）` : ''}
                      </button>
                      <button
                        type="button"
                        onClick={exitBatchMode}
                        disabled={!!batchDeleteProgress}
                        className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-black px-3 py-1.5 text-[10.5px] font-mono text-zinc-300 transition-colors hover:border-[#00ff00]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {/* 返回上一个目录功能暂时停用
                    <button
                      type="button"
                      onClick={goToPreviousFolder}
                      disabled={folderHistory.length === 0}
                      title={previousFolderName ? `返回上一个目录：${previousFolderName}` : '没有可返回的目录'}
                      className="inline-flex shrink-0 items-center justify-center rounded border border-zinc-800 bg-black p-1.5 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    */}
                    <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
                      <FolderOpen size={16} className="text-[#00ff00]" />
                      <span className="truncate">{selectedFolder?.name ?? '未选择文件夹'}</span>
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {isPersonalSpace && !isExternalRootSelected && (
                      <button
                        type="button"
                        onClick={openPersonalUploadInfo}
                        className="inline-flex items-center justify-center gap-1.5 rounded border border-[#00ff00]/40 bg-[#00ff00]/10 px-3 py-1.5 text-[10.5px] font-mono font-semibold text-[#00ff00] transition-colors hover:border-[#00ff00] hover:bg-[#00ff00]/20"
                      >
                        <Upload size={12} />
                        上传
                      </button>
                    )}

                    <div className="relative w-56 sm:w-72 xl:w-80">
                      <Search size={13} className="absolute left-3 top-2 text-zinc-500" />
                      <input
                        type="text"
                        value={isExternalRootSelected ? externalKeyword : keyword}
                        disabled={imageSearchQuery !== null}
                        onChange={event => (
                          isExternalRootSelected
                            ? setExternalKeyword(event.target.value)
                            : setKeyword(event.target.value)
                        )}
                        placeholder={imageSearchQuery !== null ? '以图搜图进行中…' : (isExternalRootSelected ? '搜索外部素材名或标签' : '搜索素材名或标签')}
                        className="w-full bg-zinc-950 border border-zinc-900 focus:border-[#00ff00] transition-colors outline-none text-xs rounded py-1.5 pl-9 pr-9 text-zinc-200 font-mono disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={openImageSearchPicker}
                        disabled={isImageSearchProcessing}
                        title="以图搜图：上传参考图按视觉相似度匹配素材"
                        className={`absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          imageSearchQuery !== null
                            ? 'bg-[#00ff00]/15 text-[#00ff00]'
                            : 'text-zinc-500 hover:bg-zinc-800 hover:text-[#00ff00]'
                        }`}
                      >
                        {isImageSearchProcessing ? <Loader2 size={13} className="animate-spin" /> : <Camera size={14} />}
                      </button>
                    </div>

                    {canBatchDelete && (
                      <button
                        type="button"
                        onClick={enterBatchMode}
                        title="批量操作：多选后批量删除"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded border border-zinc-700 bg-black px-2.5 py-1.5 text-[10.5px] font-mono text-zinc-300 transition-colors hover:border-[#00ff00]/60 hover:text-white"
                      >
                        <CheckCircle size={12} />
                        批量操作
                      </button>
                    )}
                  </div>
                </div>
                )}

                {imageSearchQuery && (
                  <div className="flex items-center gap-3 rounded border border-[#00ff00]/40 bg-[#00ff00]/5 px-3 py-2">
                    <img
                      src={imageSearchQuery.previewUrl}
                      alt="参考图"
                      className="h-10 w-10 shrink-0 rounded border border-[#00ff00]/40 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#00ff00]">
                        <ScanSearch size={12} />
                        以图搜图进行中
                      </p>
                      <p className="truncate font-mono text-[10px] text-zinc-400">参考图：{imageSearchQuery.fileName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={clearImageSearch}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 bg-black px-2 py-1 text-[10px] font-mono text-zinc-300 transition-colors hover:border-[#00ff00]/60 hover:text-white"
                    >
                      <X size={11} />
                      退出图片搜索
                    </button>
                  </div>
                )}

                {renderFilterToolbar(isExternalRootSelected ? 'external' : 'internal')}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-7">
              {!isExternalRootSelected && directChildFolders.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <Folder size={16} className="text-[#00ff00]" />
                      <span>子文件夹</span>
                      <span className="font-mono text-xs text-zinc-500">({directChildFolders.length})</span>
                    </div>
                  </div>

                  <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {directChildFolders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => {
                          setSelectedFolderId(folder.id);
                          setExpandedFolderIds(prev => new Set(prev).add(selectedFolderId));
                        }}
                        onContextMenu={(event) => openFolderContextMenu(event, folder.id)}
                        className="group/folderCard min-h-[128px] rounded border border-[#27272a] bg-[#0c0c0e] p-4 text-left transition-all hover:border-[#00ff00]/60 hover:bg-[#121214]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <FolderOpen size={42} className="text-zinc-500 transition-colors group-hover/folderCard:text-[#00ff00]" />
                          <span className="rounded border border-zinc-800 bg-black px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                            {getFolderAssetCount(folder.id)}
                          </span>
                        </div>
                        <div className="mt-3 min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-200 group-hover/folderCard:text-white">
                            {folder.name}
                          </p>
                          <p className="mt-1 text-[10px] font-mono text-zinc-500">
                            {foldersByParent.get(folder.id)?.length ?? 0} 个子目录
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Files size={16} className="text-[#00ff00]" />
                    <span>素材</span>
                    <span className="font-mono text-xs text-zinc-500">({totalItems})</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* 卡片宽度调节滑动条 */}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] text-zinc-500">封面尺寸</span>
                      <input
                        type="range"
                        min={CARD_WIDTH_MIN}
                        max={CARD_WIDTH_MAX}
                        step={10}
                        value={cardWidth}
                        onChange={(event) => setCardWidth(clampCardWidth(Number(event.target.value)))}
                        className="asset-card-width-slider h-1 w-28 cursor-pointer appearance-none rounded-full bg-zinc-700 accent-[#00ff00]"
                        title={`封面宽度 ${cardWidth}px`}
                      />
                      <span className="w-12 shrink-0 font-mono text-[10.5px] text-zinc-400">{cardWidth}px</span>
                    </div>

                    {!isExternalRootSelected && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={includeSubfolderAssets}
                        onClick={() => setIncludeSubfolderAssets(prev => !prev)}
                        className={`subfolder-assets-toggle inline-flex items-center gap-2 rounded border px-2.5 py-1.5 text-[10.5px] font-mono transition-colors ${
                          includeSubfolderAssets
                            ? 'is-active border-zinc-700 bg-zinc-900/70 text-zinc-200'
                            : 'border-zinc-800 bg-black text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <span className={`subfolder-assets-toggle-indicator flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                          includeSubfolderAssets ? 'is-active border-zinc-500 bg-zinc-200 text-black' : 'border-zinc-700'
                        }`}>
                          {includeSubfolderAssets && <Check size={10} />}
                        </span>
                        显示子文件夹素材
                      </button>
                    )}
                  </div>
                </div>

                {totalItems === 0 ? (
                  <div className="h-64 border border-dashed border-[#27272a] rounded flex flex-col items-center justify-center p-8 text-center text-zinc-500 text-xs">
                    {imageSearchQuery
                      ? '没有找到与参考图相似的素材。'
                      : isExternalRootSelected
                      ? (hasExternalActiveFilters
                        ? '没有找到匹配筛选条件的外部素材。'
                        : '暂无外部素材。')
                      : (
                        folders.length === 0
                          ? '当前没有文件夹，请新建文件夹后在此查看素材。'
                          : keyword.trim()
                            ? `没有找到匹配 “${keyword}” 描述的美术内容包。`
                            : (!isProjectA && !isPersonalSpace
                              ? `【${currentSpace.name}】暂无预置素材。`
                              : '当前目录暂无素材。')
                      )}
                  </div>
                ) : (
                  isExternalRootSelected ? (
                    <div style={assetGridStyle}>
                      {paginatedExternalAssets.map((asset) => {
                        const sourceMeta = EXTERNAL_SOURCE_META[asset.source];
                        const isCurSelected = selectedAsset?.id === asset.id;

                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => setSelectedAsset(asset)}
                            className={`group/card rounded border overflow-hidden bg-[#0c0c0e] text-left transition-all ${
                              isCurSelected
                                ? 'border-[#00ff00]'
                                : 'border-[#27272a] hover:border-zinc-700'
                            }`}
                          >
                            <div className="aspect-video relative overflow-hidden border-b border-[#18181b] bg-black/60">
                              <img
                                src={asset.thumbnail}
                                alt={asset.name}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                                referrerPolicy="no-referrer"
                              />
                              <span className="absolute left-2 top-2 rounded border border-zinc-800 bg-black/85 px-1.5 py-0.5 text-[9.5px] font-mono font-bold uppercase text-[#00ff00]">
                                .{asset.format}
                              </span>
                              <span className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono ${sourceMeta.badgeClassName}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${sourceMeta.dotClassName}`} />
                                <span>{sourceMeta.logo}</span>
                              </span>
                              {imageSearchQuery && (
                                <span className="absolute bottom-2 left-2 rounded border border-[#00ff00]/50 bg-black/85 px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-[#00ff00]">
                                  相似度 {imageSimilarityById.get(asset.id) ?? 0}%
                                </span>
                              )}
                            </div>
                            <div className="p-3">
                              <p className="truncate text-xs font-semibold text-zinc-200 transition-colors group-hover/card:text-white">
                                {asset.name}
                              </p>
                              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                                <span>{EXTERNAL_TYPE_LABELS[asset.externalType]}</span>
                                <span>{asset.width}×{asset.height}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={assetGridStyle}>
                      {paginatedInternalAssets.map((asset) => {
                        const isCurSelected = selectedAsset?.id === asset.id;
                        const isBatchSelected = isBatchMode && batchSelectedIds.has(asset.id);

                        // Check if currently downloading/queued
                        const activeTask = activeDownloads.find(task => task.assetId === asset.id);

                        return (
                          <div
                            key={asset.id}
                            onClick={() => {
                              if (isBatchMode) toggleBatchSelect(asset.id);
                              else setSelectedAsset(asset);
                            }}
                            onContextMenu={(event) => { if (!isBatchMode) openAssetContextMenu(event, asset.id); }}
                            className={`group/card bg-[#0c0c0e] border rounded overflow-hidden cursor-pointer flex flex-col transition-all relative ${
                              isBatchSelected
                                ? 'border-[#00ff00] ring-1 ring-[#00ff00]/60'
                                : isCurSelected && !isBatchMode
                                ? 'border-[#00ff00]'
                                : 'border-[#27272a] hover:border-zinc-700'
                            }`}
                          >
                            {/* Thumbnail wrapper */}
                            <div className="group/cover aspect-video relative overflow-hidden bg-black/60 shrink-0 select-none border-b border-[#18181b]">
                              <img
                                src={asset.thumbnail}
                                alt={asset.name}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                                referrerPolicy="no-referrer"
                              />

                              {/* 批量操作复选框 */}
                              {isBatchMode && (
                                <span className={`absolute left-2 top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                                  isBatchSelected ? 'border-[#00ff00] bg-[#00ff00] text-black' : 'border-white/80 bg-black/50'
                                }`}>
                                  {isBatchSelected && <Check size={12} strokeWidth={3} />}
                                </span>
                              )}

                              {/* Format sticker and category indicator */}
                              <div className={`absolute top-2 left-2 flex items-center gap-1 ${isBatchMode ? 'opacity-0' : ''}`}>
                                <span className="text-[9.5px] font-mono bg-black/90 text-[#00ff00] font-bold border border-zinc-800 px-1 py-0.2 rounded uppercase">
                                  .{asset.format}
                                </span>
                              </div>

                              {imageSearchQuery && (
                                <span className="absolute bottom-2 left-2 z-10 rounded border border-[#00ff00]/50 bg-black/85 px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-[#00ff00]">
                                  相似度 {imageSimilarityById.get(asset.id) ?? 0}%
                                </span>
                              )}

                              {!isBatchMode && (isPersonalSpace || isProjectA) && (
                                <div className="asset-cover-actions absolute right-2 top-2 z-20 flex items-center gap-1 rounded-md px-1 py-1 opacity-0 transition-all duration-200 pointer-events-none group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto group-focus-within/cover:opacity-100 group-focus-within/cover:pointer-events-auto">
                                  {isPersonalSpace && (
                                    <button
                                      type="button"
                                      title="分享素材"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleSharePersonalAsset(asset);
                                      }}
                                      className="asset-cover-action-btn asset-cover-action-btn-share flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-100 transition-colors hover:bg-emerald-400/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/80"
                                    >
                                      <Send size={12} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    title="复制链接"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleCopyPersonalAssetLink(asset);
                                    }}
                                    className="asset-cover-action-btn asset-cover-action-btn-copy flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/22 text-cyan-100 transition-colors hover:bg-cyan-400/34 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/80"
                                  >
                                    <Link2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    title="更多操作"
                                    onClick={(event) => openAssetMoreMenu(event, asset.id)}
                                    className="asset-cover-action-btn asset-cover-action-btn-more flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800/85 text-zinc-200 transition-colors hover:bg-zinc-700/90 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-200/70"
                                  >
                                    <MoreHorizontal size={12} />
                                  </button>
                                </div>
                              )}

                              {/* Status overlays (Download Status / Queued) */}
                              {activeTask && (
                                <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center">
                                  {activeTask.status === 'queued' ? (
                                    <div className="flex flex-col items-center gap-1.5 animate-pulse">
                                      <Clock size={16} className="text-amber-400" />
                                      <span className="text-[10px] font-mono text-amber-400 font-bold">排队等候中...</span>
                                    </div>
                                  ) : (
                                    <div className="w-full px-4 flex flex-col items-center">
                                      <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-[#00ff00] animate-spin mb-1.5"></div>
                                      <span className="text-[10px] font-mono text-zinc-300">后台高速并行拉取中</span>
                                      <span className="text-[12px] font-mono text-[#00ff00] font-bold mt-0.5">{activeTask.progress}%</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {showAssetCardInfo && (
                              <div className="p-3.5 flex-1 flex flex-col justify-between">
                                <div>
                                  <h3 className="text-xs font-bold text-white tracking-wide font-sans line-clamp-1 truncate block group-hover/card:text-[#00ff00] transition-colors">
                                    {asset.name}
                                  </h3>
                                  <div className="flex items-center gap-2 mt-1 px-0.5">
                                    <span className="text-[9.2px] font-mono text-zinc-500 uppercase">
                                      类别: {asset.category.replace('_', ' ')}
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-3.5 pt-2 border-t border-zinc-900 flex justify-between items-center text-[10px] font-mono text-zinc-500">
                                  <span>大小: {asset.sizeMB} MB</span>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedAsset(asset);
                                    }}
                                    className="text-zinc-400 text-[10.5px] group-hover/card:text-[#00ff00] flex items-center transition-colors cursor-pointer"
                                  >
                                    查看素材详情
                                    <ExternalLink size={10} className="ml-1" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </section>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-[#27272a] bg-[#0c0c0e]/80 backdrop-blur-md flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0 font-mono text-xs text-zinc-400 select-none">
                <label className="inline-flex w-fit items-center gap-2 rounded border border-zinc-800 bg-black px-2.5 py-1.5 text-[10.5px] font-mono text-zinc-400">
                  每页
                  <select
                    value={itemsPerPage}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next) || !ITEMS_PER_PAGE_OPTIONS.includes(next)) return;
                      setItemsPerPage(next);
                      setCurrentPage(1);
                    }}
                    className="rounded border border-zinc-800 bg-[#0c0c0e] px-2 py-1 text-[10.5px] text-zinc-200"
                  >
                    {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  条
                </label>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  {/* Previous Page Button */}
                  <button
                    disabled={effectivePage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className={`inline-flex h-8 items-center gap-1 rounded border px-2.5 transition-all ${
                      effectivePage === 1
                        ? 'text-zinc-700 bg-transparent cursor-not-allowed opacity-40'
                        : 'text-zinc-300 hover:text-white hover:border-[#00ff00]/60 bg-[#0c0c0e] hover:bg-zinc-900 cursor-pointer'
                    }`}
                    title="上一页"
                  >
                    <ChevronLeft size={14} className="pointer-events-none" />
                    <span className="hidden sm:inline">上一页</span>
                  </button>

                  {/* Page numbers */}
                  {pageTokens.map((token) => {
                    if (token === 'ellipsis-left' || token === 'ellipsis-right') {
                      return (
                        <span
                          key={token}
                          className="inline-flex h-8 w-8 items-center justify-center text-zinc-600"
                        >
                          ...
                        </span>
                      );
                    }

                    const page = token;
                    const isCurrent = page === effectivePage;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`h-8 min-w-8 rounded border px-2 transition-all text-xs font-mono font-medium ${
                          isCurrent
                            ? 'bg-zinc-950 border-[#00ff00] text-[#00ff00] font-bold'
                            : 'bg-transparent border-zinc-900 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}

                  {/* Next Page Button */}
                  <button
                    disabled={effectivePage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className={`inline-flex h-8 items-center gap-1 rounded border px-2.5 transition-all ${
                      effectivePage === totalPages
                        ? 'text-zinc-700 bg-transparent cursor-not-allowed opacity-40'
                        : 'text-zinc-300 hover:text-white hover:border-[#00ff00]/60 bg-[#0c0c0e] hover:bg-zinc-900 cursor-pointer'
                    }`}
                    title="下一页"
                  >
                    <span className="hidden sm:inline">下一页</span>
                    <ChevronRight size={14} className="pointer-events-none" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

      {isPersonalUploadInfoOpen && (
        <div className="personal-upload-info-modal fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="personal-upload-info-panel w-full max-w-[560px] rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Upload size={14} className="text-[#00ff00]" />
                  上传素材
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonalUploadInfoOpen(false)}
                className="personal-upload-info-close flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600 hover:text-white"
                title="关闭"
              >
                <X size={13} />
              </button>
            </div>

            <div className="personal-upload-info-body mt-4 rounded border border-zinc-800 bg-black/40 p-3 text-[11px] font-mono text-zinc-300 space-y-1.5">
              <p>1. 目录逻辑一致：支持一级目录、子目录、目录搜索、右键管理。</p>
              <p>2. 入库目录：确认上传后自动写入个人空间置顶目录（一级目录）。</p>
              <p>3. 格式限制：支持图片、动图(GIF)、视频。</p>
              <p>4. 批量限制：单次最多 500 条，总大小不超过 10 GB。</p>
              <p>5. 智能处理：上传阶段自动 AI 打标，支持标签增删改后再确认。</p>
            </div>

            <button
              type="button"
              onClick={openPersonalUploadPicker}
              onDragEnter={handlePersonalUploadDragEnter}
              onDragOver={handlePersonalUploadDragOver}
              onDragLeave={handlePersonalUploadDragLeave}
              onDrop={handlePersonalUploadDrop}
              className={`personal-upload-dropzone mt-3 w-full rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
                isPersonalUploadDropzoneActive
                  ? 'is-dragging border-[#00ff00] bg-[#00ff00]/10 text-[#00ff00]'
                  : 'border-zinc-700 bg-black/30 text-zinc-400 hover:border-[#00ff00]/60 hover:text-zinc-200'
              }`}
              title="点击选择文件，或拖拽文件到此处上传"
            >
              <div className="pointer-events-none flex flex-col items-center gap-2">
                <Upload size={16} />
                <p className="text-[11.5px] font-semibold">点击或拖拽文件到此处上传</p>
              </div>
            </button>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPersonalUploadInfoOpen(false)}
                className="personal-upload-info-cancel rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs font-mono text-zinc-400 hover:border-zinc-600 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={openPersonalUploadPicker}
                className="rounded bg-[#00ff00] px-4 py-1.5 text-xs font-bold text-black hover:bg-[#00dd00]"
              >
                选择本地文件
              </button>
            </div>
          </div>
        </div>
      )}

      {permissionViewTarget && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={closePermissionView}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1c1c1f] px-5 py-4">
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <Eye size={15} className="text-[#00ff00]" />
                查看权限
              </span>
              <button type="button" onClick={closePermissionView} className="text-zinc-500 transition-colors hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="mb-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  {permissionViewTarget.kind === 'folder'
                    ? <Folder size={14} className="text-zinc-400" />
                    : <Files size={14} className="text-zinc-400" />}
                  {permissionViewTarget.name}
                </span>
              </div>

              {/* Tab 切换：成员 / 项目组 */}
              <div className="mb-3 flex items-center gap-1 border-b border-[#1c1c1f]">
                {([
                  { id: 'members' as const, name: `成员（${permissionGrantees.length}）` },
                  { id: 'groups' as const, name: `项目组（${permissionGroups.length}）` }
                ]).map(tab => {
                  const isActive = permissionViewTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPermissionViewTab(tab.id)}
                      className={`border-b-2 px-3 py-2 text-xs transition-colors ${
                        isActive ? 'border-[#00ff00] text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {tab.name}
                    </button>
                  );
                })}
              </div>

              {permissionViewTab === 'members' ? (
                <>
                  <p className="mb-2 text-[11px] text-zinc-400">当前可访问成员：</p>
                  <div className="space-y-1.5">
                    {permissionGrantees.map(g => (
                      <div key={g.email} className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-black px-3 py-2">
                        <div className="min-w-0">
                          <span className="block truncate text-xs text-zinc-200">{g.name}</span>
                          <span className="block truncate font-mono text-[10px] text-zinc-500">{g.email}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-mono ${
                            g.role === '管理员'
                              ? 'border-[#00ff00]/50 bg-[#00ff00]/10 text-[#00ff00]'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                          }`}>
                            {g.role}
                          </span>
                          {g.removable && (
                            <button
                              type="button"
                              onClick={() => requestRemoveMemberGrant(g.email, g.name)}
                              className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-red-500/60 hover:text-red-400"
                            >
                              移除权限
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {permissionGrantees.length === 0 && (
                      <div className="px-3 py-4 text-center text-[11px] text-zinc-600">暂无可访问成员。</div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-2 text-[11px] text-zinc-400">当前共享项目组：</p>
                  <div className="space-y-1.5">
                    {permissionGroups.map(grp => (
                      <div key={grp.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#00ff00]/30 bg-[#00ff00]/5 px-3 py-2.5">
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#00ff00]">
                            <Users size={13} />
                            {grp.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">{grp.id} · {grp.memberCount} 名成员</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">{grp.source}</span>
                          {grp.removable && (
                            <button
                              type="button"
                              onClick={() => requestRemoveGroupGrant(grp.name)}
                              className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-red-500/60 hover:text-red-400"
                            >
                              移除
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {permissionGroups.length === 0 && (
                      <div className="px-3 py-4 text-center text-[11px] text-zinc-600">暂无共享项目组。</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingPermissionRemoval && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPendingPermissionRemoval(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#1c1c1f] px-5 py-4 text-sm font-bold text-white">
              {pendingPermissionRemoval.scope === 'member' ? '移除访问权限' : '取消项目组共享'}
            </div>
            <div className="px-5 py-4 text-xs leading-relaxed text-zinc-300">
              {pendingPermissionRemoval.scope === 'member' ? (
                <>确认移除 <span className="font-semibold text-white">{pendingPermissionRemoval.name}</span> 对该{permissionViewTarget?.kind === 'folder' ? '目录' : '素材'}的访问权限？</>
              ) : (
                <>确认取消项目组 <span className="font-semibold text-white">「{pendingPermissionRemoval.name}」</span> 对该{permissionViewTarget?.kind === 'folder' ? '目录' : '素材'}的共享？该组成员的分享授权将一并移除。</>
              )}
              <p className="mt-2 text-[11px] text-amber-500">移除后授权立即失效。</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#1c1c1f] px-5 py-4">
              <button
                type="button"
                onClick={() => setPendingPermissionRemoval(null)}
                className="rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmPermissionRemoval}
                className="rounded bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
              >
                确认移除
              </button>
            </div>
          </div>
        </div>
      )}

      {shareModalTarget && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={closeShareModal}
        >
          <div
            className="w-full max-w-[560px] overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1c1c1f] px-5 py-4">
              <span className="text-sm font-bold text-white">分享 1 个{shareModalTarget.kind === 'folder' ? '文件夹' : '文件'}</span>
              <button
                type="button"
                onClick={closeShareModal}
                className="text-zinc-500 transition-colors hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
              {/* Target card */}
              <div className="flex items-center gap-3 rounded-lg border border-[#27272a] bg-[#121214] p-3">
                <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-[#27272a] bg-black">
                  {shareModalTarget.kind === 'folder' ? (
                    <Folder size={22} className="text-[#00ff00]" />
                  ) : (
                    <img src={shareModalTarget.thumbnail} alt={shareModalTarget.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{shareModalTarget.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{shareModalTarget.kind === 'folder' ? '文件夹' : `.${shareModalTarget.format}`} · 使用者</p>
                </div>
              </div>

              {/* Share scope */}
              <div>
                <label className="mb-1.5 block text-[11px] text-zinc-400">分享给</label>
                <select
                  value={shareScope}
                  onChange={(event) => { setShareScope(event.target.value as ShareScope); setShareError(''); }}
                  className="w-full rounded-lg border border-[#27272a] bg-[#121214] px-3 py-2.5 text-xs text-zinc-200 outline-none transition-colors focus:border-[#00ff00] [color-scheme:dark]"
                >
                  <option value="user">指定的人</option>
                  <option value="group">项目组</option>
                </select>
              </div>

              {/* Invite collaborator */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[11px] text-zinc-400">邀请协作者</label>
                  {shareScope === 'user' && (
                    <span className={`font-mono text-[10px] ${shareSelectedUsers.length >= SHARE_MAX_USERS ? 'text-amber-400' : 'text-zinc-600'}`}>
                      {shareSelectedUsers.length}/{SHARE_MAX_USERS}
                    </span>
                  )}
                </div>
                {shareScope === 'user' ? (
                  <div className="relative">
                    {shareSelectedUsers.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {shareSelectedUsers.map(user => (
                          <span
                            key={user.id}
                            className="inline-flex items-center gap-1 rounded-full border border-[#00ff00]/40 bg-[#00ff00]/10 py-0.5 pl-2 pr-1 text-[10px] text-[#00ff00]"
                          >
                            <span className="max-w-[160px] truncate">{user.name}（{user.email}）</span>
                            <button
                              type="button"
                              onClick={() => { setShareSelectedUsers(prev => prev.filter(u => u.id !== user.id)); setShareError(''); }}
                              className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-[#00ff00]/20"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      type="text"
                      value={shareUserQuery}
                      disabled={shareSelectedUsers.length >= SHARE_MAX_USERS}
                      onChange={(event) => { setShareUserQuery(event.target.value); setShareError(''); }}
                      placeholder={shareSelectedUsers.length >= SHARE_MAX_USERS ? `已达上限 ${SHARE_MAX_USERS} 人` : '输入姓名或邮箱，支持模糊匹配'}
                      className="w-full rounded-lg border border-[#27272a] bg-[#121214] px-3 py-2.5 text-xs text-zinc-200 outline-none transition-colors focus:border-[#00ff00] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {shareUserQuery.trim() && shareSelectedUsers.length < SHARE_MAX_USERS && shareUserMatches.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-lg border border-[#27272a] bg-[#0c0c0e] py-1 shadow-xl">
                        {shareUserMatches.map(user => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => { setShareSelectedUsers(prev => [...prev, user]); setShareUserQuery(''); setShareError(''); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#121214]"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00ff00]/15 text-[10px] font-bold text-[#00ff00]">
                              {user.name.slice(0, 2)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                              {user.name} <span className="font-mono text-[10px] text-zinc-500">({user.email})</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {shareUserQuery.trim() && shareSelectedUsers.length < SHARE_MAX_USERS && shareUserMatches.length === 0 && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-[#27272a] bg-[#0c0c0e] px-3 py-2 text-[11px] text-zinc-500 shadow-xl">
                        无匹配的平台用户
                      </div>
                    )}
                  </div>
                ) : (
                  <select
                    value={shareSelectedGroup}
                    onChange={(event) => { setShareSelectedGroup(event.target.value as SpaceId); setShareError(''); }}
                    className="w-full rounded-lg border border-[#27272a] bg-[#121214] px-3 py-2.5 text-xs text-zinc-200 outline-none transition-colors focus:border-[#00ff00] [color-scheme:dark]"
                  >
                    {projectGroupOptions.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {shareError && (
                <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-[11px] text-red-300">
                  {shareError}
                </div>
              )}

              {/* Existing grantees */}
              <div>
                <label className="mb-1.5 block text-[11px] text-zinc-400">已拥有权限</label>
                <div className="space-y-1 rounded-lg border border-[#1c1c1f] bg-[#121214]/40 p-1.5">
                  {shareExistingGrantees.length > 0 ? shareExistingGrantees.map(g => (
                    <div key={g.email} className="flex items-center gap-2 rounded px-2 py-1.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-200">
                        {g.name.slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-zinc-200">{g.name} <span className="font-mono text-[10px] text-zinc-500">({g.email})</span></p>
                        <p className="font-mono text-[9px] text-zinc-600">{g.source}</p>
                      </div>
                      <span className="shrink-0 rounded border border-zinc-700 bg-black px-2 py-0.5 text-[10px] text-zinc-400">使用者</span>
                    </div>
                  )) : (
                    <p className="px-2 py-3 text-center text-[11px] text-zinc-600">暂无其他权限用户</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[#1c1c1f] px-5 py-4">
              <button
                type="button"
                onClick={closeShareModal}
                className="rounded-lg border border-zinc-800 bg-black px-4 py-2 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmShare}
                className="rounded-lg bg-[#00ff00] px-5 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#00dd00]"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V1：移动功能暂时停用（保留弹窗逻辑便于后续恢复） */}
      {false && personalAssetMoveEditor && moveEditorAsset && (
        <div
          className="delete-folder-modal fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => setPersonalAssetMoveEditor(null)}
        >
          <div
            className="delete-folder-modal-panel w-full max-w-[520px] rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-900 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <FolderInput size={14} className="text-[#00ff00]" />
                  移动素材
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                  选择素材的目标文件夹。
                </p>
              </div>
              <button
                type="button"
                title="关闭"
                onClick={() => setPersonalAssetMoveEditor(null)}
                className="delete-folder-modal-close flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="delete-folder-modal-body mt-4 rounded border border-zinc-800 bg-black/40 p-3.5 text-[11px] font-mono text-zinc-300 space-y-2">
              <p>当前素材：{moveEditorAsset.name}</p>
              <label className="flex flex-col gap-1.5">
                <span className="text-zinc-500">目标目录</span>
                <select
                  value={personalAssetMoveEditor.targetFolderId}
                  onChange={(event) => {
                    const nextFolderId = event.target.value;
                    setPersonalAssetMoveEditor(prev => (
                      prev ? { ...prev, targetFolderId: nextFolderId } : prev
                    ));
                  }}
                  className="rounded border border-zinc-800 bg-[#0c0c0e] px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#00ff00]"
                >
                  {[...folders]
                    .sort((a, b) => (
                      getFolderPathLabel(a.id).localeCompare(getFolderPathLabel(b.id), 'zh-Hans-CN', { numeric: true })
                    ))
                    .map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {getFolderPathLabel(folder.id)}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPersonalAssetMoveEditor(null)}
                className="delete-folder-modal-cancel rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs font-mono text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitPersonalAssetMove}
                className="rounded border border-[#00ff00]/60 bg-[#00ff00]/10 px-4 py-1.5 text-xs font-semibold text-[#00ff00] transition-colors hover:border-[#00ff00] hover:bg-[#00ff00]/20"
              >
                确认移动
              </button>
            </div>
          </div>
        </div>
      )}

      {personalAssetRenameEditor && renameEditorAsset && (
        <div
          className="delete-folder-modal fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={closePersonalAssetRenameEditor}
        >
          <div
            className="delete-folder-modal-panel w-full max-w-[520px] rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-900 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Pencil size={14} className="text-[#00ff00]" />
                  重命名素材
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                  为素材填写一个新的名称。
                </p>
              </div>
              <button
                type="button"
                title="关闭"
                onClick={closePersonalAssetRenameEditor}
                className="delete-folder-modal-close flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="delete-folder-modal-body mt-4 rounded border border-zinc-800 bg-black/40 p-3.5 text-[11px] font-mono text-zinc-300 space-y-2">
              <p>当前素材：{renameEditorAsset.name}</p>
              <label className="flex flex-col gap-1.5">
                <span className="text-zinc-500">新名称</span>
                <input
                  autoFocus
                  maxLength={PERSONAL_ASSET_NAME_MAX_LENGTH}
                  value={personalAssetRenameEditor.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setPersonalAssetRenameEditor(prev => (
                      prev ? { ...prev, name: nextName } : prev
                    ));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitPersonalAssetRename();
                    if (event.key === 'Escape') closePersonalAssetRenameEditor();
                  }}
                  className={`rounded border bg-[#0c0c0e] px-2 py-1.5 text-xs text-zinc-200 outline-none transition-colors ${
                    shouldShowPersonalAssetRenameError
                      ? 'border-red-500/70 focus:border-red-500'
                      : 'border-zinc-800 focus:border-[#00ff00]'
                  }`}
                />
              </label>
              {shouldShowPersonalAssetRenameError && (
                <p className="text-[10px] leading-relaxed text-red-400">
                  {personalAssetRenameValidationError}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closePersonalAssetRenameEditor}
                className="delete-folder-modal-cancel rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs font-mono text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitPersonalAssetRename}
                className="rounded border border-[#00ff00]/60 bg-[#00ff00]/10 px-4 py-1.5 text-xs font-semibold text-[#00ff00] transition-colors hover:border-[#00ff00] hover:bg-[#00ff00]/20"
              >
                确认重命名
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBatchDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPendingBatchDelete(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[#1c1c1f] px-5 py-4 text-sm font-bold text-white">批量删除素材</div>
            <div className="px-5 py-4 text-xs leading-relaxed text-zinc-300">
              确认删除选中的 <span className="font-semibold text-white">{batchSelectedIds.size}</span> 个素材？
              <p className="mt-2 text-[11px] text-amber-500">删除后将从当前空间移除，操作不可撤销。</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#1c1c1f] px-5 py-4">
              <button
                type="button"
                onClick={() => setPendingBatchDelete(false)}
                className="rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void runBatchDelete(); }}
                className="rounded bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {batchDeleteProgress && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] shadow-2xl">
            <div className="px-5 py-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                <Loader2 size={15} className="animate-spin text-[#00ff00]" />
                正在删除…（{batchDeleteProgress.done}/{batchDeleteProgress.total}）
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-[#00ff00] transition-all duration-150"
                  style={{ width: `${Math.round((batchDeleteProgress.done / Math.max(1, batchDeleteProgress.total)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingPersonalAssetDelete && (
        <div
          className="delete-folder-modal fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => setPendingPersonalAssetDelete(null)}
        >
          <div
            className="delete-folder-modal-panel w-full max-w-[520px] rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-900 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Trash2 size={14} className="text-red-400" />
                  确认删除素材
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                  删除后不可恢复，请确认本次操作。
                </p>
              </div>
              <button
                type="button"
                title="关闭"
                onClick={() => setPendingPersonalAssetDelete(null)}
                className="delete-folder-modal-close flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="delete-folder-modal-body mt-4 rounded border border-zinc-800 bg-black/40 p-3.5 text-[11px] font-mono text-zinc-300 space-y-1.5">
              <p>即将删除素材「{pendingPersonalAssetDelete.assetName}」。</p>
              <p className="delete-folder-modal-warning text-amber-400">
                {isPersonalSpace
                  ? '此素材将从个人空间中移除，且不再出现在当前目录。'
                  : `此素材将从「${currentSpace.name}」中移除，且不再出现在当前目录。`}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingPersonalAssetDelete(null)}
                className="delete-folder-modal-cancel rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs font-mono text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmPersonalAssetDelete}
                className="delete-folder-modal-confirm rounded border border-red-500/60 bg-red-950/40 px-4 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/60 hover:text-red-200"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {personalUploadDraft && (
        <div className="personal-upload-modal fixed inset-0 z-50 bg-black/85 backdrop-blur-sm p-4 md:p-6 flex items-center justify-center">
          <div className="personal-upload-modal-panel w-full max-w-[1080px] max-h-[88vh] overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] flex flex-col">
            <div className="px-5 py-4 border-b border-[#27272a] flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Sparkles size={14} className="text-[#00ff00]" />
                  上传预处理与 AI 自动打标
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                  共 {personalUploadDraft.items.length} 条 | 总大小 {formatUploadTotal(personalUploadDraft.totalBytes)} | 已完成标注 {personalReadyTaggingCount}/{personalUploadDraft.items.length}
                </p>
              </div>
              <button
                type="button"
                title="关闭上传面板"
                onClick={closePersonalUploadDraft}
                className="personal-upload-modal-close flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-500 transition-colors hover:border-zinc-600 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-[#27272a]">
              <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-[#00ff00] transition-all"
                  style={{
                    width: `${personalUploadDraft.items.length === 0 ? 0 : (personalReadyTaggingCount / personalUploadDraft.items.length) * 100}%`
                  }}
                />
              </div>
              {personalUploadDraft.isTagging && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
                  <Loader2 size={12} className="animate-spin text-[#00ff00]" />
                  正在执行上传预处理和智能打标，请稍候...
                </div>
              )}
            </div>

            <div className="personal-upload-modal-list flex-1 overflow-y-auto p-5 space-y-3">
              {personalUploadDraft.items.map((item) => {
                const tagSuggestions = getTagSuggestions(item.id);
                return (
                <div key={item.id} className="personal-upload-modal-item rounded border border-[#27272a] bg-black/35 p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-28 sm:w-32 shrink-0">
                      <div className="personal-upload-modal-preview relative aspect-[4/3] rounded border border-zinc-800 overflow-hidden bg-black">
                        {item.uploadType === 'video' ? (
                          <video src={item.previewUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                        ) : (
                          <img src={item.previewUrl} alt={item.fileName} className="h-full w-full object-cover" />
                        )}
                        <span
                          className={`personal-upload-modal-status-badge pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-mono ${
                            item.status === 'ready'
                              ? 'is-ready border-[#00ff00]/50 bg-black/65 text-[#00ff00]'
                              : 'is-pending border-amber-400/50 bg-black/65 text-amber-300'
                          }`}
                        >
                          {item.status === 'ready' ? '已打标' : '打标中'}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="space-y-1">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="shrink-0 text-[10px] font-mono text-zinc-500">文件名</span>
                          <input
                            type="text"
                            value={item.fileName}
                            onChange={(event) => updateDraftItemName(item.id, event.target.value)}
                            placeholder="请输入素材名称"
                            className="personal-upload-modal-input min-w-0 w-full rounded border border-zinc-800 bg-[#0c0c0e] px-2 py-1 text-[11px] font-mono text-zinc-200 outline-none transition-colors focus:border-[#00ff00]"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-y-1 text-[10.5px] font-mono">
                          <span className="text-zinc-500">.{item.format}</span>
                          <span className="ml-2 border-l border-zinc-800 pl-2 text-zinc-500">{toDisplayMB(item.sizeBytes)} MB</span>
                          <span className="ml-2 border-l border-zinc-800 pl-2 text-[#00ff00]">{personalTypeLabel[item.uploadType]}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <label className="inline-flex items-center gap-1 text-[10.5px] font-mono text-zinc-500">
                          分类
                          <select
                            value={item.category}
                            onChange={(event) => updateDraftItemCategory(item.id, event.target.value as AssetCategory)}
                            className="rounded border border-zinc-800 bg-[#0c0c0e] px-1.5 py-0.5 text-[10px] text-zinc-200"
                          >
                            {uploadCategoryOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.name}</option>
                            ))}
                          </select>
                        </label>
                        <span className="ml-1 inline-flex items-center border-l border-zinc-800 pl-2 text-[10.5px] font-mono text-zinc-500">
                          标签
                        </span>
                        {item.tags.map((tag) => (
                          <span
                            key={`${item.id}-${tag}`}
                            className="inline-flex items-center gap-1 rounded border border-[#00ff00]/20 bg-[#00ff00]/5 px-2 py-0.5 text-[10px] font-mono text-[#00ff00]"
                          >
                            <button
                              type="button"
                              onClick={() => editDraftTag(item.id, tag)}
                              className="inline-flex items-center gap-1 hover:text-white"
                              title="编辑标签"
                            >
                              <Tag size={10} />
                              #{tag}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeDraftTag(item.id, tag)}
                              className="text-zinc-500 hover:text-red-400"
                              title="删除标签"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                        {item.tags.length === 0 && (
                          <span className="text-[10px] text-zinc-600 font-mono">暂无标签</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="w-full max-w-[420px]">
                          <input
                            type="text"
                            value={pendingTagInputs[item.id] ?? ''}
                            onChange={(event) => setPendingTagInputs(prev => ({ ...prev, [item.id]: event.target.value }))}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                addDraftTag(item.id);
                              }
                            }}
                            placeholder="新增标签并回车"
                            className="personal-upload-modal-input w-full rounded border border-zinc-800 bg-[#0c0c0e] px-2 py-1.5 text-[11px] font-mono text-zinc-200 outline-none transition-colors focus:border-[#00ff00]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => addDraftTag(item.id)}
                          className="personal-upload-modal-add-tag shrink-0 rounded border border-zinc-800 bg-black px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00]"
                        >
                          添加
                        </button>
                      </div>

                      {tagSuggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] font-mono text-zinc-500">推荐标签</span>
                          {tagSuggestions.map((tag) => (
                            <button
                              key={`${item.id}-suggest-${tag}`}
                              type="button"
                              onClick={() => updateDraftItemTags(item.id, tags => [...tags, tag])}
                              className="rounded border border-zinc-800 bg-black px-2 py-0.5 text-[10px] font-mono text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00]"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="personal-upload-modal-remove-slot shrink-0 self-stretch flex items-center justify-center border-l border-zinc-800 px-3">
                      <button
                        type="button"
                        onClick={() => removeDraftItem(item.id, item.fileName)}
                        className="shrink-0 inline-flex items-center gap-1 rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] font-mono text-zinc-500 transition-colors hover:border-red-500/60 hover:text-red-300"
                        title="移除此素材"
                      >
                        <X size={10} />
                        移除
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-[#27272a] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closePersonalUploadDraft}
                className="personal-upload-modal-cancel rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs font-mono text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmPersonalUpload}
                disabled={personalUploadDraft.isTagging || personalUploadDraft.items.length === 0}
                className={`rounded px-4 py-1.5 text-xs font-bold transition-colors ${
                  personalUploadDraft.isTagging || personalUploadDraft.items.length === 0
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-[#00ff00] text-black hover:bg-[#00dd00]'
                }`}
              >
                确认上传到置顶目录
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingFolderDelete && (
        <div
          className="delete-folder-modal fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => setPendingFolderDelete(null)}
        >
          <div
            className="delete-folder-modal-panel w-full max-w-[520px] rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-900 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Trash2 size={14} className="text-red-400" />
                  确认删除文件夹
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                  删除后不可恢复，请确认本次操作。
                </p>
              </div>
              <button
                type="button"
                title="关闭"
                onClick={() => setPendingFolderDelete(null)}
                className="delete-folder-modal-close flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="delete-folder-modal-body mt-4 rounded border border-zinc-800 bg-black/40 p-3.5 text-[11px] font-mono text-zinc-300 space-y-1.5">
              <p>即将删除文件夹「{pendingFolderDelete.folderName}」。</p>
              <p>将同时删除 {pendingFolderDelete.childFolderCount} 个子文件夹。</p>
              {pendingFolderDelete.affectedAssetCount > 0 && (
                <p className="delete-folder-modal-warning text-amber-400">
                  受影响素材 {pendingFolderDelete.affectedAssetCount} 个，
                  {pendingFolderDelete.fallbackFolderId
                    ? `将移动到「${pendingFolderDelete.fallbackFolderName ?? '上级文件夹'}」。`
                    : '将解除目录归属。'}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingFolderDelete(null)}
                className="delete-folder-modal-cancel rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs font-mono text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeleteFolder}
                className="delete-folder-modal-confirm rounded border border-red-500/60 bg-red-950/40 px-4 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/60 hover:text-red-200"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Large asset detail modal */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm p-4 md:p-6 flex items-center justify-center"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="h-[min(88vh,760px)] w-full max-w-[1200px] bg-[#0c0c0e] border border-[#27272a] rounded-xl overflow-hidden flex flex-col lg:flex-row"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              ref={previewViewportRef}
              className="relative flex-1 min-h-[280px] bg-black border-b lg:border-b-0 lg:border-r border-[#27272a] overflow-hidden"
              onWheel={handlePreviewWheel}
            >
              <img
                src={selectedAsset.previewUrl}
                alt={selectedAsset.name}
                className="w-full h-full select-none"
                style={{
                  objectFit: 'contain',
                  transform: `scale(${previewMode === 'fit' ? 1 : previewZoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 120ms ease-out'
                }}
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setPreviewNaturalSize({
                    width: target.naturalWidth,
                    height: target.naturalHeight
                  });
                }}
                referrerPolicy="no-referrer"
                draggable={false}
              />

              <div className="asset-source-badge absolute bottom-4 right-4 flex bg-black/95 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-400 items-center gap-1">
                <span>来源:</span>
                {selectedExternalSourceMeta ? (
                  <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-black px-1.5 py-0.5 text-zinc-200">
                    <span className={`h-1.5 w-1.5 rounded-full ${selectedExternalSourceMeta.dotClassName}`} />
                    <span className="font-bold force-text-white">{selectedExternalSourceMeta.label}</span>
                  </span>
                ) : (
                  <span className="text-white font-bold force-text-white">{selectedAsset.platform}</span>
                )}
              </div>

              <div className="absolute left-4 bottom-4 flex items-center gap-2 rounded border border-zinc-800 bg-black/90 px-2 py-1 text-[10px] font-mono text-zinc-300">
                <button
                  type="button"
                  onClick={() => stepPreviewZoom('out')}
                  disabled={isPreviewZoomAtMin}
                  className={`h-6 w-6 rounded border text-xs transition-colors ${
                    isPreviewZoomAtMin
                      ? 'border-zinc-800 text-zinc-700 cursor-not-allowed'
                      : 'border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500'
                  }`}
                  title="缩小"
                >
                  -
                </button>
                <span className="min-w-[48px] text-center text-zinc-200">{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => stepPreviewZoom('in')}
                  disabled={isPreviewZoomAtMax}
                  className={`h-6 w-6 rounded border text-xs transition-colors ${
                    isPreviewZoomAtMax
                      ? 'border-zinc-800 text-zinc-700 cursor-not-allowed'
                      : 'border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500'
                  }`}
                  title="放大"
                >
                  +
                </button>
              </div>
            </div>

            <div className="asset-detail-sidebar w-full lg:w-[320px] xl:w-[336px] bg-[#0a0a0c] border-t lg:border-t-0 lg:border-l border-[#27272a] p-5 overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-900 pb-3 shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                  素材详情
                </p>
                <button
                  type="button"
                  aria-label="关闭素材详情"
                  title="关闭素材详情"
                  onClick={() => setSelectedAsset(null)}
                  className="asset-detail-close flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-3">
                  {isSelectedExternalAsset ? (
                    <div className="asset-detail-form-field w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[14px] font-medium tracking-wide text-zinc-200">
                      {selectedAsset.name}
                    </div>
                  ) : (
                    <input
                      value={assetDetailNameDraft}
                      onChange={(event) => setAssetDetailNameDraft(event.target.value)}
                      onBlur={submitAssetDetailNameEdit}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitAssetDetailNameEdit();
                        }
                        if (event.key === 'Escape') {
                          setAssetDetailNameDraft(selectedAsset.name);
                        }
                      }}
                      className="asset-detail-form-field w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[14px] font-medium tracking-wide text-zinc-300 outline-none focus:border-[#00ff00]"
                    />
                  )}
                  <div className="asset-detail-form-field min-h-[56px] rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5">
                    {selectedAsset.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedAsset.tags.map((tag, index) => (
                          <span
                            key={`detail-tag-${index}-${tag}`}
                            className="rounded-md border border-[#00ff00]/30 bg-[#00ff00]/8 px-2 py-0.5 text-[11px] font-mono text-[#00ff00]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500">暂无标签</span>
                    )}
                  </div>
                </div>

                <div className="pt-1">
                  <h3 className="text-sm font-semibold text-zinc-200">素材信息</h3>
                  <div className="mt-3 space-y-2.5 font-mono">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="w-[68px] shrink-0 text-left text-zinc-500">文件夹</span>
                      <span className="min-w-0 flex-1 truncate text-right text-zinc-300" title={selectedAssetFolderLabel}>{selectedAssetFolderLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="w-[68px] shrink-0 text-left text-zinc-500">尺寸</span>
                      <span className="min-w-0 flex-1 text-right text-zinc-300">{selectedAssetDimensionLabel}</span>
                    </div>
                    {selectedAssetDurationLabel && (
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="w-[68px] shrink-0 text-left text-zinc-500">时长</span>
                        <span className="min-w-0 flex-1 text-right text-zinc-300">{selectedAssetDurationLabel}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="w-[68px] shrink-0 text-left text-zinc-500">大小</span>
                      <span className="min-w-0 flex-1 text-right text-zinc-300">{selectedAsset.sizeMB} MB</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="w-[68px] shrink-0 text-left text-zinc-500">后缀</span>
                      <span className="min-w-0 flex-1 text-right text-zinc-300">{selectedAsset.format.toLowerCase()}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="w-[68px] shrink-0 text-left text-zinc-500">创建人</span>
                      <span className="min-w-0 flex-1 truncate text-right text-zinc-300" title={selectedAsset.author}>{selectedAsset.author}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="w-[68px] shrink-0 text-left text-zinc-500">添加日期</span>
                      <span className="min-w-0 flex-1 text-right text-zinc-300">{selectedAssetCreatedAtLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="w-[68px] shrink-0 text-left text-zinc-500">地区</span>
                      <span className="min-w-0 flex-1 text-right text-zinc-300">{selectedAssetRegionLabel}</span>
                    </div>
                    {selectedExternalAsset && (
                      <>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="w-[68px] shrink-0 text-left text-zinc-500">来源平台</span>
                          <span className="min-w-0 flex-1 text-right text-zinc-300">{selectedExternalSourceMeta?.label}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3 text-xs">
                          <span className="w-[68px] shrink-0 pt-0.5 text-left text-zinc-500">商用信息</span>
                          <span className="min-w-0 flex-1 text-right leading-relaxed text-amber-300">{selectedExternalAsset.nonCommercialNotice}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* ACTION BUTTONS (F9 Paths) */}
                {!isSelectedExternalAsset ? (
                  <div className="pt-4 border-t border-zinc-900 space-y-3">
                  {/* Path A: Local high-speed download */}
                  <div>
                    <h4 className="text-[10.2px] text-zinc-500 font-mono uppercase mb-1.5 tracking-wide">
                      本地磁盘离线提取
                    </h4>

                    {selectedAssetTask ? (
                      <div className="w-full bg-[#121214] border border-dashed border-zinc-800 p-3.5 rounded text-center font-mono">
                        {selectedAssetTask.status === 'queued' ? (
                          <div className="flex flex-col gap-1 items-center">
                            <span className="text-xs text-amber-400 font-bold animate-pulse">等候下载空闲槽中</span>
                            <span className="text-[9.5px] text-zinc-500 leading-tight">由于网络和并发限制，至多同时执行 3 个素材下载包。</span>
                            <button
                              onClick={() => cancelActiveDownload(selectedAsset.id)}
                              className="mt-2 text-red-500 hover:text-red-400 text-[10px] underline cursor-pointer"
                            >
                              移出缓冲区
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between text-xs text-zinc-400">
                              <span>下载拉取中...</span>
                              <span className="text-[#00ff00] font-bold">{selectedAssetTask.progress}%</span>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                              <div
                                className="bg-[#00ff00] h-full"
                                style={{ width: `${selectedAssetTask.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleLocalDownload(selectedAsset)}
                        className={`w-full py-2 px-4 text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                          downloadedAssetIds.has(selectedAsset.id)
                            ? 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white btn-secondary'
                            : 'bg-white hover:bg-zinc-150 text-black font-bold shadow-lg btn-primary'
                        }`}
                      >
                        <Download size={13} />
                        {downloadedAssetIds.has(selectedAsset.id)
                          ? '已下载 · 在资源管理器中打开文件夹'
                          : `下载到本地缓存 (${selectedAsset.sizeMB} MB)`
                        }
                      </button>
                    )}
                  </div>

                  {/* Path B: Smart DCC hot import */}
                  <div>
                    <h4 className="text-[10px] text-zinc-500 font-mono uppercase mb-1.5 tracking-wide">
                      专属通道智能热导入 DCC
                    </h4>

                    {/* Compatible DCC targets mapping matrix */}
                    <div className="space-y-1.5">
                      {[AppId.ComfyUI, AppId.Blender, AppId.Photoshop, AppId.Maya, AppId.Max3ds].map((appId) => {
                        const dccApp = apps.find(app => app.id === appId);
                        const isConnected = dccApp?.status === AppStatus.Connected;
                        const { compatible, reason } = checkCompatibility(selectedAsset.format, appId);

                        if (!compatible) {
                          return (
                            <div
                              key={appId}
                              title={reason}
                              className="w-full bg-[#121214]/40 border border-dashed border-zinc-900/60 p-2 text-zinc-650 rounded text-[10px] font-mono flex items-center gap-2 select-none cursor-not-allowed opacity-35"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                              <span className="uppercase font-bold shrink-0">{appId === AppId.Max3ds ? '3DS MAX' : appId}:</span>
                              <span className="truncate line-clamp-1">{reason}</span>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={appId}
                            onClick={() => handleImportDccTrigger(selectedAsset, appId)}
                            className={`w-full p-2.5 rounded text-left border text-[11px] font-mono flex items-center justify-between transition-all cursor-pointer ${
                              isConnected
                                ? 'bg-black border-[#00ff00]/40 text-zinc-200 hover:bg-[#00ff00]/10 hover:border-[#00ff00] hover:text-white glow-btn group/btn'
                                : 'bg-[#121214] border-zinc-900 text-zinc-500 hover:border-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#00ff00]' : 'bg-red-500'}`}></div>
                              <span className={`uppercase font-bold ${isConnected ? 'text-[#00ff00]' : 'text-zinc-400'}`}>
                                {appId === AppId.Max3ds ? '3D MAX' : appId}
                              </span>
                              <span className="text-[9.5px] text-zinc-500 shrink-0 select-none">|</span>
                              <span className={`truncate text-[10px] ${isConnected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                {getImportActionLabel(selectedAsset.format, appId)}
                              </span>
                            </div>
                            <CornerDownRight size={11} className={`shrink-0 ${isConnected ? 'text-[#00ff00] group-hover/btn:translate-x-0.5 transition-transform' : 'text-zinc-500'}`} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  </div>
                ) : (
                  <div className="pt-4 border-t border-zinc-900 space-y-3">
                    <div className="rounded border border-zinc-800 bg-black/40 p-3.5 text-[11px] font-mono text-zinc-300 space-y-2">
                      <p className="text-zinc-100 font-semibold">外部来源信息</p>
                      <p>来源平台：{selectedExternalSourceMeta?.label ?? selectedAsset.platform}</p>
                      <p className="leading-relaxed text-zinc-400">{selectedExternalAsset?.nonCommercialNotice}</p>
                      {selectedExternalAsset?.sourceUrl && (
                        <a
                          href={selectedExternalAsset.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#00ff00] transition-colors hover:text-[#7dff7d]"
                        >
                          打开来源页面
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED MODAL 1: OPTION MODAL BASED ON DCC TYPE ("可选" Matrix path) */}
      {importOptionsConfig && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-md w-full font-sans">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Shuffle size={16} className="text-[#00ff00]" />
                一键导入模式配置: {apps.find(a => a.id === importOptionsConfig.dccId)?.name}
              </h3>
              <button onClick={() => setImportOptionsConfig(null)} className="text-zinc-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-4 font-mono leading-relaxed">
              素材 <b>{importOptionsConfig.asset.name}</b> 触发推送指令。
              由于该资产不支持单模型热插拔同步，宿主 DCC 提供了以下实例化承接模式，请根据作业流需求选择：
            </p>

            <div className="bg-zinc-950 border border-zinc-900 rounded p-4 mb-6">
              {/* PHOTOSHOP IMAGES OPTIONS */}
              {importOptionsConfig.dccId === AppId.Photoshop && (
                <div className="space-y-3 text-xs font-mono">
                  <button
                    onClick={() => setSelectedImportMode('layer')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'layer'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式一：热智能对象图层置入</span>
                      {selectedImportMode === 'layer' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      将素材按高精智能矢量对象直接叠加图层导入到当前最顶层的活跃视区，不破坏底层原画底稿。
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedImportMode('artboard')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'artboard'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式二：独立画板栅格化排放</span>
                      {selectedImportMode === 'artboard' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      根据素材本身物理尺寸，在 Photoshop 工程内横向增设一个命名完备的九宫格独立画板排布资产。
                    </p>
                  </button>
                </div>
              )}

              {/* BLENDER MODELS OPTIONS */}
              {importOptionsConfig.dccId === AppId.Blender && (
                <div className="space-y-3 text-xs font-mono">
                  <button
                    onClick={() => setSelectedImportMode('append')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'append'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式一：直接本体追加导入</span>
                      {selectedImportMode === 'append' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      将.blend 模型里的几何体、网格纹理以及着色节点，通过本地打包直接写入并追加到当前主工程内，支持直接解构修改。
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedImportMode('link')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'link'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式二：外部资源轻量引用</span>
                      {selectedImportMode === 'link' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      建立场景对外部下载目录的单向只读软关联，仅投射几何虚影。工程轻量且当服务器源文件更新时可自动同频。
                    </p>
                  </button>
                </div>
              )}

              {/* MAYA OPTIONS */}
              {importOptionsConfig.dccId === AppId.Maya && (
                <div className="space-y-3 text-xs font-mono">
                  <button
                    onClick={() => setSelectedImportMode('importScene')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'importScene'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式一：导入并入当前层</span>
                      {selectedImportMode === 'importScene' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      并入当前场景，大纲视图将增设项目专用命名空间，自动清除无关的多余空变换节点。
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedImportMode('newScene')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'newScene'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式二：强制新建场景加载</span>
                      {selectedImportMode === 'newScene' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      重置并清空现有的 Maya 视图卡槽。拉起新工程用于对该次世代装备/马匹模型执行独立微调制备。
                    </p>
                  </button>
                </div>
              )}

              {/* 3DS MAX OPTIONS */}
              {importOptionsConfig.dccId === AppId.Max3ds && (
                <div className="space-y-3 text-xs font-mono">
                  <button
                    onClick={() => setSelectedImportMode('merge')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'merge'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式一：场景追加合并</span>
                      {selectedImportMode === 'merge' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      运行 3ds Max 经典 Merge 合并流程，将选定几何多边形直接合并入现有的渲染图层中。
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedImportMode('newScene')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'newScene'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式二：作为新项目文件打开</span>
                      {selectedImportMode === 'newScene' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      关闭当前作业面，打开此独立 max 三维工程包进行资产调色、法线烘焙渲染等。
                    </p>
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end font-mono">
              <button 
                onClick={() => setImportOptionsConfig(null)}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors btn-secondary"
              >
                取消导入
              </button>
              <button
                onClick={submitOptionalImport}
                className="px-5 py-1.5 bg-[#00ff00] text-black font-semibold rounded text-xs transition-colors hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] glow-btn btn-special"
              >
                完成配置并投送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

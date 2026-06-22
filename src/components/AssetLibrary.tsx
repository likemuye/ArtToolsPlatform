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
  FolderDot,
  Shuffle,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Pencil,
  Trash2,
  Plus,
  Files
} from 'lucide-react';
import { AppId, AppStatus, AppConfig, ArtAsset, AssetCategory, SpaceId, ProjectSpace, AssetFolder, PersonalUploadedAsset, PersonalUploadType } from '../types';
import { INITIAL_ASSET_FOLDERS_PROJECT_A, INITIAL_ASSET_FOLDER_ASSIGNMENTS_PROJECT_A } from '../data';

interface AssetLibraryProps {
  currentSpace: ProjectSpace;
  apps: AppConfig[];
  assets: ArtAsset[];
  personalAssets: PersonalUploadedAsset[];
  setPersonalAssets: React.Dispatch<React.SetStateAction<PersonalUploadedAsset[]>>;
  downloadedAssetIds: Set<string>;
  setDownloadedAssetIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  simulatedDiskGB: number;
  setSimulatedDiskGB: React.Dispatch<React.SetStateAction<number>>;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

interface PendingPersonalUploadItem {
  id: string;
  fileName: string;
  sourceFileName: string;
  sizeBytes: number;
  format: string;
  uploadType: PersonalUploadType;
  previewUrl: string;
  tags: string[];
  status: 'tagging' | 'ready';
}

interface PersonalUploadDraft {
  items: PendingPersonalUploadItem[];
  totalBytes: number;
  isTagging: boolean;
}

// Simulated active download task structure for queue management
interface ActiveDownload {
  assetId: string;
  progress: number;
  status: 'downloading' | 'queued';
  targetDccImportAfterDownload?: AppId; // If triggered by import click, remembers DCC target
}

const ASSET_FOLDER_STORAGE_KEY = 'art-launcher-asset-folders-v1';
const ASSET_FOLDER_ASSIGNMENT_STORAGE_KEY = 'art-launcher-asset-folder-assignments-v1';
const ASSET_FOLDER_PANE_WIDTH_STORAGE_KEY = 'art-launcher-folder-pane-width-v1';
const REMOVED_DEFAULT_FOLDER_IDS = new Set(['folder-browser', 'folder-cloud-local']);
const DEFAULT_ASSET_FOLDER_ID = 'folder-primary';
const CREATED_FOLDER_ID_PATTERN = /^folder-(\d{10,})$/;
const PERSONAL_UPLOAD_MAX_COUNT = 500;
const PERSONAL_UPLOAD_MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;
const BYTES_IN_MB = 1024 * 1024;
const DEFAULT_FOLDER_PANE_WIDTH = 304;
const MIN_FOLDER_PANE_WIDTH = 240;
const MAX_FOLDER_PANE_WIDTH = 520;

// Folder name validation rules: length cap, illegal chars, reserved names, sibling uniqueness
const FOLDER_NAME_MAX_LENGTH = 32;
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

const normalizeFolders = (folders: AssetFolder[]) => {
  return folders.filter(folder => !REMOVED_DEFAULT_FOLDER_IDS.has(folder.id));
};

const normalizeFolderAssignments = (assignments: Record<string, string>) => {
  return Object.fromEntries(
    Object.entries(assignments).map(([assetId, folderId]) => [
      assetId,
      REMOVED_DEFAULT_FOLDER_IDS.has(folderId) ? DEFAULT_ASSET_FOLDER_ID : folderId
    ])
  );
};

const getInitialFolders = () => {
  try {
    const stored = localStorage.getItem(ASSET_FOLDER_STORAGE_KEY);
    if (!stored) return INITIAL_ASSET_FOLDERS_PROJECT_A;

    const parsed = JSON.parse(stored) as AssetFolder[];
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_ASSET_FOLDERS_PROJECT_A;
    return normalizeFolders(parsed);
  } catch {
    return INITIAL_ASSET_FOLDERS_PROJECT_A;
  }
};

const getInitialFolderAssignments = () => {
  try {
    const stored = localStorage.getItem(ASSET_FOLDER_ASSIGNMENT_STORAGE_KEY);
    if (!stored) return INITIAL_ASSET_FOLDER_ASSIGNMENTS_PROJECT_A;

    const parsed = JSON.parse(stored) as Record<string, string>;
    if (!parsed || typeof parsed !== 'object') return INITIAL_ASSET_FOLDER_ASSIGNMENTS_PROJECT_A;
    return normalizeFolderAssignments({ ...INITIAL_ASSET_FOLDER_ASSIGNMENTS_PROJECT_A, ...parsed });
  } catch {
    return INITIAL_ASSET_FOLDER_ASSIGNMENTS_PROJECT_A;
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

export default function AssetLibrary({
  currentSpace,
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
  const [selectedCat, setSelectedCat] = useState<AssetCategory>(AssetCategory.All);
  const [keyword, setKeyword] = useState<string>('');
  const [selectedAsset, setSelectedAsset] = useState<ArtAsset | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // Temporarily keep card metadata visible while the view-mode toggle is hidden.
  const showAssetCardInfo = true;
  /*
  const [showAssetCardInfo, setShowAssetCardInfo] = useState<boolean>(true);
  */
  const [folderKeyword, setFolderKeyword] = useState<string>('');
  const [isFolderSearchActive, setIsFolderSearchActive] = useState<boolean>(false);
  const [folders, setFolders] = useState<AssetFolder[]>(getInitialFolders);
  const [folderAssignments, setFolderAssignments] = useState<Record<string, string>>(getInitialFolderAssignments);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('folder-primary');
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(['folder-primary', 'folder-character', 'folder-scene'])
  );
  const [includeSubfolderAssets, setIncludeSubfolderAssets] = useState<boolean>(true);
  const [folderEditor, setFolderEditor] = useState<{
    mode: 'create' | 'rename';
    parentId: string | null;
    folderId?: string;
    name: string;
  } | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);
  const [isPersonalUploadInfoOpen, setIsPersonalUploadInfoOpen] = useState<boolean>(false);
  const [personalUploadDraft, setPersonalUploadDraft] = useState<PersonalUploadDraft | null>(null);
  const [pendingTagInputs, setPendingTagInputs] = useState<Record<string, string>>({});
  const [folderPaneWidth, setFolderPaneWidth] = useState<number>(getInitialFolderPaneWidth);
  const [isResizingFolderPane, setIsResizingFolderPane] = useState<boolean>(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => window.innerWidth >= 1024);
  const assetLayoutRef = useRef<HTMLDivElement | null>(null);
  const personalUploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadSessionRef = useRef<number>(0);

  // Reset page when filters or space change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCat, keyword, currentSpace, selectedFolderId, includeSubfolderAssets]);

  useEffect(() => {
    setSelectedAsset(null);
  }, [currentSpace]);

  useEffect(() => {
    if (!folderContextMenu) return;

    const closeContextMenu = () => setFolderContextMenu(null);
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [folderContextMenu]);

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
    const cleanedFolders = normalizeFolders(folders);
    if (cleanedFolders.length !== folders.length) {
      setFolders(cleanedFolders);
    }

    const cleanedAssignments = normalizeFolderAssignments(folderAssignments);
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

    const fallbackFolder = folders.find(folder => folder.id === DEFAULT_ASSET_FOLDER_ID)
      ?? folders.find(folder => folder.parentId === null)
      ?? folders[0];
    if (fallbackFolder) {
      setSelectedFolderId(fallbackFolder.id);
    }
  }, [folders, selectedFolderId]);

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

  // Download simulation engine states (queue F9 rule)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  
  // Custom dialog popups - "可选" mode selections
  const [importOptionsConfig, setImportOptionsConfig] = useState<{ asset: ArtAsset, dccId: AppId } | null>(null);
  const [selectedImportMode, setSelectedImportMode] = useState<string>('');

  const isProjectA = currentSpace.id === SpaceId.ProjectA;
  const isPersonalSpace = currentSpace.id === SpaceId.Personal;
  const activeAssets: ArtAsset[] = isPersonalSpace ? personalAssets : assets;

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

  const addDraftTag = (itemId: string) => {
    const value = normalizeTag(pendingTagInputs[itemId] ?? '');
    if (!value) return;
    updateDraftItemTags(itemId, tags => [...tags, value]);
    setPendingTagInputs(prev => ({ ...prev, [itemId]: '' }));
  };

  const removeDraftTag = (itemId: string, tagToRemove: string) => {
    updateDraftItemTags(itemId, tags => tags.filter(tag => tag !== tagToRemove));
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

    const timestampBase = Date.now();
    const newAssets: PersonalUploadedAsset[] = personalUploadDraft.items.map((item, index) => ({
      id: `personal-asset-${timestampBase}-${index}`,
      name: getFileBaseName(item.fileName),
      category: item.uploadType === 'video' ? AssetCategory.Video : AssetCategory.GUI,
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
        next[asset.id] = DEFAULT_ASSET_FOLDER_ID;
      });
      return next;
    });
    setSelectedFolderId(DEFAULT_ASSET_FOLDER_ID);
    setExpandedFolderIds(prev => new Set(prev).add(DEFAULT_ASSET_FOLDER_ID));
    addLog(`📤 个人空间上传完成：${newAssets.length} 条素材已归档到【置顶目录】。`, 'success');
    closePersonalUploadDraft();
  };

  const handlePersonalFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const unsupported = files.filter(file => inferUploadType(file) === null);
    if (unsupported.length > 0) {
      alert(`仅支持上传图片、动图(GIF)和视频文件。\n\n当前包含 ${unsupported.length} 个不支持的文件。`);
      addLog(`❌ 个人空间上传被拦截：存在 ${unsupported.length} 个不支持格式文件。`, 'error');
      return;
    }

    if (files.length > PERSONAL_UPLOAD_MAX_COUNT) {
      alert(`单次最多上传 ${PERSONAL_UPLOAD_MAX_COUNT} 条素材。\n当前选择 ${files.length} 条，请分批上传。`);
      addLog(`❌ 个人空间上传被拦截：单次上传数量 ${files.length} 超过上限 ${PERSONAL_UPLOAD_MAX_COUNT}。`, 'error');
      return;
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > PERSONAL_UPLOAD_MAX_TOTAL_BYTES) {
      alert(`单次上传总大小不能超过 10 GB。\n当前选择总大小：${formatUploadTotal(totalBytes)}。`);
      addLog(`❌ 个人空间上传被拦截：批量体积 ${formatUploadTotal(totalBytes)} 超过 10 GB。`, 'error');
      return;
    }

    setIsPersonalUploadInfoOpen(false);

    const sessionId = Date.now();
    uploadSessionRef.current = sessionId;
    addLog(`📤 已选择 ${files.length} 个文件，开始执行上传预处理与 AI 自动打标。`, 'info');

    const initialItems: PendingPersonalUploadItem[] = files.map((file, index) => {
      const uploadType = inferUploadType(file) ?? 'image';
      return {
        id: `pending-${sessionId}-${index}`,
        fileName: getFileBaseName(file.name),
        sourceFileName: file.name,
        sizeBytes: file.size,
        format: getFileExtension(file.name).toUpperCase() || 'BIN',
        uploadType,
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
              ? { ...item, tags: aiTags, status: 'ready' }
              : item
          ))
        };
      });
    }

    if (uploadSessionRef.current !== sessionId) return;

    setPersonalUploadDraft(prev => prev ? { ...prev, isTagging: false } : prev);
    addLog(`🤖 AI 自动打标完成：${files.length} 条素材可确认标签后入库。`, 'success');
  };

  const openPersonalUploadPicker = () => {
    personalUploadInputRef.current?.click();
  };

  const openPersonalUploadInfo = () => {
    setIsPersonalUploadInfoOpen(true);
  };

  // Filter categories list matching PRD
  const categoryTabs = [
    { id: AssetCategory.All, name: '全部' },
    { id: AssetCategory.CharConcept, name: '角色原画' },
    { id: AssetCategory.SceneConcept, name: '场景原画' },
    { id: AssetCategory.CharModel, name: '角色模型' },
    { id: AssetCategory.SceneModel, name: '场景模型' },
    { id: AssetCategory.Animation, name: '动画序列' },
    { id: AssetCategory.Video, name: '粒子视频' },
    { id: AssetCategory.GUI, name: 'GUI 切图' },
  ];

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, AssetFolder[]>();
    folders.forEach((folder) => {
      const list = map.get(folder.parentId) ?? [];
      list.push(folder);
      map.set(folder.parentId, list);
    });

    const getCreatedFolderOrder = (folder: AssetFolder) => {
      const match = CREATED_FOLDER_ID_PATTERN.exec(folder.id);
      return match ? Number(match[1]) : null;
    };

    map.forEach((list) => {
      list.sort((a, b) => {
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

  const folderById = useMemo(() => {
    return folders.reduce<Record<string, AssetFolder>>((acc, folder) => {
      acc[folder.id] = folder;
      return acc;
    }, {});
  }, [folders]);

  const selectedFolder = folderById[selectedFolderId] ?? folders.find(folder => folder.parentId === null);

  const getDescendantFolderIds = (folderId: string): string[] => {
    const childFolders = foldersByParent.get(folderId) ?? [];
    return childFolders.flatMap(folder => [folder.id, ...getDescendantFolderIds(folder.id)]);
  };

  const getFolderAssetCount = (folderId: string, includeDescendants = true) => {
    const folderIds = new Set([folderId]);
    if (includeDescendants) {
      getDescendantFolderIds(folderId).forEach(id => folderIds.add(id));
    }

    return activeAssets.filter(asset => folderIds.has(folderAssignments[asset.id] ?? DEFAULT_ASSET_FOLDER_ID)).length;
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

  const selectedFolderPath = useMemo(() => {
    if (!selectedFolder) return [];

    const path: AssetFolder[] = [];
    let cursor: AssetFolder | undefined = selectedFolder;
    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parentId ? folderById[cursor.parentId] : undefined;
    }

    return path;
  }, [folderById, selectedFolder]);

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

  const openCreateFolderEditor = (parentId: string | null) => {
    setFolderContextMenu(null);
    setFolderEditor({
      mode: 'create',
      parentId,
      name: ''
    });
  };

  const openRenameFolderEditor = (folderId = selectedFolderId) => {
    const folder = folderById[folderId];
    if (!folder) return;

    setFolderContextMenu(null);
    setSelectedFolderId(folder.id);
    setFolderEditor({
      mode: 'rename',
      parentId: folder.parentId,
      folderId: folder.id,
      name: folder.name
    });
  };

  const submitFolderEditor = () => {
    if (!folderEditor) return;

    const error = validateFolderName(folderEditor.name, folderEditor);
    if (error) {
      addLog(`❌ 文件夹操作被拦截：${error}`, 'error');
      return;
    }

    const folderName = folderEditor.name.trim();

    if (folderEditor.mode === 'create') {
      const newFolder: AssetFolder = {
        id: `folder-${Date.now()}`,
        name: folderName,
        parentId: folderEditor.parentId
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

    setFolderEditor(null);
  };

  const deleteFolder = (folderId = selectedFolderId) => {
    const targetFolder = folderById[folderId];
    if (!targetFolder) return;

    setFolderContextMenu(null);
    const deletedFolderIds = new Set([targetFolder.id, ...getDescendantFolderIds(targetFolder.id)]);
    const remainingFolders = folders.filter(folder => !deletedFolderIds.has(folder.id));

    // Fallback folder to re-home affected assets. When every folder is deleted there is none,
    // so affected assets are detached from the tree instead (rule: the folder directory may be empty).
    const fallbackFolder = (targetFolder.parentId && remainingFolders.some(folder => folder.id === targetFolder.parentId))
      ? folderById[targetFolder.parentId]
      : (remainingFolders.find(folder => folder.parentId === null) ?? remainingFolders[0]);
    const fallbackFolderId = fallbackFolder?.id;

    const affectedAssetCount = activeAssets.filter(asset => deletedFolderIds.has(folderAssignments[asset.id] ?? DEFAULT_ASSET_FOLDER_ID)).length;
    const assetHint = affectedAssetCount > 0
      ? (fallbackFolderId
        ? `\n\n其中 ${affectedAssetCount} 个素材会移动到上级文件夹。`
        : `\n\n其中 ${affectedAssetCount} 个素材将解除目录归属（删除后无文件夹留存）。`)
      : '';
    const confirmed = window.confirm(`确认删除「${targetFolder.name}」及其 ${deletedFolderIds.size - 1} 个子文件夹吗？${assetHint}`);
    if (!confirmed) return;

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
    setSelectedFolderId(folderId);
    setFolderContextMenu({
      folderId,
      x: event.clientX,
      y: event.clientY
    });
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

  // Live validation result for the inline folder editor (drives error text + disabled confirm).
  const folderEditorError = folderEditor ? validateFolderName(folderEditor.name, folderEditor) : '';

  // Filtering calculation
  const filteredAssets = activeAssets.filter(asset => {
    if (!isProjectA && !isPersonalSpace) return false;
    if (!scopedFolderIds.has(folderAssignments[asset.id] ?? DEFAULT_ASSET_FOLDER_ID)) return false;

    // Cat filter
    if (selectedCat !== AssetCategory.All && asset.category !== selectedCat) return false;

    // Search Box keyword matching title or tags
    if (keyword.trim() !== '') {
      const kw = keyword.toLowerCase();
      const matchTitle = asset.name.toLowerCase().includes(kw);
      const matchTags = asset.tags.some(t => t.toLowerCase().includes(kw));
      return matchTitle || matchTags;
    }

    return true;
  });

  const personalReadyTaggingCount = personalUploadDraft
    ? personalUploadDraft.items.filter(item => item.status === 'ready').length
    : 0;

  const itemsPerPage = 12;
  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedAssets = filteredAssets.slice(startIndex, startIndex + itemsPerPage);
  const selectedAssetTask = selectedAsset
    ? activeDownloads.find(task => task.assetId === selectedAsset.id)
    : null;
  const selectedAssetCategoryName = selectedAsset
    ? categoryTabs.find(tab => tab.id === selectedAsset.category)?.name ?? selectedAsset.category
    : '';

  const renderFolderTree = (parentId: string | null, depth = 0): React.ReactNode => {
    const childFolders = (foldersByParent.get(parentId) ?? []).filter(folder => (
      !visibleFolderIds || visibleFolderIds.has(folder.id)
    ));

    return childFolders.map((folder) => {
      const children = foldersByParent.get(folder.id) ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = expandedFolderIds.has(folder.id);
      const isSelected = selectedFolderId === folder.id;
      const nestedCount = getFolderAssetCount(folder.id);

      return (
        <div key={folder.id}>
          <button
            type="button"
            onClick={() => setSelectedFolderId(folder.id)}
            onContextMenu={(event) => openFolderContextMenu(event, folder.id)}
            className={`group/folder flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-all ${
              isSelected
                ? 'bg-[#18181b] text-white border border-transparent'
                : 'text-zinc-400 border border-transparent hover:bg-[#0c0c0e] hover:text-white'
            }`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
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
            {isExpanded && hasChildren ? (
              <FolderOpen size={15} className={isSelected ? 'text-[#00ff00]' : 'text-zinc-400 group-hover/folder:text-[#00ff00]'} />
            ) : (
              <Folder size={15} className={isSelected ? 'text-[#00ff00]' : 'text-zinc-400 group-hover/folder:text-[#00ff00]'} />
            )}
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            <span className={`font-mono text-[10px] ${isSelected ? 'text-[#00ff00]' : 'text-zinc-500'}`}>
              {nestedCount}
            </span>
          </button>
          {hasChildren && isExpanded && renderFolderTree(folder.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col font-sans">
      
      {/* Top section: Title */}
      <div className="p-6 pb-4 border-b border-[#27272a] shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
              <FolderOpen size={22} className="text-[#00ff00]" />
              {isPersonalSpace ? '个人空间素材库' : '项目美术素材库'}
            </h1>
          </div>
        </div>
      </div>

      <input
        ref={personalUploadInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.gif"
        onChange={handlePersonalFileSelection}
        className="hidden"
      />

      {/* Main body content */}
      {!(isProjectA || isPersonalSpace) ? (
        /* Empty status for space B, Shared */
        <div className="flex-1 overflow-y-auto p-12 flex flex-col items-center justify-center text-center select-none">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-[#27272a] flex items-center justify-center text-zinc-500 mb-4/5 text-zinc-600">
            <FolderDot size={28} />
          </div>
          <h3 className="text-sm font-bold text-zinc-300 font-display mt-4">该空间无可用素材</h3>
          <p className="text-xs text-zinc-500 mt-2 max-w-sm leading-relaxed font-mono">
            【{currentSpace.name}】目前暂无管理员预置和发布的 3D/2D 资产大包。
            <br/>
            请通过边栏顶级空间下拉菜单，快捷切到 <span className="text-[#00ff00] underline font-bold cursor-pointer hover:text-white" onClick={() => setSelectedCat(AssetCategory.All)}>项目空间 A (三国奇幻RPG)</span> 提取并调用模型。
          </p>
        </div>
      ) : (
        <div ref={assetLayoutRef} className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {folderContextMenu && (
            <div
              className="fixed z-50 w-44 overflow-hidden rounded border border-[#27272a] bg-[#0c0c0e] py-1 shadow-xl font-mono text-[11px]"
              style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                onClick={() => openCreateFolderEditor(folderById[folderContextMenu.folderId]?.parentId ?? null)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
              >
                <Plus size={12} className="text-[#00ff00]" />
                新建同级文件夹
              </button>
              <button
                type="button"
                onClick={() => openCreateFolderEditor(folderContextMenu.folderId)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
              >
                <FolderPlus size={12} className="text-[#00ff00]" />
                新建子文件夹
              </button>
              <button
                type="button"
                onClick={() => openRenameFolderEditor(folderContextMenu.folderId)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-[#121214] hover:text-white"
              >
                <Pencil size={12} className="text-zinc-400" />
                重命名
              </button>
              <div className="my-1 border-t border-zinc-900" />
              <button
                type="button"
                onClick={() => deleteFolder(folderContextMenu.folderId)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-400 transition-colors hover:bg-red-950/30 hover:text-red-300"
              >
                <Trash2 size={12} />
                删除文件夹
              </button>
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
                    <span className="text-xs font-bold text-white truncate">文件夹目录</span>
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
                      title="新建一级文件夹"
                      onClick={() => openCreateFolderEditor(null)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-[#0c0c0e] text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00]"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              )}

              {folderEditor && (
                <div className="mt-3 rounded border border-[#27272a] bg-black p-2">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      maxLength={FOLDER_NAME_MAX_LENGTH}
                      value={folderEditor.name}
                      onChange={(event) => setFolderEditor(prev => prev ? { ...prev, name: event.target.value } : prev)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !folderEditorError) submitFolderEditor();
                        if (event.key === 'Escape') setFolderEditor(null);
                      }}
                      placeholder={folderEditor.mode === 'create' ? '文件夹名称' : '重命名'}
                      className={`min-w-0 flex-1 rounded border bg-[#0c0c0e] px-2 py-1.5 text-xs text-zinc-200 outline-none transition-colors ${
                        folderEditorError
                          ? 'border-red-500/70 focus:border-red-500'
                          : 'border-zinc-800 focus:border-[#00ff00]'
                      }`}
                    />
                    <button
                      type="button"
                      title={folderEditorError || '确认'}
                      disabled={!!folderEditorError}
                      onClick={submitFolderEditor}
                      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                        folderEditorError
                          ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                          : 'bg-[#00ff00] text-black'
                      }`}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      title="取消"
                      onClick={() => setFolderEditor(null)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {folderEditorError && (
                    <p className="mt-1.5 px-0.5 text-[10px] font-mono leading-relaxed text-red-400">
                      {folderEditorError}
                    </p>
                  )}
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
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
                      <FolderOpen size={16} className="text-[#00ff00]" />
                      <span className="truncate">{selectedFolder?.name ?? '未选择文件夹'}</span>
                      <span className="rounded border border-zinc-800 bg-black px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                        L{selectedFolder ? getFolderDepth(selectedFolder.id) + 1 : 0}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1 text-[10px] font-mono text-zinc-500">
                      {selectedFolderPath.map((folder, index) => (
                        <React.Fragment key={folder.id}>
                          {index > 0 && <ChevronRight size={11} />}
                          <button
                            type="button"
                            onClick={() => setSelectedFolderId(folder.id)}
                            className="truncate hover:text-[#00ff00]"
                          >
                            {folder.name}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="relative w-full sm:w-72 xl:w-80 shrink-0">
                    <Search size={13} className="absolute left-3 top-2 text-zinc-500" />
                    <input 
                      type="text" 
                      value={keyword}
                      onChange={e => setKeyword(e.target.value)}
                      placeholder="搜索素材名或标签"
                      className="w-full bg-zinc-950 border border-zinc-900 focus:border-[#00ff00] transition-colors outline-none text-xs rounded py-1.5 pl-9 pr-3 text-zinc-200 font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:justify-between">
                  <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none font-mono">
                    {categoryTabs.map((tab) => {
                      const isSelected = selectedCat === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setSelectedCat(tab.id)}
                          className={`px-3 py-1 font-mono text-[10.5px] rounded whitespace-nowrap cursor-pointer transition-all border cat-tab-btn ${
                            isSelected 
                              ? 'bg-white text-black font-semibold border-white shadow is-selected' 
                              : 'bg-transparent border-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700'
                          }`}
                        >
                          {tab.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {isPersonalSpace && (
                      <button
                        type="button"
                        onClick={openPersonalUploadInfo}
                        className="inline-flex items-center justify-center gap-1.5 rounded border border-[#00ff00]/40 bg-[#00ff00]/10 px-3 py-1.5 text-[10.5px] font-mono font-semibold text-[#00ff00] transition-colors hover:border-[#00ff00] hover:bg-[#00ff00]/20"
                      >
                        <Upload size={12} />
                        上传素材
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-7">
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Folder size={16} className="text-[#00ff00]" />
                    <span>子文件夹</span>
                    <span className="font-mono text-xs text-zinc-500">({directChildFolders.length})</span>
                  </div>
                </div>

                {directChildFolders.length > 0 ? (
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {directChildFolders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => {
                          setSelectedFolderId(folder.id);
                          setExpandedFolderIds(prev => new Set(prev).add(selectedFolderId));
                        }}
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
                ) : (
                  <div className="rounded border border-dashed border-[#27272a] bg-[#0c0c0e]/30 px-4 py-5 text-xs text-zinc-500">
                    当前文件夹没有子文件夹。
                  </div>
                )}
              </section>

              <section>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Files size={16} className="text-[#00ff00]" />
                    <span>素材</span>
                    <span className="font-mono text-xs text-zinc-500">({filteredAssets.length})</span>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeSubfolderAssets}
                    onClick={() => setIncludeSubfolderAssets(prev => !prev)}
                    className={`inline-flex items-center gap-2 rounded border px-2.5 py-1.5 text-[10.5px] font-mono transition-colors ${
                      includeSubfolderAssets
                        ? 'border-[#00ff00]/50 bg-[#00ff00]/10 text-[#00ff00]'
                        : 'border-zinc-800 bg-black text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                      includeSubfolderAssets ? 'border-[#00ff00] bg-[#00ff00] text-black' : 'border-zinc-700'
                    }`}>
                      {includeSubfolderAssets && <Check size={10} />}
                    </span>
                    显示子文件夹素材
                  </button>
                </div>

                {filteredAssets.length === 0 ? (
                  <div className="h-64 border border-dashed border-[#27272a] rounded flex flex-col items-center justify-center p-8 text-center text-zinc-500 text-xs">
                    {folders.length === 0
                      ? '当前没有文件夹，请新建文件夹后在此查看素材。'
                      : `没有找到匹配 “${keyword}” 描述的美术内容包。`}
                  </div>
                ) : (
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {paginatedAssets.map((asset) => {
                      const isCurSelected = selectedAsset?.id === asset.id;
                      const isDownloaded = downloadedAssetIds.has(asset.id);

                      // Check if currently downloading/queued
                      const activeTask = activeDownloads.find(task => task.assetId === asset.id);

                      return (
                        <div
                          key={asset.id}
                          onClick={() => {
                            if (!isPersonalSpace) {
                              setSelectedAsset(asset);
                            }
                          }}
                          className={`group/card bg-[#0c0c0e] border rounded overflow-hidden cursor-pointer flex flex-col transition-all relative ${
                            isCurSelected
                              ? 'border-[#00ff00]'
                              : 'border-[#27272a] hover:border-zinc-700'
                          }`}
                        >
                          {/* Thumbnail wrapper */}
                          <div className="aspect-video relative overflow-hidden bg-black/60 shrink-0 select-none border-b border-[#18181b]">
                            <img
                              src={asset.thumbnail}
                              alt={asset.name}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                              referrerPolicy="no-referrer"
                            />

                            {/* Format sticker and category indicator */}
                            <div className="absolute top-2 left-2 flex items-center gap-1">
                              <span className="text-[9.5px] font-mono bg-black/90 text-[#00ff00] font-bold border border-zinc-800 px-1 py-0.2 rounded uppercase">
                                .{asset.format}
                              </span>
                            </div>

                            {/* Status overlays (Download Status / Queued) */}
                            {isDownloaded && (
                              <div className="absolute top-2 right-2 bg-[#00ff00] text-black rounded-full p-1 shadow-lg">
                                <CheckCircle size={12} fill="currentColor" className="text-black" />
                              </div>
                            )}

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
                                {!isPersonalSpace && (
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
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-[#27272a] bg-[#0c0c0e]/80 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 font-mono text-xs text-zinc-400 select-none">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">
                    当前显示 <span className="text-[#00ff00] font-bold">{startIndex + 1} - {Math.min(startIndex + itemsPerPage, filteredAssets.length)}</span> / 共 <span className="text-white font-bold">{filteredAssets.length}</span> 项
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Previous Page Button */}
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className={`p-2 rounded border border-[#27272a] transition-all ${
                      currentPage === 1
                        ? 'text-zinc-700 bg-transparent cursor-not-allowed opacity-40'
                        : 'text-zinc-300 hover:text-white hover:border-[#00ff00]/60 bg-[#0c0c0e] hover:bg-zinc-900 cursor-pointer'
                    }`}
                    title="上一页"
                  >
                    <ChevronLeft size={14} className="pointer-events-none" />
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    const isCurrent = page === currentPage;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded border transition-all text-xs font-mono font-medium ${
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
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className={`p-2 rounded border border-[#27272a] transition-all ${
                      currentPage === totalPages
                        ? 'text-zinc-700 bg-transparent cursor-not-allowed opacity-40'
                        : 'text-zinc-300 hover:text-white hover:border-[#00ff00]/60 bg-[#0c0c0e] hover:bg-zinc-900 cursor-pointer'
                    }`}
                    title="下一页"
                  >
                    <ChevronRight size={14} className="pointer-events-none" />
                  </button>
                </div>

                <div className="hidden md:block text-zinc-500 text-[10px]">
                  页码: {currentPage} / {totalPages}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {isPersonalUploadInfoOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-[560px] rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Upload size={14} className="text-[#00ff00]" />
                  上传素材说明
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                  个人空间目录结构与项目空间一致
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonalUploadInfoOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600 hover:text-white"
                title="关闭"
              >
                <X size={13} />
              </button>
            </div>

            <div className="mt-4 rounded border border-zinc-800 bg-black/40 p-3 text-[11px] font-mono text-zinc-300 space-y-1.5">
              <p>1. 目录逻辑一致：支持一级目录、子目录、目录搜索、右键管理。</p>
              <p>2. 入库目录：确认上传后自动写入个人空间置顶目录（一级目录）。</p>
              <p>3. 格式限制：支持图片、动图(GIF)、视频。</p>
              <p>4. 批量限制：单次最多 500 条，总大小不超过 10 GB。</p>
              <p>5. 智能处理：上传阶段自动 AI 打标，支持标签增删改后再确认。</p>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPersonalUploadInfoOpen(false)}
                className="rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs font-mono text-zinc-400 hover:border-zinc-600 hover:text-white"
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

      {personalUploadDraft && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm p-4 md:p-6 flex items-center justify-center">
          <div className="w-full max-w-[1080px] max-h-[88vh] overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] flex flex-col">
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-500 transition-colors hover:border-zinc-600 hover:text-white"
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

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {personalUploadDraft.items.map((item) => (
                <div key={item.id} className="rounded border border-[#27272a] bg-black/35 p-3">
                  <div className="flex flex-col gap-3 xl:flex-row">
                    <div className="w-full xl:w-52 shrink-0">
                      <div className="aspect-video rounded border border-zinc-800 overflow-hidden bg-black">
                        {item.uploadType === 'video' ? (
                          <video src={item.previewUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                        ) : (
                          <img src={item.previewUrl} alt={item.fileName} className="h-full w-full object-cover" />
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono">
                        <p className="text-zinc-200 font-semibold truncate">{item.fileName}</p>
                        <span className="text-zinc-500">{item.sourceFileName}</span>
                        <span className="text-zinc-500">.{item.format}</span>
                        <span className="text-zinc-500">{toDisplayMB(item.sizeBytes)} MB</span>
                        <span className="text-[#00ff00]">{personalTypeLabel[item.uploadType]}</span>
                        <span className={item.status === 'ready' ? 'text-[#00ff00]' : 'text-amber-400'}>
                          {item.status === 'ready' ? '已打标' : '打标中'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
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
                          className="w-full rounded border border-zinc-800 bg-[#0c0c0e] px-2 py-1.5 text-[11px] font-mono text-zinc-200 outline-none transition-colors focus:border-[#00ff00]"
                        />
                        <button
                          type="button"
                          onClick={() => addDraftTag(item.id)}
                          className="shrink-0 rounded border border-zinc-800 bg-black px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00]"
                        >
                          添加
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-[#27272a] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closePersonalUploadDraft}
                className="rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs font-mono text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmPersonalUpload}
                disabled={personalUploadDraft.isTagging}
                className={`rounded px-4 py-1.5 text-xs font-bold transition-colors ${
                  personalUploadDraft.isTagging
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
            <div className="relative flex-1 min-h-[280px] bg-black border-b lg:border-b-0 lg:border-r border-[#27272a]">
              <img
                src={selectedAsset.previewUrl}
                alt={selectedAsset.name}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />

              <div className="asset-source-badge absolute bottom-4 right-4 flex bg-black/95 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-400 items-center gap-1">
                <span>来源:</span>
                <span className="text-white font-bold force-text-white">{selectedAsset.platform}</span>
              </div>
            </div>

            <div className="w-full lg:w-[390px] xl:w-[420px] bg-[#0a0a0c] border-t lg:border-t-0 lg:border-l border-[#27272a] p-5 overflow-y-auto flex flex-col">
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
                <div>
                  <h2 className="text-base font-bold text-white leading-snug font-display">
                    {selectedAsset.name}
                  </h2>
                  <p className="mt-2 text-xs text-zinc-400 leading-relaxed font-sans bg-black p-2.5 border border-zinc-900 rounded select-text">
                    {selectedAsset.desc}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-black border border-zinc-900 rounded p-2.5">
                    <p className="text-zinc-500 text-[10px]">文件格式</p>
                    <p className="mt-1 text-[#00ff00] font-bold">.{selectedAsset.format.toUpperCase()}</p>
                  </div>
                  <div className="bg-black border border-zinc-900 rounded p-2.5">
                    <p className="text-zinc-500 text-[10px]">资产大小</p>
                    <p className="mt-1 text-zinc-300 font-bold">{selectedAsset.sizeMB} MB</p>
                  </div>
                  <div className="bg-black border border-zinc-900 rounded p-2.5">
                    <p className="text-zinc-500 text-[10px]">分类</p>
                    <p className="mt-1 text-zinc-300 font-bold">{selectedAssetCategoryName}</p>
                  </div>
                  <div className="bg-black border border-zinc-900 rounded p-2.5">
                    <p className="text-zinc-500 text-[10px]">分发创作者</p>
                    <p className="mt-1 text-zinc-300 font-bold truncate" title={selectedAsset.author}>{selectedAsset.author}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {selectedAsset.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-mono bg-[#00ff00]/5 border border-[#00ff00]/20 text-[#00ff00] px-2 py-0.5 rounded">
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* ACTION BUTTONS (F9 Paths) */}
                <div className="pt-3.5 border-t border-zinc-900 space-y-3">
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

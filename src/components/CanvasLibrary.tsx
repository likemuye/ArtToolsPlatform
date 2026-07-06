import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CornerDownRight,
  Copy,
  Edit3,
  ExternalLink,
  Folder,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  Package,
  Palette,
  Plus,
  Search,
  Send,
  Trash2,
  User,
  Users,
  X
} from 'lucide-react';
import {
  CanvasCommentThread,
  CanvasDocument,
  CanvasFolder,
  CanvasHistoryEntry,
  CanvasRole,
  CanvasShareGrant,
  PlatformUser,
  ProjectMember,
  ProjectSpace,
  SpaceId
} from '../types';
import {
  CURRENT_USER_EMAIL,
  CURRENT_USER_NAME,
  PROJECT_SPACES,
  PLATFORM_USERS
} from '../data';
import {
  CANVAS_FOLDERS_STORAGE_KEY,
  CANVAS_HISTORY_STORAGE_KEY,
  CANVAS_SHARES_STORAGE_KEY,
  CANVASES_STORAGE_KEY,
  readCanvasComments,
  readCanvasFolders,
  readCanvasHistory,
  readCanvasShares,
  readCanvases,
  readProjectMembers,
  writeStorage
} from '../canvasStorage';

interface CanvasLibraryProps {
  currentSpace: ProjectSpace;
  setCurrentSpace: (space: ProjectSpace) => void;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error', options?: { toast?: boolean }) => void;
}

type CanvasShareRole = Exclude<CanvasRole, 'owner'>;

interface CanvasDialogState {
  kind: 'create-canvas' | 'rename-canvas';
  targetId?: string;
  name: string;
  error?: string;
}

interface CanvasFolderEditorState {
  mode: 'create' | 'rename';
  spaceId: SpaceId;
  parentId: string | null;
  folderId?: string;
  name: string;
}

interface DeleteState {
  kind: 'canvas' | 'folder';
  id: string;
}

interface ShareState {
  canvasId: string;
  query: string;
  role: CanvasShareRole;
  error?: string;
}

const CANVAS_NAME_MAX_LENGTH = 100;
const INVALID_NAME_PATTERN = /[\\/:*?"<>|]/;
const CANVAS_CARD_WIDTH = 220;
const TUYOO_COMMON_ROOT_ID = 'tuyooCommon';
const CANVAS_FOLDER_PANE_WIDTH_STORAGE_KEY = 'pixgo-canvas-folder-pane-width-v011';
const DEFAULT_FOLDER_PANE_WIDTH = 304;
const MIN_FOLDER_PANE_WIDTH = 240;
const MAX_FOLDER_PANE_WIDTH = 520;
const EXCALIDRAW_URL = 'https://excalidraw.com/';

const ROOT_VISUALS: Record<string, { icon: typeof User; accent: string; label: string }> = {
  [SpaceId.Personal]: { icon: User, accent: '#38bdf8', label: '个人空间' },
  [TUYOO_COMMON_ROOT_ID]: { icon: Package, accent: '#facc15', label: '途游通用' },
  [SpaceId.Shared]: { icon: Users, accent: '#a78bfa', label: '与我共享' },
  [SpaceId.ProjectA]: { icon: Boxes, accent: '#00ff00', label: '项目空间' },
  [SpaceId.ProjectB]: { icon: Boxes, accent: '#00ff00', label: '项目空间' }
};

const formatDateTime = (source: string) => {
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return '--';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

const getRoleLabel = (role: CanvasRole) => {
  if (role === 'owner') return '作者';
  if (role === 'editor') return '编辑者';
  return '使用者';
};

const clampFolderPaneWidth = (width: number) => (
  Math.max(MIN_FOLDER_PANE_WIDTH, Math.min(MAX_FOLDER_PANE_WIDTH, width))
);

const getInitialFolderPaneWidth = () => {
  try {
    const stored = localStorage.getItem(CANVAS_FOLDER_PANE_WIDTH_STORAGE_KEY);
    if (!stored) return DEFAULT_FOLDER_PANE_WIDTH;

    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return DEFAULT_FOLDER_PANE_WIDTH;
    return clampFolderPaneWidth(parsed);
  } catch {
    return DEFAULT_FOLDER_PANE_WIDTH;
  }
};

const validateName = (name: string, siblingNames: string[]) => {
  const trimmed = name.trim();
  if (!trimmed) return '名称不能为空';
  if (trimmed.length > CANVAS_NAME_MAX_LENGTH) return `名称不能超过 ${CANVAS_NAME_MAX_LENGTH} 个字符`;
  if (INVALID_NAME_PATTERN.test(trimmed)) return '名称不能包含 \\ / : * ? " < > |';
  if (siblingNames.some(existing => existing.trim().toLowerCase() === trimmed.toLowerCase())) return '同一级目录下名称不能重复';
  return '';
};

export default function CanvasLibrary({ currentSpace, setCurrentSpace, addLog }: CanvasLibraryProps) {
  const [folders, setFolders] = useState<CanvasFolder[]>(readCanvasFolders);
  const [canvases, setCanvases] = useState<CanvasDocument[]>(readCanvases);
  const [shares, setShares] = useState<CanvasShareGrant[]>(readCanvasShares);
  const [history, setHistory] = useState<CanvasHistoryEntry[]>(readCanvasHistory);
  const [comments] = useState<CanvasCommentThread[]>(readCanvasComments);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [openedCanvasId, setOpenedCanvasId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [contextMenuCanvasId, setContextMenuCanvasId] = useState<string | null>(null);
  const [contextMenuFolderId, setContextMenuFolderId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<CanvasDialogState | null>(null);
  const [folderEditor, setFolderEditor] = useState<CanvasFolderEditorState | null>(null);
  const [isFolderEditorSubmitAttempted, setIsFolderEditorSubmitAttempted] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [shareState, setShareState] = useState<ShareState | null>(null);
  const [selectedSystemRoot, setSelectedSystemRoot] = useState<typeof TUYOO_COMMON_ROOT_ID | null>(null);
  const [expandedRootIds, setExpandedRootIds] = useState<Record<string, boolean>>({
    [SpaceId.Personal]: true,
    [TUYOO_COMMON_ROOT_ID]: false,
    [SpaceId.Shared]: true,
    [SpaceId.ProjectA]: true,
    [SpaceId.ProjectB]: false
  });
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(['canvas-folder-personal-inspiration', 'canvas-folder-project-style'])
  );
  const [folderPaneWidth, setFolderPaneWidth] = useState<number>(getInitialFolderPaneWidth);
  const [isResizingFolderPane, setIsResizingFolderPane] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => window.innerWidth >= 1024);
  const canvasLayoutRef = useRef<HTMLDivElement | null>(null);

  const projectMembers = useMemo(() => readProjectMembers(), []);
  const projectSpaces = useMemo(() => PROJECT_SPACES.filter(space => space.id === SpaceId.ProjectA || space.id === SpaceId.ProjectB), []);
  const personalSpace = useMemo(() => PROJECT_SPACES.find(space => space.id === SpaceId.Personal) ?? PROJECT_SPACES[0], []);
  const sharedSpace = useMemo(() => PROJECT_SPACES.find(space => space.id === SpaceId.Shared) ?? PROJECT_SPACES[0], []);
  const isTuyooCommonSpace = selectedSystemRoot === TUYOO_COMMON_ROOT_ID;
  const isProjectSpace = currentSpace.id === SpaceId.ProjectA || currentSpace.id === SpaceId.ProjectB;
  const isSharedSpace = currentSpace.id === SpaceId.Shared;
  const isPersonalSpace = currentSpace.id === SpaceId.Personal;
  const currentUserProjectMember = projectMembers[currentSpace.id]?.find(member => member.email.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase());
  const isCurrentUserAdmin = currentUserProjectMember?.role === 'admin';
  const canCreateCanvas = !isTuyooCommonSpace && (isPersonalSpace || (isProjectSpace && !!currentUserProjectMember));
  const canCreateFolder = !isTuyooCommonSpace && (isPersonalSpace || (isProjectSpace && isCurrentUserAdmin));
  const spaceDisplayName = isTuyooCommonSpace ? '途游通用' : currentSpace.id === SpaceId.Shared ? '与我共享' : currentSpace.name;

  const updateFolders = (next: CanvasFolder[]) => {
    setFolders(next);
    writeStorage(CANVAS_FOLDERS_STORAGE_KEY, next);
  };
  const updateCanvases = (next: CanvasDocument[]) => {
    setCanvases(next);
    writeStorage(CANVASES_STORAGE_KEY, next);
  };
  const updateShares = (next: CanvasShareGrant[]) => {
    setShares(next);
    writeStorage(CANVAS_SHARES_STORAGE_KEY, next);
  };
  const updateHistory = (next: CanvasHistoryEntry[]) => {
    setHistory(next);
    writeStorage(CANVAS_HISTORY_STORAGE_KEY, next);
  };

  useEffect(() => {
    localStorage.setItem(CANVAS_FOLDER_PANE_WIDTH_STORAGE_KEY, String(folderPaneWidth));
  }, [folderPaneWidth]);

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
      const containerRect = canvasLayoutRef.current?.getBoundingClientRect();
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

  const folderById = useMemo(() => (
    folders.reduce<Record<string, CanvasFolder>>((acc, folder) => {
      acc[folder.id] = folder;
      return acc;
    }, {})
  ), [folders]);

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, CanvasFolder[]>();
    folders.forEach((folder) => {
      const list = map.get(folder.parentId) ?? [];
      list.push(folder);
      map.set(folder.parentId, list);
    });

    map.forEach((list) => {
      list.sort((a, b) => (
        a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ));
    });

    return map;
  }, [folders]);

  const getDescendantFolderIds = (folderId: string): string[] => {
    const childFolders = foldersByParent.get(folderId) ?? [];
    return childFolders.flatMap(folder => [folder.id, ...getDescendantFolderIds(folder.id)]);
  };

  const sharedCanvasIds = useMemo(() => (
    new Set(shares.filter(share => share.granteeEmail.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase()).map(share => share.canvasId))
  ), [shares]);
  const visibleCanvases = useMemo(() => {
    if (isTuyooCommonSpace) return [];
    const source = isSharedSpace
      ? canvases.filter(canvas => sharedCanvasIds.has(canvas.id))
      : canvases.filter(canvas => canvas.spaceId === currentSpace.id);
    const normalized = keyword.trim().toLowerCase();
    const scopedFolderIds = selectedFolderId
      ? new Set([selectedFolderId, ...getDescendantFolderIds(selectedFolderId)])
      : null;
    return source
      .filter(canvas => !canvas.isDeleted)
      .filter(canvas => scopedFolderIds ? !!canvas.folderId && scopedFolderIds.has(canvas.folderId) : true)
      .filter(canvas => !normalized || canvas.name.toLowerCase().includes(normalized) || canvas.ownerName.toLowerCase().includes(normalized))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [canvases, currentSpace.id, foldersByParent, isSharedSpace, isTuyooCommonSpace, keyword, selectedFolderId, sharedCanvasIds]);

  const spaceCanvasCount = useMemo(() => {
    if (isTuyooCommonSpace) return 0;
    if (isSharedSpace) return canvases.filter(canvas => sharedCanvasIds.has(canvas.id) && !canvas.isDeleted).length;
    return canvases.filter(canvas => canvas.spaceId === currentSpace.id && !canvas.isDeleted).length;
  }, [canvases, currentSpace.id, isSharedSpace, isTuyooCommonSpace, sharedCanvasIds]);

  const getSpaceCanvasCount = (spaceId: SpaceId) => {
    if (spaceId === SpaceId.Shared) return canvases.filter(canvas => sharedCanvasIds.has(canvas.id) && !canvas.isDeleted).length;
    return canvases.filter(canvas => canvas.spaceId === spaceId && !canvas.isDeleted).length;
  };

  const selectSpace = (space: ProjectSpace) => {
    setSelectedSystemRoot(null);
    setCurrentSpace(space);
    setSelectedFolderId(null);
    setOpenedCanvasId(null);
    setFolderEditor(null);
    setIsFolderEditorSubmitAttempted(false);
    setContextMenuCanvasId(null);
    setContextMenuFolderId(null);
  };

  const selectFolder = (space: ProjectSpace, folderId: string) => {
    setSelectedSystemRoot(null);
    setCurrentSpace(space);
    setSelectedFolderId(folderId);
    setOpenedCanvasId(null);
    setFolderEditor(null);
    setIsFolderEditorSubmitAttempted(false);
    setContextMenuCanvasId(null);
    setContextMenuFolderId(null);
  };

  const selectTuyooCommon = () => {
    setSelectedSystemRoot(TUYOO_COMMON_ROOT_ID);
    setSelectedFolderId(null);
    setOpenedCanvasId(null);
    setFolderEditor(null);
    setIsFolderEditorSubmitAttempted(false);
    setContextMenuCanvasId(null);
    setContextMenuFolderId(null);
  };

  const toggleRoot = (rootId: string) => {
    setExpandedRootIds(prev => ({ ...prev, [rootId]: !prev[rootId] }));
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const getFoldersForSpace = (spaceId: SpaceId, parentId: string | null = null) => (
    (foldersByParent.get(parentId) ?? []).filter(folder => folder.spaceId === spaceId)
  );

  const selectedFolder = selectedFolderId ? folderById[selectedFolderId] ?? null : null;
  const shareTarget = shareState ? canvases.find(canvas => canvas.id === shareState.canvasId) ?? null : null;
  const deleteTargetCanvas = deleteState?.kind === 'canvas' ? canvases.find(canvas => canvas.id === deleteState.id) ?? null : null;
  const deleteTargetFolder = deleteState?.kind === 'folder' ? folderById[deleteState.id] ?? null : null;

  const getCanvasRole = (canvas: CanvasDocument): CanvasRole => {
    if (canvas.ownerEmail.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase()) return 'owner';
    const directShare = shares.find(share => share.canvasId === canvas.id && share.granteeEmail.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase());
    if (directShare) return directShare.role;
    const canvasIsProjectSpace = canvas.spaceId === SpaceId.ProjectA || canvas.spaceId === SpaceId.ProjectB;
    const canvasProjectMember = canvasIsProjectSpace
      ? projectMembers[canvas.spaceId]?.find(member => member.email.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase())
      : null;
    if (canvasProjectMember) {
      if (canvasProjectMember.role === 'admin') return 'editor';
      const groupShare = shares.find(share => share.canvasId === canvas.id && share.viaGroup === canvas.spaceId);
      return groupShare?.role ?? 'editor';
    }
    return 'viewer';
  };

  const canRenameCanvas = (canvas: CanvasDocument) => {
    const role = getCanvasRole(canvas);
    return !isSharedSpace && (role === 'owner' || (isProjectSpace && isCurrentUserAdmin));
  };

  const canDeleteCanvas = (canvas: CanvasDocument) => {
    if (isSharedSpace) return false;
    const role = getCanvasRole(canvas);
    if (isProjectSpace) return role === 'owner' || isCurrentUserAdmin;
    return role === 'owner' || role === 'editor';
  };

  const canShareCanvas = (canvas: CanvasDocument) => {
    const role = getCanvasRole(canvas);
    if (isPersonalSpace) return role === 'owner' || role === 'editor';
    if (isSharedSpace) return role === 'editor' && canvas.spaceId === SpaceId.Personal;
    return isProjectSpace && (role === 'owner' || isCurrentUserAdmin);
  };

  const getFolderCanvasCount = (folderId: string, includeDescendants = true) => {
    const folderIds = new Set([folderId]);
    if (includeDescendants) {
      getDescendantFolderIds(folderId).forEach(id => folderIds.add(id));
    }
    return canvases.filter(canvas => !canvas.isDeleted && !!canvas.folderId && folderIds.has(canvas.folderId)).length;
  };

  const getDirectFolderCanvasCount = (folderId: string) => getFolderCanvasCount(folderId, false);

  const getFolderCoverCanvases = (folderId: string, limit = 3) => {
    const folderIds = new Set([folderId, ...getDescendantFolderIds(folderId)]);
    return canvases
      .filter(canvas => !canvas.isDeleted && !!canvas.folderId && folderIds.has(canvas.folderId))
      .sort((a, b) => {
        const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (updatedDiff !== 0) return updatedDiff;
        return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
      })
      .slice(0, limit);
  };

  const openEditor = (canvas: CanvasDocument) => {
    const role = getCanvasRole(canvas);
    setOpenedCanvasId(canvas.id);
    setContextMenuCanvasId(null);
    addLog(`🎨 已在内容区打开 Excalidraw 画布【${canvas.name}】，角色：${getRoleLabel(role)}。`, 'success');
  };

  const openDialog = (next: CanvasDialogState) => {
    setContextMenuCanvasId(null);
    setContextMenuFolderId(null);
    setDialog(next);
  };

  const submitDialog = () => {
    if (!dialog) return;
    const now = new Date().toISOString();
    const parentFolderId = selectedFolder?.id ?? null;
    const siblingCanvasNames = canvases
      .filter(canvas => canvas.spaceId === currentSpace.id && canvas.folderId === parentFolderId && canvas.id !== dialog.targetId && !canvas.isDeleted)
      .map(canvas => canvas.name);
    const validation = validateName(dialog.name, siblingCanvasNames);
    if (validation) {
      setDialog({ ...dialog, error: validation });
      return;
    }
    const name = dialog.name.trim();

    if (dialog.kind === 'create-canvas') {
      const nextCanvas: CanvasDocument = {
        id: `canvas-${Date.now()}`,
        name,
        folderId: parentFolderId,
        spaceId: currentSpace.id,
        ownerEmail: CURRENT_USER_EMAIL,
        ownerName: CURRENT_USER_NAME,
        createdAt: now,
        updatedAt: now,
        thumbnailColor: ['#0f766e', '#1d4ed8', '#7c3aed', '#b45309'][Math.floor(Math.random() * 4)],
        elementCount: 0
      };
      updateCanvases([nextCanvas, ...canvases]);
      updateHistory([{ id: `history-${Date.now()}`, canvasId: nextCanvas.id, actorName: CURRENT_USER_NAME, createdAt: now, summary: '创建画布。' }, ...history]);
      addLog(`🎨 已创建画布【${name}】。`, 'success');
    }

    if (dialog.kind === 'rename-canvas' && dialog.targetId) {
      updateCanvases(canvases.map(canvas => canvas.id === dialog.targetId ? { ...canvas, name, updatedAt: now } : canvas));
      updateHistory([{ id: `history-${Date.now()}`, canvasId: dialog.targetId, actorName: CURRENT_USER_NAME, createdAt: now, summary: `重命名为「${name}」。` }, ...history]);
      addLog(`✏️ 已重命名画布为【${name}】。`, 'success');
    }

    setDialog(null);
  };

  const canMutateFolder = (folder: CanvasFolder) => (
    folder.spaceId === SpaceId.Personal || (
      (folder.spaceId === SpaceId.ProjectA || folder.spaceId === SpaceId.ProjectB) &&
      projectMembers[folder.spaceId]?.find(member => member.email.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase())?.role === 'admin'
    )
  );

  const getFolderEditorValidationError = () => {
    if (!folderEditor) return '';
    const siblingNames = folders
      .filter(folder => (
        folder.spaceId === folderEditor.spaceId &&
        folder.parentId === folderEditor.parentId &&
        folder.id !== folderEditor.folderId
      ))
      .map(folder => folder.name);
    return validateName(folderEditor.name, siblingNames);
  };

  const closeFolderEditor = () => {
    setFolderEditor(null);
    setIsFolderEditorSubmitAttempted(false);
  };

  const openCreateFolderEditor = (space: ProjectSpace, parentId: string | null) => {
    setSelectedSystemRoot(null);
    setCurrentSpace(space);
    setSelectedFolderId(parentId);
    setOpenedCanvasId(null);
    setContextMenuCanvasId(null);
    setContextMenuFolderId(null);
    setIsFolderEditorSubmitAttempted(false);
    setExpandedRootIds(prev => ({ ...prev, [space.id]: true }));
    if (parentId) {
      setExpandedFolderIds(prev => new Set(prev).add(parentId));
    }
    setFolderEditor({
      mode: 'create',
      spaceId: space.id,
      parentId,
      name: ''
    });
  };

  const openRenameFolderEditor = (folder: CanvasFolder) => {
    if (!canMutateFolder(folder)) return;
    const space = PROJECT_SPACES.find(item => item.id === folder.spaceId) ?? currentSpace;
    setSelectedSystemRoot(null);
    setCurrentSpace(space);
    setSelectedFolderId(folder.id);
    setOpenedCanvasId(null);
    setContextMenuCanvasId(null);
    setContextMenuFolderId(null);
    setIsFolderEditorSubmitAttempted(false);
    setFolderEditor({
      mode: 'rename',
      spaceId: folder.spaceId,
      parentId: folder.parentId,
      folderId: folder.id,
      name: folder.name
    });
  };

  const submitFolderEditor = () => {
    if (!folderEditor) return;
    setIsFolderEditorSubmitAttempted(true);

    const validation = getFolderEditorValidationError();
    if (validation) {
      addLog(`❌ 文件夹操作被拦截：${validation}`, 'error', { toast: false });
      return;
    }

    const now = new Date().toISOString();
    const name = folderEditor.name.trim();

    if (folderEditor.mode === 'create') {
      const nextFolder: CanvasFolder = {
        id: `canvas-folder-${Date.now()}`,
        name,
        parentId: folderEditor.parentId,
        spaceId: folderEditor.spaceId,
        createdAt: now,
        updatedAt: now,
        createdByEmail: CURRENT_USER_EMAIL
      };
      updateFolders([nextFolder, ...folders]);
      setSelectedSystemRoot(null);
      setCurrentSpace(PROJECT_SPACES.find(space => space.id === folderEditor.spaceId) ?? currentSpace);
      setSelectedFolderId(nextFolder.id);
      setExpandedRootIds(prev => ({ ...prev, [folderEditor.spaceId]: true }));
      if (folderEditor.parentId) {
        setExpandedFolderIds(prev => new Set(prev).add(folderEditor.parentId));
      }
      addLog(`📁 已创建画布文件夹【${name}】。`, 'success');
    }

    if (folderEditor.mode === 'rename' && folderEditor.folderId) {
      const originalName = folderById[folderEditor.folderId]?.name ?? '未命名文件夹';
      updateFolders(folders.map(folder => (
        folder.id === folderEditor.folderId ? { ...folder, name, updatedAt: now } : folder
      )));
      addLog(`✏️ 画布文件夹已重命名：${originalName} → ${name}`, 'success');
    }

    closeFolderEditor();
  };

  const confirmDelete = () => {
    if (!deleteState) return;
    const now = new Date().toISOString();
    if (deleteState.kind === 'canvas') {
      const target = canvases.find(canvas => canvas.id === deleteState.id);
      updateCanvases(canvases.map(canvas => canvas.id === deleteState.id ? { ...canvas, isDeleted: true, updatedAt: now } : canvas));
      updateShares(shares.filter(share => share.canvasId !== deleteState.id));
      addLog(`🗑️ 已删除画布【${target?.name ?? deleteState.id}】，共享权限已级联失效。`, 'warning');
    } else {
      const deletedFolderIds = new Set([deleteState.id, ...getDescendantFolderIds(deleteState.id)]);
      const canvasIds = canvases.filter(canvas => !!canvas.folderId && deletedFolderIds.has(canvas.folderId)).map(canvas => canvas.id);
      updateCanvases(canvases.map(canvas => canvas.folderId && deletedFolderIds.has(canvas.folderId) ? { ...canvas, isDeleted: true, updatedAt: now } : canvas));
      updateShares(shares.filter(share => !canvasIds.includes(share.canvasId)));
      updateFolders(folders.filter(folder => !deletedFolderIds.has(folder.id)));
      if (selectedFolderId && deletedFolderIds.has(selectedFolderId)) setSelectedFolderId(null);
      addLog(`🗑️ 已删除画布文件夹【${deleteTargetFolder?.name ?? deleteState.id}】及其中 ${canvasIds.length} 个画布。`, 'warning');
    }
    setDeleteState(null);
  };

  const availableShareUsers = PLATFORM_USERS.filter(user => (
    user.email.toLowerCase() !== CURRENT_USER_EMAIL.toLowerCase() &&
    !shares.some(share => !share.viaGroup && share.canvasId === shareState?.canvasId && share.granteeEmail.toLowerCase() === user.email.toLowerCase())
  ));

  const submitShare = (user: PlatformUser) => {
    if (!shareState || !shareTarget) return;
    if (shareTarget.spaceId === SpaceId.ProjectA || shareTarget.spaceId === SpaceId.ProjectB) return;
    const now = new Date().toISOString();
    const nextShare: CanvasShareGrant = {
      canvasId: shareState.canvasId,
      granteeEmail: user.email,
      granteeName: user.name,
      role: shareState.role,
      sharedByEmail: CURRENT_USER_EMAIL,
      sharedAt: now
    };
    updateShares([nextShare, ...shares]);
    addLog(`📤 已将画布【${shareTarget.name}】分享给 ${user.name}，权限：${getRoleLabel(shareState.role)}。`, 'success');
    setShareState({ ...shareState, query: '' });
  };

  const removeShare = (email: string) => {
    if (!shareState) return;
    updateShares(shares.filter(share => !(share.canvasId === shareState.canvasId && !share.viaGroup && share.granteeEmail.toLowerCase() === email.toLowerCase())));
    addLog('🛑 已移除画布访问权限。', 'warning');
  };

  const submitProjectGroupShare = () => {
    if (!shareState || !shareTarget) return;
    if (shareTarget.spaceId !== SpaceId.ProjectA && shareTarget.spaceId !== SpaceId.ProjectB) return;
    const now = new Date().toISOString();
    const projectName = PROJECT_SPACES.find(space => space.id === shareTarget.spaceId)?.name ?? '项目空间';
    const nextShare: CanvasShareGrant = {
      canvasId: shareTarget.id,
      granteeEmail: `project-group:${shareTarget.spaceId}`,
      granteeName: `${projectName} 项目成员组`,
      role: shareState.role,
      sharedByEmail: CURRENT_USER_EMAIL,
      sharedAt: now,
      viaGroup: shareTarget.spaceId
    };
    const withoutExistingGroup = shares.filter(share => !(share.canvasId === shareTarget.id && share.viaGroup === shareTarget.spaceId));
    updateShares([nextShare, ...withoutExistingGroup]);
    addLog(`📤 已更新画布【${shareTarget.name}】的项目成员组权限：${getRoleLabel(shareState.role)}。`, 'success');
  };

  const removeProjectGroupShare = () => {
    if (!shareTarget) return;
    updateShares(shares.filter(share => !(share.canvasId === shareTarget.id && share.viaGroup === shareTarget.spaceId)));
    addLog('🛑 已移除项目成员组画布授权。', 'warning');
  };

  const copyCanvasLink = (canvas: CanvasDocument) => {
    navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?canvasId=${canvas.id}`);
    addLog(`🔗 已复制画布链接: ${canvas.name}`, 'success');
  };

  const matchedUsers = availableShareUsers
    .filter(user => {
      const query = shareState?.query.trim().toLowerCase() ?? '';
      if (!query) return true;
      return user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
    })
    .slice(0, 6);

  const directChildFolders = isTuyooCommonSpace
    ? []
    : getFoldersForSpace(currentSpace.id, selectedFolderId);
  const openedCanvas = openedCanvasId
    ? canvases.find(canvas => canvas.id === openedCanvasId && !canvas.isDeleted) ?? null
    : null;
  const openedCanvasRole = openedCanvas ? getCanvasRole(openedCanvas) : null;
  const closeCanvasContent = () => {
    setOpenedCanvasId(null);
  };
  const canvasGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${CANVAS_CARD_WIDTH}px, 1fr))`,
    gap: '0.5rem'
  };

  const openFolderActions = (folderId: string) => {
    setContextMenuFolderId(prev => (prev === folderId ? null : folderId));
    setContextMenuCanvasId(null);
  };

  const renderFolderActionMenu = (folder: CanvasFolder) => {
    const canMutateCurrentFolder = canMutateFolder(folder);
    if (!canMutateCurrentFolder || contextMenuFolderId !== folder.id) return null;
    const folderSpace = PROJECT_SPACES.find(space => space.id === folder.spaceId) ?? currentSpace;

    return (
      <div className="canvas-context-menu absolute right-1 top-8 z-30 w-40 overflow-hidden rounded border border-[#27272a] bg-[#0c0c0e] py-1 text-[11px] shadow-xl">
        {folder.parentId !== null && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openCreateFolderEditor(folderSpace, folder.parentId);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 hover:bg-[#121214]"
          >
            <Plus size={12} />
            新建同级文件夹
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openCreateFolderEditor(folderSpace, folder.id);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 hover:bg-[#121214]"
        >
          <CornerDownRight size={12} />
          新建子文件夹
        </button>
        <div className="my-1 border-t border-zinc-900" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openRenameFolderEditor(folder);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 hover:bg-[#121214]"
        >
          <Edit3 size={12} />
          重命名
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setDeleteState({ kind: 'folder', id: folder.id });
            setContextMenuFolderId(null);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-300 hover:bg-red-950/30"
        >
          <Trash2 size={12} />
          删除
        </button>
      </div>
    );
  };

  const renderInlineFolderEditor = (depth: number): React.ReactNode => {
    if (!folderEditor) return null;
    const isRename = folderEditor.mode === 'rename';
    const validationError = getFolderEditorValidationError();
    const shouldShowError = isFolderEditorSubmitAttempted && !!validationError;

    return (
      <div className="canvas-inline-folder-editor py-1 pr-2" style={{ paddingLeft: `${8 + depth * 16}px` }}>
        <div className="flex items-center gap-1.5">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-700">
            {isRename ? <Edit3 size={11} /> : <CornerDownRight size={12} />}
          </span>
          <Folder size={14} className="shrink-0 text-zinc-500" />
          <input
            autoFocus
            maxLength={CANVAS_NAME_MAX_LENGTH}
            value={folderEditor.name}
            onChange={(event) => setFolderEditor(prev => prev ? { ...prev, name: event.target.value } : prev)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitFolderEditor();
              if (event.key === 'Escape') closeFolderEditor();
            }}
            placeholder={isRename ? '重命名' : '文件夹名称'}
            className={`min-w-0 flex-1 rounded border bg-[#0c0c0e] px-2 py-1 text-xs text-zinc-200 outline-none transition-colors ${
              shouldShowError ? 'border-red-500/70 focus:border-red-500' : 'border-zinc-800 focus:border-[#00ff00]'
            }`}
          />
          <button
            type="button"
            title={shouldShowError ? validationError : '确认'}
            disabled={shouldShowError}
            onClick={submitFolderEditor}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
              shouldShowError ? 'cursor-not-allowed bg-zinc-800 text-zinc-600' : 'bg-[#00ff00] text-black'
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
        {shouldShowError && (
          <p className="mt-1 pl-6 text-[10px] font-mono leading-relaxed text-red-400">
            {validationError}
          </p>
        )}
      </div>
    );
  };

  const renderFolderRows = (space: ProjectSpace, parentId: string | null, depth = 0): React.ReactNode => {
    const childFolders = getFoldersForSpace(space.id, parentId);
    const isCreatingHere = folderEditor?.mode === 'create' && folderEditor.spaceId === space.id && folderEditor.parentId === parentId;
    if (childFolders.length === 0 && !isCreatingHere) return null;

    const renderedChildren = childFolders.map((folder) => {
      const children = getFoldersForSpace(space.id, folder.id);
      const hasChildren = children.length > 0;
      const isExpanded = expandedFolderIds.has(folder.id);
      const isSelected = !isTuyooCommonSpace && currentSpace.id === space.id && selectedFolderId === folder.id;
      const isRenamingThisFolder = folderEditor?.mode === 'rename' && folderEditor.folderId === folder.id;
      const isCreatingInThisFolder = folderEditor?.mode === 'create' && folderEditor.parentId === folder.id;
      const shouldRenderSubtree = (hasChildren && isExpanded) || isCreatingInThisFolder;

      return (
        <div key={folder.id} className="relative">
          {isRenamingThisFolder ? (
            renderInlineFolderEditor(depth)
          ) : (
            <button
              type="button"
              onClick={() => selectFolder(space, folder.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                openFolderActions(folder.id);
              }}
              className={`canvas-tree-row ${isSelected ? 'is-active' : ''}`}
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
                className={`canvas-tree-toggle ${hasChildren ? '' : 'is-empty'}`}
              >
                {hasChildren ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="h-1 w-1 rounded-full bg-current" />}
              </span>
              {isExpanded && hasChildren ? (
                <FolderOpen size={14} className={isSelected ? 'text-zinc-300' : 'text-zinc-500'} />
              ) : (
                <Folder size={14} className={isSelected ? 'text-zinc-300' : 'text-zinc-500'} />
              )}
              <span className="min-w-0 truncate">{folder.name}</span>
              <span className={`asset-folder-count ${isSelected ? 'is-selected' : ''}`}>{getFolderCanvasCount(folder.id)}</span>
            </button>
          )}
          {renderFolderActionMenu(folder)}
          {shouldRenderSubtree && renderFolderRows(space, folder.id, depth + 1)}
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

  const renderRootRow = (
    rootId: string,
    label: string,
    count: number,
    isActive: boolean,
    onSelect: () => void,
    children?: React.ReactNode
  ) => {
    const rootOpen = expandedRootIds[rootId] ?? false;
    const visual = ROOT_VISUALS[rootId] ?? ROOT_VISUALS[SpaceId.ProjectA];
    const RootIcon = visual.icon;
    const hasChildren = !!children || (folderEditor?.mode === 'create' && folderEditor.parentId === null && folderEditor.spaceId === rootId);

    return (
      <div key={rootId}>
        <div className={`canvas-tree-row ${isActive ? 'is-active' : ''}`}>
          <button
            type="button"
            onClick={() => hasChildren && toggleRoot(rootId)}
            className={`canvas-tree-toggle ${hasChildren ? '' : 'is-empty'}`}
          >
            {hasChildren ? (rootOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="h-1 w-1 rounded-full bg-current" />}
          </button>
          <button type="button" onClick={onSelect} className="canvas-tree-main">
            <RootIcon size={14} style={{ color: visual.accent }} />
            <span className="truncate">{label}</span>
          </button>
          <span className={`asset-folder-count ${isActive ? 'is-selected' : ''}`} style={isActive ? { '--folder-accent': visual.accent } as React.CSSProperties : undefined}>
            {count}
          </span>
        </div>
        {hasChildren && rootOpen && <div>{children}</div>}
      </div>
    );
  };

  const renderCanvasMenu = (canvas: CanvasDocument) => {
    if (contextMenuCanvasId !== canvas.id) return null;

    return (
      <div className="canvas-context-menu absolute right-1.5 top-9 z-30 w-40 overflow-hidden rounded border border-[#27272a] bg-[#0c0c0e] py-1 text-[11px] shadow-xl">
        <button type="button" onClick={() => openEditor(canvas)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 hover:bg-[#121214]"><ExternalLink size={12} />打开</button>
        {canRenameCanvas(canvas) && <button type="button" onClick={() => openDialog({ kind: 'rename-canvas', targetId: canvas.id, name: canvas.name })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 hover:bg-[#121214]"><Edit3 size={12} />重命名</button>}
        {canShareCanvas(canvas) && <button type="button" onClick={() => { setShareState({ canvasId: canvas.id, query: '', role: 'viewer' }); setContextMenuCanvasId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 hover:bg-[#121214]"><Send size={12} />分享</button>}
        <button type="button" onClick={() => { copyCanvasLink(canvas); setContextMenuCanvasId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-300 hover:bg-[#121214]"><Copy size={12} />复制链接</button>
        {canDeleteCanvas(canvas) && <button type="button" onClick={() => { setDeleteState({ kind: 'canvas', id: canvas.id }); setContextMenuCanvasId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-300 hover:bg-red-950/30"><Trash2 size={12} />删除</button>}
      </div>
    );
  };

  const renderCanvasContentView = () => {
    if (!openedCanvas) return null;
    const roleLabel = openedCanvasRole ? getRoleLabel(openedCanvasRole) : '使用者';

    return (
      <section className="canvas-inline-editor canvas-excalidraw-shell flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="canvas-inline-header flex shrink-0 items-center gap-3 border-b border-[#27272a] bg-[#0c0c0e]/60 px-4 py-2">
          <button
            type="button"
            onClick={closeCanvasContent}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-[#0c0c0e] text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00]"
            title="返回画布列表"
          >
            <ArrowLeft size={13} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-bold text-white">{openedCanvas.name}</h2>
              <span className="canvas-role-badge">{roleLabel}</span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
              Excalidraw 官方画布 · 创建人 {openedCanvas.ownerName} · 最后更新 {formatDateTime(openedCanvas.updatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyCanvasLink(openedCanvas)}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-[#0c0c0e] px-2.5 py-1.5 font-mono text-[10.5px] text-zinc-300 transition-colors hover:border-[#00ff00]/60 hover:text-white"
          >
            <Copy size={12} />
            复制链接
          </button>
        </div>

        <div className="canvas-excalidraw-frame-wrap min-h-0 flex-1 bg-white">
          <iframe
            src={EXCALIDRAW_URL}
            title={`Excalidraw - ${openedCanvas.name}`}
            className="canvas-excalidraw-frame"
            allow="clipboard-read; clipboard-write; fullscreen"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>
    );
  };

  const startFolderPaneResize = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktopLayout) return;

    const containerRect = canvasLayoutRef.current?.getBoundingClientRect();
    if (containerRect) {
      const rawWidth = event.clientX - containerRect.left;
      const maxWidthByContainer = Math.max(MIN_FOLDER_PANE_WIDTH, containerRect.width - 360);
      const constrainedWidth = Math.min(rawWidth, maxWidthByContainer);
      setFolderPaneWidth(clampFolderPaneWidth(constrainedWidth));
    }

    event.preventDefault();
    setIsResizingFolderPane(true);
  };

  return (
    <div ref={canvasLayoutRef} className="canvas-library-root flex h-full min-h-0 bg-[#09090b] text-zinc-200">
      <aside
        className="canvas-sidebar w-full shrink-0 border-b border-[#27272a] bg-[#070708] flex flex-col min-h-0 lg:border-b-0"
        style={isDesktopLayout ? { width: `${folderPaneWidth}px` } : undefined}
      >
        <div className="border-b border-[#1c1c1f] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <FolderOpen size={15} className="text-[#00ff00]" />
              <span className="truncate text-xs font-bold text-white">文件目录</span>
            </div>
            <button
              type="button"
              title={canCreateFolder ? `在「${selectedFolder?.name ?? spaceDisplayName}」下新建子文件夹` : '当前目录不支持新建文件夹'}
              disabled={!canCreateFolder}
              onClick={() => openCreateFolderEditor(currentSpace, selectedFolderId)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-[#0c0c0e] text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="canvas-directory-tree space-y-1">
            {renderRootRow(
              SpaceId.Personal,
              '个人空间',
              getSpaceCanvasCount(SpaceId.Personal),
              !isTuyooCommonSpace && currentSpace.id === SpaceId.Personal && selectedFolderId === null,
              () => selectSpace(personalSpace),
              renderFolderRows(personalSpace, null)
            )}

            {renderRootRow(
              TUYOO_COMMON_ROOT_ID,
              '途游通用',
              0,
              isTuyooCommonSpace,
              selectTuyooCommon
            )}

            {renderRootRow(
              SpaceId.Shared,
              '与我共享',
              getSpaceCanvasCount(SpaceId.Shared),
              !isTuyooCommonSpace && currentSpace.id === SpaceId.Shared && selectedFolderId === null,
              () => selectSpace(sharedSpace),
              renderFolderRows(sharedSpace, null)
            )}

            {projectSpaces.map(space => renderRootRow(
              space.id,
              space.name,
              getSpaceCanvasCount(space.id),
              !isTuyooCommonSpace && currentSpace.id === space.id && selectedFolderId === null,
              () => selectSpace(space),
              renderFolderRows(space, null)
            ))}
          </div>
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整画布目录宽度"
        onMouseDown={startFolderPaneResize}
        className="group relative hidden w-2 shrink-0 cursor-col-resize lg:block"
      >
        <div
          className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
            isResizingFolderPane ? 'bg-[#00ff00]' : 'bg-[#27272a] group-hover:bg-[#00ff00]/70'
          }`}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        {openedCanvas ? (
          renderCanvasContentView()
        ) : (
          <>
            <div className="asset-content-toolbar shrink-0 border-b border-[#27272a] bg-[#0c0c0e]/60 px-4 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold text-white">
                  <FolderOpen size={16} className="text-[#00ff00]" />
                  <span className="truncate">{selectedFolder?.name ?? spaceDisplayName}</span>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {canCreateCanvas && (
                    <button
                      type="button"
                      onClick={() => openDialog({ kind: 'create-canvas', name: '' })}
                      className="asset-upload-trigger inline-flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-[10.5px] font-mono font-semibold transition-colors"
                    >
                      <Plus size={12} />
                      新建画布
                    </button>
                  )}

                  <div className="relative w-56 sm:w-72 xl:w-80">
                    <Search size={13} className="absolute left-3 top-2 text-zinc-500" />
                    <input
                      type="text"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="搜索画布名称或创建人"
                      className="w-full rounded border border-zinc-800 bg-zinc-950 py-1.5 pl-9 pr-3 font-mono text-xs text-zinc-200 outline-none transition-colors focus:border-[#00ff00]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <section className="canvas-content-panel min-h-0 flex-1 overflow-y-auto p-5 space-y-7">
              {directChildFolders.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Folder size={16} className="text-[#00ff00]" />
                  <span>子文件夹</span>
                  <span className="font-mono text-xs text-zinc-500">({directChildFolders.length})</span>
                </div>
              </div>

              <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
                {directChildFolders.map(folder => {
                  const coverCanvases = getFolderCoverCanvases(folder.id);
                  const canvasCount = getFolderCanvasCount(folder.id);
                  const childFolderCount = getFoldersForSpace(folder.spaceId, folder.id).length;

                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        selectFolder(PROJECT_SPACES.find(space => space.id === folder.spaceId) ?? currentSpace, folder.id);
                        setExpandedFolderIds(prev => new Set(prev).add(folder.id));
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openFolderActions(folder.id);
                      }}
                      className="group/folderCard relative rounded border border-[#27272a] bg-[#0c0c0e] p-2 text-center transition-all hover:border-[#00ff00]/60 hover:bg-[#121214]"
                    >
                      <div className="asset-folder-cover relative aspect-[4/3] overflow-hidden rounded-md border border-zinc-800 bg-[#1f2430] p-1 transition-colors group-hover/folderCard:border-[#00ff00]/50">
                        {coverCanvases.length > 0 ? (
                          <div className="relative z-10 grid h-full grid-cols-[1.55fr_1fr] gap-1 pt-1.5">
                            <div className="canvas-folder-cover-tile overflow-hidden rounded bg-black/25" style={{ background: `linear-gradient(135deg, ${coverCanvases[0].thumbnailColor}, #09090b)` }}>
                              <div className="absolute inset-2 rounded border border-white/10 bg-black/10">
                                <div className="absolute left-2 top-3 h-6 w-14 rounded bg-white/10" />
                                <div className="absolute bottom-3 right-2 h-8 w-10 rounded bg-white/10" />
                              </div>
                            </div>
                            <div className="grid min-h-0 grid-rows-2 gap-1">
                              {[1, 2].map((coverIndex) => (
                                <div
                                  key={`${folder.id}-canvas-cover-${coverIndex}`}
                                  className="canvas-folder-cover-tile overflow-hidden rounded bg-black/25"
                                  style={coverCanvases[coverIndex] ? { background: `linear-gradient(135deg, ${coverCanvases[coverIndex].thumbnailColor}, #09090b)` } : undefined}
                                >
                                  {coverCanvases[coverIndex] ? (
                                    <div className="absolute inset-1.5 rounded border border-white/10 bg-black/10">
                                      <div className="absolute left-1.5 top-2 h-3 w-8 rounded bg-white/10" />
                                      <div className="absolute bottom-2 right-1.5 h-4 w-5 rounded bg-white/10" />
                                    </div>
                                  ) : (
                                    <div className="asset-folder-cover-missing flex h-full w-full items-center justify-center text-zinc-600">
                                      <FolderOpen size={18} />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="asset-folder-empty-cover relative z-10 grid h-full grid-cols-[1.55fr_1fr] gap-1 pt-1.5">
                            <div className="asset-folder-empty-tile flex items-center justify-center rounded">
                              <FolderOpen size={30} />
                            </div>
                            <div className="grid min-h-0 grid-rows-2 gap-1">
                              <div className="asset-folder-empty-tile rounded" />
                              <div className="asset-folder-empty-tile rounded" />
                            </div>
                          </div>
                        )}
                        <span className="asset-folder-cover-count absolute right-1.5 top-1.5 z-20 rounded border border-zinc-700 bg-black/80 px-1 py-0.5 text-[9px] font-mono text-zinc-300">
                          {canvasCount}
                        </span>
                      </div>
                      <div className="mt-1.5 min-w-0">
                        <p className="truncate text-[11px] font-semibold leading-4 text-zinc-200 group-hover/folderCard:text-white">
                          {folder.name}
                        </p>
                        <p className="mt-0.5 text-[9px] font-mono leading-3 text-zinc-500">
                          {childFolderCount} 个子目录
                        </p>
                      </div>
                      {renderFolderActionMenu(folder)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Palette size={16} className="text-[#00ff00]" />
                <span>画布</span>
                <span className="font-mono text-xs text-zinc-500">({visibleCanvases.length})</span>
              </div>
              <p className="font-mono text-[10.5px] text-zinc-500">按最后修改时间倒序</p>
            </div>

            {visibleCanvases.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center rounded border border-dashed border-[#27272a] p-8 text-center text-xs text-zinc-500">
                <Palette size={28} className="mb-3 text-zinc-700" />
                <p className="text-sm font-semibold text-zinc-300">暂无画布</p>
                <p className="mt-1 text-xs text-zinc-600">{canCreateCanvas ? '新建一个画布开始整理创意参考。' : '当前空间没有可查看的画布。'}</p>
                {canCreateCanvas && (
                  <button
                    type="button"
                    onClick={() => openDialog({ kind: 'create-canvas', name: '' })}
                    className="asset-upload-trigger mt-4 inline-flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-[10.5px] font-mono font-semibold transition-colors"
                  >
                    <Plus size={12} />
                    新建画布
                  </button>
                )}
              </div>
            ) : (
              <div style={canvasGridStyle}>
                {visibleCanvases.map(canvas => {
                  const role = getCanvasRole(canvas);
                  const shareCount = shares.filter(share => share.canvasId === canvas.id).length;
                  const commentCount = comments.filter(comment => comment.canvasId === canvas.id && !comment.resolved).length;

                  return (
                    <div
                      key={canvas.id}
                      onDoubleClick={() => openEditor(canvas)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextMenuCanvasId(canvas.id);
                        setContextMenuFolderId(null);
                      }}
                      className="group/card relative flex cursor-pointer flex-col overflow-hidden rounded border border-[#27272a] bg-[#0c0c0e] transition-all hover:border-zinc-700"
                    >
                      <div className="group/cover relative aspect-video shrink-0 select-none overflow-hidden border-b border-[#18181b] bg-black/60" style={{ background: `linear-gradient(135deg, ${canvas.thumbnailColor}, #09090b)` }}>
                        <div className="absolute inset-3 rounded border border-white/10 bg-black/10">
                          <div className="absolute left-4 top-5 h-10 w-24 rounded bg-white/10" />
                          <div className="absolute bottom-6 right-5 h-16 w-20 rounded bg-white/10" />
                          <div className="absolute left-10 bottom-8 h-8 w-28 rounded-full bg-white/10" />
                        </div>
                        <span className="absolute left-2 top-2 rounded border border-zinc-800 bg-black/90 px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-[#00ff00]">
                          {getRoleLabel(role)}
                        </span>
                        <div className="asset-cover-actions absolute right-1.5 top-1.5 z-20 flex items-center gap-1 rounded-md px-1 py-1 opacity-0 transition-all duration-200 pointer-events-none group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto group-focus-within/cover:opacity-100 group-focus-within/cover:pointer-events-auto">
                          {canShareCanvas(canvas) && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setShareState({ canvasId: canvas.id, query: '', role: 'viewer' });
                                setContextMenuCanvasId(null);
                              }}
                              className="asset-cover-action-btn asset-cover-action-btn-share flex h-7 w-7 items-center justify-center rounded-md bg-[#111214] text-emerald-300 transition-colors hover:bg-[#1a1c1f] focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/80"
                              title="分享画布"
                            >
                              <Send size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              copyCanvasLink(canvas);
                            }}
                            className="asset-cover-action-btn asset-cover-action-btn-copy flex h-7 w-7 items-center justify-center rounded-md bg-[#111214] text-cyan-300 transition-colors hover:bg-[#1a1c1f] focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/80"
                            title="复制链接"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setContextMenuCanvasId(prev => (prev === canvas.id ? null : canvas.id));
                              setContextMenuFolderId(null);
                            }}
                            className="asset-cover-action-btn asset-cover-action-btn-more flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800/85 text-zinc-200 transition-colors hover:bg-zinc-700/90 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-200/70"
                            title="更多操作"
                          >
                            <MoreHorizontal size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="flex h-8 items-center px-1.5 py-1">
                        <span className="block w-full truncate text-[11px] font-medium text-zinc-200 transition-colors group-hover/card:text-white">
                          {canvas.name}
                        </span>
                      </div>
                      <div className="border-t border-zinc-900 px-2.5 py-2 font-mono text-[9.5px] text-zinc-500">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{canvas.ownerName}</span>
                          <span className="shrink-0">{formatDateTime(canvas.updatedAt)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1"><Users size={11} />{shareCount}</span>
                          <span className="inline-flex items-center gap-1"><MessageSquare size={11} />{commentCount}</span>
                          <span className="inline-flex items-center gap-1"><Clock size={11} />{canvas.elementCount}</span>
                        </div>
                      </div>
                      {renderCanvasMenu(canvas)}
                    </div>
                  );
                })}
              </div>
            )}
              </section>
            </section>
          </>
        )}
      </main>

      {dialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c1c1f] px-5 py-4">
              <h3 className="text-sm font-bold text-white">{dialog.kind === 'create-canvas' ? '新建画布' : '重命名画布'}</h3>
              <button type="button" onClick={() => setDialog(null)} className="text-zinc-500 hover:text-white"><X size={15} /></button>
            </div>
            <div className="px-5 py-4">
              <input
                autoFocus
                value={dialog.name}
                maxLength={CANVAS_NAME_MAX_LENGTH}
                onChange={(event) => setDialog({ ...dialog, name: event.target.value, error: '' })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitDialog();
                  if (event.key === 'Escape') setDialog(null);
                }}
                placeholder="画布名称"
                className="w-full rounded border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#00ff00]"
              />
              {dialog.error && <p className="mt-2 text-[11px] text-red-400">{dialog.error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#1c1c1f] px-5 py-4">
              <button type="button" onClick={() => setDialog(null)} className="rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs text-zinc-400 hover:text-white">取消</button>
              <button type="button" onClick={submitDialog} className="rounded bg-[#00ff00] px-4 py-1.5 text-xs font-semibold text-black">确认</button>
            </div>
          </div>
        </div>
      )}

      {deleteState && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] shadow-2xl">
            <div className="border-b border-[#1c1c1f] px-5 py-4 text-sm font-bold text-white">确认删除</div>
            <div className="px-5 py-4 text-xs leading-relaxed text-zinc-300">
              {deleteState.kind === 'canvas' ? (
                <>确认删除画布 <span className="font-semibold text-white">「{deleteTargetCanvas?.name}」</span>？{shares.filter(share => share.canvasId === deleteState.id).length > 0 && <p className="mt-2 text-amber-400">该画布已分享给 {shares.filter(share => share.canvasId === deleteState.id).length} 位用户，删除后他们也将无法访问。</p>}</>
              ) : (
                <>将删除文件夹 <span className="font-semibold text-white">「{deleteTargetFolder?.name}」</span> 及其中所有画布（共 {deleteTargetFolder ? getFolderCanvasCount(deleteTargetFolder.id) : 0} 个），确认删除？</>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#1c1c1f] px-5 py-4">
              <button type="button" onClick={() => setDeleteState(null)} className="rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs text-zinc-400 hover:text-white">取消</button>
              <button type="button" onClick={confirmDelete} className="rounded bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {shareState && shareTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[520px] overflow-hidden rounded-xl border border-[#27272a] bg-[#0c0c0e] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c1c1f] px-5 py-4">
              <h3 className="text-sm font-bold text-white">分享画布</h3>
              <button type="button" onClick={() => setShareState(null)} className="text-zinc-500 hover:text-white"><X size={15} /></button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                <p className="text-sm font-semibold text-white">{shareTarget.name}</p>
                <p className="mt-1 text-[10px] text-zinc-500">作者：{shareTarget.ownerName}</p>
              </div>
              {(shareTarget.spaceId === SpaceId.ProjectA || shareTarget.spaceId === SpaceId.ProjectB) ? (
                <>
                  <div className="rounded-lg border border-zinc-800 bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-500">
                    项目空间画布通过项目成员组授权；添加或移除成员请到「权限管理」。这里仅调整项目成员组对该画布的默认权限。
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['viewer', 'editor'] as CanvasShareRole[]).map(role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setShareState({ ...shareState, role })}
                        className={`rounded border px-3 py-2 text-xs ${shareState.role === role ? 'border-[#00ff00] bg-[#00ff00]/10 text-[#00ff00]' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}
                      >
                        {getRoleLabel(role)}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1 rounded border border-zinc-800 p-1.5">
                    {shares.filter(share => share.canvasId === shareTarget.id && share.viaGroup === shareTarget.spaceId).length === 0 ? (
                      <p className="px-2 py-2 text-[11px] text-zinc-600">当前沿用项目成员默认可打开权限，尚未单独设置组权限。</p>
                    ) : (
                      shares
                        .filter(share => share.canvasId === shareTarget.id && share.viaGroup === shareTarget.spaceId)
                        .map(share => (
                          <div key={share.granteeEmail} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs text-zinc-300">
                            <span className="min-w-0 truncate">{share.granteeName}</span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="rounded border border-zinc-700 px-2 py-0.5 text-[10px]">{getRoleLabel(share.role)}</span>
                              <button type="button" onClick={removeProjectGroupShare} className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-red-500/60 hover:text-red-400">移除</button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(['viewer', 'editor'] as CanvasShareRole[]).map(role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setShareState({ ...shareState, role })}
                        className={`rounded border px-3 py-2 text-xs ${shareState.role === role ? 'border-[#00ff00] bg-[#00ff00]/10 text-[#00ff00]' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}
                      >
                        {getRoleLabel(role)}
                      </button>
                    ))}
                  </div>
                  <div>
                    <input
                      value={shareState.query}
                      onChange={(event) => setShareState({ ...shareState, query: event.target.value, error: '' })}
                      placeholder="输入姓名或邮箱，选择平台用户"
                      className="w-full rounded border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#00ff00]"
                    />
                    <div className="mt-2 max-h-44 overflow-y-auto rounded border border-zinc-800">
                      {matchedUsers.map(user => (
                        <button key={user.id} type="button" onClick={() => submitShare(user)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-300 hover:bg-[#121214]">
                          <span>{user.name} <span className="font-mono text-[10px] text-zinc-500">({user.email})</span></span>
                          <Plus size={12} />
                        </button>
                      ))}
                      {matchedUsers.length === 0 && <p className="px-3 py-3 text-center text-[11px] text-zinc-600">没有可添加的用户</p>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] text-zinc-500">已授权用户</p>
                    <div className="space-y-1 rounded border border-zinc-800 p-1.5">
                      <div className="flex items-center justify-between rounded px-2 py-1.5 text-xs text-zinc-300">
                        <span>{shareTarget.ownerName} <span className="font-mono text-[10px] text-zinc-500">({shareTarget.ownerEmail})</span></span>
                        <span className="rounded border border-zinc-700 px-2 py-0.5 text-[10px]">作者</span>
                      </div>
                      {shares.filter(share => share.canvasId === shareTarget.id && !share.viaGroup).map(share => (
                        <div key={share.granteeEmail} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs text-zinc-300">
                          <span className="min-w-0 truncate">{share.granteeName} <span className="font-mono text-[10px] text-zinc-500">({share.granteeEmail})</span></span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded border border-zinc-700 px-2 py-0.5 text-[10px]">{getRoleLabel(share.role)}</span>
                            <button type="button" onClick={() => removeShare(share.granteeEmail)} className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-red-500/60 hover:text-red-400">移除</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#1c1c1f] px-5 py-4">
              <button type="button" onClick={() => copyCanvasLink(shareTarget)} className="mr-auto inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs text-zinc-400 hover:text-white"><Copy size={12} />复制链接</button>
              {(shareTarget.spaceId === SpaceId.ProjectA || shareTarget.spaceId === SpaceId.ProjectB) && (
                <button type="button" onClick={submitProjectGroupShare} className="rounded bg-[#00ff00] px-4 py-1.5 text-xs font-semibold text-black">确认授权</button>
              )}
              <button type="button" onClick={() => setShareState(null)} className="rounded border border-zinc-800 bg-black px-4 py-1.5 text-xs text-zinc-400 hover:text-white">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

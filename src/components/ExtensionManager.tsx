import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Puzzle,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  User,
  Users,
  UploadCloud,
  WifiOff,
  X
} from 'lucide-react';
import { CURRENT_USER_EMAIL, CURRENT_USER_NAME, INITIAL_PROJECT_MEMBERS, PROJECT_SPACES } from '../data';
import {
  AppConfig,
  AppId,
  AppStatus,
  DccExtension,
  ExtensionArtStage,
  ExtensionHostId,
  ExtensionLifecycle,
  NotificationAction,
  NotificationInput,
  PlatformUser,
  ProjectMember,
  SpaceId,
  DownloadTransferInput,
  TransferTask
} from '../types';
import {
  applyDraftToExtension,
  createEmptyExtensionDraft,
  createExtensionDraft,
  EXTENSION_STAGE_META,
  EXTENSION_STAGE_OPTIONS,
  EXTENSION_TYPE_META,
  EXTENSION_TYPE_OPTIONS,
  ExtensionDraft,
  ExtensionEditor,
  hasDraftChanges,
  hasVersionedDraftChanges
} from './ExtensionEditor';
import { PlatformUserPicker, PLATFORM_USER_PICKER_MAX_USERS } from './PlatformUserPicker';

interface ExtensionManagerProps {
  apps: AppConfig[];
  setApps: React.Dispatch<React.SetStateAction<AppConfig[]>>;
  extensions: DccExtension[];
  setExtensions: React.Dispatch<React.SetStateAction<DccExtension[]>>;
  simulatedDiskGB: number;
  onOpenSettings: () => void;
  onDownloadActivityChange: (count: number) => void;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error', options?: { toast?: boolean }) => void;
  addNotification: (notification: NotificationInput) => void;
  navigationTarget: NotificationAction | null;
  theme: 'light' | 'dark';
  transferTasks: TransferTask[];
  enqueueDownload: (input: DownloadTransferInput) => string | null;
  cancelTransferTask: (taskId: string) => void;
  pauseTransferTask: (taskId: string) => void;
  resumeTransferTask: (taskId: string) => void;
  retryTransferTask: (taskId: string) => void;
}

type DownloadStatus = 'queued' | 'packing' | 'downloading' | 'paused' | 'waiting_network' | 'completed' | 'failed';
type DownloadKind = 'download' | 'update';

interface ExtensionDownloadTask {
  id: string;
  extensionId: string;
  kind: DownloadKind;
  status: DownloadStatus;
  pauseReason?: TransferTask['pauseReason'];
  progress: number;
  speedMBps: number;
  createdAt: number;
}

interface LaunchPrompt {
  extension: DccExtension;
  type: 'missing' | 'restart' | 'hotload_failure' | 'update_close';
}

const PROJECT_MEMBERS_STORAGE_KEY = 'art-launcher-project-members-v1';

const DCC_META = EXTENSION_TYPE_META;
const DCC_OPTIONS = EXTENSION_TYPE_OPTIONS;
const STAGE_META = EXTENSION_STAGE_META;

const SPACE_META: Record<SpaceId, { icon: typeof User; color: string }> = {
  [SpaceId.Personal]: { icon: User, color: '#38bdf8' },
  [SpaceId.Shared]: { icon: Users, color: '#a78bfa' },
  [SpaceId.ProjectA]: { icon: Boxes, color: '#00ff00' },
  [SpaceId.ProjectB]: { icon: Boxes, color: '#00ff00' }
};

const LIFECYCLE_META: Record<ExtensionLifecycle, { label: string; dot: string; text: string }> = {
  not_downloaded: { label: '未下载', dot: 'bg-zinc-500', text: 'text-zinc-400' },
  installed_latest: { label: '已安装·最新', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  update_available: { label: '有新版本', dot: 'bg-amber-400', text: 'text-amber-400' }
};

const LIFECYCLE_OPTIONS: ExtensionLifecycle[] = ['not_downloaded', 'installed_latest', 'update_available'];
const STAGE_OPTIONS = EXTENSION_STAGE_OPTIONS;
const STAGE_TABS: Array<{ value: ExtensionArtStage | null; label: string }> = [
  { value: null, label: '全部' },
  ...STAGE_OPTIONS.map(stage => ({ value: stage, label: STAGE_META[stage] }))
];

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date(value));

const spaceLabel = (spaceId: SpaceId) => {
  if (spaceId === SpaceId.Personal) return '个人空间';
  if (spaceId === SpaceId.Shared) return '与我共享';
  return PROJECT_SPACES.find(space => space.id === spaceId)?.name ?? '项目空间';
};

const buildExtensionHref = (spaceId: SpaceId, extensionId?: string) => {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('tab', 'extensions');
  url.searchParams.set('space', spaceId);
  if (extensionId) url.searchParams.set('tool', extensionId);
  return url.toString();
};

const readProjectMembers = (): Record<SpaceId, ProjectMember[]> => {
  try {
    const stored = localStorage.getItem(PROJECT_MEMBERS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Record<SpaceId, ProjectMember[]>>;
      return {
        [SpaceId.Personal]: [],
        [SpaceId.Shared]: [],
        [SpaceId.ProjectA]: Array.isArray(parsed[SpaceId.ProjectA]) ? parsed[SpaceId.ProjectA] : INITIAL_PROJECT_MEMBERS[SpaceId.ProjectA],
        [SpaceId.ProjectB]: Array.isArray(parsed[SpaceId.ProjectB]) ? parsed[SpaceId.ProjectB] : INITIAL_PROJECT_MEMBERS[SpaceId.ProjectB]
      };
    }
  } catch {
    // Fall back to the seeded project roles when local permission data is unavailable.
  }
  return INITIAL_PROJECT_MEMBERS;
};

const nextVersion = (version: string) => {
  const match = version.match(/^(.*?)(\d+)([^\d]*)$/);
  if (!match) return 'V2';
  return `${match[1]}${Number(match[2]) + 1}${match[3]}`;
};

export default function ExtensionManager({
  apps,
  setApps,
  extensions,
  setExtensions,
  simulatedDiskGB,
  onOpenSettings,
  onDownloadActivityChange,
  addLog,
  addNotification,
  navigationTarget,
  theme,
  transferTasks,
  enqueueDownload,
  cancelTransferTask,
  pauseTransferTask,
  resumeTransferTask,
  retryTransferTask
}: ExtensionManagerProps) {
  const [selectedSpaceId, setSelectedSpaceId] = useState<SpaceId>(SpaceId.ProjectA);
  const [keyword, setKeyword] = useState('');
  const [selectedDccs, setSelectedDccs] = useState<ExtensionHostId[]>([]);
  const [selectedStage, setSelectedStage] = useState<ExtensionArtStage | null>(null);
  const [selectedLifecycles, setSelectedLifecycles] = useState<ExtensionLifecycle[]>([]);
  const [selectedExtensionId, setSelectedExtensionId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const tasks = useMemo<ExtensionDownloadTask[]>(() => transferTasks
    .filter(task => task.direction === 'download' && task.resourceKind === 'tool' && !['cancelled', 'completed'].includes(task.status))
    .map(task => ({
      id: task.id,
      extensionId: task.resourceId,
      kind: task.downloadKind === 'update' ? 'update' : 'download',
      status: task.status === 'transferring'
        ? 'downloading'
        : task.status === 'packing'
          ? 'packing'
        : task.status === 'waiting_network'
          ? 'waiting_network'
          : task.status === 'failed'
            ? 'failed'
            : task.status === 'completed'
              ? 'completed'
              : task.status === 'paused'
                ? 'paused'
                : 'queued',
      progress: task.progress,
      speedMBps: task.speedMBps,
      pauseReason: task.pauseReason,
      createdAt: new Date(task.createdAt).getTime()
    })), [transferTasks]);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [cancelTaskId, setCancelTaskId] = useState<string | null>(null);
  const [launchPrompt, setLaunchPrompt] = useState<LaunchPrompt | null>(null);
  const [deleteExtension, setDeleteExtension] = useState<DccExtension | null>(null);
  const [actionMenuKey, setActionMenuKey] = useState<string | null>(null);
  const [shareExtension, setShareExtension] = useState<DccExtension | null>(null);
  const [shareUserQuery, setShareUserQuery] = useState('');
  const [shareSelectedUsers, setShareSelectedUsers] = useState<PlatformUser[]>([]);
  const [shareError, setShareError] = useState('');
  const [projectMembers] = useState(readProjectMembers);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editorExtensionId, setEditorExtensionId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<ExtensionDraft>(createEmptyExtensionDraft);
  const [editorOriginalDraft, setEditorOriginalDraft] = useState<ExtensionDraft | null>(null);
  const [editorMessage, setEditorMessage] = useState('');
  const [pendingVersionPublish, setPendingVersionPublish] = useState<{ extensionId: string; draft: ExtensionDraft; currentVersion: string; nextVersion: string } | null>(null);
  const previousSpaceId = useRef<SpaceId>(SpaceId.ProjectA);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const isLight = theme === 'light';

  const extensionsForSpace = useMemo(() => extensions.filter(extension => {
    if (selectedSpaceId === SpaceId.Shared) {
      return extension.ownerEmail !== CURRENT_USER_EMAIL
        && extension.sharedWith.some(grant => grant.email === CURRENT_USER_EMAIL);
    }
    if (selectedSpaceId === SpaceId.Personal) {
      return extension.spaceId === SpaceId.Personal && extension.ownerEmail === CURRENT_USER_EMAIL;
    }
    return extension.spaceId === selectedSpaceId;
  }), [extensions, selectedSpaceId]);

  const filteredExtensions = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return extensionsForSpace.filter(extension => {
      if (selectedDccs.length > 0 && !selectedDccs.includes(extension.dccId)) return false;
      if (selectedStage && extension.stage !== selectedStage) return false;
      if (selectedLifecycles.length > 0 && !selectedLifecycles.includes(extension.lifecycle)) return false;
      if (query && !`${extension.name} ${extension.desc}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [extensionsForSpace, keyword, selectedDccs, selectedStage, selectedLifecycles]);

  const selectedExtension = selectedExtensionId
    ? extensions.find(extension => extension.id === selectedExtensionId) ?? null
    : null;
  const shareExistingEmails = useMemo(
    () => new Set(shareExtension?.sharedWith.map(grant => grant.email.toLowerCase()) ?? []),
    [shareExtension]
  );

  useEffect(() => {
    if (!actionMenuKey) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setActionMenuKey(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionMenuKey(null);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [actionMenuKey]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addLog('网络已恢复，工具下载任务将从断点继续。', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      addLog('网络已中断，工具下载进度已保留。', 'warning');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addLog]);

  useEffect(() => {
    onDownloadActivityChange(tasks.filter(task => task.status !== 'completed').length);
  }, [tasks, onDownloadActivityChange]);

  useEffect(() => {
    if (previousSpaceId.current === selectedSpaceId) return;
    addLog(`工具空间已从「${spaceLabel(previousSpaceId.current)}」切换至「${spaceLabel(selectedSpaceId)}」，后台任务保持运行。`, 'info', { toast: false });
    previousSpaceId.current = selectedSpaceId;
  }, [selectedSpaceId, addLog]);

  useEffect(() => {
    if (!navigationTarget) return;
    setSelectedSpaceId(navigationTarget.spaceId);
    setKeyword('');
    setSelectedDccs([]);
    setSelectedStage(null);
    setSelectedLifecycles([]);
    setSelectedExtensionId(navigationTarget.extensionId ?? null);
  }, [navigationTarget]);

  useEffect(() => {
    if (!selectedExtension) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedExtensionId(null);
      if (event.key === 'ArrowLeft') navigateDetail(-1);
      if (event.key === 'ArrowRight') navigateDetail(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const getTask = (extensionId: string) => tasks.find(task => task.extensionId === extensionId);

  const startTask = (extension: DccExtension, kind: DownloadKind) => {
    if (getTask(extension.id)) return;
    const requiredGB = extension.fileSizeMB / 1024;
    if (simulatedDiskGB < requiredGB) {
      addLog(`磁盘空间不足，需要 ${extension.fileSizeMB} MB，当前剩余 ${(simulatedDiskGB * 1024).toFixed(0)} MB。`, 'error');
      return;
    }
    const taskId = enqueueDownload({
      resourceKind: 'tool',
      resourceId: extension.id,
      name: extension.name,
      sizeMB: extension.fileSizeMB,
      format: 'ZIP',
      previewUrl: extension.thumbnail,
      targetSpaceId: extension.spaceId,
      downloadKind: kind
    });
    if (!taskId) {
      addLog('工具下载任务创建失败：传输队列已满。', 'error');
      return;
    }
    addLog(`${kind === 'update' ? '开始更新' : '开始下载'}「${extension.name}」，任务已加入传输中心。`, 'info');
  };

  const confirmCancelTask = () => {
    if (!cancelTaskId) return;
    cancelTransferTask(cancelTaskId);
    setCancelTaskId(null);
    addLog('工具下载已取消，临时文件已清理。', 'warning');
  };

  const requestUpdate = (extension: DccExtension) => {
    const app = apps.find(item => item.id === extension.dccId);
    if (app?.status === AppStatus.Connected) {
      setLaunchPrompt({ extension, type: 'update_close' });
      return;
    }
    startTask(extension, 'update');
  };

  const launchExtension = (extension: DccExtension) => {
    if (extension.dccId === 'web') {
      if (!extension.webUrl) {
        addLog(`「${extension.name}」未配置 Web 访问地址。`, 'error');
        return;
      }
      window.open(extension.webUrl, '_blank', 'noopener,noreferrer');
      addLog(`已使用系统默认浏览器打开「${extension.name}」。`, 'success');
      return;
    }
    if (extension.dccId === 'exe') {
      setExtensions(previous => previous.map(item => item.id === extension.id ? { ...item, isActivated: true } : item));
      addLog(`已按指令启动「${extension.name}」${extension.command ? `：${extension.command}` : '。'}`, 'success');
      return;
    }
    const app = apps.find(item => item.id === extension.dccId);
    if (!app || app.status === AppStatus.NotReady || !app.installPath) {
      setLaunchPrompt({ extension, type: 'missing' });
      return;
    }
    if (extension.needsRestart) {
      setLaunchPrompt({ extension, type: 'restart' });
      return;
    }
    if (extension.simulateHotLoadFailure) {
      setLaunchPrompt({ extension, type: 'hotload_failure' });
      return;
    }
    const alreadyConnected = app.status === AppStatus.Connected;
    if (!alreadyConnected) {
      setApps(previous => previous.map(item => item.id === app.id ? { ...item, status: AppStatus.Connecting } : item));
    }
    addLog(`${alreadyConnected ? '正在热加载' : '正在启动并连接'} ${app.name}，准备加载「${extension.name}」...`, 'info');
    window.setTimeout(() => {
      setApps(previous => previous.map(item => item.id === app.id ? { ...item, status: AppStatus.Connected } : item));
      setExtensions(previous => previous.map(item => item.id === extension.id ? { ...item, isActivated: true } : item));
      addLog(`${extension.name} 已通过 ${app.id === AppId.Maya ? 'cmds.loadPlugin()' : 'addon_enable()'} 完成热加载。`, 'success');
    }, alreadyConnected ? 600 : 1500);
  };

  const confirmRestartLaunch = () => {
    if (!launchPrompt) return;
    const extension = launchPrompt.extension;
    const app = apps.find(item => item.id === extension.dccId);
    if (!app) return;
    setLaunchPrompt(null);
    setApps(previous => previous.map(item => item.id === app.id ? { ...item, status: AppStatus.Connecting } : item));
    addLog(`正在重启 ${app.name} 并加载「${extension.name}」...`, 'warning');
    window.setTimeout(() => {
      setApps(previous => previous.map(item => item.id === app.id ? { ...item, status: AppStatus.Connected } : item));
      setExtensions(previous => previous.map(item => item.id === extension.id ? { ...item, isActivated: true, simulateHotLoadFailure: false } : item));
      addLog(`${app.name} 已重新连接，「${extension.name}」加载成功。`, 'success');
    }, 1800);
  };

  const confirmUpdateClose = () => {
    if (!launchPrompt) return;
    const extension = launchPrompt.extension;
    setApps(previous => previous.map(item => item.id === extension.dccId ? { ...item, status: AppStatus.InstalledOffline } : item));
    setLaunchPrompt(null);
    startTask(extension, 'update');
  };

  const confirmDelete = () => {
    if (!deleteExtension) return;
    const extension = deleteExtension;
    setExtensions(previous => previous.filter(item => item.id !== extension.id));
    setSelectedExtensionId(previous => previous === extension.id ? null : previous);
    setDeleteExtension(null);
    addLog(`已删除「${extension.name}」，${extension.sharedWith.length} 位被授权用户的入口已同步移除，本地文件不受影响。`, 'success');
  };

  const submitShare = () => {
    if (!shareExtension || !isOnline) return;
    if (shareSelectedUsers.length === 0) {
      setShareError(shareUserQuery.trim() ? '请从搜索结果中选择要授权的用户。' : '请至少添加 1 位协作者（支持姓名/邮箱模糊匹配）。');
      return;
    }
    if (shareSelectedUsers.length > PLATFORM_USER_PICKER_MAX_USERS) {
      setShareError(`单次最多同时添加 ${PLATFORM_USER_PICKER_MAX_USERS} 人。`);
      return;
    }
    const freshUsers = shareSelectedUsers.filter(user => !shareExistingEmails.has(user.email.toLowerCase()));
    if (freshUsers.length === 0) {
      setShareError('所选协作者均已拥有该工具权限，请勿重复授权。');
      return;
    }
    const sharedAt = new Date().toISOString();
    const grants = freshUsers.map(user => ({ email: user.email, name: user.name, sharedAt }));
    setExtensions(previous => previous.map(item => item.id === shareExtension.id ? {
      ...item,
      sharedWith: [...item.sharedWith, ...grants]
    } : item));
    setShareUserQuery('');
    setShareSelectedUsers([]);
    setShareError('');
    freshUsers.forEach(user => {
      addNotification({
        domain: 'tool',
        node: 'tool-personal-grant',
        trigger: '个人空间工具授权完成',
        recipient: `${user.name}（${user.email}）`,
        title: '获得新工具使用权限',
        content: `${CURRENT_USER_NAME} 已将工具「${shareExtension.name}」授权给您，点击可前往“与我共享”查看。`,
        resourceLabel: '工具',
        resourceName: shareExtension.name,
        actorName: CURRENT_USER_NAME,
        action: {
          label: '查看工具',
          tab: 'extensions',
          spaceId: SpaceId.Shared,
          extensionId: shareExtension.id,
          href: buildExtensionHref(SpaceId.Shared, shareExtension.id)
        }
      });
    });
    addLog(`已将「${shareExtension.name}」授权给 ${freshUsers.length} 位用户；站内通知已逐人生成，钉钉机器人已逐人推送。`, 'success', { toast: false });
    setShareExtension(null);
    addLog('分享成功！', 'success');
  };

  const removeShare = (extension: DccExtension, email: string) => {
    setExtensions(previous => previous.map(item => item.id === extension.id ? {
      ...item,
      sharedWith: item.sharedWith.filter(grant => grant.email !== email)
    } : item));
    setShareExtension(previous => previous ? { ...previous, sharedWith: previous.sharedWith.filter(grant => grant.email !== email) } : previous);
    addLog(`已移除 ${email} 对「${extension.name}」的使用权限。`, 'success');
  };

  const copyToolLink = async (extension: DccExtension) => {
    const url = buildExtensionHref(SpaceId.Shared, extension.id);
    try {
      await navigator.clipboard.writeText(url);
      addLog('工具链接已复制；访问者仍需已有授权。', 'success');
    } catch {
      addLog(`工具链接：${url}`, 'info');
    }
  };

  const navigateDetail = (direction: number) => {
    if (!selectedExtensionId || filteredExtensions.length < 2) return;
    const currentIndex = filteredExtensions.findIndex(extension => extension.id === selectedExtensionId);
    const nextIndex = (currentIndex + direction + filteredExtensions.length) % filteredExtensions.length;
    setSelectedExtensionId(filteredExtensions[nextIndex].id);
  };

  const toggleValue = <T,>(value: T, values: T[], setter: React.Dispatch<React.SetStateAction<T[]>>) => {
    setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  };

  const clearFilters = () => {
    setSelectedDccs([]);
    setSelectedStage(null);
    setSelectedLifecycles([]);
    setKeyword('');
  };

  const getSpaceCount = (spaceId: SpaceId) => {
    if (spaceId === SpaceId.Shared) {
      return extensions.filter(item => item.ownerEmail !== CURRENT_USER_EMAIL && item.sharedWith.some(grant => grant.email === CURRENT_USER_EMAIL)).length;
    }
    if (spaceId === SpaceId.Personal) {
      return extensions.filter(item => item.spaceId === SpaceId.Personal && item.ownerEmail === CURRENT_USER_EMAIL).length;
    }
    return extensions.filter(item => item.spaceId === spaceId).length;
  };

  const isProjectAdmin = (spaceId: SpaceId) => (
    (spaceId === SpaceId.ProjectA || spaceId === SpaceId.ProjectB)
    && projectMembers[spaceId].some(member => member.email === CURRENT_USER_EMAIL && member.role === 'admin')
  );

  const canCreateExtension = selectedSpaceId === SpaceId.Personal || isProjectAdmin(selectedSpaceId);

  const canModifyExtension = (extension: DccExtension) => {
    if (selectedSpaceId === SpaceId.Shared) return false;
    if (selectedSpaceId === SpaceId.Personal) return extension.ownerEmail === CURRENT_USER_EMAIL;
    return extension.ownerEmail === CURRENT_USER_EMAIL || isProjectAdmin(selectedSpaceId);
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditorExtensionId(null);
    setEditorOriginalDraft(null);
    setEditorMessage('');
  };

  const openCreateEditor = () => {
    if (!canCreateExtension) return;
    setEditorDraft(createEmptyExtensionDraft());
    setEditorOriginalDraft(null);
    setEditorExtensionId(null);
    setEditorMessage('');
    setEditorMode('create');
  };

  const openEditEditor = (extension: DccExtension) => {
    if (!canModifyExtension(extension)) return;
    const draft = createExtensionDraft(extension);
    setEditorDraft(draft);
    setEditorOriginalDraft(draft);
    setEditorExtensionId(extension.id);
    setEditorMessage('');
    setEditorMode('edit');
  };

  const submitEditor = () => {
    if (editorMode === 'create') {
      if (!canCreateExtension || selectedSpaceId === SpaceId.Shared) return;
      const createdAt = new Date().toISOString();
      const base: DccExtension = {
        id: `ext-created-${Date.now()}`,
        name: editorDraft.name.trim(),
        dccId: editorDraft.type,
        version: 'V1',
        latestVersion: 'V1',
        desc: editorDraft.desc.trim(),
        author: CURRENT_USER_NAME,
        ownerEmail: CURRENT_USER_EMAIL,
        spaceId: selectedSpaceId,
        stage: editorDraft.stage,
        lifecycle: 'not_downloaded',
        fileSizeMB: editorDraft.type === 'web' ? 0 : 64,
        thumbnail: editorDraft.thumbnail,
        previewUrl: editorDraft.thumbnail,
        updatedAt: createdAt,
        needsRestart: editorDraft.type !== 'exe' && editorDraft.type !== 'web',
        isActivated: false,
        sharedWith: []
      };
      const created = applyDraftToExtension(base, editorDraft);
      setExtensions(previous => [created, ...previous]);
      clearFilters();
      closeEditor();
      addLog(`已创建工具拓展「${created.name}」，当前版本 V1，状态为未下载。`, 'success');
      return;
    }

    if (editorMode !== 'edit' || !editorExtensionId || !editorOriginalDraft) return;
    const extension = extensions.find(item => item.id === editorExtensionId);
    if (!extension || !canModifyExtension(extension)) return;
    if (!hasDraftChanges(editorOriginalDraft, editorDraft)) {
      setEditorMessage('未检测到修改');
      return;
    }
    if (hasVersionedDraftChanges(editorOriginalDraft, editorDraft)) {
      const currentVersion = extension.latestVersion || extension.version;
      setPendingVersionPublish({
        extensionId: extension.id,
        draft: editorDraft,
        currentVersion,
        nextVersion: nextVersion(currentVersion)
      });
      return;
    }
    setExtensions(previous => previous.map(item => item.id === extension.id ? applyDraftToExtension(item, editorDraft) : item));
    closeEditor();
    addLog(`已保存「${editorDraft.name.trim()}」的展示信息，版本号保持 ${extension.latestVersion}。`, 'success');
  };

  const confirmVersionPublish = () => {
    if (!pendingVersionPublish) return;
    const publish = pendingVersionPublish;
    setExtensions(previous => previous.map(item => {
      if (item.id !== publish.extensionId) return item;
      const updated = applyDraftToExtension(item, publish.draft);
      if (item.lifecycle === 'not_downloaded') {
        return { ...updated, version: publish.nextVersion, latestVersion: publish.nextVersion };
      }
      return { ...updated, latestVersion: publish.nextVersion, lifecycle: 'update_available', isActivated: false };
    }));
    setPendingVersionPublish(null);
    closeEditor();
    addLog(`「${publish.draft.name.trim()}」已发布 ${publish.nextVersion}，旧版本使用者将看到更新提示。`, 'success');
  };

  const renderTask = (extension: DccExtension, compact = false) => {
    const task = getTask(extension.id);
    if (!task) return null;
    const remainingSeconds = Math.max(1, Math.ceil(((100 - task.progress) / 100 * extension.fileSizeMB) / task.speedMBps));
    const taskLabel = task.status === 'queued' ? '下载中' : task.status === 'packing' ? '打包中' : task.status === 'paused' ? '已暂停' : task.status === 'waiting_network' ? '已暂停（网络异常）' : task.status === 'failed' ? '下载失败，可重试' : task.kind === 'update' ? '正在更新' : '正在下载';

    if (compact) {
      return (
        <div className={`mt-3 flex h-[45px] items-center gap-2 border-t ${isLight ? 'border-slate-200' : 'border-zinc-800/70'}`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-mono">
              <span className={`truncate ${isLight ? 'text-sky-600' : 'text-sky-300'}`}>{taskLabel}</span>
              <span className="shrink-0 text-zinc-500">{Math.round(task.progress)}% · {task.speedMBps.toFixed(1)} MB/s</span>
            </div>
            <div className={`h-1 overflow-hidden rounded-full ${isLight ? 'bg-slate-200' : 'bg-zinc-800'}`}>
              <div className="h-full bg-sky-400 transition-all" style={{ width: `${task.progress}%` }} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {task.status === 'failed' && (
              <button type="button" title="重试" onClick={(event) => { event.stopPropagation(); retryTransferTask(task.id); }} className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${isLight ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}><RefreshCw size={11} /></button>
            )}
            {(task.status === 'downloading' || task.status === 'queued') && (
              <button type="button" title="暂停下载" onClick={(event) => { event.stopPropagation(); pauseTransferTask(task.id); }} className={`inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 ${isLight ? 'hover:bg-slate-100 hover:text-slate-900' : 'hover:bg-zinc-800 hover:text-white'}`}><Pause size={11} /></button>
            )}
            {task.status === 'paused' && task.pauseReason === 'manual' && (
              <button type="button" title="继续下载" onClick={(event) => { event.stopPropagation(); resumeTransferTask(task.id); }} className={`inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 ${isLight ? 'hover:bg-slate-100 hover:text-slate-900' : 'hover:bg-zinc-800 hover:text-white'}`}><Play size={11} /></button>
            )}
            <button type="button" title="取消下载" onClick={(event) => { event.stopPropagation(); setCancelTaskId(task.id); }} className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-red-500/10 hover:text-red-500"><X size={11} /></button>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-4 rounded border border-sky-500/25 bg-sky-500/5 p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-mono">
          <span className="flex min-w-0 items-center gap-1.5 text-sky-300">
            {task.status === 'waiting_network' || (task.status === 'paused' && task.pauseReason !== 'manual') ? <WifiOff size={11} /> : <Download size={11} />}
            <span className="truncate">
              {taskLabel}
            </span>
          </span>
          <span className="shrink-0 text-zinc-400">{Math.round(task.progress)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-sky-400 transition-all" style={{ width: `${task.progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[9px] font-mono text-zinc-500">
            {task.status === 'downloading' ? `${task.speedMBps.toFixed(1)} MB/s · 剩余约 ${remainingSeconds}s` : task.status === 'queued' ? '等待并发槽位' : task.status === 'packing' ? '服务端打包中' : '断点数据已保留'}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {task.status === 'failed' && (
              <button type="button" title="重试" onClick={(event) => { event.stopPropagation(); retryTransferTask(task.id); }} className={`inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 ${isLight ? 'hover:bg-slate-100 hover:text-slate-900' : 'hover:bg-zinc-800 hover:text-white'}`}>
                <RefreshCw size={12} />
              </button>
            )}
            {(task.status === 'downloading' || task.status === 'queued') && (
              <button type="button" title="暂停下载" onClick={(event) => { event.stopPropagation(); pauseTransferTask(task.id); }} className={`inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 ${isLight ? 'hover:bg-slate-100 hover:text-slate-900' : 'hover:bg-zinc-800 hover:text-white'}`}>
                <Pause size={12} />
              </button>
            )}
            {task.status === 'paused' && task.pauseReason === 'manual' && (
              <button type="button" title="继续下载" onClick={(event) => { event.stopPropagation(); resumeTransferTask(task.id); }} className={`inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 ${isLight ? 'hover:bg-slate-100 hover:text-slate-900' : 'hover:bg-zinc-800 hover:text-white'}`}>
                <Play size={12} />
              </button>
            )}
            <button type="button" title="取消下载" onClick={(event) => { event.stopPropagation(); setCancelTaskId(task.id); }} className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-red-500/15 hover:text-red-400">
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderLifecycleActions = (extension: DccExtension, detail = false) => {
    const task = getTask(extension.id);
    const canManagePersonal = selectedSpaceId === SpaceId.Personal && extension.ownerEmail === CURRENT_USER_EMAIL;
    const canModify = canModifyExtension(extension);
    const menuKey = `${detail ? 'detail' : 'card'}:${extension.id}`;
    const isActionMenuOpen = actionMenuKey === menuKey;
    if (task) return renderTask(extension, !detail);
    return (
      <div className={`relative flex flex-wrap items-center gap-2 ${detail ? 'mt-5' : ''}`}>
        {extension.lifecycle === 'not_downloaded' && (
          <button type="button" onClick={(event) => { event.stopPropagation(); startTask(extension, 'download'); }} className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-[11px] font-semibold transition-colors ${isLight ? 'force-text-white bg-slate-950 hover:bg-slate-800' : 'bg-white text-black hover:bg-zinc-200'}`}>
            <Download size={13} /> 下载
          </button>
        )}
        {extension.lifecycle === 'installed_latest' && (
          <button type="button" onClick={(event) => { event.stopPropagation(); launchExtension(extension); }} className="inline-flex h-8 items-center gap-1.5 rounded bg-[#00ff00] px-3 text-[11px] font-bold text-black hover:bg-[#35ff35]">
            <Play size={13} /> 启动
          </button>
        )}
        {extension.lifecycle === 'update_available' && (
          <button type="button" onClick={(event) => { event.stopPropagation(); requestUpdate(extension); }} className="inline-flex h-8 items-center gap-1.5 rounded bg-amber-400 px-3 text-[11px] font-bold text-black hover:bg-amber-300">
            <RefreshCw size={13} /> 更新至 {extension.latestVersion}
          </button>
        )}
        {canManagePersonal && (
          <button type="button" title="分享授权" onClick={(event) => { event.stopPropagation(); setActionMenuKey(null); setShareExtension(extension); setShareUserQuery(''); setShareSelectedUsers([]); setShareError(''); }} className={`inline-flex h-8 w-8 items-center justify-center rounded border transition-colors ${isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-600' : 'border-zinc-700 text-zinc-400 hover:border-sky-500/50 hover:text-sky-400'}`}>
            <Share2 size={13} />
          </button>
        )}
        {(canModify || canManagePersonal) && (
          <div ref={isActionMenuOpen ? actionMenuRef : undefined} className="relative">
            <button
              type="button"
              title="更多操作"
              aria-haspopup="menu"
              aria-expanded={isActionMenuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setActionMenuKey(previous => previous === menuKey ? null : menuKey);
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded border transition-colors ${isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:bg-zinc-900 hover:text-white'}`}
            >
              <MoreHorizontal size={14} />
            </button>
            {isActionMenuOpen && (
              <div role="menu" className={`absolute right-0 top-full z-50 mt-1.5 w-28 overflow-hidden rounded border py-1 shadow-xl ${isLight ? 'border-slate-200 bg-white' : 'border-zinc-700 bg-[#121214]'}`}>
                {canModify && (
                  <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setActionMenuKey(null); openEditEditor(extension); }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors ${isLight ? 'text-slate-700 hover:bg-slate-50 hover:text-slate-950' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}>
                    <Pencil size={12} /> 编辑
                  </button>
                )}
                {canManagePersonal && (
                  <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setActionMenuKey(null); setDeleteExtension(extension); }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors ${isLight ? 'text-rose-700 hover:bg-rose-50' : 'text-red-300 hover:bg-red-950/40'}`}>
                    <Trash2 size={12} /> 删除
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const activeFilterCount = selectedDccs.length + (selectedStage ? 1 : 0) + selectedLifecycles.length;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden font-sans">
      <aside className="canvas-sidebar flex min-h-0 w-[216px] shrink-0 flex-col border-r border-[#27272a] bg-[#070708] max-lg:w-[188px] max-md:hidden">
        <div className="border-b border-[#1c1c1f] p-3">
          <div className="flex items-center gap-2">
            <Puzzle size={15} className="text-[#00ff00]" />
            <span className="truncate text-xs font-bold text-white">工具</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {[SpaceId.Personal, SpaceId.Shared].map(spaceId => {
            const visual = SPACE_META[spaceId];
            const SpaceIcon = visual.icon;
            const active = selectedSpaceId === spaceId;
            return (
              <button key={spaceId} type="button" onClick={() => setSelectedSpaceId(spaceId)} className={`canvas-tree-row mb-1 ${active ? 'is-active' : ''}`}>
                <SpaceIcon size={14} className="shrink-0" style={{ color: visual.color }} />
                <span className="min-w-0 flex-1 truncate text-left">{spaceLabel(spaceId)}</span>
                <span className={`asset-folder-count ${active ? 'is-selected' : ''}`} style={active ? { '--folder-accent': visual.color } as React.CSSProperties : undefined}>{getSpaceCount(spaceId)}</span>
              </button>
            );
          })}
          {[SpaceId.ProjectA, SpaceId.ProjectB].map(spaceId => {
            const visual = SPACE_META[spaceId];
            const SpaceIcon = visual.icon;
            const active = selectedSpaceId === spaceId;
            return (
              <button key={spaceId} type="button" onClick={() => setSelectedSpaceId(spaceId)} className={`canvas-tree-row mb-1 ${active ? 'is-active' : ''}`}>
                <SpaceIcon size={14} className="shrink-0" style={{ color: visual.color }} />
                <span className="min-w-0 flex-1 truncate text-left">{spaceLabel(spaceId)}</span>
                <span className={`asset-folder-count ${active ? 'is-selected' : ''}`} style={active ? { '--folder-accent': visual.color } as React.CSSProperties : undefined}>{getSpaceCount(spaceId)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="w-full p-5 max-md:p-3">
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className={`flex items-center gap-2 text-lg font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>
                工具拓展
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {canCreateExtension && <button type="button" onClick={openCreateEditor} className="inline-flex h-8 items-center gap-1.5 rounded border border-[#0d121e] bg-[#0d121e] px-3 text-[11px] font-bold text-[#ffffff] transition-colors hover:border-[#1e293b] hover:bg-[#1e293b]"><UploadCloud size={13} />上传工具</button>}
              <select value={selectedSpaceId} onChange={event => setSelectedSpaceId(event.target.value as SpaceId)} className={`hidden h-8 max-w-[190px] rounded border px-2 text-[11px] outline-none max-md:block ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-zinc-800 bg-[#0c0c0e] text-zinc-300'}`}>
                {[SpaceId.Personal, SpaceId.Shared, SpaceId.ProjectA, SpaceId.ProjectB].map(spaceId => <option key={spaceId} value={spaceId}>{spaceLabel(spaceId)} ({getSpaceCount(spaceId)})</option>)}
              </select>
            </div>
          </header>

          <section className={`mb-4 rounded border p-3 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div
                role="tablist"
                aria-label="美术环节"
                className={`flex h-9 max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded border px-1 py-0.5 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-zinc-800 bg-black'}`}
              >
                {STAGE_TABS.map(tab => {
                  const active = selectedStage === tab.value;
                  return (
                    <button
                      key={tab.value ?? 'all'}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedStage(tab.value)}
                      className={`h-7 shrink-0 rounded px-2.5 text-[10px] font-medium transition-colors ${active
                        ? (isLight ? 'force-text-white bg-slate-950' : 'bg-white text-black')
                        : (isLight ? 'text-slate-600 hover:bg-white hover:text-slate-950' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white')
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 xl:w-auto">
                <FilterMenu label="拓展类型" activeCount={selectedDccs.length} isLight={isLight}>
                  {DCC_OPTIONS.map(dccId => <FilterCheck key={dccId} checked={selectedDccs.includes(dccId)} label={DCC_META[dccId].label} onChange={() => toggleValue(dccId, selectedDccs, setSelectedDccs)} />)}
                </FilterMenu>
                <FilterMenu label="状态" activeCount={selectedLifecycles.length} isLight={isLight}>
                  {LIFECYCLE_OPTIONS.map(lifecycle => <FilterCheck key={lifecycle} checked={selectedLifecycles.includes(lifecycle)} label={LIFECYCLE_META[lifecycle].label} onChange={() => toggleValue(lifecycle, selectedLifecycles, setSelectedLifecycles)} />)}
                </FilterMenu>
                <label className="relative w-[320px] min-w-[240px] flex-none max-xl:flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input value={keyword} disabled={extensionsForSpace.length === 0} onChange={event => setKeyword(event.target.value)} placeholder="搜索工具名称或功能描述" className={`h-9 w-full rounded border pl-9 pr-8 text-xs outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isLight ? 'border-slate-200 bg-slate-50 text-slate-900 focus:border-emerald-500' : 'border-zinc-800 bg-black text-zinc-200 focus:border-[#00ff00]'}`} />
                  {keyword && <button type="button" title="清空搜索" onClick={() => setKeyword('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"><X size={13} /></button>}
                </label>
              </div>
            </div>
            {(activeFilterCount > 0 || keyword) && (
              <div className={`mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3 ${isLight ? 'border-slate-100' : 'border-zinc-900'}`}>
                <SlidersHorizontal size={12} className="mr-1 text-zinc-500" />
                {selectedDccs.map(value => <FilterTag key={value} label={DCC_META[value].label} onRemove={() => toggleValue(value, selectedDccs, setSelectedDccs)} />)}
                {selectedStage && <FilterTag label={STAGE_META[selectedStage]} onRemove={() => setSelectedStage(null)} />}
                {selectedLifecycles.map(value => <FilterTag key={value} label={LIFECYCLE_META[value].label} onRemove={() => toggleValue(value, selectedLifecycles, setSelectedLifecycles)} />)}
                <button type="button" onClick={clearFilters} className="ml-auto text-[10px] text-zinc-500 hover:text-red-400">清除全部</button>
              </div>
            )}
          </section>

          {extensionsForSpace.length === 0 ? (
            <EmptyState icon={selectedSpaceId === SpaceId.Shared ? Users : Puzzle} title={selectedSpaceId === SpaceId.Shared ? '暂未收到共享工具' : selectedSpaceId === SpaceId.Personal ? '个人空间暂无工具' : '当前空间暂无内容'} description={selectedSpaceId === SpaceId.Shared ? '该空间仅承载他人分享的拓展，不支持创建。' : canCreateExtension ? '点击“新建”创建当前空间的第一个工具拓展。' : '当前账号没有该项目空间的创建权限。'} isLight={isLight} />
          ) : filteredExtensions.length === 0 ? (
            <EmptyState icon={Search} title="未找到匹配拓展" description="调整关键词或移除部分筛选条件后重试。" isLight={isLight} action={<button type="button" onClick={clearFilters} className="mt-4 rounded border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-400 hover:text-white">清除筛选</button>} />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredExtensions.map(extension => {
                const lifecycle = LIFECYCLE_META[extension.lifecycle];
                const dcc = DCC_META[extension.dccId];
                return (
                  <article key={extension.id} tabIndex={0} onClick={() => setSelectedExtensionId(extension.id)} onKeyDown={event => { if (event.key === 'Enter') setSelectedExtensionId(extension.id); }} className={`group relative min-w-0 cursor-pointer overflow-visible rounded border transition-colors focus:outline-none ${isLight ? 'border-slate-200 bg-white hover:border-emerald-300 focus:border-emerald-500' : 'border-[#27272a] bg-[#0c0c0e] hover:border-zinc-600 focus:border-[#00ff00]'}`}>
                    <div className="flex min-h-[112px] items-start gap-3.5 p-3.5">
                      <div
                        className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border"
                        style={{ backgroundColor: `${dcc.color}12`, borderColor: `${dcc.color}4d` }}
                      >
                        <span className="font-display text-xl font-bold leading-none" style={{ color: dcc.color }}>{dcc.short}</span>
                        {dcc.logoSrc && (
                          <img
                            src={dcc.logoSrc}
                            alt={`${dcc.label} logo`}
                            className="absolute inset-0 h-full w-full object-contain p-3.5"
                            onError={event => { event.currentTarget.style.display = 'none'; }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <h3 className={`truncate text-[13px] font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-100'}`}>{extension.name}</h3>
                          {selectedSpaceId === SpaceId.Personal && extension.sharedWith.length > 0 && (
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8.5px] font-semibold ${isLight ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-violet-400/30 bg-violet-500/10 text-violet-300'}`}>共享 {extension.sharedWith.length}</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px]">
                          <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono ${isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-zinc-800 bg-black/30 text-zinc-300'}`}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dcc.color }} />
                            {dcc.label}
                          </span>
                          <span className={`rounded border px-1.5 py-0.5 ${isLight ? 'border-slate-200 text-slate-500' : 'border-zinc-800 text-zinc-500'}`}>{STAGE_META[extension.stage]}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 min-h-8 text-[10.5px] leading-4 text-zinc-500">{extension.desc}</p>
                      </div>
                    </div>
                    {getTask(extension.id) ? <div className="px-3.5">{renderTask(extension, true)}</div> : (
                      <div className={`flex min-h-[58px] items-center justify-between gap-3 border-t px-3.5 py-2.5 ${isLight ? 'border-slate-200 bg-slate-50/60' : 'border-zinc-800/70 bg-black/10'}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 text-[9px] font-mono">
                            <span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>{extension.version}</span>
                            {extension.lifecycle === 'update_available' && (
                              <>
                                <ChevronRight size={10} className="text-amber-500" />
                                <span className={isLight ? 'font-semibold text-amber-700' : 'font-semibold text-amber-400'}>{extension.latestVersion}</span>
                              </>
                            )}
                          </div>
                          <span className={`mt-1 flex min-w-0 items-center gap-1.5 text-[9.5px] ${lifecycle.text}`}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${lifecycle.dot}`} />
                            {lifecycle.label}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center">{renderLifecycleActions(extension)}</div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {selectedExtension && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedExtensionId(null); }}>
          <button type="button" title="上一个工具" onClick={() => navigateDetail(-1)} className="absolute left-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-black/70 text-zinc-300 hover:border-zinc-500 hover:text-white md:flex"><ChevronLeft size={20} /></button>
          <div className={`relative max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded border ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <span title={selectedExtension.id} className={`absolute right-14 top-3 z-10 flex h-8 max-w-[240px] items-center truncate rounded border px-2.5 font-mono text-[9px] ${isLight ? 'border-slate-200 bg-white/90 text-slate-500' : 'border-zinc-700 bg-black/70 text-zinc-500'}`}>
              工具 ID: {selectedExtension.id}
            </span>
            <button type="button" title="关闭" onClick={() => setSelectedExtensionId(null)} className={`absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded border transition-colors ${isLight ? 'border-slate-200 bg-white/90 text-slate-500 hover:text-slate-900' : 'border-zinc-700 bg-black/70 text-zinc-400 hover:text-white'}`}><X size={16} /></button>
            <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-5 p-5 pr-14 max-md:grid-cols-1 max-md:pr-5">
              <div className={`aspect-video overflow-hidden rounded border ${isLight ? 'border-slate-200 bg-slate-100' : 'border-zinc-800 bg-black'}`}>
                {!failedImages.has(selectedExtension.id) ? <img src={selectedExtension.previewUrl} alt="" onError={() => setFailedImages(previous => new Set(previous).add(selectedExtension.id))} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-zinc-900 text-3xl font-bold" style={{ color: DCC_META[selectedExtension.dccId].color }}>{DCC_META[selectedExtension.dccId].short}</div>}
              </div>
              <div className="min-w-0 self-center">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded border text-[11px] font-bold" style={{ color: DCC_META[selectedExtension.dccId].color, borderColor: `${DCC_META[selectedExtension.dccId].color}66` }}>{DCC_META[selectedExtension.dccId].short}</span>
                  <div>
                    <p className="text-[10px] font-mono text-zinc-500">{DCC_META[selectedExtension.dccId].label} · {STAGE_META[selectedExtension.stage]}</p>
                    <div className={`mt-0.5 flex items-center gap-1.5 text-[10px] font-mono ${LIFECYCLE_META[selectedExtension.lifecycle].text}`}><span className={`h-1.5 w-1.5 rounded-full ${LIFECYCLE_META[selectedExtension.lifecycle].dot}`} />{LIFECYCLE_META[selectedExtension.lifecycle].label}</div>
                  </div>
                </div>
                <h2 className={`mt-4 text-xl font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>{selectedExtension.name}</h2>
                {renderLifecycleActions(selectedExtension, true)}
              </div>
            </div>
            <div className={`border-t p-5 ${isLight ? 'border-slate-200 bg-slate-50/60' : 'border-zinc-800 bg-black/15'}`}>
              <h3 className={`text-xs font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>工具详情</h3>
              <p className="mt-2 max-w-3xl text-[12px] leading-6 text-zinc-500">{selectedExtension.desc}</p>
              <dl className="mt-5 grid grid-cols-3 gap-x-8 gap-y-4 text-[11px] leading-5 max-md:grid-cols-2 max-sm:grid-cols-1">
                <div><dt className="text-zinc-500">当前版本</dt><dd className={`mt-1 text-[14px] font-medium font-mono ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{selectedExtension.version}</dd></div>
                <div><dt className="text-zinc-500">最新版本</dt><dd className={`mt-1 text-[14px] font-medium font-mono ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{selectedExtension.latestVersion}</dd></div>
                <div><dt className="text-zinc-500">作者</dt><dd className={`mt-1 text-[14px] font-medium ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{selectedExtension.author}</dd></div>
                <div><dt className="text-zinc-500">更新时间</dt><dd className={`mt-1 text-[14px] font-medium font-mono ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{formatDate(selectedExtension.updatedAt)}</dd></div>
                <div><dt className="text-zinc-500">文件大小</dt><dd className={`mt-1 text-[14px] font-medium font-mono ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{selectedExtension.fileSizeMB} MB</dd></div>
                <div><dt className="text-zinc-500">加载方式</dt><dd className={`mt-1 text-[14px] font-medium ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{selectedExtension.needsRestart ? '重启加载' : '支持热加载'}</dd></div>
              </dl>
            </div>
          </div>
          <button type="button" title="下一个工具" onClick={() => navigateDetail(1)} className="absolute right-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-black/70 text-zinc-300 hover:border-zinc-500 hover:text-white md:flex"><ChevronRight size={20} /></button>
        </div>
      )}

      {editorMode && (
        <ExtensionEditor
          mode={editorMode}
          draft={editorDraft}
          onChange={draft => { setEditorDraft(draft); setEditorMessage(''); }}
          onCancel={closeEditor}
          onSubmit={submitEditor}
          isLight={isLight}
          currentVersion={editorExtensionId ? extensions.find(item => item.id === editorExtensionId)?.latestVersion : undefined}
          message={editorMessage}
        />
      )}

      {pendingVersionPublish && (
        <ConfirmDialog
          title="确认发布新版本？"
          description={`版本号将从 ${pendingVersionPublish.currentVersion} 修改为 ${pendingVersionPublish.nextVersion}。发布后，已下载旧版本的使用者会看到“有新版本”状态。`}
          confirmLabel={`发布 ${pendingVersionPublish.nextVersion}`}
          icon={RefreshCw}
          isLight={isLight}
          onCancel={() => setPendingVersionPublish(null)}
          onConfirm={confirmVersionPublish}
        />
      )}

      {cancelTaskId && <ConfirmDialog title="取消下载任务？" description="取消后会删除当前临时文件，工具状态将恢复为未下载。" confirmLabel="取消下载" danger isLight={isLight} onCancel={() => setCancelTaskId(null)} onConfirm={confirmCancelTask} />}
      {deleteExtension && <ConfirmDialog title={`删除「${deleteExtension.name}」？`} description={`此操作不可恢复。${deleteExtension.sharedWith.length > 0 ? `该工具已分享给 ${deleteExtension.sharedWith.length} 位用户，删除后他们也将无法访问。` : ''} 已下载到本地的版本不受影响。`} confirmLabel="确认删除" danger isLight={isLight} onCancel={() => setDeleteExtension(null)} onConfirm={confirmDelete} />}

      {launchPrompt && (
        <ConfirmDialog
          title={launchPrompt.type === 'missing' ? `未找到 ${DCC_META[launchPrompt.extension.dccId].label}` : launchPrompt.type === 'update_close' ? '更新前需退出依赖软件' : launchPrompt.type === 'hotload_failure' ? '热加载失败，需重启' : `重启 ${DCC_META[launchPrompt.extension.dccId].label} 后加载`}
          description={launchPrompt.type === 'missing' ? `请先安装并设置 ${DCC_META[launchPrompt.extension.dccId].label} 安装目录。` : launchPrompt.type === 'update_close' ? `${DCC_META[launchPrompt.extension.dccId].label} 正在运行。确认保存当前工作并退出后再下载新版本。` : launchPrompt.type === 'hotload_failure' ? '直接加载接口未响应，已自动降级为重启加载路径。' : '平台将关闭并重新连接软件；当前运行中的任务可能中断。'}
          confirmLabel={launchPrompt.type === 'missing' ? '设置路径' : launchPrompt.type === 'update_close' ? '退出并更新' : '立即重启'}
          icon={launchPrompt.type === 'missing' ? FolderOpen : RefreshCw}
          isLight={isLight}
          onCancel={() => setLaunchPrompt(null)}
          onConfirm={() => {
            if (launchPrompt.type === 'missing') { setLaunchPrompt(null); onOpenSettings(); }
            else if (launchPrompt.type === 'update_close') confirmUpdateClose();
            else confirmRestartLaunch();
          }}
        />
      )}

      {shareExtension && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setShareExtension(null); }}>
          <div role="dialog" aria-modal="true" aria-label="分享授权" className={`w-full max-w-lg overflow-hidden rounded-lg border shadow-2xl ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${isLight ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
              <div><h3 className={`text-base font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>分享授权</h3><p className="mt-1 text-[11px] text-zinc-500">{shareExtension.name}</p></div>
              <button type="button" title="关闭" onClick={() => setShareExtension(null)} className={isLight ? 'text-slate-400 hover:text-slate-700' : 'text-zinc-500 hover:text-white'}><X size={16} /></button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
              <PlatformUserPicker
                query={shareUserQuery}
                selectedUsers={shareSelectedUsers}
                existingEmails={shareExistingEmails}
                onQueryChange={value => { setShareUserQuery(value); setShareError(''); }}
                onSelect={user => {
                  if (shareSelectedUsers.length >= PLATFORM_USER_PICKER_MAX_USERS) {
                    setShareError(`单次最多同时添加 ${PLATFORM_USER_PICKER_MAX_USERS} 人，当前已达上限。`);
                    return;
                  }
                  setShareSelectedUsers(previous => previous.some(item => item.id === user.id) ? previous : [...previous, user]);
                  setShareUserQuery('');
                  setShareError('');
                }}
                onRemove={user => { setShareSelectedUsers(previous => previous.filter(item => item.id !== user.id)); setShareError(''); }}
                isLight={isLight}
              />
              <div>
                <label className={`mb-1.5 block text-[11px] ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>授权类型</label>
                <div className={`rounded-lg border px-3 py-2.5 text-xs ${isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-[#27272a] bg-[#121214] text-zinc-200'}`}>使用者</div>
              </div>
              {!isOnline && <p className="mt-2 flex items-center gap-1 text-[10px] text-red-400"><WifiOff size={11} /> 网络未连接，不可分享</p>}
              {shareError && <div className={`rounded-lg border px-3 py-2 text-[11px] ${isLight ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-500/50 bg-red-950/40 text-red-300'}`}>{shareError}</div>}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>已拥有权限</label>
                  <button type="button" onClick={() => copyToolLink(shareExtension)} className={`flex items-center gap-1 text-[10px] ${isLight ? 'text-sky-600 hover:text-sky-700' : 'text-sky-400 hover:text-sky-300'}`}><ExternalLink size={11} /> 复制工具链接</button>
                </div>
                <div className={`space-y-1 rounded-lg border p-1.5 ${isLight ? 'border-slate-200 bg-slate-50/70' : 'border-[#1c1c1f] bg-[#121214]/40'}`}>
                  {shareExtension.sharedWith.length === 0 ? <p className={`px-2 py-3 text-center text-[11px] ${isLight ? 'text-slate-400' : 'text-zinc-600'}`}>暂无其他权限用户</p> : shareExtension.sharedWith.map(grant => (
                    <div key={grant.email} className="flex items-center gap-2 rounded px-2 py-1.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isLight ? 'bg-violet-50 text-violet-700' : 'bg-violet-500/20 text-violet-200'}`}>{grant.name.slice(0, 2)}</span>
                      <span className="min-w-0 flex-1"><span className={`block truncate text-xs ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{grant.name}</span><span className={`block truncate font-mono text-[10px] ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>{grant.email}</span></span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] ${isLight ? 'border-slate-200 bg-white text-slate-500' : 'border-zinc-700 bg-black text-zinc-400'}`}>使用者</span>
                      <button type="button" onClick={() => removeShare(shareExtension, grant.email)} className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${isLight ? 'border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600' : 'border-zinc-800 text-zinc-400 hover:border-red-500/60 hover:text-red-400'}`}>移除</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={`flex items-center justify-end gap-2 border-t px-5 py-4 ${isLight ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
              <button type="button" onClick={() => setShareExtension(null)} className={`rounded-lg border px-4 py-2 text-xs transition-colors ${isLight ? 'border-slate-200 bg-white text-slate-600 hover:text-slate-900' : 'border-zinc-800 bg-black text-zinc-300 hover:border-zinc-700 hover:text-white'}`}>取消</button>
              <button type="button" disabled={!isOnline} onClick={submitShare} className="rounded-lg bg-[#00ff00] px-5 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#00dd00] disabled:cursor-not-allowed disabled:opacity-40">确认{shareSelectedUsers.length > 0 ? `（${shareSelectedUsers.length}）` : ''}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterMenu({ label, activeCount, isLight, children }: { label: string; activeCount: number; isLight: boolean; children: React.ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOtherMenus = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== label) {
        detailsRef.current?.removeAttribute('open');
      }
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.removeAttribute('open');
      }
    };
    window.addEventListener('pixgo-extension-filter-open', closeOtherMenus);
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => {
      window.removeEventListener('pixgo-extension-filter-open', closeOtherMenus);
      document.removeEventListener('mousedown', closeOnOutsideClick);
    };
  }, [label]);

  return (
    <details
      ref={detailsRef}
      className="group relative"
      onToggle={event => {
        if (event.currentTarget.open) {
          window.dispatchEvent(new CustomEvent('pixgo-extension-filter-open', { detail: label }));
        }
      }}
    >
      <summary className={`flex h-9 min-w-[116px] cursor-pointer list-none items-center justify-between gap-2 rounded border px-3 text-[11px] [&::-webkit-details-marker]:hidden ${activeCount > 0 ? (isLight ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-[#00ff00]/60 bg-[#00ff00]/5 text-[#00ff00]') : (isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-zinc-800 bg-black text-zinc-400')}`}>
        <span>{label}{activeCount > 0 ? ` (${activeCount})` : ''}</span><ChevronDown size={12} className="transition-transform group-open:rotate-180" />
      </summary>
      <div
        onClick={event => {
          if ((event.target as HTMLElement).closest('button')) {
            detailsRef.current?.removeAttribute('open');
          }
        }}
        className={`absolute right-0 top-full z-40 mt-1 w-44 rounded border p-1.5 shadow-2xl ${isLight ? 'border-slate-200 bg-white' : 'border-zinc-800 bg-[#121214]'}`}
      >
        {children}
      </div>
    </details>
  );
}

function FilterCheck({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return <button type="button" onClick={onChange} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-zinc-400 hover:bg-zinc-500/10 hover:text-zinc-200"><span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${checked ? 'border-[#00ff00] bg-[#00ff00] text-black' : 'border-zinc-700'}`}>{checked && <Check size={10} />}</span>{label}</button>;
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <button type="button" onClick={onRemove} className="inline-flex h-6 items-center gap-1 rounded border border-sky-500/30 bg-sky-500/5 px-2 text-[9px] text-sky-400 hover:border-red-500/40 hover:text-red-400">{label}<X size={9} /></button>;
}

function EmptyState({ icon: Icon, title, description, isLight, action }: { icon: typeof Puzzle; title: string; description: string; isLight: boolean; action?: React.ReactNode }) {
  return <div className={`flex min-h-[340px] flex-col items-center justify-center rounded border border-dashed p-8 text-center ${isLight ? 'border-slate-300 bg-white' : 'border-zinc-800 bg-[#0c0c0e]/30'}`}><div className={`flex h-12 w-12 items-center justify-center rounded border ${isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}><Icon size={22} /></div><h3 className={`mt-4 text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>{title}</h3><p className="mt-2 max-w-sm text-[11px] leading-5 text-zinc-500">{description}</p>{action}</div>;
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm, isLight, danger = false, icon: Icon = AlertTriangle }: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void; isLight: boolean; danger?: boolean; icon?: typeof AlertTriangle }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded border p-5 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
        <div className="flex items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${danger ? (isLight ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-red-500/30 bg-red-500/10 text-red-400') : (isLight ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-amber-500/30 bg-amber-500/10 text-amber-400')}`}><Icon size={17} /></div><div><h3 className={`text-sm font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>{title}</h3><p className={`mt-2 text-[11px] leading-5 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{description}</p></div></div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={`h-8 rounded border px-3 text-[11px] transition-colors ${isLight ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'}`}>取消</button>
          <button type="button" onClick={onConfirm} className={`h-8 rounded border px-4 text-[11px] font-semibold transition-colors ${danger ? (isLight ? 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800' : 'border-red-500/40 bg-red-950/40 text-red-300 hover:border-red-400/60 hover:bg-red-950/60 hover:text-red-200') : (isLight ? 'force-text-white border-slate-950 bg-slate-950 text-white hover:bg-slate-800' : 'border-[#00ff00] bg-[#00ff00] text-black hover:bg-[#35ff35]')}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

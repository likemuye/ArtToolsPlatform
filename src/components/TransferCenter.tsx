import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  FolderOpen,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  WifiOff,
  X
} from 'lucide-react';
import { PROJECT_SPACES } from '../data';
import { AssetCategory, SpaceId, TransferBatch, TransferStatus, TransferTask } from '../types';

type TransferSection = 'active' | 'failed' | 'completed';

interface TransferFocusRequest {
  direction: 'upload' | 'download';
  section: TransferSection;
  nonce: number;
}

interface TransferCenterProps {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  tasks: TransferTask[];
  batches: TransferBatch[];
  focusRequest?: TransferFocusRequest | null;
  onCancelTask: (taskId: string) => void;
  onPauseTask: (taskId: string) => void;
  onResumeTask: (taskId: string) => void;
  onPauseAll: (direction?: 'upload' | 'download') => void;
  onResumeAll: (direction?: 'upload' | 'download') => void;
  onPauseBatch: (batchId: string) => void;
  onResumeBatch: (batchId: string) => void;
  onRetryTask: (taskId: string) => void;
  onRetryAllFailed: (direction: 'upload' | 'download') => void;
  onCancelBatch: (batchId: string) => void;
  onClearBatch: (batchId: string) => void;
  onClearCompleted: (direction: 'upload' | 'download') => void;
}

const ACTIVE_STATUSES: TransferStatus[] = ['queued', 'transferring', 'packing', 'inspecting', 'tagging', 'submitting', 'paused', 'waiting_network'];
const TERMINAL_STATUSES: TransferStatus[] = ['completed', 'failed', 'cancelled'];

const SECTION_META: Array<{ id: TransferSection; label: string }> = [
  { id: 'active', label: '进行中' },
  { id: 'failed', label: '失败' },
  { id: 'completed', label: '已完成' }
];

const FAILURE_LABELS = {
  upload: '上传失败',
  inspection: '质检失败',
  tagging: '打标失败',
  ingestion: '入库失败',
  download: '下载失败',
  source: '源文件不存在',
  storage: '磁盘空间不足'
} as const;

const formatSize = (sizeMB: number) => sizeMB >= 1024
  ? `${(sizeMB / 1024).toFixed(2)} GB`
  : `${Math.max(0.01, sizeMB).toFixed(sizeMB >= 10 ? 0 : 1)} MB`;

const formatTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).format(new Date(value));

const spaceLabel = (spaceId?: SpaceId) => {
  if (spaceId === SpaceId.Personal) return '个人空间';
  if (spaceId === SpaceId.Shared) return '与我共享';
  return PROJECT_SPACES.find(space => space.id === spaceId)?.name ?? '项目空间';
};

const CATEGORY_LABELS: Partial<Record<AssetCategory, string>> = {
  [AssetCategory.CharConcept]: '角色原画',
  [AssetCategory.SceneConcept]: '场景原画',
  [AssetCategory.CharModel]: '角色模型',
  [AssetCategory.SceneModel]: '场景模型',
  [AssetCategory.Animation]: '动画序列',
  [AssetCategory.Video]: '粒子视频',
  [AssetCategory.GUI]: 'GUI 切图'
};

const taskPipelineProgress = (task: TransferTask) => {
  if (task.status === 'completed') return 100;
  if (task.status === 'failed' || task.status === 'cancelled') return task.progress;
  if (task.direction === 'download') return task.progress;
  if (task.status === 'queued' || task.status === 'paused' || task.status === 'waiting_network') {
    const resume = task.resumeStatus;
    if (resume === 'inspecting') return 55;
    if (resume === 'tagging') return 70;
    if (resume === 'submitting') return 85;
    return task.progress * 0.55;
  }
  if (task.status === 'transferring') return task.progress * 0.55;
  if (task.status === 'inspecting') return 55 + task.progress * 0.15;
  if (task.status === 'tagging') return 70 + task.progress * 0.15;
  if (task.status === 'submitting') return 85 + task.progress * 0.15;
  return task.progress;
};

const getStatusMeta = (task: TransferTask): { label: string; tone: string } => {
  // Internal queued tasks are shown as waiting within their transfer direction;
  // the UI intentionally does not expose a standalone queue state.
  if (task.status === 'queued') return { label: task.direction === 'upload' ? '上传中' : '下载中', tone: 'active' };
  if (task.status === 'packing') return { label: task.direction === 'upload' ? '上传中' : '下载中', tone: 'active' };
  if (task.status === 'transferring') return { label: task.direction === 'upload' ? '上传中' : '下载中', tone: 'active' };
  if (task.status === 'inspecting') return { label: '质检中', tone: 'inspection' };
  if (task.status === 'tagging') return { label: '内容理解中', tone: 'tagging' };
  if (task.status === 'submitting') return { label: '提交中', tone: 'active' };
  if (task.status === 'waiting_network') return { label: '已暂停（网络异常）', tone: 'warning' };
  if (task.status === 'paused') {
    if (task.pauseReason === 'manual') return { label: '已暂停', tone: 'warning' };
    const reason = task.pauseReason === 'token' ? '登录过期' : task.pauseReason === 'logout' ? '已登出' : task.pauseReason === 'restart' ? '客户端重启' : '系统暂停';
    return { label: `已暂停（${reason}）`, tone: 'warning' };
  }
  if (task.status === 'completed') return { label: task.direction === 'upload' ? '已提交' : '已完成', tone: 'success' };
  if (task.status === 'failed') return { label: task.failureStage ? FAILURE_LABELS[task.failureStage] : '失败', tone: 'danger' };
  return { label: '已取消', tone: 'neutral' };
};

const matchesSection = (task: TransferTask, section: TransferSection) => {
  if (section === 'active') return ACTIVE_STATUSES.includes(task.status);
  if (section === 'failed') return task.status === 'failed';
  return task.status === 'completed' || task.status === 'cancelled';
};

function StatusIcon({ task }: { task: TransferTask }) {
  if (task.status === 'completed') return <Check size={12} />;
  if (task.status === 'failed') return <AlertCircle size={12} />;
  if (task.status === 'waiting_network') return <WifiOff size={12} />;
  if (task.status === 'paused') return <Clock3 size={12} />;
  if (task.status === 'queued' || task.status === 'packing') return <LoaderCircle size={12} className="animate-spin" />;
  if (['transferring', 'inspecting', 'tagging', 'submitting'].includes(task.status)) return <LoaderCircle size={12} className="animate-spin" />;
  return <Clock3 size={12} />;
}

function TaskActions({
  task,
  onPause,
  onResume,
  onCancel,
  onRetry
}: {
  task: TransferTask;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (task.status === 'failed') {
    return task.retryable !== false
      ? <button type="button" title="重试" className="transfer-icon-button" onClick={onRetry}><RefreshCw size={14} /></button>
      : null;
  }
  if (task.status === 'paused' && task.direction === 'download' && task.pauseReason === 'manual') {
    return <>
      <button type="button" title="继续下载" className="transfer-icon-button" onClick={onResume}><Play size={14} /></button>
      <button type="button" title="取消任务" className="transfer-icon-button is-danger" onClick={onCancel}><X size={14} /></button>
    </>;
  }
  if (ACTIVE_STATUSES.includes(task.status)) {
    // Uploads cannot be cancelled once started. Cancellation is available
    // only for download tasks; the upload draft handles pre-start removal.
    if (task.direction !== 'download') return null;
    return <>
      {(task.status === 'queued' || task.status === 'transferring') && (
        <button type="button" title="暂停下载" className="transfer-icon-button" onClick={onPause}><Pause size={14} /></button>
      )}
      <button type="button" title="取消任务" className="transfer-icon-button is-danger" onClick={onCancel}><X size={14} /></button>
    </>;
  }
  return null;
}

function TransferTaskRow({
  task,
  showUploadTarget = false,
  showDownloadSource = true,
  compact = false,
  onPause,
  onResume,
  onCancel,
  onRetry
}: {
  task: TransferTask;
  showUploadTarget?: boolean;
  showDownloadSource?: boolean;
  compact?: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const meta = getStatusMeta(task);
  const pipelineProgress = Math.round(taskPipelineProgress(task));
  const remainingSeconds = task.status === 'transferring' && task.speedMBps > 0
    ? Math.max(1, Math.ceil((((100 - task.progress) / 100) * task.sizeMB) / task.speedMBps))
    : null;
  const confirmCancel = () => {
    if (window.confirm(`确认取消「${task.name}」？\n取消后会删除尚未入库的暂存数据。`)) onCancel();
  };
  return (
    <div className={`transfer-task-row ${compact ? 'is-compact' : ''}`}>
      <div className="transfer-file-icon">
        {task.previewUrl ? <img src={task.previewUrl} alt="" /> : task.direction === 'upload' ? <Upload size={17} /> : <Download size={17} />}
      </div>
      <div className="transfer-task-main">
        <div className="transfer-task-title-row">
          <span className="transfer-task-name" title={task.sourceFileName ?? task.name}>{task.name}</span>
          <span className={`transfer-status is-${meta.tone}`}><StatusIcon task={task} />{meta.label}</span>
        </div>
        {task.direction === 'download' && showDownloadSource && (
          <div className="transfer-task-path" title={spaceLabel(task.sourceSpaceId ?? task.targetSpaceId)}>
            来源空间：{spaceLabel(task.sourceSpaceId ?? task.targetSpaceId)}
          </div>
        )}
        {task.direction === 'upload' && showUploadTarget && (
          <div className="transfer-task-path" title={`${spaceLabel(task.targetSpaceId)} / ${task.targetFolderLabel ?? '置顶目录'}`}>
            目标空间：{spaceLabel(task.targetSpaceId)} · 目标目录：{task.targetFolderLabel ?? '置顶目录'}
          </div>
        )}
        <div className="transfer-task-meta">
          <span>{task.format || 'FILE'}</span>
          <span>{formatSize(task.sizeMB)}</span>
          {task.status === 'transferring' && <span>{task.speedMBps.toFixed(1)} MB/s</span>}
          {remainingSeconds !== null && <span>剩余约 {remainingSeconds}s</span>}
          {task.retryCount > 0 && <span>已重试 {task.retryCount} 次</span>}
        </div>
        {task.direction === 'upload' && (
          <div className="transfer-task-tags" title="内容理解产出的类型与标签">
            {task.category && CATEGORY_LABELS[task.category] && <span className="transfer-task-chip is-type">类型：{CATEGORY_LABELS[task.category]}</span>}
            {task.uploadType && <span className="transfer-task-chip">{task.uploadType === 'video' ? '视频' : task.uploadType === 'gif' ? '动图' : '图片'}</span>}
            {task.tags.map(tag => <span key={`${task.id}-${tag}`} className="transfer-task-chip">#{tag}</span>)}
          </div>
        )}
        {!TERMINAL_STATUSES.includes(task.status) && task.status !== 'packing' && (
          <div className="transfer-progress" aria-label={`整体进度 ${pipelineProgress}%`}><span style={{ width: `${pipelineProgress}%` }} /></div>
        )}
        {task.error && <p className="transfer-error">{task.error}</p>}
      </div>
      <div className="transfer-task-actions">
        <TaskActions
          task={task}
          onPause={onPause}
          onResume={onResume}
          onCancel={confirmCancel}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}

export default function TransferCenter(props: TransferCenterProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'download'>('upload');
  const [activeSection, setActiveSection] = useState<TransferSection>('active');
  const [collapsedBatches, setCollapsedBatches] = useState<Set<string>>(new Set());
  const wasOpenRef = useRef(false);
  const drawerRef = useRef<HTMLElement>(null);

  const tabTasks = useMemo(() => props.tasks.filter(task => task.direction === activeTab), [activeTab, props.tasks]);
  const visibleTasks = useMemo(() => tabTasks.filter(task => matchesSection(task, activeSection)), [activeSection, tabTasks]);
  const uploadBatches = useMemo(() => props.batches
    .map(batch => {
      const allTasks = props.tasks.filter(task => task.batchId === batch.id);
      return { batch, allTasks, visibleTasks: allTasks.filter(task => matchesSection(task, activeSection)) };
    })
    .filter(entry => entry.batch.direction !== 'download' && entry.visibleTasks.length > 0), [activeSection, props.batches, props.tasks]);
  const downloadBatches = useMemo(() => props.batches
    .filter(batch => batch.direction === 'download' && batch.downloadMode === 'files')
    .map(batch => {
      const allTasks = props.tasks.filter(task => task.batchId === batch.id && task.direction === 'download');
      return { batch, allTasks, visibleTasks: allTasks.filter(task => matchesSection(task, activeSection)) };
    })
    .filter(entry => entry.visibleTasks.length > 0), [activeSection, props.batches, props.tasks]);

  const counts = useMemo(() => ({
    upload: props.tasks.filter(task => task.direction === 'upload' && (ACTIVE_STATUSES.includes(task.status) || task.status === 'failed')).length,
    download: props.tasks.filter(task => task.direction === 'download' && (ACTIVE_STATUSES.includes(task.status) || task.status === 'failed')).length
  }), [props.tasks]);

  const sectionCounts = useMemo(() => ({
    active: tabTasks.filter(task => ACTIVE_STATUSES.includes(task.status)).length,
    failed: tabTasks.filter(task => task.status === 'failed').length,
    completed: tabTasks.filter(task => ['completed', 'cancelled'].includes(task.status)).length
  }), [tabTasks]);

  const preferredSection = (direction: 'upload' | 'download'): TransferSection => {
    const directionTasks = props.tasks.filter(task => task.direction === direction);
    if (directionTasks.some(task => ACTIVE_STATUSES.includes(task.status))) return 'active';
    if (directionTasks.some(task => task.status === 'failed')) return 'failed';
    return 'completed';
  };

  useEffect(() => {
    if (props.open && !wasOpenRef.current) {
      const latestActiveTask = [...props.tasks]
        .filter(task => ACTIVE_STATUSES.includes(task.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      if (latestActiveTask) setActiveTab(latestActiveTask.direction);
      const direction = latestActiveTask?.direction ?? activeTab;
      setActiveSection(preferredSection(direction));
    }
    wasOpenRef.current = props.open;
  }, [activeTab, props.open, props.tasks]);

  useEffect(() => {
    if (!props.focusRequest) return;
    setActiveTab(props.focusRequest.direction);
    setActiveSection(props.focusRequest.section);
  }, [props.focusRequest]);

  useEffect(() => {
    if (!props.open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || drawerRef.current?.contains(target) || target.closest('.app-sidebar-transfer')) return;
      props.onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [props.onClose, props.open]);

  const toggleBatch = (batchId: string) => setCollapsedBatches(previous => {
    const next = new Set(previous);
    if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
    return next;
  });

  return (
    <aside ref={drawerRef} className={`transfer-center ${props.open ? 'is-open' : ''} ${props.theme === 'light' ? 'is-light' : 'is-dark'}`} aria-hidden={!props.open}>
      <header className="transfer-header">
        <h2>传输中心</h2>
        <button type="button" className="transfer-close" title="关闭传输中心" onClick={props.onClose}><X size={18} /></button>
      </header>

      <div className="transfer-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === 'upload'} className={activeTab === 'upload' ? 'is-active' : ''} onClick={() => { setActiveTab('upload'); setActiveSection(preferredSection('upload')); }}><Upload size={15} />上传{counts.upload > 0 && <span>{counts.upload}</span>}</button>
        <button type="button" role="tab" aria-selected={activeTab === 'download'} className={activeTab === 'download' ? 'is-active' : ''} onClick={() => { setActiveTab('download'); setActiveSection(preferredSection('download')); }}><Download size={15} />下载{counts.download > 0 && <span>{counts.download}</span>}</button>
      </div>

      <div className="transfer-section-tabs" role="tablist" aria-label={`${activeTab === 'upload' ? '上传' : '下载'}任务状态`}>
        {SECTION_META.map(section => (
          <button
            type="button"
            key={section.id}
            role="tab"
            aria-selected={activeSection === section.id}
            className={activeSection === section.id ? 'is-active' : ''}
            onClick={() => setActiveSection(section.id)}
          >
            {(activeTab === 'upload' && section.id === 'active' ? '上传中' : section.label)}<span>{sectionCounts[section.id]}</span>
          </button>
        ))}
      </div>

      <div className="transfer-toolbar">
        <div>
          {activeTab === 'download' && sectionCounts.active > 0 && <button type="button" onClick={() => props.onPauseAll('download')}>全部暂停</button>}
          {activeTab === 'download' && tabTasks.some(task => task.status === 'paused' && task.pauseReason === 'manual') && <button type="button" onClick={() => props.onResumeAll('download')}>全部继续</button>}
          {sectionCounts.failed > 0 && <button type="button" onClick={() => props.onRetryAllFailed(activeTab)}>重试全部失败</button>}
          {activeSection === 'completed' && sectionCounts.completed > 0 && <button type="button" onClick={() => props.onClearCompleted(activeTab)}>清空已完成</button>}
        </div>
      </div>

      <div className="transfer-list">
        {activeTab === 'upload' ? uploadBatches.map(({ batch, allTasks, visibleTasks: batchVisibleTasks }) => {
          // A single-file upload is represented as a flat task row. Only
          // multi-file submissions receive a batch card.
          if (allTasks.length === 1) {
            const task = batchVisibleTasks[0];
            if (!task) return null;
            return <TransferTaskRow
              key={task.id}
              task={task}
              showUploadTarget
              onPause={() => props.onPauseTask(task.id)}
              onResume={() => props.onResumeTask(task.id)}
              onCancel={() => props.onCancelTask(task.id)}
              onRetry={() => props.onRetryTask(task.id)}
            />;
          }
          const collapsed = collapsedBatches.has(batch.id);
          const completed = allTasks.filter(task => task.status === 'completed').length;
          const failed = allTasks.filter(task => task.status === 'failed').length;
          const active = allTasks.filter(task => ACTIVE_STATUSES.includes(task.status)).length;
          const canClearBatch = allTasks.length > 0 && allTasks.every(task => TERMINAL_STATUSES.includes(task.status));
          const batchProgress = allTasks.length === 0 ? 0 : Math.round(allTasks.reduce((sum, task) => sum + taskPipelineProgress(task), 0) / allTasks.length);
          return (
            <section key={batch.id} className="transfer-batch">
              <div className="transfer-batch-header">
                <button type="button" className="transfer-batch-toggle" onClick={() => toggleBatch(batch.id)}>{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
                <div className="transfer-batch-copy">
                  <div className="transfer-batch-title-line">
                    <strong>{batch.name}</strong>
                    <time>{formatTime(batch.createdAt)}</time>
                  </div>
                  <div className="transfer-batch-metrics">
                    <span>文件数 {allTasks.length}</span>
                    <span className="is-success">已提交 {completed}</span>
                    {failed > 0 && <span className="is-danger">失败 {failed}</span>}
                    {active > 0 && <span className="is-active">进行中 {active}</span>}
                  </div>
                  <div className="transfer-batch-progress"><span style={{ width: `${batchProgress}%` }} /></div>
                </div>
                <div className="transfer-batch-actions">
                  {canClearBatch && <button type="button" title="清除该批次记录" className="transfer-icon-button" onClick={() => props.onClearBatch(batch.id)}><Trash2 size={14} /></button>}
                </div>
              </div>
              <div className="transfer-target-static">
                <FolderOpen size={13} />
                <span>目标空间：{spaceLabel(batch.targetSpaceId)} · 目标目录：{batch.targetFolderLabel}</span>
              </div>
              {!collapsed && <div className="transfer-batch-tasks">{batchVisibleTasks.map(task => <TransferTaskRow
                  key={task.id}
                  task={task}
                  compact
                  onPause={() => props.onPauseTask(task.id)}
                onResume={() => props.onResumeTask(task.id)}
                onCancel={() => props.onCancelTask(task.id)}
                onRetry={() => props.onRetryTask(task.id)}
              />)}</div>}
            </section>
          );
        }) : (
          <>
            {downloadBatches.map(({ batch, allTasks, visibleTasks: batchVisibleTasks }) => {
              const collapsed = collapsedBatches.has(batch.id);
              const completed = allTasks.filter(task => task.status === 'completed').length;
              const failed = allTasks.filter(task => task.status === 'failed').length;
              const active = allTasks.filter(task => ACTIVE_STATUSES.includes(task.status)).length;
              const canPause = allTasks.some(task => task.status === 'queued' || task.status === 'transferring');
              const canResume = allTasks.some(task => task.status === 'paused' && task.pauseReason === 'manual');
              const canCancel = allTasks.some(task => !['completed', 'cancelled'].includes(task.status));
              const batchProgress = allTasks.length === 0 ? 0 : Math.round(allTasks.reduce((sum, task) => sum + taskPipelineProgress(task), 0) / allTasks.length);
              return (
                <section key={batch.id} className="transfer-batch">
                  <div className="transfer-batch-header">
                    <button type="button" className="transfer-batch-toggle" onClick={() => toggleBatch(batch.id)}>{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
                    <div className="transfer-batch-copy">
                      <div className="transfer-batch-title-line">
                        <strong>{batch.name}</strong>
                        <time>{formatTime(batch.createdAt)}</time>
                      </div>
                      <div className="transfer-batch-metrics">
                        <span>文件数 {allTasks.length}</span>
                        <span className="is-success">已下载 {completed}</span>
                        {failed > 0 && <span className="is-danger">失败 {failed}</span>}
                        {active > 0 && <span className="is-active">下载中 {active}</span>}
                      </div>
                      <div className="transfer-batch-progress"><span style={{ width: `${batchProgress}%` }} /></div>
                    </div>
                    <div className="transfer-batch-actions">
                      {canPause && <button type="button" title="全部暂停" className="transfer-icon-button" onClick={() => props.onPauseBatch(batch.id)}><Pause size={14} /></button>}
                      {canResume && <button type="button" title="全部继续" className="transfer-icon-button" onClick={() => props.onResumeBatch(batch.id)}><Play size={14} /></button>}
                      {failed > 0 && <button type="button" title="重试全部失败" className="transfer-icon-button" onClick={() => allTasks.filter(task => task.status === 'failed' && task.retryable !== false).forEach(task => props.onRetryTask(task.id))}><RefreshCw size={14} /></button>}
                      {canCancel && <button type="button" title="全部取消" className="transfer-icon-button is-danger" onClick={() => {
                        if (window.confirm(`确认取消「${batch.name}」中尚未完成的下载？`)) props.onCancelBatch(batch.id);
                      }}><X size={14} /></button>}
                    </div>
                  </div>
                  <div className="transfer-target-static"><FolderOpen size={13} /><span>来源空间：{spaceLabel(batch.targetSpaceId)} · 保存位置：{batch.targetFolderLabel}</span></div>
                  {!collapsed && <div className="transfer-batch-tasks">{batchVisibleTasks.map(task => <TransferTaskRow
                    key={task.id}
                    task={task}
                    compact
                    showDownloadSource={false}
                    onPause={() => props.onPauseTask(task.id)}
                    onResume={() => props.onResumeTask(task.id)}
                    onCancel={() => props.onCancelTask(task.id)}
                    onRetry={() => props.onRetryTask(task.id)}
                  />)}</div>}
                </section>
              );
            })}
            {visibleTasks
              .filter(task => !task.batchId || !downloadBatches.some(entry => entry.batch.id === task.batchId))
              .map(task => <TransferTaskRow
                key={task.id}
                task={task}
                onPause={() => props.onPauseTask(task.id)}
                onResume={() => props.onResumeTask(task.id)}
                onCancel={() => props.onCancelTask(task.id)}
                onRetry={() => props.onRetryTask(task.id)}
              />)}
          </>
        )}

        {visibleTasks.length === 0 && (
          <div className="transfer-empty">
            <div>{activeSection === 'failed' ? <AlertCircle size={23} /> : activeTab === 'upload' ? <Upload size={23} /> : <Download size={23} />}</div>
            <strong>{activeSection === 'failed' ? '暂无失败任务' : activeSection === 'active' ? (activeTab === 'upload' ? '暂无上传中任务' : '暂无进行中任务') : '暂无已完成任务'}</strong>
            <span>{activeTab === 'upload' ? '从个人空间选择文件或文件夹开始上传' : '从素材库或工具库发起下载'}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

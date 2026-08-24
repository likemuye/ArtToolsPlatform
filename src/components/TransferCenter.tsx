import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  FolderInput,
  FolderOpen,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Send,
  Tag,
  Trash2,
  Upload,
  WifiOff,
  X
} from 'lucide-react';
import { TransferBatch, TransferStatus, TransferTask } from '../types';

interface TransferCenterProps {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  tasks: TransferTask[];
  batches: TransferBatch[];
  isOnline: boolean;
  onPauseTask: (taskId: string) => void;
  onResumeTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onPauseBatch: (batchId: string) => void;
  onResumeBatch: (batchId: string) => void;
  onCancelBatch: (batchId: string) => void;
  onDiscardBatch: (batchId: string) => void;
  onSubmitBatch: (batchId: string) => void;
  onUpdateTaskTags: (taskId: string, tags: string[]) => void;
  onChangeBatchTarget: (batchId: string, target: string) => void;
  onClearCompleted: (direction: 'upload' | 'download') => void;
}

const STATUS_META: Record<TransferStatus, { label: string; tone: string }> = {
  queued: { label: '排队中', tone: 'neutral' },
  transferring: { label: '传输中', tone: 'active' },
  inspecting: { label: '质量检查', tone: 'inspection' },
  tagging: { label: 'AI 打标', tone: 'tagging' },
  pending_submit: { label: '待提交', tone: 'pending' },
  submitting: { label: '提交中', tone: 'active' },
  paused: { label: '已暂停', tone: 'warning' },
  waiting_network: { label: '等待网络', tone: 'warning' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'neutral' }
};

const formatSize = (sizeMB: number) => sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(2)} GB` : `${Math.max(0.01, sizeMB).toFixed(sizeMB >= 10 ? 0 : 1)} MB`;
const formatTime = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

function StatusIcon({ status }: { status: TransferStatus }) {
  if (status === 'completed') return <Check size={12} />;
  if (status === 'failed') return <AlertCircle size={12} />;
  if (status === 'waiting_network') return <WifiOff size={12} />;
  if (status === 'paused') return <Pause size={12} />;
  if (['transferring', 'inspecting', 'tagging', 'submitting'].includes(status)) return <LoaderCircle size={12} className="animate-spin" />;
  return <Clock3 size={12} />;
}

function TaskActions({
  task,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove
}: {
  task: TransferTask;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  if (task.status === 'failed') {
    return <>
      <button type="button" title="重试" className="transfer-icon-button" onClick={onRetry}><RefreshCw size={14} /></button>
      <button type="button" title="移除" className="transfer-icon-button is-danger" onClick={onRemove}><Trash2 size={14} /></button>
    </>;
  }
  if (task.status === 'paused' || task.status === 'waiting_network') {
    return <>
      <button type="button" title="继续" className="transfer-icon-button" disabled={task.status === 'waiting_network'} onClick={onResume}><Play size={14} /></button>
      <button type="button" title="取消" className="transfer-icon-button is-danger" onClick={onCancel}><X size={14} /></button>
    </>;
  }
  if (task.status === 'completed' || task.status === 'cancelled') {
    return <>
      {task.direction === 'download' && task.status === 'completed' && <button type="button" title="打开本地目录" className="transfer-icon-button" onClick={() => window.alert(`已定位到本地缓存目录\nD:\\PixGo\\downloads\\${task.resourceId}`)}><FolderOpen size={14} /></button>}
      <button type="button" title="移除记录" className="transfer-icon-button" onClick={onRemove}><Trash2 size={14} /></button>
    </>;
  }
  if (task.status === 'pending_submit') return null;
  return <>
    <button type="button" title="暂停" className="transfer-icon-button" onClick={onPause}><Pause size={14} /></button>
    <button type="button" title="取消" className="transfer-icon-button is-danger" onClick={onCancel}><X size={14} /></button>
  </>;
}

function TransferTaskRow({
  task,
  compact = false,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onUpdateTags
}: {
  task: TransferTask;
  compact?: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onUpdateTags: (tags: string[]) => void;
}) {
  const meta = STATUS_META[task.status];
  const editTags = () => {
    const value = window.prompt('编辑 AI 标签（使用逗号分隔）', task.tags.join(', '));
    if (value === null) return;
    onUpdateTags([...new Set(value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))]);
  };
  return (
    <div className={`transfer-task-row ${compact ? 'is-compact' : ''}`}>
      <div className="transfer-file-icon">
        {task.previewUrl ? <img src={task.previewUrl} alt="" /> : task.direction === 'upload' ? <Upload size={17} /> : <Download size={17} />}
      </div>
      <div className="transfer-task-main">
        <div className="transfer-task-title-row">
          <span className="transfer-task-name" title={task.sourceFileName ?? task.name}>{task.name}</span>
          <span className={`transfer-status is-${meta.tone}`}><StatusIcon status={task.status} />{meta.label}</span>
        </div>
        <div className="transfer-task-meta">
          <span>{task.format || 'FILE'}</span><span>{formatSize(task.sizeMB)}</span>
          {task.status === 'transferring' && <span>{task.speedMBps.toFixed(1)} MB/s</span>}
          {task.retryCount > 0 && <span>已重试 {task.retryCount}/3</span>}
        </div>
        {!['completed', 'cancelled', 'pending_submit', 'failed'].includes(task.status) && (
          <div className="transfer-progress"><span style={{ width: `${task.progress}%` }} /></div>
        )}
        {task.error && <p className="transfer-error">{task.error}</p>}
        {task.direction === 'upload' && task.tags.length > 0 && (
          <button type="button" className="transfer-tags" onClick={editTags} title="编辑 AI 标签">
            <Tag size={11} />{task.tags.slice(0, 4).map(tag => <span key={tag}>{tag}</span>)}{task.tags.length > 4 && <span>+{task.tags.length - 4}</span>}
          </button>
        )}
      </div>
      <div className="transfer-task-actions">
        <TaskActions task={task} onPause={onPause} onResume={onResume} onCancel={onCancel} onRetry={onRetry} onRemove={onRemove} />
      </div>
    </div>
  );
}

export default function TransferCenter(props: TransferCenterProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'download'>('upload');
  const [collapsedBatches, setCollapsedBatches] = useState<Set<string>>(new Set());
  const wasOpenRef = useRef(false);
  const drawerRef = useRef<HTMLElement>(null);
  const visibleTasks = useMemo(() => props.tasks.filter(task => task.direction === activeTab), [activeTab, props.tasks]);
  const uploadBatches = useMemo(() => props.batches
    .map(batch => ({ batch, tasks: props.tasks.filter(task => task.batchId === batch.id) }))
    .filter(entry => entry.tasks.length > 0), [props.batches, props.tasks]);
  const counts = useMemo(() => ({
    upload: props.tasks.filter(task => task.direction === 'upload' && !['completed', 'cancelled'].includes(task.status)).length,
    download: props.tasks.filter(task => task.direction === 'download' && !['completed', 'cancelled'].includes(task.status)).length
  }), [props.tasks]);
  const totalProgress = visibleTasks.length === 0 ? 0 : Math.round(visibleTasks.reduce((sum, task) => sum + task.progress, 0) / visibleTasks.length);

  useEffect(() => {
    if (props.open && !wasOpenRef.current) {
      const latestActiveTask = [...props.tasks]
        .filter(task => !['completed', 'cancelled'].includes(task.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      if (latestActiveTask) setActiveTab(latestActiveTask.direction);
    }
    wasOpenRef.current = props.open;
  }, [props.open, props.tasks]);

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
        <div>
          <h2>传输中心</h2>
        </div>
        <button type="button" className="transfer-close" title="关闭传输中心" onClick={props.onClose}><X size={18} /></button>
      </header>

      <div className="transfer-network-row">
        <span className={props.isOnline ? 'is-online' : 'is-offline'}><span className="transfer-network-dot" />{props.isOnline ? '网络正常' : '网络已断开，任务已暂停'}</span>
        <span>{visibleTasks.length} 项 · 总进度 {totalProgress}%</span>
      </div>

      <div className="transfer-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === 'upload'} className={activeTab === 'upload' ? 'is-active' : ''} onClick={() => setActiveTab('upload')}><Upload size={15} />上传{counts.upload > 0 && <span>{counts.upload}</span>}</button>
        <button type="button" role="tab" aria-selected={activeTab === 'download'} className={activeTab === 'download' ? 'is-active' : ''} onClick={() => setActiveTab('download')}><Download size={15} />下载{counts.download > 0 && <span>{counts.download}</span>}</button>
      </div>

      <div className="transfer-toolbar">
        <span>{activeTab === 'upload' ? '按提交批次分组' : '最近下载任务'}</span>
        {visibleTasks.some(task => task.status === 'completed') && <button type="button" onClick={() => props.onClearCompleted(activeTab)}>清除已完成</button>}
      </div>

      <div className="transfer-list">
        {activeTab === 'upload' ? uploadBatches.map(({ batch, tasks }) => {
          const collapsed = collapsedBatches.has(batch.id);
          const allPending = tasks.length > 0 && tasks.every(task => task.status === 'pending_submit');
          const allCompleted = tasks.length > 0 && tasks.every(task => task.status === 'completed');
          const hasRunning = tasks.some(task => ['queued', 'transferring', 'inspecting', 'tagging', 'waiting_network'].includes(task.status));
          const allPaused = tasks.every(task => ['paused', 'pending_submit', 'completed', 'cancelled'].includes(task.status));
          const done = tasks.filter(task => task.status === 'completed').length;
          return (
            <section key={batch.id} className="transfer-batch">
              <div className="transfer-batch-header">
                <button type="button" className="transfer-batch-toggle" onClick={() => toggleBatch(batch.id)}>{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
                <div className="transfer-batch-copy">
                  <strong>{batch.name}</strong>
                  <span>{tasks.length} 个文件 · {done > 0 ? `已完成 ${done}` : formatTime(batch.createdAt)}</span>
                </div>
                <div className="transfer-batch-actions">
                  {hasRunning && <button type="button" title="暂停批次" className="transfer-icon-button" onClick={() => props.onPauseBatch(batch.id)}><Pause size={14} /></button>}
                  {allPaused && tasks.some(task => task.status === 'paused') && <button type="button" title="继续批次" className="transfer-icon-button" onClick={() => props.onResumeBatch(batch.id)}><Play size={14} /></button>}
                  {tasks.some(task => !['completed', 'cancelled'].includes(task.status)) && <button type="button" title="取消批次" className="transfer-icon-button is-danger" onClick={() => props.onCancelBatch(batch.id)}><X size={14} /></button>}
                </div>
              </div>
              <button type="button" className="transfer-target" onClick={() => {
                const target = window.prompt('修改提交目录', batch.targetFolderLabel);
                if (target?.trim()) props.onChangeBatchTarget(batch.id, target.trim());
              }}><FolderInput size={13} /><span>个人空间 / {batch.targetFolderLabel}</span><span>修改</span></button>
              {!collapsed && <div className="transfer-batch-tasks">{tasks.map(task => <TransferTaskRow
                key={task.id}
                task={task}
                compact
                onPause={() => props.onPauseTask(task.id)}
                onResume={() => props.onResumeTask(task.id)}
                onCancel={() => props.onCancelTask(task.id)}
                onRetry={() => props.onRetryTask(task.id)}
                onRemove={() => props.onRemoveTask(task.id)}
                onUpdateTags={tags => props.onUpdateTaskTags(task.id, tags)}
              />)}</div>}
              <div className="transfer-batch-footer">
                <span>{allCompleted ? '已提交入库，记录将保留 7 天' : allPending ? '全部文件已通过检查，可提交入库' : batch.submittedAt ? '正在写入素材库' : '文件完成处理后可整批提交'}</span>
                <div>
                  <button type="button" className="transfer-secondary-button" onClick={() => props.onDiscardBatch(batch.id)}><Trash2 size={13} />丢弃</button>
                  <button type="button" className="transfer-primary-button" disabled={!allPending} onClick={() => props.onSubmitBatch(batch.id)}><Send size={13} />提交批次</button>
                </div>
              </div>
            </section>
          );
        }) : visibleTasks.map(task => <TransferTaskRow
          key={task.id}
          task={task}
          onPause={() => props.onPauseTask(task.id)}
          onResume={() => props.onResumeTask(task.id)}
          onCancel={() => props.onCancelTask(task.id)}
          onRetry={() => props.onRetryTask(task.id)}
          onRemove={() => props.onRemoveTask(task.id)}
          onUpdateTags={tags => props.onUpdateTaskTags(task.id, tags)}
        />)}

        {visibleTasks.length === 0 && (
          <div className="transfer-empty">
            <div>{activeTab === 'upload' ? <Upload size={23} /> : <Download size={23} />}</div>
            <strong>{activeTab === 'upload' ? '暂无上传任务' : '暂无下载任务'}</strong>
            <span>{activeTab === 'upload' ? '从个人空间选择文件或文件夹开始上传' : '从素材库或工具库发起下载'}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

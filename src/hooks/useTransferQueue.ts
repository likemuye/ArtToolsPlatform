import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DownloadTransferInput,
  TransferDirection,
  SpaceId,
  TransferBatch,
  TransferBatchSummary,
  TransferFailureStage,
  TransferPauseReason,
  TransferStatus,
  TransferTask,
  UploadTransferInput
} from '../types';

const STORAGE_PREFIX = 'pixgo-transfer-queue-v1';
const MAX_PENDING_TASKS = 500;
// The product document leaves concrete concurrency values pending technical confirmation.
// Keep the existing independent pools configurable here until the backend publishes limits.
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_CONCURRENT_DOWNLOADS = 3;
const MAX_CONCURRENT_INSPECTIONS = 8;
const MAX_COMPLETED_RECORDS = 500;
const RECORD_RETENTION_MS = 48 * 60 * 60 * 1000;
const TEMP_DATA_RETENTION_MS = 24 * 60 * 60 * 1000;

const formatBatchTimestamp = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
};

const ACTIVE_STATUSES: TransferStatus[] = ['queued', 'transferring', 'packing', 'inspecting', 'tagging', 'submitting'];
const TERMINAL_STATUSES: TransferStatus[] = ['completed', 'failed', 'cancelled'];

interface PersistedQueue {
  tasks: TransferTask[];
  batches: TransferBatch[];
}

interface UseTransferQueueOptions {
  accountId: string;
  onTaskCompleted: (task: TransferTask) => void;
  onBatchSettled?: (summary: TransferBatchSummary) => void;
}

const buildId = (prefix: string) => (
  typeof crypto.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
);

const storageKey = (accountId: string) => `${STORAGE_PREFIX}:${accountId.toLowerCase()}`;

const migrateTask = (task: TransferTask): TransferTask => {
  const now = new Date().toISOString();
  const legacyStatus = task.status as TransferStatus | 'pending_submit';
  let status: TransferStatus = legacyStatus === 'pending_submit' ? 'submitting' : legacyStatus;
  let resumeStatus = legacyStatus === 'pending_submit' ? undefined : task.resumeStatus;
  let pauseReason = task.pauseReason;
  const progress = legacyStatus === 'pending_submit' ? 0 : task.progress;

  if (status === 'paused' && task.pauseReason === 'manual') {
    // Manual download pauses survive reloads and are resumed only by the user.
    status = 'paused';
  } else if ((status === 'waiting_network' || status === 'paused') && navigator.onLine) {
    status = resumeStatus ?? 'queued';
    resumeStatus = undefined;
    pauseReason = undefined;
  } else if (ACTIVE_STATUSES.includes(status) && !navigator.onLine) {
    resumeStatus = status;
    status = 'waiting_network';
    pauseReason = 'network';
  }

  return {
    ...task,
    status,
    resumeStatus,
    pauseReason,
    progress,
    retryable: task.retryable ?? task.failureStage !== 'inspection',
    updatedAt: legacyStatus === 'pending_submit' ? now : task.updatedAt
  };
};

const readQueue = (accountId: string): PersistedQueue => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(accountId)) ?? '{}') as Partial<PersistedQueue>;
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(migrateTask) : [];
    const terminalTaskIds = new Set(tasks.filter(task => TERMINAL_STATUSES.includes(task.status)).map(task => task.id));
    const batches = Array.isArray(parsed.batches) ? parsed.batches.map(batch => {
      const isDownloadBatch = batch.direction === 'download' && batch.downloadMode === 'files';
      const isUploadBatch = !isDownloadBatch;
      const parsedCreatedAt = new Date(batch.createdAt);
      const batchTime = formatBatchTimestamp(Number.isNaN(parsedCreatedAt.getTime()) ? new Date() : parsedCreatedAt);
      let name = typeof batch.name === 'string' ? batch.name : (isDownloadBatch ? '批量下载' : '批量上传');
      // Keep persisted batch cards aligned with the F11 naming rule after
      // upgrading from earlier “上传批次/下载批次 HH:mm” labels.
      if (isDownloadBatch && name.startsWith('下载批次')) name = name.replace(/^下载批次/, '批量下载');
      if (isUploadBatch && name.startsWith('上传批次')) name = name.replace(/^上传批次/, '批量上传');
      if (isDownloadBatch && /^批量下载\s+(?:\d{4}_)?\d{2}:?\d{2}$/.test(name)) name = `批量下载 ${batchTime}`;
      if (isUploadBatch && /^批量上传\s+(?:\d{4}_)?\d{2}:?\d{2}$/.test(name)) name = `批量上传 ${batchTime}`;
      return {
      ...batch,
      name,
      confidence: isUploadBatch ? (batch.confidence ?? 85) : batch.confidence,
      // Old fully submitted batches already notified before this migration.
      notificationApplied: batch.notificationApplied ?? (
        Boolean(batch.submittedAt)
        && batch.taskIds.length > 0
        && batch.taskIds.every(taskId => terminalTaskIds.has(taskId))
      )
    }; }) : [];
    return { tasks, batches };
  } catch {
    return { tasks: [], batches: [] };
  }
};

const isCapacityTask = (task: TransferTask) => !['completed', 'cancelled'].includes(task.status);

const sanitizeTags = (tags: string[]) => [...new Set(tags.map(tag => tag.trim()).filter(tag => tag.length > 0 && tag.length <= 20))].slice(0, 100);

const withGeneratedAiTags = (task: TransferTask) => ({
  ...task,
  tags: sanitizeTags([...task.tags, 'AI自动打标', task.format.toUpperCase()])
});

const resumeStatusForFailure = (stage?: TransferFailureStage): TransferStatus => {
  if (stage === 'tagging') return 'tagging';
  if (stage === 'ingestion') return 'submitting';
  return 'queued';
};

export function useTransferQueue({
  accountId,
  onTaskCompleted,
  onBatchSettled
}: UseTransferQueueOptions) {
  const initialQueue = useMemo(() => readQueue(accountId), []);
  const [tasks, setTasks] = useState<TransferTask[]>(initialQueue.tasks);
  const [batches, setBatches] = useState<TransferBatch[]>(initialQueue.batches);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const loadedAccountRef = useRef(accountId);
  const tasksRef = useRef(tasks);
  const completionCallbackRef = useRef(onTaskCompleted);
  const batchCallbackRef = useRef(onBatchSettled);
  const notifiedBatchIdsRef = useRef(new Set(initialQueue.batches.filter(batch => batch.notificationApplied).map(batch => batch.id)));

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { completionCallbackRef.current = onTaskCompleted; }, [onTaskCompleted]);
  useEffect(() => { batchCallbackRef.current = onBatchSettled; }, [onBatchSettled]);

  useEffect(() => {
    if (loadedAccountRef.current === accountId) return;
    const nextQueue = readQueue(accountId);
    loadedAccountRef.current = accountId;
    notifiedBatchIdsRef.current = new Set(nextQueue.batches.filter(batch => batch.notificationApplied).map(batch => batch.id));
    setTasks(nextQueue.tasks);
    setBatches(nextQueue.batches);
  }, [accountId]);

  useEffect(() => {
    if (loadedAccountRef.current !== accountId) return;
    localStorage.setItem(storageKey(accountId), JSON.stringify({ tasks, batches } satisfies PersistedQueue));
  }, [accountId, batches, tasks]);

  useEffect(() => {
    const handleOffline = () => {
      const now = new Date().toISOString();
      setIsOnline(false);
      setTasks(previous => previous.map(task => (
        ACTIVE_STATUSES.includes(task.status)
          ? { ...task, status: 'waiting_network', resumeStatus: task.status, pauseReason: 'network', updatedAt: now }
          : task
      )));
    };
    const handleOnline = () => {
      const now = new Date().toISOString();
      setIsOnline(true);
      setTasks(previous => previous.map(task => task.status === 'waiting_network'
        ? { ...task, status: task.resumeStatus ?? 'queued', resumeStatus: undefined, pauseReason: undefined, updatedAt: now }
        : task));
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isOnline) return;
      setTasks(previous => {
        let activeUploads = previous.filter(task => task.direction === 'upload' && task.status === 'transferring').length;
        let activeDownloads = previous.filter(task => task.direction === 'download' && (task.status === 'transferring' || task.status === 'packing')).length;
        const now = new Date().toISOString();

        const scheduled = previous.map(task => {
          if (task.status === 'queued' && task.direction === 'upload' && activeUploads < MAX_CONCURRENT_UPLOADS) {
            activeUploads += 1;
            return { ...task, status: 'transferring' as TransferStatus, updatedAt: now };
          }
          if (task.status === 'queued' && task.direction === 'download' && activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
            activeDownloads += 1;
            return task.downloadKind === 'pack'
              ? { ...task, status: 'packing' as TransferStatus, updatedAt: now }
              : { ...task, status: 'transferring' as TransferStatus, updatedAt: now };
          }
          return task;
        });

        const inspectionSlots = new Set(scheduled
          .filter(task => task.status === 'inspecting')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(0, MAX_CONCURRENT_INSPECTIONS)
          .map(task => task.id));

        return scheduled.map(task => {
          if (task.status === 'packing') {
            // Server-side archive generation has no meaningful byte progress;
            // keep the visible “打包中” state for one scheduler interval before
            // transitioning to the actual download.
            const wasAlreadyPacking = previous.some(previousTask => previousTask.id === task.id && previousTask.status === 'packing');
            return wasAlreadyPacking
              ? { ...task, status: 'transferring', progress: 0, updatedAt: now }
              : task;
          }
          if (task.status === 'transferring') {
            const increment = task.direction === 'download' ? 6 + (task.name.length % 5) : 5 + (task.name.length % 4);
            const progress = Math.min(100, task.progress + increment);
            if (progress < 100) return { ...task, progress, updatedAt: now };
            if (task.direction === 'download') {
              return { ...task, progress: 100, status: 'completed', completedAt: now, updatedAt: now };
            }
            return { ...task, progress: 0, status: 'inspecting', updatedAt: now };
          }
          if (task.status === 'inspecting') {
            if (!inspectionSlots.has(task.id)) return task;
            const progress = Math.min(100, task.progress + 20);
            return progress >= 100
              ? { ...task, progress: 0, status: 'tagging', updatedAt: now }
              : { ...task, progress, updatedAt: now };
          }
          if (task.status === 'tagging') {
            const progress = Math.min(100, task.progress + 25);
            if (progress < 100) return { ...task, progress, updatedAt: now };
            return { ...withGeneratedAiTags(task), progress: 0, status: 'submitting', updatedAt: now };
          }
          if (task.status === 'submitting') {
            if (!task.targetFolderLabel?.trim()) {
              return {
                ...task,
                status: 'failed',
                progress: 0,
                error: '入库失败（目标目录不存在/无权限）',
                failureStage: 'ingestion',
                retryable: true,
                failedAt: now,
                temporaryDataExpiresAt: new Date(Date.now() + TEMP_DATA_RETENTION_MS).toISOString(),
                updatedAt: now
              };
            }
            const progress = Math.min(100, task.progress + 20);
            return progress >= 100
              ? { ...task, progress: 100, status: 'completed', completedAt: now, updatedAt: now }
              : { ...task, progress, updatedAt: now };
          }
          return task;
        });
      });
    }, 600);
    return () => window.clearInterval(timer);
  }, [isOnline]);

  useEffect(() => {
    const completed = tasks.filter(task => task.status === 'completed' && !task.completionApplied);
    if (completed.length === 0) return;
    completed.forEach(task => completionCallbackRef.current(task));
    const completedIds = new Set(completed.map(task => task.id));
    setTasks(previous => previous.map(task => completedIds.has(task.id) ? { ...task, completionApplied: true } : task));
  }, [tasks]);

  useEffect(() => {
    const newlySettled = batches.filter(batch => {
      if (batch.notificationApplied || notifiedBatchIdsRef.current.has(batch.id)) return false;
      const batchTasks = tasks.filter(task => batch.taskIds.includes(task.id));
      return batchTasks.length > 0 && batchTasks.every(task => TERMINAL_STATUSES.includes(task.status));
    });
    if (newlySettled.length === 0) return;

    const now = new Date().toISOString();
    newlySettled.forEach(batch => {
      notifiedBatchIdsRef.current.add(batch.id);
      const batchTasks = tasks.filter(task => batch.taskIds.includes(task.id));
      batchCallbackRef.current?.({
        batch,
        completed: batchTasks.filter(task => task.status === 'completed').length,
        failed: batchTasks.filter(task => task.status === 'failed').length,
        cancelled: batchTasks.filter(task => task.status === 'cancelled').length,
        total: batchTasks.length
      });
    });
    const settledIds = new Set(newlySettled.map(batch => batch.id));
    setBatches(previous => previous.map(batch => settledIds.has(batch.id)
      ? { ...batch, settledAt: now, notificationApplied: true }
      : batch));
  }, [batches, tasks]);

  useEffect(() => {
    const cleanQueue = () => {
      const now = Date.now();
      let changed = false;
      let nextTasks = tasksRef.current.map(task => {
        if (
          task.status === 'failed'
          && task.retryable !== false
          && task.temporaryDataExpiresAt
          && now >= new Date(task.temporaryDataExpiresAt).getTime()
        ) {
          changed = true;
          return {
            ...task,
            retryable: false,
            error: `${task.error ?? '任务失败'}；暂存数据已超过 24 小时，请重新选择文件。`,
            updatedAt: new Date(now).toISOString()
          };
        }
        return task;
      });

      nextTasks = nextTasks.filter(task => {
        if (task.status === 'failed') {
          const keep = now - new Date(task.failedAt ?? task.updatedAt).getTime() <= RECORD_RETENTION_MS;
          if (!keep) changed = true;
          return keep;
        }
        if (task.status === 'completed' || task.status === 'cancelled') {
          const keep = now - new Date(task.completedAt ?? task.updatedAt).getTime() <= RECORD_RETENTION_MS;
          if (!keep) changed = true;
          return keep;
        }
        return true;
      });

      const completed = nextTasks
        .filter(task => task.status === 'completed')
        .sort((a, b) => new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime());
      if (completed.length > MAX_COMPLETED_RECORDS) {
        const retainedIds = new Set(completed.slice(0, MAX_COMPLETED_RECORDS).map(task => task.id));
        nextTasks = nextTasks.filter(task => task.status !== 'completed' || retainedIds.has(task.id));
        changed = true;
      }

      if (!changed) return;
      const retainedIds = new Set(nextTasks.map(task => task.id));
      setTasks(nextTasks);
      setBatches(previous => previous
        .map(batch => ({ ...batch, taskIds: batch.taskIds.filter(taskId => retainedIds.has(taskId)) }))
        .filter(batch => batch.taskIds.length > 0));
    };

    cleanQueue();
    const timer = window.setInterval(cleanQueue, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const enqueueDownload = useCallback((input: DownloadTransferInput) => {
    if (tasksRef.current.filter(task => task.direction === 'download' && isCapacityTask(task)).length >= MAX_PENDING_TASKS) return null;
    const now = new Date().toISOString();
    const task: TransferTask = {
      id: buildId('download'),
      direction: 'download',
      resourceKind: input.resourceKind,
      resourceId: input.resourceId,
      name: input.name,
      sizeMB: input.sizeMB,
      format: input.format,
      previewUrl: input.previewUrl,
      sourceSpaceId: input.targetSpaceId,
      targetSpaceId: input.targetSpaceId,
      targetFolderLabel: input.targetFolderLabel,
      downloadKind: input.downloadKind ?? 'download',
      tags: [],
      status: isOnline ? 'queued' : 'waiting_network',
      resumeStatus: isOnline ? undefined : 'queued',
      pauseReason: isOnline ? undefined : 'network',
      progress: 0,
      speedMBps: Math.min(5, 2.6 + (input.sizeMB % 2)),
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    setTasks(previous => [...previous, task]);
    return task.id;
  }, [isOnline]);

  const enqueueUploadBatch = useCallback((inputs: UploadTransferInput[], targetFolderLabel: string, targetFolderId?: string, confidence = 85) => {
    if (inputs.length === 0 || tasksRef.current.filter(task => task.direction === 'upload' && isCapacityTask(task)).length + inputs.length > MAX_PENDING_TASKS) return null;
    if (inputs.some(input => input.sizeMB > 2048)) return null;
    const now = new Date().toISOString();
    const normalizedConfidence = Math.max(0, Math.min(100, Math.round(confidence)));
    const batchId = buildId('upload-batch');
    const taskIds = inputs.map(() => buildId('upload'));
    const nextTasks: TransferTask[] = inputs.map((input, index) => ({
      id: taskIds[index],
      batchId,
      direction: 'upload',
      resourceKind: 'asset',
      resourceId: `pending-${taskIds[index]}`,
      name: input.name,
      sourceFileName: input.sourceFileName,
      sizeMB: input.sizeMB,
      format: input.format,
      previewUrl: input.previewUrl,
      category: input.category,
      uploadType: input.uploadType,
      tags: sanitizeTags(input.tags),
      targetSpaceId: SpaceId.Personal,
      targetFolderId,
      targetFolderLabel,
      // `queued` is an internal scheduler state; the upload UI presents it as
      // “上传中” until a worker starts processing the file.
      status: isOnline ? 'queued' : 'waiting_network',
      resumeStatus: isOnline ? undefined : 'queued',
      pauseReason: isOnline ? undefined : 'network',
      progress: 0,
      speedMBps: Math.min(5, 2.2 + (input.sizeMB % 2.5)),
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    }));
    const batch: TransferBatch = {
      id: batchId,
      name: `批量上传 ${formatBatchTimestamp(new Date(now))}`,
      taskIds,
      targetSpaceId: SpaceId.Personal,
      targetFolderId,
      targetFolderLabel,
      createdAt: now,
      submittedAt: now,
      notificationApplied: false,
      confidence: normalizedConfidence
    };
    setBatches(previous => [batch, ...previous]);
    setTasks(previous => [...previous, ...nextTasks]);
    return batchId;
  }, [isOnline]);

  const enqueueDownloadBatch = useCallback((inputs: DownloadTransferInput[], targetFolderLabel = '本地缓存') => {
    if (inputs.length === 0) return null;
    const activeDownloadCount = tasksRef.current.filter(task => task.direction === 'download' && isCapacityTask(task)).length;
    if (activeDownloadCount + inputs.length > MAX_PENDING_TASKS) return null;
    const now = new Date().toISOString();
    const batchId = buildId('download-batch');
    const taskIds = inputs.map(() => buildId('download'));
    const nextTasks: TransferTask[] = inputs.map((input, index) => ({
      id: taskIds[index],
      batchId,
      direction: 'download',
      resourceKind: input.resourceKind,
      resourceId: input.resourceId,
      name: input.name,
      sizeMB: input.sizeMB,
      format: input.format,
      previewUrl: input.previewUrl,
      sourceSpaceId: input.targetSpaceId,
      targetSpaceId: input.targetSpaceId,
      downloadKind: input.downloadKind ?? 'download',
      tags: [],
      status: isOnline ? 'queued' : 'waiting_network',
      resumeStatus: isOnline ? undefined : 'queued',
      pauseReason: isOnline ? undefined : 'network',
      progress: 0,
      speedMBps: Math.min(5, 2.6 + (input.sizeMB % 2)),
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    }));
    const batch: TransferBatch = {
      id: batchId,
      taskIds,
      name: `批量下载 ${formatBatchTimestamp(new Date(now))}`,
      targetSpaceId: inputs[0]?.targetSpaceId ?? SpaceId.Personal,
      targetFolderLabel,
      createdAt: now,
      direction: 'download',
      downloadMode: 'files'
    };
    setBatches(previous => [batch, ...previous]);
    setTasks(previous => [...previous, ...nextTasks]);
    return batchId;
  }, [isOnline]);

  const cancelTask = useCallback((taskId: string) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => task.id === taskId && task.direction === 'download' && task.status !== 'completed'
      ? {
          ...task,
          status: 'cancelled',
          progress: 0,
          error: undefined,
          resumeStatus: undefined,
          pauseReason: undefined,
          temporaryDataExpiresAt: undefined,
          updatedAt: now
        }
      : task));
  }, []);

  const pauseTask = useCallback((taskId: string) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => (
      task.id === taskId
      && task.direction === 'download'
      && (task.status === 'queued' || task.status === 'transferring')
    ) ? {
      ...task,
      status: 'paused',
      resumeStatus: task.status,
      pauseReason: 'manual',
      updatedAt: now
    } : task));
  }, []);

  const resumeTask = useCallback((taskId: string) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => (
      task.id === taskId
      && task.direction === 'download'
      && task.status === 'paused'
      && task.pauseReason === 'manual'
    ) ? {
      ...task,
      status: isOnline ? 'queued' : 'waiting_network',
      resumeStatus: isOnline ? undefined : 'queued',
      pauseReason: isOnline ? undefined : 'network',
      updatedAt: now
    } : task));
  }, [isOnline]);

  const pauseAll = useCallback((direction?: TransferDirection) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => (
      (!direction || task.direction === direction)
      && task.direction === 'download'
      && (task.status === 'queued' || task.status === 'transferring')
    ) ? {
      ...task,
      status: 'paused',
      resumeStatus: task.status,
      pauseReason: 'manual',
      updatedAt: now
    } : task));
  }, []);

  const pauseBatch = useCallback((batchId: string) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => (
      task.batchId === batchId
      && task.direction === 'download'
      && (task.status === 'queued' || task.status === 'transferring')
    ) ? {
      ...task,
      status: 'paused',
      resumeStatus: task.status,
      pauseReason: 'manual',
      updatedAt: now
    } : task));
  }, []);

  const resumeBatch = useCallback((batchId: string) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => (
      task.batchId === batchId
      && task.direction === 'download'
      && task.status === 'paused'
      && task.pauseReason === 'manual'
    ) ? {
      ...task,
      status: isOnline ? 'queued' : 'waiting_network',
      resumeStatus: isOnline ? undefined : 'queued',
      pauseReason: isOnline ? undefined : 'network',
      updatedAt: now
    } : task));
  }, [isOnline]);

  const resumeAll = useCallback((direction?: TransferDirection) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => (
      (!direction || task.direction === direction)
      && task.direction === 'download'
      && task.status === 'paused'
      && task.pauseReason === 'manual'
    ) ? {
      ...task,
      status: isOnline ? 'queued' : 'waiting_network',
      resumeStatus: isOnline ? undefined : 'queued',
      pauseReason: isOnline ? undefined : 'network',
      updatedAt: now
    } : task));
  }, [isOnline]);

  const retryTask = useCallback((taskId: string) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => task.id === taskId && task.status === 'failed' && task.retryable !== false
      ? {
          ...task,
          status: isOnline ? resumeStatusForFailure(task.failureStage) : 'waiting_network',
          resumeStatus: isOnline ? undefined : resumeStatusForFailure(task.failureStage),
          pauseReason: isOnline ? undefined : 'network',
          progress: 0,
          retryCount: task.retryCount + 1,
          error: undefined,
          failureStage: undefined,
          failedAt: undefined,
          temporaryDataExpiresAt: undefined,
          updatedAt: now
        }
      : task));
  }, [isOnline]);

  const retryAllFailed = useCallback((direction?: 'upload' | 'download') => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => (
      task.status === 'failed'
      && task.retryable !== false
      && (!direction || task.direction === direction)
    ) ? {
      ...task,
      status: isOnline ? resumeStatusForFailure(task.failureStage) : 'waiting_network',
      resumeStatus: isOnline ? undefined : resumeStatusForFailure(task.failureStage),
      pauseReason: isOnline ? undefined : 'network',
      progress: 0,
      retryCount: task.retryCount + 1,
      error: undefined,
      failureStage: undefined,
      failedAt: undefined,
      temporaryDataExpiresAt: undefined,
      updatedAt: now
    } : task));
  }, [isOnline]);

  const removeTask = useCallback((taskId: string) => {
    const target = tasksRef.current.find(task => task.id === taskId);
    if (!target || !TERMINAL_STATUSES.includes(target.status)) return;
    const nextTasks = tasksRef.current.filter(task => task.id !== taskId);
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    setBatches(previous => previous
      .map(batch => ({ ...batch, taskIds: batch.taskIds.filter(id => id !== taskId) }))
      .filter(batch => batch.taskIds.length > 0));
  }, []);

  const cancelBatch = useCallback((batchId: string) => {
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => task.batchId === batchId && task.direction === 'download' && task.status !== 'completed' && task.status !== 'cancelled'
      ? {
          ...task,
          status: 'cancelled',
          progress: 0,
          error: undefined,
          resumeStatus: undefined,
          pauseReason: undefined,
          temporaryDataExpiresAt: undefined,
          updatedAt: now
        }
      : task));
  }, []);

  const discardBatch = useCallback((batchId: string) => {
    const batchTasks = tasksRef.current.filter(task => task.batchId === batchId);
    if (batchTasks.length > 0 && batchTasks.some(task => !TERMINAL_STATUSES.includes(task.status))) return;
    const nextTasks = tasksRef.current.filter(task => task.batchId !== batchId);
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    setBatches(previous => previous.filter(batch => batch.id !== batchId));
  }, []);

  const clearCompleted = useCallback((direction?: 'upload' | 'download') => {
    const removedIds = new Set(tasksRef.current
      .filter(task => task.status === 'completed' && (!direction || task.direction === direction))
      .map(task => task.id));
    setTasks(previous => previous.filter(task => !removedIds.has(task.id)));
    setBatches(previous => previous
      .map(batch => ({ ...batch, taskIds: batch.taskIds.filter(id => !removedIds.has(id)) }))
      .filter(batch => batch.taskIds.length > 0));
  }, []);

  const pauseAllAndPersist = useCallback((reason: TransferPauseReason = 'logout') => {
    const now = new Date().toISOString();
    const paused = tasksRef.current.map(task => (
      ACTIVE_STATUSES.includes(task.status) || task.status === 'waiting_network'
    ) ? {
      ...task,
      status: 'paused' as TransferStatus,
      resumeStatus: task.status === 'waiting_network' ? (task.resumeStatus ?? 'queued') : task.status,
      pauseReason: reason,
      updatedAt: now
    } : task);
    localStorage.setItem(storageKey(accountId), JSON.stringify({ tasks: paused, batches } satisfies PersistedQueue));
    setTasks(paused);
  }, [accountId, batches]);

  return {
    tasks,
    batches,
    isOnline,
    enqueueDownload,
    enqueueDownloadBatch,
    enqueueUploadBatch,
    cancelTask,
    pauseTask,
    resumeTask,
    pauseAll,
    resumeAll,
    pauseBatch,
    resumeBatch,
    retryTask,
    retryAllFailed,
    removeTask,
    cancelBatch,
    discardBatch,
    clearCompleted,
    pauseAllAndPersist
  };
}

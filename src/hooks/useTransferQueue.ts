import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DownloadTransferInput,
  SpaceId,
  TransferBatch,
  TransferStatus,
  TransferTask,
  UploadTransferInput
} from '../types';

const STORAGE_PREFIX = 'pixgo-transfer-queue-v1';
const MAX_PENDING_TASKS = 500;
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_CONCURRENT_DOWNLOADS = 3;
const MAX_CONCURRENT_INSPECTIONS = 8;
const MAX_COMPLETED_RECORDS = 200;
const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface PersistedQueue {
  tasks: TransferTask[];
  batches: TransferBatch[];
}

interface UseTransferQueueOptions {
  accountId: string;
  onTaskCompleted: (task: TransferTask) => void;
}

const buildId = (prefix: string) => (
  typeof crypto.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
);

const storageKey = (accountId: string) => `${STORAGE_PREFIX}:${accountId.toLowerCase()}`;

const readQueue = (accountId: string): PersistedQueue => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(accountId)) ?? '{}') as Partial<PersistedQueue>;
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    return {
      tasks: tasks.map(task => task.status === 'waiting_network' && navigator.onLine
        ? { ...task, status: task.resumeStatus ?? 'queued', resumeStatus: undefined, updatedAt: new Date().toISOString() }
        : task),
      batches: Array.isArray(parsed.batches) ? parsed.batches : []
    };
  } catch {
    return { tasks: [], batches: [] };
  }
};

const isCapacityTask = (task: TransferTask) => !['completed', 'cancelled'].includes(task.status);

export function useTransferQueue({ accountId, onTaskCompleted }: UseTransferQueueOptions) {
  const initialQueue = useMemo(() => readQueue(accountId), []);
  const [tasks, setTasks] = useState<TransferTask[]>(initialQueue.tasks);
  const [batches, setBatches] = useState<TransferBatch[]>(initialQueue.batches);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const loadedAccountRef = useRef(accountId);
  const tasksRef = useRef(tasks);
  const completionCallbackRef = useRef(onTaskCompleted);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { completionCallbackRef.current = onTaskCompleted; }, [onTaskCompleted]);

  useEffect(() => {
    if (loadedAccountRef.current === accountId) return;
    const nextQueue = readQueue(accountId);
    loadedAccountRef.current = accountId;
    setTasks(nextQueue.tasks);
    setBatches(nextQueue.batches);
  }, [accountId]);

  useEffect(() => {
    if (loadedAccountRef.current !== accountId) return;
    localStorage.setItem(storageKey(accountId), JSON.stringify({ tasks, batches } satisfies PersistedQueue));
  }, [accountId, batches, tasks]);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      setTasks(previous => previous.map(task => (
        ['queued', 'transferring', 'inspecting', 'tagging', 'submitting'].includes(task.status)
          ? { ...task, status: 'waiting_network', resumeStatus: task.status, updatedAt: new Date().toISOString() }
          : task
      )));
    };
    const handleOnline = () => {
      setIsOnline(true);
      setTasks(previous => previous.map(task => task.status === 'waiting_network'
        ? { ...task, status: task.resumeStatus ?? 'queued', resumeStatus: undefined, updatedAt: new Date().toISOString() }
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
        let activeDownloads = previous.filter(task => task.direction === 'download' && task.status === 'transferring').length;
        const now = new Date().toISOString();

        const scheduled = previous.map(task => {
          if (task.status === 'queued' && task.direction === 'upload' && activeUploads < MAX_CONCURRENT_UPLOADS) {
            activeUploads += 1;
            return { ...task, status: 'transferring' as TransferStatus, updatedAt: now };
          }
          if (task.status === 'queued' && task.direction === 'download' && activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
            activeDownloads += 1;
            return { ...task, status: 'transferring' as TransferStatus, updatedAt: now };
          }
          return task;
        });

        const inspectionSlots = new Set(scheduled
          .filter(task => task.status === 'inspecting')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(0, MAX_CONCURRENT_INSPECTIONS)
          .map(task => task.id));

        return scheduled.map(task => {
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
            return progress >= 100
              ? { ...task, progress: 100, status: 'pending_submit', updatedAt: now }
              : { ...task, progress, updatedAt: now };
          }
          if (task.status === 'submitting') {
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
    const now = Date.now();
    setTasks(previous => {
      const incomplete = previous.filter(task => task.status !== 'completed').map(task => (
        task.status === 'pending_submit' && now - new Date(task.updatedAt).getTime() > COMPLETED_RETENTION_MS
          ? { ...task, status: 'cancelled' as TransferStatus, error: '待提交记录已超过 7 天，临时文件已自动清理。', updatedAt: new Date(now).toISOString() }
          : task
      ));
      const completed = previous
        .filter(task => task.status === 'completed')
        .filter(task => now - new Date(task.completedAt ?? task.updatedAt).getTime() <= COMPLETED_RETENTION_MS)
        .sort((a, b) => new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime())
        .slice(0, MAX_COMPLETED_RECORDS);
      return incomplete.length + completed.length === previous.length ? previous : [...incomplete, ...completed];
    });
  }, []);

  const enqueueDownload = useCallback((input: DownloadTransferInput) => {
    if (tasksRef.current.filter(isCapacityTask).length >= MAX_PENDING_TASKS) return null;
    const duplicate = tasksRef.current.find(task => (
      task.direction === 'download' && task.resourceKind === input.resourceKind && task.resourceId === input.resourceId
      && !['completed', 'cancelled'].includes(task.status)
    ));
    if (duplicate) return duplicate.id;
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
      targetSpaceId: input.targetSpaceId,
      downloadKind: input.downloadKind ?? 'download',
      tags: [],
      status: isOnline ? 'queued' : 'waiting_network',
      resumeStatus: isOnline ? undefined : 'queued',
      progress: 0,
      speedMBps: Math.min(5, 2.6 + (input.sizeMB % 2)),
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    setTasks(previous => [...previous, task]);
    return task.id;
  }, [isOnline]);

  const enqueueUploadBatch = useCallback((inputs: UploadTransferInput[], targetFolderLabel: string) => {
    if (inputs.length === 0 || tasksRef.current.filter(isCapacityTask).length + inputs.length > MAX_PENDING_TASKS) return null;
    if (inputs.some(input => input.sizeMB > 2048)) return null;
    const now = new Date().toISOString();
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
      tags: input.tags,
      targetSpaceId: SpaceId.Personal,
      targetFolderLabel,
      status: isOnline ? 'queued' : 'waiting_network',
      resumeStatus: isOnline ? undefined : 'queued',
      progress: 0,
      speedMBps: Math.min(5, 2.2 + (input.sizeMB % 2.5)),
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    }));
    const batch: TransferBatch = {
      id: batchId,
      name: `上传批次 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      taskIds,
      targetSpaceId: SpaceId.Personal,
      targetFolderLabel,
      createdAt: now
    };
    setBatches(previous => [batch, ...previous]);
    setTasks(previous => [...previous, ...nextTasks]);
    return batchId;
  }, [isOnline]);

  const pauseTask = useCallback((taskId: string) => {
    setTasks(previous => previous.map(task => task.id === taskId && !['completed', 'cancelled', 'pending_submit'].includes(task.status)
      ? { ...task, status: 'paused', resumeStatus: task.status === 'waiting_network' ? (task.resumeStatus ?? 'queued') : task.status, updatedAt: new Date().toISOString() }
      : task));
  }, []);

  const resumeTask = useCallback((taskId: string) => {
    setTasks(previous => previous.map(task => task.id === taskId && (task.status === 'paused' || task.status === 'waiting_network')
      ? { ...task, status: isOnline ? (task.resumeStatus ?? 'queued') : 'waiting_network', resumeStatus: isOnline ? undefined : task.resumeStatus, updatedAt: new Date().toISOString() }
      : task));
  }, [isOnline]);

  const cancelTask = useCallback((taskId: string) => {
    setTasks(previous => previous.map(task => task.id === taskId && task.status !== 'completed'
      ? { ...task, status: 'cancelled', progress: 0, updatedAt: new Date().toISOString() }
      : task));
  }, []);

  const retryTask = useCallback((taskId: string) => {
    setTasks(previous => previous.map(task => task.id === taskId && task.status === 'failed'
      ? { ...task, status: isOnline ? 'queued' : 'waiting_network', resumeStatus: isOnline ? undefined : 'queued', progress: 0, retryCount: task.retryCount + 1, error: undefined, updatedAt: new Date().toISOString() }
      : task));
  }, [isOnline]);

  const removeTask = useCallback((taskId: string) => {
    setTasks(previous => previous.filter(task => task.id !== taskId));
    setBatches(previous => previous.map(batch => ({ ...batch, taskIds: batch.taskIds.filter(id => id !== taskId) })).filter(batch => batch.taskIds.length > 0));
  }, []);

  const pauseBatch = useCallback((batchId: string) => {
    setTasks(previous => previous.map(task => task.batchId === batchId && ['queued', 'transferring', 'inspecting', 'tagging', 'waiting_network'].includes(task.status)
      ? { ...task, status: 'paused', resumeStatus: task.status === 'waiting_network' ? (task.resumeStatus ?? 'queued') : task.status, updatedAt: new Date().toISOString() }
      : task));
  }, []);

  const resumeBatch = useCallback((batchId: string) => {
    setTasks(previous => previous.map(task => task.batchId === batchId && task.status === 'paused'
      ? { ...task, status: isOnline ? (task.resumeStatus ?? 'queued') : 'waiting_network', resumeStatus: isOnline ? undefined : task.resumeStatus, updatedAt: new Date().toISOString() }
      : task));
  }, [isOnline]);

  const cancelBatch = useCallback((batchId: string) => {
    setTasks(previous => previous.map(task => task.batchId === batchId && task.status !== 'completed'
      ? { ...task, status: 'cancelled', progress: 0, updatedAt: new Date().toISOString() }
      : task));
  }, []);

  const discardBatch = useCallback((batchId: string) => {
    setTasks(previous => previous.filter(task => task.batchId !== batchId));
    setBatches(previous => previous.filter(batch => batch.id !== batchId));
  }, []);

  const submitBatch = useCallback((batchId: string) => {
    const batchTasks = tasksRef.current.filter(task => task.batchId === batchId);
    if (batchTasks.length === 0 || batchTasks.some(task => task.status !== 'pending_submit')) return false;
    const now = new Date().toISOString();
    setTasks(previous => previous.map(task => task.batchId === batchId
      ? { ...task, status: 'submitting', progress: 0, updatedAt: now }
      : task));
    setBatches(previous => previous.map(batch => batch.id === batchId ? { ...batch, submittedAt: now } : batch));
    return true;
  }, []);

  const updateTaskTags = useCallback((taskId: string, tags: string[]) => {
    setTasks(previous => previous.map(task => task.id === taskId ? { ...task, tags, updatedAt: new Date().toISOString() } : task));
  }, []);

  const changeBatchTarget = useCallback((batchId: string, targetFolderLabel: string) => {
    setBatches(previous => previous.map(batch => batch.id === batchId ? { ...batch, targetFolderLabel } : batch));
    setTasks(previous => previous.map(task => task.batchId === batchId ? { ...task, targetFolderLabel, updatedAt: new Date().toISOString() } : task));
  }, []);

  const clearCompleted = useCallback((direction?: 'upload' | 'download') => {
    const removedIds = new Set(tasksRef.current
      .filter(task => task.status === 'completed' && (!direction || task.direction === direction))
      .map(task => task.id));
    setTasks(previous => previous.filter(task => !removedIds.has(task.id)));
    setBatches(previous => previous.map(batch => ({ ...batch, taskIds: batch.taskIds.filter(id => !removedIds.has(id)) })).filter(batch => batch.taskIds.length > 0));
  }, []);

  const pauseAllAndPersist = useCallback(() => {
    const now = new Date().toISOString();
    const paused = tasksRef.current.map(task => ['queued', 'transferring', 'inspecting', 'tagging', 'submitting', 'waiting_network'].includes(task.status)
      ? { ...task, status: 'paused' as TransferStatus, resumeStatus: task.status === 'waiting_network' ? (task.resumeStatus ?? 'queued') : task.status, updatedAt: now }
      : task);
    localStorage.setItem(storageKey(accountId), JSON.stringify({ tasks: paused, batches } satisfies PersistedQueue));
    setTasks(paused);
  }, [accountId, batches]);

  return {
    tasks,
    batches,
    isOnline,
    enqueueDownload,
    enqueueUploadBatch,
    pauseTask,
    resumeTask,
    cancelTask,
    retryTask,
    removeTask,
    pauseBatch,
    resumeBatch,
    cancelBatch,
    discardBatch,
    submitBatch,
    updateTaskTags,
    changeBatchTarget,
    clearCompleted,
    pauseAllAndPersist
  };
}

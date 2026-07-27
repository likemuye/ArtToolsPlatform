import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FolderOpen,
  HardDrive,
  MapPin,
  RefreshCw,
  Settings,
  Trash2,
  X
} from 'lucide-react';
import { AppConfig, AppId, AppStatus, ArtAsset, DccExtension } from '../types';

interface SettingsPanelProps {
  apps: AppConfig[];
  setApps: React.Dispatch<React.SetStateAction<AppConfig[]>>;
  extensions: DccExtension[];
  setExtensions: React.Dispatch<React.SetStateAction<DccExtension[]>>;
  assets: ArtAsset[];
  downloadedAssetIds: Set<string>;
  simulatedDiskGB: number;
  setSimulatedDiskGB: React.Dispatch<React.SetStateAction<number>>;
  tempCacheMB: number;
  setTempCacheMB: React.Dispatch<React.SetStateAction<number>>;
  activeDownloadCount: number;
  theme: 'light' | 'dark';
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error', options?: { toast?: boolean }) => void;
}

type HostSoftwareId =
  | 'comfyui'
  | 'blender'
  | 'photoshop'
  | 'maya'
  | 'max3ds'
  | 'houdini'
  | 'substance_painter'
  | 'motionbuilder'
  | 'unreal_engine'
  | 'unity';

interface HostSoftwareMeta {
  id: HostSoftwareId;
  appId?: AppId;
  name: string;
  short: string;
  color: string;
  version: string;
  paths: string[];
  itManaged: boolean;
  logoSrc?: string;
  fixedPort?: number;
}

interface StoredHostConfig {
  path: string;
  version: string;
  status: 'installed_offline' | 'not_ready';
  updatedAt: string;
}

interface CacheSnapshot {
  extensionMB: number;
  assetMB: number;
  tempMB: number;
  updatedAt: number;
}

const HOST_PATH_STORAGE_KEY = 'pixgo-host-software-paths-v1';
const INVALID_PATH = 'D:\\Downloads\\未解压安装包（无效）';

const HOST_SOFTWARE: HostSoftwareMeta[] = [
  {
    id: 'comfyui', name: 'ComfyUI', short: 'CU', color: '#7c3aed', version: '0.3.44', itManaged: false, fixedPort: 8000,
    paths: ['C:\\AI\\ComfyUI', 'D:\\AI\\ComfyUI']
  },
  {
    id: 'blender', appId: AppId.Blender, name: 'Blender', short: 'B', color: '#f5792a', version: 'v4.2.0', itManaged: false, logoSrc: '/logos/blender.svg',
    paths: ['C:\\Program Files\\Blender Foundation\\Blender 4.2', 'D:\\DCC\\Blender\\4.1']
  },
  {
    id: 'photoshop', appId: AppId.Photoshop, name: 'Photoshop', short: 'Ps', color: '#31a8ff', version: '2025.2', itManaged: true, logoSrc: '/logos/photoshop.svg',
    paths: ['C:\\Program Files\\Adobe\\Adobe Photoshop 2025', 'D:\\DCC\\Adobe Photoshop 2024']
  },
  {
    id: 'maya', appId: AppId.Maya, name: 'Maya', short: 'M', color: '#00a6a6', version: '2024.1', itManaged: true, logoSrc: '/logos/maya.svg',
    paths: ['C:\\Program Files\\Autodesk\\Maya2024', 'D:\\DCC\\Autodesk\\Maya2025']
  },
  {
    id: 'max3ds', appId: AppId.Max3ds, name: '3ds Max', short: '3D', color: '#37a5cc', version: '2025.0', itManaged: true, logoSrc: '/logos/3dsmax.svg',
    paths: ['C:\\Program Files\\Autodesk\\3ds Max 2025', 'D:\\DCC\\Autodesk\\3ds Max 2024']
  },
  {
    id: 'houdini', appId: AppId.Houdini, name: 'Houdini', short: 'H', color: '#ff4713', version: '20.5', itManaged: false, logoSrc: '/logos/houdini.svg',
    paths: ['C:\\Program Files\\Side Effects Software\\Houdini 20.5', 'D:\\DCC\\SideFX\\Houdini 20.5']
  },
  {
    id: 'substance_painter', name: 'Substance Painter', short: 'SP', color: '#9acd32', version: '10.1.2', itManaged: true,
    paths: ['C:\\Program Files\\Adobe\\Adobe Substance 3D Painter', 'D:\\DCC\\Substance Painter']
  },
  {
    id: 'motionbuilder', name: 'MotionBuilder', short: 'MB', color: '#64748b', version: '2025.0', itManaged: true,
    paths: ['C:\\Program Files\\Autodesk\\MotionBuilder 2025', 'D:\\DCC\\Autodesk\\MotionBuilder 2024']
  },
  {
    id: 'unreal_engine', name: 'Unreal Engine', short: 'UE', color: '#334155', version: '5.5.1', itManaged: true,
    paths: ['C:\\Program Files\\Epic Games\\UE_5.5', 'D:\\Epic Games\\UE_5.4']
  },
  {
    id: 'unity', name: 'Unity', short: 'U', color: '#2563eb', version: '6000.0.32f1', itManaged: true,
    paths: ['C:\\Program Files\\Unity\\Hub\\Editor\\6000.0.32f1', 'D:\\Unity\\Editor\\2022.3.50f1']
  }
];

const readStoredHostConfigs = (): Partial<Record<HostSoftwareId, StoredHostConfig>> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOST_PATH_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const isInvalidPath = (path: string) => {
  const normalized = path.trim();
  return !/^[a-z]:\\/i.test(normalized) || /无效|missing|未解压|安装包/i.test(normalized);
};

const formatSize = (sizeMB: number) => sizeMB >= 1024
  ? `${(sizeMB / 1024).toFixed(2)} GB`
  : `${sizeMB.toFixed(0)} MB`;

export default function SettingsPanel({
  apps,
  setApps,
  extensions,
  setExtensions,
  assets,
  downloadedAssetIds,
  simulatedDiskGB,
  setSimulatedDiskGB,
  tempCacheMB,
  setTempCacheMB,
  activeDownloadCount,
  theme,
  addLog
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'hosts' | 'cache'>('hosts');
  const [pathHostId, setPathHostId] = useState<HostSoftwareId | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [pathError, setPathError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [hostConfigs, setHostConfigs] = useState<Partial<Record<HostSoftwareId, StoredHostConfig>>>(readStoredHostConfigs);
  const isLight = theme === 'light';

  const extensionCacheMB = useMemo(() => extensions
    .filter(extension => extension.lifecycle !== 'not_downloaded')
    .reduce((sum, extension) => sum + extension.fileSizeMB, 0), [extensions]);

  const installedExtensionCount = useMemo(() => extensions
    .filter(extension => extension.lifecycle !== 'not_downloaded').length, [extensions]);

  const downloadedAssetsMB = useMemo(() => assets
    .filter(asset => downloadedAssetIds.has(asset.id))
    .reduce((sum, asset) => sum + asset.sizeMB, 0), [assets, downloadedAssetIds]);

  const [cacheSnapshot, setCacheSnapshot] = useState<CacheSnapshot>(() => ({
    extensionMB: extensionCacheMB,
    assetMB: downloadedAssetsMB,
    tempMB: tempCacheMB,
    updatedAt: Date.now()
  }));

  const protectedTempMB = Math.min(tempCacheMB, activeDownloadCount * 64);
  const clearableTempMB = Math.max(0, tempCacheMB - protectedTempMB);
  const clearableToolCacheMB = extensionCacheMB + clearableTempMB;
  const totalCacheMB = cacheSnapshot.extensionMB + cacheSnapshot.assetMB + cacheSnapshot.tempMB;
  const usedDiskPercent = Math.min(100, totalCacheMB / Math.max(1, simulatedDiskGB * 1024) * 100);
  const pathHost = HOST_SOFTWARE.find(host => host.id === pathHostId) ?? null;

  const getHostState = (host: HostSoftwareMeta) => {
    const linkedApp = host.appId ? apps.find(app => app.id === host.appId) : undefined;
    const stored = hostConfigs[host.id];
    const path = linkedApp?.installPath ?? stored?.path ?? '';
    const invalid = Boolean(path) && isInvalidPath(path);
    const statusAllowsReady = linkedApp
      ? linkedApp.status !== AppStatus.NotReady
      : stored?.status === 'installed_offline';
    const ready = Boolean(path) && !invalid && statusAllowsReady;
    const version = linkedApp?.version || stored?.version || host.version;
    const statusLabel = ready
      ? (linkedApp?.status === AppStatus.InstalledOffline || stored?.status === 'installed_offline' ? '已安装·离线' : '已检测')
      : '未就绪';
    return { linkedApp, path, invalid, ready, version, statusLabel };
  };

  const refreshCacheSnapshot = () => {
    setCacheSnapshot({
      extensionMB: extensionCacheMB,
      assetMB: downloadedAssetsMB,
      tempMB: tempCacheMB,
      updatedAt: Date.now()
    });
  };

  useEffect(() => {
    localStorage.setItem(HOST_PATH_STORAGE_KEY, JSON.stringify(hostConfigs));
  }, [hostConfigs]);

  useEffect(() => {
    setApps(previous => {
      let changed = false;
      const next = previous.map(app => {
        if (app.installPath && isInvalidPath(app.installPath) && app.status !== AppStatus.NotReady) {
          changed = true;
          return { ...app, status: AppStatus.NotReady };
        }
        return app;
      });
      return changed ? next : previous;
    });
    setHostConfigs(previous => {
      let changed = false;
      const next = { ...previous };
      Object.entries(previous).forEach(([id, config]) => {
        if (config && isInvalidPath(config.path) && config.status !== 'not_ready') {
          next[id as HostSoftwareId] = { ...config, status: 'not_ready' };
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [setApps]);

  useEffect(() => {
    refreshCacheSnapshot();
    const timer = window.setInterval(refreshCacheSnapshot, 30_000);
    return () => window.clearInterval(timer);
  }, [extensionCacheMB, downloadedAssetsMB, tempCacheMB]);

  const hostReadyCount = HOST_SOFTWARE.filter(host => getHostState(host).ready).length;

  const openPathDialog = (host: HostSoftwareMeta) => {
    setPathHostId(host.id);
    setSelectedPath(getHostState(host).path);
    setPathError('');
  };

  const closePathDialog = () => {
    setPathHostId(null);
    setSelectedPath('');
    setPathError('');
  };

  const savePath = () => {
    if (!pathHost || !selectedPath.trim()) {
      setPathError('请选择或输入安装目录');
      return;
    }
    const normalizedPath = selectedPath.trim().replace(/[\\/]+$/, '');
    if (isInvalidPath(normalizedPath)) {
      setPathError('路径无效，请重新选择');
      addLog(`${pathHost.name} 路径校验失败，未找到有效的主程序可执行文件。`, 'error');
      return;
    }

    if (pathHost.appId) {
      setApps(previous => previous.map(app => app.id === pathHost.appId ? {
        ...app,
        installPath: normalizedPath,
        version: pathHost.version,
        status: AppStatus.InstalledOffline
      } : app));
    } else {
      setHostConfigs(previous => ({
        ...previous,
        [pathHost.id]: {
          path: normalizedPath,
          version: pathHost.version,
          status: 'installed_offline',
          updatedAt: new Date().toISOString()
        }
      }));
    }

    addLog(`${pathHost.name} 安装路径已保存并通过校验，状态更新为“已安装·离线”。`, 'success');
    closePathDialog();
  };

  const revalidatePath = (host: HostSoftwareMeta) => {
    const state = getHostState(host);
    if (!state.path || isInvalidPath(state.path)) {
      if (host.appId) {
        setApps(previous => previous.map(app => app.id === host.appId ? { ...app, status: AppStatus.NotReady } : app));
      } else if (hostConfigs[host.id]) {
        setHostConfigs(previous => ({
          ...previous,
          [host.id]: { ...previous[host.id]!, status: 'not_ready' }
        }));
      }
      addLog(`${host.name} 已保存路径失效，请重新设置${host.itManaged ? '或联系 IT' : ''}。`, 'error');
      return;
    }
    addLog(`${host.name} 路径校验通过：${state.path}`, 'success');
  };

  const openFolder = (label: string, path: string) => {
    addLog(`在资源管理器中定位 ${label}：${path}`, 'info');
    window.alert(`[仿真资源管理器]\n已定位到 ${label}\n\n${path}`);
  };

  const clearToolCache = () => {
    const releasedMB = extensionCacheMB + clearableTempMB;
    setExtensions(previous => previous.map(extension => extension.lifecycle === 'not_downloaded' ? extension : {
      ...extension,
      lifecycle: 'not_downloaded',
      isActivated: false
    }));
    setTempCacheMB(protectedTempMB);
    setSimulatedDiskGB(previous => Math.min(256, previous + releasedMB / 1024));
    setCacheSnapshot({
      extensionMB: 0,
      assetMB: downloadedAssetsMB,
      tempMB: protectedTempMB,
      updatedAt: Date.now()
    });
    setShowClearConfirm(false);

    const protectedMessage = protectedTempMB > 0 ? `；${protectedTempMB.toFixed(0)} MB 下载断点文件已保留` : '';
    addLog(`已清空 ${installedExtensionCount} 个工具拓展缓存与 ${clearableTempMB.toFixed(0)} MB 临时文件${protectedMessage}。`, 'success');
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto font-sans">
      <div className="mx-auto w-full max-w-7xl p-6 max-md:p-4">
        <header className="mb-5">
          <h1 className={`flex items-center gap-2 text-lg font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>
            <Settings size={18} className={isLight ? 'text-emerald-600' : 'text-[#00ff00]'} />设置
          </h1>
          <p className="mt-1 text-[11px] text-zinc-500">宿主软件位置与本地文件占用</p>
        </header>

        <div role="tablist" aria-label="设置分类" className={`mb-5 inline-flex h-9 rounded border p-1 ${isLight ? 'border-slate-200 bg-white' : 'border-zinc-800 bg-[#0c0c0e]'}`}>
          <button type="button" role="tab" aria-selected={activeTab === 'hosts'} onClick={() => setActiveTab('hosts')} className={`flex items-center gap-1.5 rounded px-4 text-[11px] font-medium ${activeTab === 'hosts' ? (isLight ? 'bg-slate-950 text-white force-text-white' : 'bg-white text-black') : (isLight ? 'text-slate-500 hover:text-slate-900' : 'text-zinc-500 hover:text-zinc-300')}`}><MapPin size={12} />宿主软件位置</button>
          <button type="button" role="tab" aria-selected={activeTab === 'cache'} onClick={() => { setActiveTab('cache'); refreshCacheSnapshot(); }} className={`flex items-center gap-1.5 rounded px-4 text-[11px] font-medium ${activeTab === 'cache' ? (isLight ? 'bg-slate-950 text-white force-text-white' : 'bg-white text-black') : (isLight ? 'text-slate-500 hover:text-slate-900' : 'text-zinc-500 hover:text-zinc-300')}`}><HardDrive size={12} />本地缓存</button>
        </div>

        {activeTab === 'hosts' ? (
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>安装路径</h2>
                <p className="mt-1 text-[10px] text-zinc-500">手动补充自动检测失败的宿主软件目录</p>
              </div>
              <span className="text-[9px] font-mono text-zinc-500">{hostReadyCount}/{HOST_SOFTWARE.length} 已就绪</span>
            </div>

            <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
              {HOST_SOFTWARE.map(host => {
                const state = getHostState(host);
                const issueText = state.invalid
                  ? `已保存路径失效，请重新设置${host.itManaged ? '或联系 IT' : ''}`
                  : host.itManaged
                    ? '未检测到安装目录，可手动设置或联系 IT'
                    : '未检测到安装目录，请手动设置路径';
                return (
                  <article key={host.id} data-testid={`host-card-${host.id}`} className={`flex min-h-[112px] items-center gap-3.5 rounded border p-4 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border text-xs font-bold" style={{ color: host.color, borderColor: `${host.color}55`, backgroundColor: `${host.color}12` }}>
                      <span>{host.short}</span>
                      {host.logoSrc && <img src={host.logoSrc} alt={`${host.name} logo`} className="absolute inset-0 h-full w-full object-contain p-2.5" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-[12px] font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{host.name}</h3>
                        <span className={`inline-flex items-center gap-1 text-[9px] font-mono ${state.ready ? (isLight ? 'text-emerald-700' : 'text-emerald-400') : (state.invalid ? 'text-red-500' : 'text-zinc-500')}`}>
                          {state.ready ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}{state.statusLabel}
                        </span>
                        {host.fixedPort && <span className={`rounded border px-1.5 py-0.5 text-[8px] font-mono ${isLight ? 'border-slate-200 text-slate-500' : 'border-zinc-800 text-zinc-500'}`}>端口 {host.fixedPort}</span>}
                      </div>
                      {state.ready ? (
                        <p className="mt-1.5 truncate text-[9.5px] font-mono text-zinc-500" title={state.path}>{state.path}</p>
                      ) : (
                        <p className={`mt-1.5 text-[9.5px] ${state.invalid ? 'text-red-500' : 'text-zinc-500'}`}>{issueText}</p>
                      )}
                      {state.ready && <p className="mt-1 text-[9px] font-mono text-zinc-500">版本 {state.version}</p>}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      {state.ready && (
                        <button type="button" title="重新校验路径" onClick={() => revalidatePath(host)} className={`inline-flex h-8 w-8 items-center justify-center rounded border ${isLight ? 'border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700' : 'border-zinc-700 text-zinc-500 hover:text-zinc-200'}`}><RefreshCw size={12} /></button>
                      )}
                      <button type="button" data-testid={`host-path-${host.id}`} onClick={() => openPathDialog(host)} className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-[10px] font-medium ${state.ready ? (isLight ? 'border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200') : (isLight ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10')}`}><FolderOpen size={12} />{state.ready ? '重新指定' : '手动设置路径'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-[minmax(0,1fr)_300px] gap-5 max-lg:grid-cols-1">
            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>文件占用</h2>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500"><Clock3 size={10} />约 30 秒刷新 · {new Date(cacheSnapshot.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}</p>
                </div>
                <button type="button" title="立即刷新" onClick={refreshCacheSnapshot} className={`inline-flex h-8 w-8 items-center justify-center rounded border ${isLight ? 'border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700' : 'border-zinc-700 text-zinc-500 hover:text-zinc-200'}`}><RefreshCw size={12} /></button>
              </div>

              <div className={`overflow-hidden rounded border ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
                <CacheRow title="拓展文件" path="C:\\PixGo\\extensions" sizeMB={cacheSnapshot.extensionMB} detail={`${installedExtensionCount} 个本地工具`} onOpen={() => openFolder('拓展文件', 'C:\\PixGo\\extensions')} isLight={isLight} />
                <CacheRow title="素材文件" path="C:\\PixGo\\downloads" sizeMB={cacheSnapshot.assetMB} detail={`${downloadedAssetIds.size} 个已下载素材`} onOpen={() => openFolder('素材文件', 'C:\\PixGo\\downloads')} isLight={isLight} />
                <CacheRow title="临时文件" path="C:\\PixGo\\temp" sizeMB={cacheSnapshot.tempMB} detail={activeDownloadCount > 0 ? `${activeDownloadCount} 个下载任务受保护` : '下载断点与中间文件'} protectedCount={activeDownloadCount} onOpen={() => openFolder('临时文件', 'C:\\PixGo\\temp')} isLight={isLight} />
              </div>
            </div>

            <aside className={`h-fit rounded border p-4 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
              <div className="flex items-center justify-between"><span className="text-[10px] text-zinc-500">缓存合计</span><HardDrive size={14} className="text-zinc-500" /></div>
              <p className={`mt-2 text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatSize(totalCacheMB)}</p>
              <div className={`mt-4 h-2 overflow-hidden rounded-full ${isLight ? 'bg-slate-200' : 'bg-zinc-800'}`}><div className="h-full bg-emerald-400" style={{ width: `${usedDiskPercent}%` }} /></div>
              <div className="mt-2 flex justify-between text-[9px] font-mono text-zinc-500"><span>当前缓存</span><span>可用 {simulatedDiskGB.toFixed(1)} GB</span></div>
              <button type="button" data-testid="clear-tool-cache" disabled={clearableToolCacheMB === 0} onClick={() => setShowClearConfirm(true)} className={`mt-5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded text-[10px] font-semibold transition-colors ${isLight ? 'bg-slate-950 text-white force-text-white hover:bg-slate-800' : 'bg-white text-black hover:bg-zinc-200'} disabled:cursor-not-allowed disabled:opacity-35`}><Trash2 size={12} />一键清理缓存</button>
              {activeDownloadCount > 0 && <div className={`mt-3 flex items-start gap-2 rounded border p-2.5 text-[9px] leading-4 ${isLight ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-sky-500/25 bg-sky-500/5 text-sky-300'}`}><RefreshCw size={11} className="mt-0.5 shrink-0 animate-spin" />正在下载的 {protectedTempMB.toFixed(0)} MB 临时文件不会被清理</div>}
            </aside>
          </section>
        )}
      </div>

      {pathHost && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) closePathDialog(); }}>
          <div className={`w-full max-w-xl rounded border p-5 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className={`text-base font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>设置 {pathHost.name} 路径</h3><p className="mt-1 text-[10px] text-zinc-500">选择包含主程序可执行文件的安装目录</p></div>
              <button type="button" title="关闭" onClick={closePathDialog} className={isLight ? 'text-slate-400 hover:text-slate-900' : 'text-zinc-500 hover:text-zinc-200'}><X size={16} /></button>
            </div>

            <div className="mt-5 space-y-2">
              {[...pathHost.paths, INVALID_PATH].map(path => {
                const invalid = path === INVALID_PATH;
                const selected = selectedPath === path;
                return (
                  <button key={path} type="button" data-testid={invalid ? 'host-path-invalid-option' : undefined} onClick={() => { setSelectedPath(path); setPathError(''); }} className={`flex w-full items-center gap-2 rounded border p-3 text-left text-[10px] font-mono transition-colors ${selected ? (invalid ? (isLight ? 'border-red-300 bg-red-50 text-red-700' : 'border-red-500/60 bg-red-500/5 text-red-300') : (isLight ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-[#00ff00]/70 bg-[#00ff00]/5 text-zinc-200')) : (isLight ? 'border-slate-200 text-slate-600 hover:border-emerald-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600')}`}>
                    <FolderOpen size={13} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{path}</span>{selected && <ChevronRight size={12} className="shrink-0" />}
                  </button>
                );
              })}
            </div>

            <label className="mt-4 block"><span className="mb-1.5 block text-[9px] text-zinc-500">自定义路径</span><input value={selectedPath} onChange={event => { setSelectedPath(event.target.value); setPathError(''); }} placeholder="C:\\Program Files\\..." className={`h-9 w-full rounded border px-3 text-[10px] font-mono outline-none ${isLight ? 'border-slate-200 bg-slate-50 text-slate-900 focus:border-emerald-500' : 'border-zinc-800 bg-black text-zinc-200 focus:border-[#00ff00]'}`} /></label>
            {pathHost.fixedPort && <div className={`mt-3 flex items-center justify-between rounded border px-3 py-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-zinc-800 bg-black/20'}`}><span className="text-[9px] text-zinc-500">服务端口</span><span className="text-[10px] font-mono text-zinc-500">{pathHost.fixedPort} · V1 固定</span></div>}
            {pathError && <p className="mt-2 flex items-center gap-1 text-[10px] text-red-500"><AlertCircle size={11} />{pathError}</p>}
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={closePathDialog} className={`h-8 rounded border px-3 text-[10px] ${isLight ? 'border-slate-200 text-slate-600 hover:text-slate-900' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>取消</button><button type="button" data-testid="save-host-path" onClick={savePath} className={`h-8 rounded px-4 text-[10px] font-bold ${isLight ? 'bg-slate-950 text-white force-text-white hover:bg-slate-800' : 'bg-[#00ff00] text-black hover:bg-[#35ff35]'}`}>校验并保存</button></div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setShowClearConfirm(false); }}>
          <div className={`w-full max-w-md rounded border p-5 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${isLight ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}><Trash2 size={16} /></div>
              <div><h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>清空工具拓展缓存？</h3><p className="mt-2 text-[11px] leading-5 text-zinc-500">将清空本地所有工具拓展缓存（含已下载拓展及临时文件），清理后这些拓展需重新下载。是否继续？{activeDownloadCount > 0 ? ` 正在下载的 ${protectedTempMB.toFixed(0)} MB 断点文件将保留。` : ''}</p></div>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowClearConfirm(false)} className={`h-8 rounded border px-3 text-[10px] ${isLight ? 'border-slate-200 text-slate-600 hover:text-slate-900' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>取消</button><button type="button" onClick={clearToolCache} className="h-8 rounded bg-red-600 px-4 text-[10px] font-semibold text-white hover:bg-red-500">确认清理</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function CacheRow({ title, path, sizeMB, detail, onOpen, isLight, protectedCount = 0 }: { title: string; path: string; sizeMB: number; detail: string; onOpen: () => void; isLight: boolean; protectedCount?: number }) {
  return (
    <div className={`flex min-h-[78px] items-center gap-4 border-b px-4 py-3 last:border-b-0 max-md:flex-wrap ${isLight ? 'border-slate-100' : 'border-zinc-800/70'}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-zinc-500/10 text-zinc-500'}`}><FolderOpen size={14} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><h3 className={`text-[11px] font-semibold ${isLight ? 'text-slate-800' : 'text-zinc-300'}`}>{title}</h3>{protectedCount > 0 && <span className={`rounded px-1.5 py-0.5 text-[8px] ${isLight ? 'bg-sky-50 text-sky-700' : 'bg-sky-500/10 text-sky-400'}`}>保护中</span>}</div>
        <p className="mt-1 truncate text-[9px] font-mono text-zinc-500">{path}</p>
        <p className="mt-1 text-[8.5px] text-zinc-500">{detail}</p>
      </div>
      <span className={`shrink-0 text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{formatSize(sizeMB)}</span>
      <button type="button" onClick={onOpen} title="跳转文件夹" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border ${isLight ? 'border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700' : 'border-zinc-700 text-zinc-500 hover:text-zinc-200'}`}><FolderOpen size={12} /></button>
    </div>
  );
}

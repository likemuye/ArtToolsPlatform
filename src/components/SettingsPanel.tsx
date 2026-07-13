import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
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

const DCC_ORDER = [AppId.Photoshop, AppId.Maya, AppId.Max3ds, AppId.Blender, AppId.Houdini];

const DCC_META: Record<AppId, { short: string; color: string; commercial: boolean; version: string; paths: string[] }> = {
  [AppId.Photoshop]: {
    short: 'Ps', color: '#31a8ff', commercial: true, version: '2025.2',
    paths: ['C:\\Program Files\\Adobe\\Adobe Photoshop 2025', 'D:\\DCC\\Adobe Photoshop 2024']
  },
  [AppId.Maya]: {
    short: 'M', color: '#00a6a6', commercial: true, version: '2024.1',
    paths: ['C:\\Program Files\\Autodesk\\Maya2024', 'D:\\DCC\\Autodesk\\Maya2025']
  },
  [AppId.Max3ds]: {
    short: '3D', color: '#37a5cc', commercial: true, version: '2025.0',
    paths: ['C:\\Program Files\\Autodesk\\3ds Max 2025', 'D:\\DCC\\Autodesk\\3ds Max 2024']
  },
  [AppId.Blender]: {
    short: 'B', color: '#f5792a', commercial: false, version: 'v4.2.0',
    paths: ['C:\\Program Files\\Blender Foundation\\Blender 4.2', 'D:\\DCC\\Blender\\4.1']
  },
  [AppId.Houdini]: {
    short: 'H', color: '#ff4713', commercial: false, version: '20.5',
    paths: ['C:\\Program Files\\Side Effects Software\\Houdini 20.5', 'D:\\DCC\\SideFX\\Houdini 20.5']
  }
};

const INVALID_PATH = 'D:\\Downloads\\未解压安装包（无效）';

export default function SettingsPanel({
  apps,
  setApps,
  extensions,
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
  const [activeTab, setActiveTab] = useState<'dcc' | 'cache'>('dcc');
  const [pathApp, setPathApp] = useState<AppConfig | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [pathError, setPathError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const isLight = theme === 'light';

  const extensionCacheMB = useMemo(() => extensions
    .filter(extension => extension.lifecycle !== 'not_downloaded')
    .reduce((sum, extension) => sum + extension.fileSizeMB, 0), [extensions]);

  const downloadedAssetsMB = useMemo(() => assets
    .filter(asset => downloadedAssetIds.has(asset.id))
    .reduce((sum, asset) => sum + asset.sizeMB, 0), [assets, downloadedAssetIds]);

  const totalCacheMB = extensionCacheMB + downloadedAssetsMB + tempCacheMB;
  const usedDiskPercent = Math.min(100, totalCacheMB / Math.max(1, simulatedDiskGB * 1024) * 100);

  const openPathDialog = (app: AppConfig) => {
    setPathApp(app);
    setSelectedPath(app.installPath ?? '');
    setPathError('');
  };

  const savePath = () => {
    if (!pathApp || !selectedPath.trim()) {
      setPathError('请选择或输入安装目录');
      return;
    }
    if (selectedPath === INVALID_PATH || selectedPath.includes('无效')) {
      setPathError('路径无效，请重新选择');
      addLog(`${pathApp.name} 路径校验失败，未找到有效的主程序可执行文件。`, 'error');
      return;
    }
    const meta = DCC_META[pathApp.id];
    setApps(previous => previous.map(app => app.id === pathApp.id ? {
      ...app,
      installPath: selectedPath.trim(),
      version: meta.version,
      status: AppStatus.InstalledOffline
    } : app));
    addLog(`${pathApp.name} 安装路径已保存并通过校验，状态更新为“已安装·离线”。`, 'success');
    setPathApp(null);
    setSelectedPath('');
    setPathError('');
  };

  const revalidatePath = (app: AppConfig) => {
    if (!app.installPath || app.installPath.includes('missing')) {
      setApps(previous => previous.map(item => item.id === app.id ? { ...item, status: AppStatus.NotReady } : item));
      addLog(`${app.name} 已保存路径失效，请重新设置${DCC_META[app.id].commercial ? '或联系 IT' : ''}。`, 'error');
      return;
    }
    addLog(`${app.name} 路径校验通过：${app.installPath}`, 'success');
  };

  const openFolder = (label: string, path: string) => {
    addLog(`在资源管理器中定位 ${label}：${path}`, 'info');
    window.alert(`[仿真资源管理器]\n已定位到 ${label}\n\n${path}`);
  };

  const clearTempCache = () => {
    const protectedMB = Math.min(tempCacheMB, activeDownloadCount * 64);
    const cleanedMB = Math.max(0, tempCacheMB - protectedMB);
    setTempCacheMB(protectedMB);
    setSimulatedDiskGB(previous => Math.min(256, previous + cleanedMB / 1024));
    setShowClearConfirm(false);
    if (protectedMB > 0) {
      addLog(`已清理 ${cleanedMB.toFixed(0)} MB 临时文件；${protectedMB.toFixed(0)} MB 下载断点受保护。`, 'success');
    } else {
      addLog(`临时文件清理完成，已释放 ${cleanedMB.toFixed(0)} MB。`, 'success');
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto font-sans">
      <div className="mx-auto w-full max-w-6xl p-6 max-md:p-4">
        <header className="mb-5">
          <h1 className={`flex items-center gap-2 text-lg font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}><Settings size={18} className={isLight ? 'text-emerald-600' : 'text-[#00ff00]'} />设置</h1>
          <p className="mt-1 text-[11px] text-zinc-500">本机 DCC 环境与存储</p>
        </header>

        <div className={`mb-5 inline-flex h-9 rounded border p-1 ${isLight ? 'border-slate-200 bg-white' : 'border-zinc-800 bg-[#0c0c0e]'}`}>
          <button type="button" onClick={() => setActiveTab('dcc')} className={`flex items-center gap-1.5 rounded px-4 text-[11px] font-medium ${activeTab === 'dcc' ? (isLight ? 'bg-slate-100 text-slate-900' : 'bg-zinc-800 text-white') : 'text-zinc-500 hover:text-zinc-300'}`}><MapPin size={12} />DCC 软件位置</button>
          <button type="button" onClick={() => setActiveTab('cache')} className={`flex items-center gap-1.5 rounded px-4 text-[11px] font-medium ${activeTab === 'cache' ? (isLight ? 'bg-slate-100 text-slate-900' : 'bg-zinc-800 text-white') : 'text-zinc-500 hover:text-zinc-300'}`}><HardDrive size={12} />本地缓存</button>
        </div>

        {activeTab === 'dcc' ? (
          <section>
            <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>软件安装目录</h2><p className="mt-1 text-[10px] text-zinc-500">5 个 DCC 的检测结果与手动路径</p></div><span className="text-[9px] font-mono text-zinc-500">{apps.filter(app => app.status !== AppStatus.NotReady).length}/5 已就绪</span></div>
            <div className="space-y-2">
              {DCC_ORDER.map(appId => {
                const app = apps.find(item => item.id === appId);
                if (!app) return null;
                const meta = DCC_META[appId];
                const ready = app.status !== AppStatus.NotReady && Boolean(app.installPath);
                return (
                  <article key={app.id} className={`flex items-center gap-4 rounded border p-4 max-md:flex-wrap ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border text-xs font-bold" style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}12` }}>{meta.short}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h3 className={`text-[12px] font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{app.name}</h3><span className={`inline-flex items-center gap-1 text-[9px] font-mono ${ready ? 'text-emerald-400' : 'text-red-400'}`}>{ready ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}{ready ? '已检测' : '未就绪'}</span></div>
                      {ready ? <p className="mt-1 truncate text-[10px] font-mono text-zinc-500" title={app.installPath}>{app.installPath} · {app.version}</p> : <p className="mt-1 text-[10px] text-zinc-500">{meta.commercial ? '未找到安装，请联系 IT 或手动设置路径' : '请手动设置安装路径'}</p>}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {ready && <button type="button" title="重新校验路径" onClick={() => revalidatePath(app)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-500 hover:text-zinc-200"><RefreshCw size={12} /></button>}
                      <button type="button" onClick={() => openPathDialog(app)} className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-[10px] font-medium ${ready ? 'border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10'}`}><FolderOpen size={12} />{ready ? '重新指定' : '设置路径'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-[minmax(0,1fr)_280px] gap-5 max-lg:grid-cols-1">
            <div>
              <div className="mb-3"><h2 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>缓存占用</h2><p className="mt-1 text-[10px] text-zinc-500">统计约每 30 秒刷新</p></div>
              <div className={`overflow-hidden rounded border ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
                <CacheRow title="工具拓展" path="C:\\PixGo\\extensions" sizeMB={extensionCacheMB} onOpen={() => openFolder('工具拓展', 'C:\\PixGo\\extensions')} />
                <CacheRow title="素材文件" path="C:\\PixGo\\downloads" sizeMB={downloadedAssetsMB} onOpen={() => openFolder('素材文件', 'C:\\PixGo\\downloads')} />
                <CacheRow title="临时文件" path="C:\\PixGo\\temp" sizeMB={tempCacheMB} protectedCount={activeDownloadCount} onOpen={() => openFolder('临时文件', 'C:\\PixGo\\temp')} action={<button type="button" disabled={tempCacheMB === 0} onClick={() => setShowClearConfirm(true)} className="inline-flex h-7 items-center gap-1 rounded border border-red-500/40 px-2 text-[9px] text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 size={10} />清理</button>} />
              </div>
            </div>
            <aside className={`h-fit rounded border p-4 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
              <div className="flex items-center justify-between"><span className="text-[10px] text-zinc-500">缓存合计</span><HardDrive size={14} className="text-zinc-500" /></div>
              <p className={`mt-2 text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{totalCacheMB >= 1024 ? `${(totalCacheMB / 1024).toFixed(2)} GB` : `${totalCacheMB.toFixed(0)} MB`}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-emerald-400" style={{ width: `${usedDiskPercent}%` }} /></div>
              <div className="mt-2 flex justify-between text-[9px] font-mono text-zinc-500"><span>当前缓存</span><span>可用 {simulatedDiskGB.toFixed(1)} GB</span></div>
              {activeDownloadCount > 0 && <div className="mt-4 flex items-start gap-2 rounded border border-sky-500/25 bg-sky-500/5 p-2.5 text-[9px] leading-4 text-sky-300"><RefreshCw size={11} className="mt-0.5 shrink-0 animate-spin" />{activeDownloadCount} 个下载任务的临时文件受保护</div>}
            </aside>
          </section>
        )}
      </div>

      {pathApp && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setPathApp(null); }}>
          <div className={`w-full max-w-xl rounded border p-5 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <div className="flex items-start justify-between gap-3"><div><h3 className={`text-base font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>设置 {pathApp.name} 路径</h3><p className="mt-1 text-[10px] text-zinc-500">选择包含主程序可执行文件的安装目录</p></div><button type="button" title="关闭" onClick={() => setPathApp(null)} className="text-zinc-500 hover:text-zinc-200"><X size={16} /></button></div>
            <div className="mt-5 space-y-2">
              {[...DCC_META[pathApp.id].paths, INVALID_PATH].map(path => {
                const invalid = path === INVALID_PATH;
                return <button key={path} type="button" onClick={() => { setSelectedPath(path); setPathError(''); }} className={`flex w-full items-center gap-2 rounded border p-3 text-left text-[10px] font-mono transition-colors ${selectedPath === path ? (invalid ? 'border-red-500/60 bg-red-500/5 text-red-300' : 'border-[#00ff00]/70 bg-[#00ff00]/5 text-zinc-200') : (isLight ? 'border-slate-200 text-slate-600 hover:border-slate-400' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600')}`}><FolderOpen size={13} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{path}</span>{selectedPath === path && <ChevronRight size={12} className="shrink-0" />}</button>;
              })}
            </div>
            <label className="mt-4 block"><span className="mb-1.5 block text-[9px] text-zinc-500">自定义路径</span><input value={selectedPath} onChange={event => { setSelectedPath(event.target.value); setPathError(''); }} className={`h-9 w-full rounded border px-3 text-[10px] font-mono outline-none ${isLight ? 'border-slate-200 bg-slate-50 text-slate-900 focus:border-emerald-500' : 'border-zinc-800 bg-black text-zinc-200 focus:border-[#00ff00]'}`} /></label>
            {pathError && <p className="mt-2 flex items-center gap-1 text-[10px] text-red-400"><AlertCircle size={11} />{pathError}</p>}
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setPathApp(null)} className="h-8 rounded border border-zinc-700 px-3 text-[10px] text-zinc-400 hover:text-white">取消</button><button type="button" onClick={savePath} className="h-8 rounded bg-[#00ff00] px-4 text-[10px] font-bold text-black hover:bg-[#35ff35]">校验并保存</button></div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded border border-[#27272a] bg-[#0c0c0e] p-5"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-red-500/30 bg-red-500/10 text-red-400"><Trash2 size={16} /></div><div><h3 className="text-sm font-bold text-white">清理临时文件？</h3><p className="mt-2 text-[11px] leading-5 text-zinc-400">将清理 {tempCacheMB.toFixed(0)} MB 下载缓存和中间文件，不影响已安装工具与素材。{activeDownloadCount > 0 ? ` ${activeDownloadCount} 个进行中任务的断点文件会被保留。` : ''}</p></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowClearConfirm(false)} className="h-8 rounded border border-zinc-700 px-3 text-[10px] text-zinc-400">取消</button><button type="button" onClick={clearTempCache} className="h-8 rounded bg-red-600 px-4 text-[10px] font-semibold text-white hover:bg-red-500">确认清理</button></div></div>
        </div>
      )}
    </div>
  );
}

function CacheRow({ title, path, sizeMB, onOpen, action, protectedCount = 0 }: { title: string; path: string; sizeMB: number; onOpen: () => void; action?: React.ReactNode; protectedCount?: number }) {
  return <div className="flex min-h-[74px] items-center gap-4 border-b border-zinc-800/70 px-4 py-3 last:border-b-0 max-md:flex-wrap"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-500/10 text-zinc-500"><FolderOpen size={14} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="text-[11px] font-semibold text-zinc-300">{title}</h3>{protectedCount > 0 && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[8px] text-sky-400">保护中</span>}</div><p className="mt-1 truncate text-[9px] font-mono text-zinc-600">{path}</p></div><span className="shrink-0 text-[11px] font-mono text-zinc-400">{sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(2)} GB` : `${sizeMB.toFixed(0)} MB`}</span><div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={onOpen} title="打开文件夹" className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-700 text-zinc-500 hover:text-zinc-200"><FolderOpen size={11} /></button>{action}</div></div>;
}

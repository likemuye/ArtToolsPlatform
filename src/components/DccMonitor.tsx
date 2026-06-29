import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  RotateCw,
  Play,
  AlertCircle,
  Folder,
  CheckCircle2,
  X
} from 'lucide-react';
import { AppId, AppStatus, AppConfig } from '../types';

// Per-DCC brand identity for the list lettermark.
const DCC_LOGO: Record<string, { label: string; color: string }> = {
  [AppId.Blender]: { label: 'B', color: '#E87D0D' },
  [AppId.Maya]: { label: 'M', color: '#00939C' },
  [AppId.Max3ds]: { label: '3', color: '#37A5CC' },
  [AppId.Houdini]: { label: 'H', color: '#FF4713' }
};
const DEFAULT_DCC_LOGO = { label: 'D', color: '#71717a' };

interface DccMonitorProps {
  apps: AppConfig[];
  setApps: React.Dispatch<React.SetStateAction<AppConfig[]>>;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error', options?: { toast?: boolean }) => void;
  theme: 'light' | 'dark';
  isCollapsed: boolean;
}

export default function DccMonitor({ apps, setApps, addLog, theme, isCollapsed }: DccMonitorProps) {
  const [open, setOpen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [pathSetupApp, setPathSetupApp] = useState<AppConfig | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [pathError, setPathError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Simulated path discovery for 设置路径 flow (last entry intentionally invalid).
  const simulatedFolders = [
    'C:\\Program Files\\Side Effects Software\\Houdini 20.5',
    'D:\\Creative\\SideFX\\Houdini_20',
    'E:\\StudioDCC\\Houdini205',
    'D:\\Downloads\\未解压安装包 (无效)'
  ];
  const INVALID_FOLDER_PATHS = new Set(['D:\\Downloads\\未解压安装包 (无效)']);

  // Close popup on outside click.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const connectedCount = apps.filter(a => a.status === AppStatus.Connected).length;
  const offlineCount = apps.filter(a => a.status === AppStatus.InstalledOffline || a.status === AppStatus.Connecting).length;
  const downCount = apps.filter(a => a.status === AppStatus.NotReady || a.status === AppStatus.ConnectionFailed).length;
  const totalCount = apps.length;

  // Re-detect all DCC states (header refresh): briefly flips into a scanning state.
  const refreshDetection = () => {
    if (isDetecting) return;
    setIsDetecting(true);
    addLog('🔍 正在后台重新检测全部 DCC 软件的连接状态...', 'info', { toast: false });
    setTimeout(() => {
      setIsDetecting(false);
      addLog('✅ DCC 环境检测完成，已刷新各软件连接状态。', 'success');
    }, 1500);
  };

  const launchApp = (app: AppConfig) => {
    addLog(`🚀 正在呼叫进程并检测 ${app.name} 端口响应中...`, 'info', { toast: false });
    setApps(prev => prev.map(a => (a.id === app.id ? { ...a, status: AppStatus.Connecting } : a)));
    setTimeout(() => {
      setApps(prev => prev.map(a => {
        if (a.id === app.id) {
          addLog(`⚡ ${app.name} 成功连接！平台专属本地端口已就位。`, 'success');
          return { ...a, status: AppStatus.Connected };
        }
        return a;
      }));
    }, 2000);
  };

  const reconnectApp = (app: AppConfig) => {
    addLog(`🔄 正在尝试重新连接 ${app.name}，重新探测本地端口...`, 'info', { toast: false });
    setApps(prev => prev.map(a => (a.id === app.id ? { ...a, status: AppStatus.Connecting } : a)));
    setTimeout(() => {
      setApps(prev => prev.map(a => {
        if (a.id === app.id) {
          addLog(`⚡ ${app.name} 重新连接成功！端口握手完毕，已恢复在线。`, 'success');
          return { ...a, status: AppStatus.Connected };
        }
        return a;
      }));
    }, 2000);
  };

  const confirmPath = () => {
    if (!pathSetupApp || !selectedPath) return;
    if (INVALID_FOLDER_PATHS.has(selectedPath)) {
      setPathError('路径无效，请重新选择');
      addLog(`❌ ${pathSetupApp.name} 路径校验失败：${selectedPath} 中未找到有效的主程序可执行文件。`, 'error');
      return;
    }
    const target = pathSetupApp;
    setApps(prev => prev.map(a => (
      a.id === target.id ? { ...a, status: AppStatus.InstalledOffline, installPath: selectedPath } : a
    )));
    addLog(`✅ 精确检测到 ${target.name} 注册项与关联可执行文件。离线桥接完毕。`, 'success');
    setPathSetupApp(null);
    setSelectedPath('');
    setPathError('');
  };

  const isLight = theme === 'light';

  return (
    <div className="relative" ref={rootRef}>
      {/* Persistent trigger */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        title={`DCC 连接状态 ${connectedCount}/${totalCount}`}
        className={`group w-full rounded border transition-all cursor-pointer ${
          open
            ? (isLight ? 'border-[#00C800] bg-emerald-50' : 'border-[#00ff00]/60 bg-[#00ff00]/5')
            : (isLight ? 'border-slate-200 bg-white hover:border-[#00C800]' : 'border-[#27272a] bg-[#0c0c0e] hover:border-[#00ff00]/50')
        } ${isCollapsed ? 'h-14 w-14 mx-auto flex flex-col items-center justify-center gap-0.5' : 'flex items-center justify-between px-2.5 py-2'}`}
      >
        {isCollapsed ? (
          <>
            <div className="relative">
              <Monitor size={15} className={isLight ? 'text-[#00C800]' : 'text-[#00ff00]'} />
              <span className="absolute -right-1.5 -top-1.5 flex h-1.5 w-1.5">
                <span className={`h-full w-full rounded-full ${connectedCount > 0 ? 'bg-[#00ff00] animate-pulse' : 'bg-zinc-600'}`}></span>
              </span>
            </div>
            <span className={`text-[9px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>{connectedCount}/{totalCount}</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 min-w-0">
              <span className="flex h-1.5 w-1.5 shrink-0">
                <span className={`h-full w-full rounded-full ${connectedCount > 0 ? 'bg-[#00ff00] animate-pulse' : 'bg-zinc-600'}`}></span>
              </span>
              <span className={`text-[11px] font-medium font-sans ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>DCC 状态</span>
            </span>
            <span className={`text-[10px] font-mono font-bold ${isLight ? 'text-[#00C800]' : 'text-[#00ff00]'}`}>{connectedCount}/{totalCount}</span>
          </>
        )}
      </button>

      {/* Popup panel */}
      {open && (
        <div
          className={`absolute z-[80] w-72 overflow-hidden rounded-lg border shadow-2xl font-sans ${
            isCollapsed ? 'left-full bottom-0 ml-2' : 'left-0 bottom-full mb-2'
          } ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-3.5 py-2.5 border-b ${isLight ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
            <span className={`flex items-center gap-1.5 text-xs font-bold font-display ${isLight ? 'text-slate-800' : 'text-white'}`}>
              <Monitor size={14} className={isLight ? 'text-[#00C800]' : 'text-[#00ff00]'} />
              DCC 连接状态
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={refreshDetection}
                title="刷新检测"
                className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors cursor-pointer ${
                  isLight ? 'text-slate-400 hover:text-[#00C800] hover:bg-slate-100' : 'text-zinc-500 hover:text-[#00ff00] hover:bg-[#18181b]'
                }`}
              >
                <RotateCw size={13} className={isDetecting ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors cursor-pointer ${
                  isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-zinc-500 hover:text-white hover:bg-[#18181b]'
                }`}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Overview bar */}
          <div className={`flex items-center gap-3 px-3.5 py-2 text-[11px] font-mono border-b ${isLight ? 'border-slate-100 bg-slate-50/60' : 'border-[#1c1c1f] bg-[#070708]'}`}>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#00ff00]"></span>
              <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>{connectedCount}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>{offlineCount}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500"></span>
              <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>{downCount}</span>
            </span>
          </div>

          {/* DCC list */}
          <div className="max-h-80 overflow-y-auto py-1">
            {apps.map((app) => {
              const logo = DCC_LOGO[app.id] ?? DEFAULT_DCC_LOGO;
              const detecting = isDetecting || app.status === AppStatus.Connecting;
              return (
                <div
                  key={app.id}
                  className={`flex items-center gap-2.5 px-3.5 py-2 transition-colors ${
                    isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121214]'
                  }`}
                >
                  {/* Lettermark */}
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded border text-xs font-bold font-display"
                    style={{ backgroundColor: `${logo.color}1A`, borderColor: `${logo.color}59`, color: logo.color }}
                  >
                    {logo.label}
                  </div>

                  {/* Name + version */}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[12px] font-semibold ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{app.name}</p>
                    <p className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>
                      {app.installPath ? app.version : '—'}
                    </p>
                  </div>

                  {/* Status + action */}
                  <div className="flex shrink-0 items-center gap-2">
                    {detecting ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                        <RotateCw size={10} className="animate-spin" />
                        检测中
                      </span>
                    ) : (
                      <>
                        {app.status === AppStatus.Connected && (
                          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#00ff00]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#00ff00] animate-pulse"></span>
                            已连接
                          </span>
                        )}
                        {app.status === AppStatus.InstalledOffline && (
                          <>
                            <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                              已离线
                            </span>
                            <button
                              type="button"
                              onClick={() => launchApp(app)}
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
                                isLight ? 'bg-[#00C800] text-white hover:bg-[#00a000]' : 'bg-[#00ff00]/15 text-[#00ff00] hover:bg-[#00ff00]/25'
                              }`}
                            >
                              <Play size={9} fill="currentColor" />
                              启动
                            </button>
                          </>
                        )}
                        {app.status === AppStatus.ConnectionFailed && (
                          <>
                            <span className="flex items-center gap-1 text-[10px] font-mono text-red-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                              连接失败
                            </span>
                            <button
                              type="button"
                              onClick={() => reconnectApp(app)}
                              className="inline-flex items-center gap-1 rounded border border-[#00ff00]/50 px-2 py-0.5 text-[10px] font-bold text-[#00ff00] transition-colors hover:bg-[#00ff00]/10 cursor-pointer"
                            >
                              <RotateCw size={9} />
                              重连
                            </button>
                          </>
                        )}
                        {app.status === AppStatus.NotReady && (
                          <>
                            <span className="flex items-center gap-1 text-[10px] font-mono text-red-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                              未安装
                            </span>
                            <button
                              type="button"
                              onClick={() => { setPathSetupApp(app); setSelectedPath(''); setPathError(''); }}
                              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
                                isLight ? 'border-slate-300 text-slate-600 hover:border-slate-400' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                              }`}
                            >
                              设置路径
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 设置路径 modal */}
      {pathSetupApp && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded border p-6 font-sans ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className={`flex items-center gap-2 text-base font-bold font-display ${isLight ? 'text-slate-800' : 'text-white'}`}>
                <Folder size={18} className="text-amber-500" />
                手动检测路径: {pathSetupApp.name}
              </h3>
              <button onClick={() => { setPathSetupApp(null); setSelectedPath(''); setPathError(''); }} className={isLight ? 'text-slate-400 hover:text-slate-700' : 'text-zinc-400 hover:text-white'}>
                <X size={16} />
              </button>
            </div>

            <p className={`mb-4 text-xs leading-relaxed ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
              请选择本地硬盘中已安装的项目官方软件包所在根目录。Launcher 将检索目录下可执行文件的注册状态并进行安全桥接。
            </p>

            <div className={`mb-5 rounded border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-[#27272a] bg-zinc-950'}`}>
              <label className={`mb-2 block text-[10.5px] font-mono uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>
                可用注册目录发现（模拟）
              </label>
              <div className="space-y-2">
                {simulatedFolders.map((pathStr) => {
                  const isSel = selectedPath === pathStr;
                  const isInvalid = INVALID_FOLDER_PATHS.has(pathStr);
                  return (
                    <button
                      key={pathStr}
                      onClick={() => { setSelectedPath(pathStr); setPathError(''); }}
                      className={`flex w-full items-center gap-3 rounded border p-2.5 text-left text-xs font-mono transition-all ${
                        isSel
                          ? (isInvalid ? 'border-red-500/60 bg-red-500/5 font-bold text-red-300' : 'border-[#00ff00] bg-[#00ff00]/5 font-bold text-white')
                          : (isLight ? 'border-slate-200 bg-white text-slate-500 hover:border-slate-300' : 'border-zinc-900 bg-black text-zinc-400 hover:border-zinc-700 hover:text-white')
                      }`}
                    >
                      <Folder size={15} className={isSel ? (isInvalid ? 'text-red-400' : 'text-[#00ff00]') : 'text-zinc-500'} />
                      <span className="flex-1 truncate">{pathStr}</span>
                      {isSel && (isInvalid
                        ? <AlertCircle size={13} className="shrink-0 text-red-400" />
                        : <CheckCircle2 size={13} className="shrink-0 text-[#00ff00]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {pathError && (
              <div className="-mt-2 mb-4 flex items-center gap-1.5 text-[11px] font-mono text-red-400">
                <AlertCircle size={13} className="shrink-0" />
                <span>{pathError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 font-mono">
              <button
                onClick={() => { setPathSetupApp(null); setSelectedPath(''); setPathError(''); }}
                className={`rounded border px-4 py-1.5 text-xs transition-colors ${isLight ? 'border-slate-200 text-slate-500 hover:border-slate-400' : 'border-[#27272a] text-zinc-400 hover:border-zinc-500 hover:text-white'}`}
              >
                取消
              </button>
              <button
                disabled={!selectedPath}
                onClick={confirmPath}
                className={`rounded px-5 py-1.5 text-xs font-bold transition-all ${
                  selectedPath
                    ? (isLight ? 'bg-[#00C800] text-white hover:bg-[#00a000] cursor-pointer' : 'bg-[#00ff00] text-black hover:bg-[#00dd00] cursor-pointer')
                    : (isLight ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400' : 'cursor-not-allowed border border-zinc-850 bg-[#18181c] text-zinc-500')
                }`}
              >
                验证注册并建立连接
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

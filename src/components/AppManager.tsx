import React, { useState } from 'react';
import { 
  Monitor, 
  Download, 
  Play, 
  Square, 
  RotateCw, 
  AlertCircle, 
  Folder, 
  CheckCircle2, 
  HelpCircle, 
  ArrowUpCircle,
  FileText,
  Clock,
  X,
  Server,
  Info
} from 'lucide-react';
import { AppId, AppStatus, AppConfig } from '../types';

interface AppManagerProps {
  apps: AppConfig[];
  setApps: React.Dispatch<React.SetStateAction<AppConfig[]>>;
  simulatedDiskGB: number;
  setSimulatedDiskGB: React.Dispatch<React.SetStateAction<number>>;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  theme: 'light' | 'dark';
}

export default function AppManager({
  apps,
  setApps,
  simulatedDiskGB,
  setSimulatedDiskGB,
  addLog,
  theme
}: AppManagerProps) {
  // Modal states
  const [activeInstallApp, setActiveInstallApp] = useState<AppConfig | null>(null);
  const [manualPathSetupApp, setManualPathSetupApp] = useState<AppConfig | null>(null);
  const [updateAppConfirmation, setUpdateAppConfirmation] = useState<AppConfig | null>(null);
  const [oldVersionAppDetails, setOldVersionAppDetails] = useState<AppConfig | null>(null);
  const [itTicketApp, setItTicketApp] = useState<AppConfig | null>(null);
  
  // Simulated Manual Path folders list
  const [selectedFolderIdx, setSelectedFolderIdx] = useState<string>('');
  const simulatedFolders = [
    'C:\\Program Files\\Autodesk\\3dsMax2025',
    'D:\\Creative\\Autodesk\\Max_V2025',
    'C:\\3dsmax_custom',
    'E:\\StudioDCC\\Max2025'
  ];

  // IT Ticket Form state
  const [itSubject, setItSubject] = useState('DCC 商业软件版本升级申请');
  const [itMessage, setItMessage] = useState('因项目A涉及到高拟真次世代人物盔甲及蒙皮管线，现有商业版本在使用局部物理插件时存在接口冲突。恳请IT部门协助将本机商业软件升级到官方建议规范，谢谢！');
  const [submittingIt, setSubmittingIt] = useState(false);
  const [itTicketSuccess, setItTicketSuccess] = useState(false);

  // Install app callback - F1
  const startInstalling = (app: AppConfig) => {
    // Disk Check
    if (simulatedDiskGB < app.diskRequiredGB) {
      addLog(`❌ 安装中阻断：无法下载 ${app.name}。磁盘所需 ${app.diskRequiredGB} GB，剩余仅有 ${simulatedDiskGB.toFixed(1)} GB。`, 'error');
      alert(`[磁盘空间不足]\n安装 ${app.name} 至少需要 ${app.diskRequiredGB} GB 的剩余磁盘空间。\n\n当前磁盘可用容量为: ${simulatedDiskGB.toFixed(1)} GB。\n请在“缓存与设置”中释放临时缓存、重置仿真磁盘，或联系 IT 协助清理磁盘目录。`);
      return;
    }

    setActiveInstallApp(app);
  };

  const confirmInstall = (app: AppConfig) => {
    setActiveInstallApp(null);
    setApps(prev => prev.map(a => {
      if (a.id === app.id) {
        return { ...a, status: AppStatus.NotReady, downloadProgress: 1 };
      }
      return a;
    }));
    
    addLog(`⏳ 开始下载并部署平台软件 ${app.name} (大小 ${app.sizeGB} GB)...`, 'info');

    // Simulate progress
    let prog = 0;
    const interval = setInterval(() => {
      prog += 8;
      if (prog >= 100) {
        prog = 100;
        clearInterval(interval);
        setApps(prev => prev.map(a => {
          if (a.id === app.id) {
            return { 
              ...a, 
              status: AppStatus.InstalledOffline, 
              downloadProgress: undefined, 
              installPath: `C:\\Program Files\\ArtPlatform\\managed\\${app.id}` 
            };
          }
          return a;
        }));
        // Subtract disk space
        setSimulatedDiskGB(d => Math.max(1.0, d - app.diskRequiredGB));
        addLog(`✅ ${app.name} 下载解压完成！已变更为【离线就绪】状态，安装路径已配置完毕。`, 'success');
      } else {
        setApps(prev => prev.map(a => {
          if (a.id === app.id) {
            return { ...a, downloadProgress: prog };
          }
          return a;
        }));
      }
    }, 150);
  };

  const cancelInstalling = (app: AppConfig) => {
    setApps(prev => prev.map(a => {
      if (a.id === app.id) {
        return { ...a, downloadProgress: undefined };
      }
      return a;
    }));
    addLog(`⚠️ 已取消下载 ${app.name}，并清空本地临时分块文件。`, 'warning');
  };

  // Connected Launch - F3
  const launchApp = (app: AppConfig) => {
    if (app.status === AppStatus.NotReady) return;

    addLog(`🚀 正在呼叫进程并检测 ${app.name} 端口响应中...`, 'info');
    setApps(prev => prev.map(a => {
      if (a.id === app.id) {
        return { ...a, status: AppStatus.Connecting };
      }
      return a;
    }));

    // Takes 2 seconds to transition to connected
    setTimeout(() => {
      setApps(prev => prev.map(a => {
        if (a.id === app.id) {
          addLog(`⚡ ${app.name} 成功连接！平台专属本地端口已就位，可以无缝挂载项目拓展。`, 'success');
          return { ...a, status: AppStatus.Connected };
        }
        return a;
      }));
    }, 2000);
  };

  // Close Application
  const stopApp = (app: AppConfig) => {
    setApps(prev => prev.map(a => {
      if (a.id === app.id) {
        addLog(`🔴 已断开与 ${app.name} 运行进程的通信，软件安全关闭。`, 'warning');
        return { ...a, status: AppStatus.InstalledOffline };
      }
      return a;
    }));
  };

  // Manual Path validation - F2
  const confirmManualPath = () => {
    if (!manualPathSetupApp || !selectedFolderIdx) return;
    
    const targetApp = manualPathSetupApp;
    const chosenPath = selectedFolderIdx;
    
    setApps(prev => prev.map(a => {
      if (a.id === targetApp.id) {
        return { 
          ...a, 
          status: AppStatus.InstalledOffline, 
          installPath: chosenPath,
          version: targetApp.id === AppId.Max3ds ? '2025.2 (IT-Approved)' : a.version
        };
      }
      return a;
    }));

    addLog(`✅ 精确检测到 ${targetApp.name} 注册项与关联可执行文件。离线桥接完毕。`, 'success');
    setManualPathSetupApp(null);
    setSelectedFolderIdx('');
  };

  // Update logic - F4 (Platform Apps)
  const triggerUpdateApp = (app: AppConfig) => {
    if (app.status === AppStatus.Connected) {
      // Prompt close running instance first
      setUpdateAppConfirmation(app);
    } else {
      performUpdateApp(app);
    }
  };

  const performUpdateApp = (app: AppConfig) => {
    setUpdateAppConfirmation(null);
    addLog(`⏳ 正在下载并解压服务器增量更新包以安装最新版 ${app.newVersion}...`, 'info');
    
    // Simulate updating
    setApps(prev => prev.map(a => {
      if (a.id === app.id) {
        return { ...a, status: AppStatus.NotReady, downloadProgress: 1 };
      }
      return a;
    }));

    let uProg = 0;
    const uInterval = setInterval(() => {
      uProg += 12;
      if (uProg >= 100) {
        uProg = 100;
        clearInterval(uInterval);
        setApps(prev => prev.map(a => {
          if (a.id === app.id) {
            return {
              ...a,
              version: a.newVersion || a.version,
              newVersion: undefined,
              status: AppStatus.InstalledOffline,
              downloadProgress: undefined
            };
          }
          return a;
        }));
        addLog(`⚡ ${app.name} 已更新到最新指定版本！热升级完成，状态已变更为离线就绪。`, 'success');
      } else {
        setApps(prev => prev.map(a => {
          if (a.id === app.id) {
            return { ...a, downloadProgress: uProg };
          }
          return a;
        }));
      }
    }, 120);
  };

  // IT Ticket Submittal
  const submitItTicket = () => {
    if (!itTicketApp) return;
    setSubmittingIt(true);
    setTimeout(() => {
      setSubmittingIt(false);
      setItTicketSuccess(true);
      addLog(`🎫 已成功向内网IT技术支持系统递交 【${itSubject}】 工单，单号：[#TKT-${Math.floor(100000 + Math.random() * 900000)}]。请留意钉钉或企业邮件通知。`, 'success');
    }, 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 font-sans">
      {/* Title section */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
            <Monitor size={22} className="text-[#00ff00]" />
            DCC 应用管理 <span className="text-xs text-zinc-500 font-mono font-normal">Global Applications</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            IT 托管与自动监听本地 DCC 生态连接。ComfyUI 与 Blender 由平台管理并支持热拉取，Maya/PS/3ds Max 将被自动识别集成。
          </p>
        </div>
        <div className="flex bg-[#0c0c0e] border border-[#27272a] rounded p-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Server size={14} className="text-[#00ff00]" />
            <span>IT Bridge:</span>
            <span className="text-[#00ff00] font-bold">已连接</span>
          </div>
        </div>
      </div>

      {/* Grid of Applications */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {apps.map((app) => {
          const isDownloading = app.downloadProgress !== undefined;
          
          return (
            <div 
              key={app.id}
              className={`relative bg-[#0c0c0e] border rounded overflow-hidden p-5 transition-all ${
                app.status === AppStatus.Connected 
                  ? 'border-[#00ff00] shadow-[0_0_15px_rgba(0,255,0,0.06)]' 
                  : 'border-[#27272a] hover:border-zinc-700'
              }`}
            >
              {/* Top Row: Info & Icon */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white tracking-wide font-display">{app.name}</h3>
                    <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1 py-0.2 rounded">
                      {app.isPlatformHosted ? '平台托管' : 'IT商业授权'}
                    </span>
                  </div>
                  
                  {/* Paths and versions details inside */}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 flex-wrap">
                      <span>当前版本:</span>
                      <span className="text-zinc-200 font-bold">{app.installPath ? app.version : '未检测到'}</span>
                      {app.newVersion && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-500/15 border border-purple-500/30 text-purple-400 ml-1.5 animate-pulse">
                          <ArrowUpCircle size={10} className="text-purple-400 shrink-0" />
                          <span>推荐更新: {app.newVersion}</span>
                        </span>
                      )}
                      {app.isOld && !app.newVersion && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/15 border border-amber-500/30 text-amber-500 ml-1.5">
                          <AlertCircle size={10} className="text-amber-500 shrink-0" />
                          <span>版本过旧</span>
                        </span>
                      )}
                    </div>
                    {app.installPath ? (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500" title={app.installPath}>
                        <Folder size={11} className="shrink-0" />
                        <span className="truncate max-w-[280px]">{app.installPath}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-500/70">
                        <AlertCircle size={11} className="shrink-0" />
                        <span>路径缺失，请手动检测或连接该 DCC</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex flex-col items-end">
                  {app.status === AppStatus.NotReady && (
                    <span className="text-[11px] font-mono border border-dashed border-zinc-700 text-zinc-500 px-2.5 py-0.5 rounded">
                      未就绪
                    </span>
                  )}
                  {app.status === AppStatus.InstalledOffline && (
                    <span className="text-[11px] font-mono bg-zinc-900 border border-zinc-700 text-zinc-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-500"></div>
                      已安装·离线
                    </span>
                  )}
                  {app.status === AppStatus.Connecting && (
                    <span className="text-[11px] font-mono bg-zinc-900 border border-[#00ff00]/40 text-[#00ff00] px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse">
                      <RotateCw size={11} className="animate-spin text-[#00ff00]" />
                      连接中
                    </span>
                  )}
                  {app.status === AppStatus.Connected && (
                    <span className="text-[11px] font-mono bg-[#00ff00]/10 border border-[#00ff00]/60 text-[#00ff00] px-2.5 py-0.5 rounded-full flex items-center gap-1 font-bold shadow-[0_0_8px_rgba(0,255,0,0.15)] glow-green">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00ff00] animate-ping"></div>
                      已连接
                    </span>
                  )}
                  <span className="text-[9.5px] font-mono text-zinc-500 mt-2">
                    所需空间: {app.sizeGB} GB
                  </span>
                </div>
              </div>

              {/* Progress Bar for Downloads/Updates */}
              {isDownloading && (
                <div className="mt-4 bg-[#141416] border border-[#27272a] p-3 rounded">
                  <div className="flex justify-between text-[11px] font-mono mb-1 text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Download size={12} className="animate-bounce text-[#00ff00]" />
                      正在下载并解压分发压缩档...
                    </span>
                    <span>{app.downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-[#00ff00] h-full progress-bar-transition" 
                      style={{ width: `${app.downloadProgress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                    <span>速度: 15.4 MB/s</span>
                    <button 
                      onClick={() => cancelInstalling(app)}
                      className="text-red-500 hover:text-red-400 underline font-mono cursor-pointer"
                    >
                      取消安装
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons Section */}
              {!isDownloading && (
                <div className="mt-5 pt-4 border-t border-zinc-900 flex flex-wrap gap-2 items-center justify-between">
                  
                  {/* Left-side action: version update trigger integrated with warning details */}
                  <div>
                    {app.newVersion ? (
                      <button
                        onClick={() => triggerUpdateApp(app)}
                        className="bg-purple-900/40 hover:bg-purple-950/60 border border-purple-500 text-purple-200 hover:text-white px-3 py-1.5 text-xs rounded flex items-center gap-2 transition-all text-left cursor-pointer group shrink-0 select-none"
                      >
                        <ArrowUpCircle size={15} className="text-purple-400 group-hover:scale-110 group-hover:text-purple-300 transition-all shrink-0" />
                        <span className="text-[11px] font-bold font-sans">发现更稳定新版 {app.newVersion}</span>
                      </button>
                    ) : app.isOld ? (
                      <button
                        onClick={() => setOldVersionAppDetails(app)}
                        className="bg-amber-950/20 hover:bg-[#78350f]/30 border border-amber-600/50 text-amber-500 hover:text-amber-400 px-3 py-1.5 text-xs rounded flex items-center gap-2 transition-all text-left cursor-pointer group shrink-0 select-none"
                      >
                        <AlertCircle size={15} className="text-amber-400 group-hover:text-amber-300 transition-all shrink-0" />
                        <span className="text-[11px] font-bold font-sans">本地版本过低 (建议升级)</span>
                      </button>
                    ) : null}
                  </div>

                  {/* Right side primary controls */}
                  <div className="flex gap-2 items-center">
                    {/* Setup manual path button with info icon on the left */}
                    {app.status === AppStatus.NotReady && !app.isPlatformHosted && (
                      <div className="flex items-center gap-1.5 mr-0.5">
                        <div className="relative group flex items-center">
                          <Info size={14} className="text-zinc-500 hover:text-zinc-300 cursor-help transition-colors shrink-0" />
                          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block z-30 w-52 bg-[#121214] border border-[#27272a] text-zinc-400 p-2.5 text-[10.5px] rounded shadow-xl font-mono leading-relaxed pointer-events-none select-none">
                            提示: 该商业程序未自动检获，需手工连接。
                          </div>
                        </div>
                      </div>
                    )}

                    {app.status === AppStatus.NotReady && !app.isPlatformHosted && (
                      <button
                        onClick={() => setManualPathSetupApp(app)}
                        className="bg-[#121214] border border-[#27272a] hover:border-zinc-500 text-zinc-300 hover:text-white px-3 py-1 text-xs font-mono rounded cursor-pointer transition-colors btn-secondary"
                      >
                        手动设置路径
                      </button>
                    )}

                    {/* Install button (platform only) */}
                    {app.status === AppStatus.NotReady && app.isPlatformHosted && (
                      <button
                        onClick={() => startInstalling(app)}
                        className="bg-white hover:bg-zinc-200 text-black font-semibold font-sans px-4 py-1 text-xs rounded transition-colors shadow-lg flex items-center gap-1 cursor-pointer dcc-deploy-btn btn-primary"
                      >
                        <Download size={13} />
                        部署该应用
                      </button>
                    )}

                    {/* Launch button */}
                    {app.status === AppStatus.InstalledOffline && (
                      <button
                        onClick={() => launchApp(app)}
                        className="dcc-launch-btn px-4 py-1.5 text-xs font-bold rounded cursor-pointer transition-all flex items-center gap-1.5"
                      >
                        <Play size={13} fill="currentColor" />
                        启动软件
                      </button>
                    )}

                    {/* Connecting loader indicator */}
                    {app.status === AppStatus.Connecting && (
                      <button
                        disabled
                        className={`px-4 py-1.5 text-xs font-mono rounded flex items-center gap-1.5 cursor-not-allowed border ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-400'
                            : 'bg-[#121214] border-zinc-800 text-zinc-500'
                        }`}
                      >
                        <RotateCw size={12} className={`animate-spin ${theme === 'light' ? 'text-slate-400' : 'text-zinc-500'}`} />
                        进程加载中...
                      </button>
                    )}

                    {/* Connected close button */}
                    {app.status === AppStatus.Connected && (
                      <button
                        onClick={() => stopApp(app)}
                        className="bg-zinc-950 hover:bg-red-950/20 border border-red-500/60 text-red-400 hover:text-red-300 px-4 py-1.5 text-xs rounded transition-all flex items-center gap-1.5"
                      >
                        <Square size={11} fill="currentColor" />
                        关闭并断开
                      </button>
                    )}
                  </div>

                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* DETAILED MODAL 1: PLATFORM HOSTED INSTALLATION CONFIRMATION */}
      {activeInstallApp && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-md w-full font-sans">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-zinc-900 border border-[#27272a] rounded">
                <Download size={24} className="text-[#00ff00]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">确认部署平台托管软件</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  该应用将从项目本地高速镜像服务器下载并自动配置环境依赖，整个流程全自动，无需手动设置注册路径。
                </p>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded text-xs font-mono space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-zinc-500">软件名称:</span>
                <span className="text-white font-bold">{activeInstallApp.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">下载版本:</span>
                <span className="text-[#00ff00] font-bold">{activeInstallApp.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">预估磁盘占用:</span>
                <span className="text-zinc-300 font-bold">{activeInstallApp.diskRequiredGB} GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">部署宿主路径:</span>
                <span className="text-zinc-400 text-[10px] break-all">
                  C:\Program Files\ArtPlatform\managed\{activeInstallApp.id}
                </span>
              </div>
              <div className="border-t border-zinc-900 pt-2 flex justify-between">
                <span className="text-zinc-500">当前可用磁盘磁盘 (D:):</span>
                <span className="text-zinc-300">{simulatedDiskGB.toFixed(1)} GB</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setActiveInstallApp(null)}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs font-mono transition-colors btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => confirmInstall(activeInstallApp)}
                className="px-5 py-1.5 bg-[#00ff00] text-black font-semibold rounded text-xs transition-colors hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] glow-btn btn-special"
              >
                开始全自动部署
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED MODAL 2: MANUAL PATH SELECTION (F2) */}
      {manualPathSetupApp && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-lg w-full font-sans">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Folder size={18} className="text-amber-500" />
                手动检测路径: {manualPathSetupApp.name}
              </h3>
              <button onClick={() => setManualPathSetupApp(null)} className="text-zinc-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              请选择本地硬盘中已安装的项目官方商业软件包所在根目录。Launcher 将检索目录下可执行文件的注册状态并进行安全桥接。
            </p>

            <div className="border border-[#27272a] bg-zinc-950 rounded mb-5 p-3">
              <label className="text-[10.5px] font-mono text-zinc-500 uppercase tracking-wilder block mb-2">
                Simulated Folder Path Selector / 可用注册目录发现 (模拟)
              </label>
              
              <div className="space-y-2">
                {simulatedFolders.map((pathStr) => {
                  const isSel = selectedFolderIdx === pathStr;
                  return (
                    <button
                      key={pathStr}
                      onClick={() => setSelectedFolderIdx(pathStr)}
                      className={`w-full flex items-center gap-3 text-left p-2.5 rounded transition-all text-xs font-mono border ${
                        isSel 
                          ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold' 
                          : 'bg-black border-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      <Folder size={15} className={isSel ? 'text-[#00ff00]' : 'text-zinc-500'} />
                      <span className="flex-1 truncate">{pathStr}</span>
                      {isSel && <CheckCircle2 size={13} className="text-[#00ff00] shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-[10px] bg-zinc-900 border border-zinc-850 p-2.5 text-zinc-400 rounded leading-relaxed">
                ℹ️ 确认路径后，客户端将自动执行进程扫描，验证主程序及IT企业授权许可证，检测成功后将变更为【就绪离线】状态。
              </div>
            </div>

            <div className="flex gap-3 justify-end font-mono">
              <button 
                onClick={() => {
                  setManualPathSetupApp(null);
                  setSelectedFolderIdx('');
                }}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors btn-secondary"
              >
                取消
              </button>
              <button
                disabled={!selectedFolderIdx}
                onClick={confirmManualPath}
                className={`px-5 py-1.5 rounded text-xs transition-all font-bold ${
                  selectedFolderIdx 
                    ? (theme === 'light' ? 'bg-[#00C800] text-white hover:bg-[#00a000] cursor-pointer' : 'bg-[#00ff00] text-black hover:bg-[#00dd00] cursor-pointer') 
                    : (theme === 'light' ? 'bg-slate-100 border border-slate-200 text-slate-450 cursor-not-allowed' : 'bg-[#18181c] border border-zinc-850 text-zinc-500 cursor-not-allowed')
                }`}
              >
                验证注册并建立连接
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED MODAL 3: RUNNING APPLICATION UPDATE DISRUPT ALERT (F4) */}
      {updateAppConfirmation && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-purple-500/50 rounded p-6 max-w-md w-full font-sans">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-purple-950/40 border border-purple-900 rounded">
                <AlertCircle size={22} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">更新警告：软件运行中</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  检测到 <span className="text-[#00ff00] font-bold">{updateAppConfirmation.name}</span> 目前处于 【已连接】 运行状态。
                </p>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 p-3.5 rounded text-xs leading-relaxed text-zinc-300 font-mono mb-6">
              ⚠️ <span className="text-purple-300 font-bold">更新会中断所有跑图及烘焙任务。</span><br/>
              系统继续更新会将正在运行中的 DCC 实例自动强制关闭并覆盖新版本分发补丁。请确保没有未保存的工作。
            </div>

            <div className="flex gap-3 justify-end font-mono">
              <button 
                onClick={() => setUpdateAppConfirmation(null)}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors"
              >
                放弃更新
              </button>
              <button
                onClick={() => performUpdateApp(updateAppConfirmation)}
                className="px-5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs transition-colors"
              >
                关闭实例并强制升级
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED MODAL 4: COMMERCIAL OUTDATED VERSION VIEW & TICKET FORM ACCESS (F4) */}
      {oldVersionAppDetails && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-lg w-full font-sans">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-500" />
                关于商业软件升级详情: {oldVersionAppDetails.name}
              </h3>
              <button onClick={() => setOldVersionAppDetails(null)} className="text-zinc-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs text-zinc-400 leading-relaxed mb-6">
              <p>
                当前系统检测到您的 {oldVersionAppDetails.name} 运行版本为 <span className="text-zinc-200 font-bold font-mono">{oldVersionAppDetails.version}</span>，低于项目官方推荐的高画质和稳定性基准版本。
              </p>

              <div className="bg-zinc-950 border border-zinc-900 p-4 rounded text-zinc-300 leading-relaxed font-mono">
                💡 <span className="text-amber-500 font-bold">升级提示：</span><br/>
                外部正版商业套件 (如 PS, Maya, 3ds Max) 受授权密钥库及企业域网络控制。
                Art Launcher 无法一键热升级。通常需 IT 网管部门进行后台分发。
                <br/>
                <br/>
                您可以通过下方快捷渠道提交工单，单系统将自动匹配您的工位及IP地址，IT 专员将在 1 个工作日内在线协助为您升级安装至 IT 注册许可包。
              </div>
            </div>

            <div className="flex gap-3 justify-end font-mono">
              <button 
                onClick={() => setOldVersionAppDetails(null)}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors btn-secondary"
              >
                知道了
              </button>
              <button
                onClick={() => {
                  setItTicketApp(oldVersionAppDetails);
                  setOldVersionAppDetails(null);
                  setItTicketSuccess(false);
                }}
                className="px-5 py-1.5 bg-[#00ff00] text-black font-semibold rounded text-xs transition-all hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] glow-btn flex items-center gap-1.5 cursor-pointer font-bold btn-special"
              >
                <FileText size={13} />
                向 IT 提交升级申请
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED MODAL 5: IT WORK TICKET COMPOSER */}
      {itTicketApp && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-lg w-full font-sans">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <FileText size={18} className="text-[#00ff00]" />
                IT 升级工单填报
              </h3>
              <button onClick={() => setItTicketApp(null)} className="text-zinc-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {itTicketSuccess ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-[#00ff00]/10 border border-[#00ff00] flex items-center justify-center mx-auto mb-4 text-[#00ff00]">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="text-sm font-bold text-white">工单派发成功！</h4>
                <p className="text-xs text-zinc-400 mt-2 max-w-sm mx-auto leading-relaxed">
                  工单 [#TKT-{Math.floor(205930 + Math.random() * 590000)}] 已分派至 【美术IT基础设施服务组】。
                  IT 老师接单后，将通过钉钉连线您并在后台下发正版离线独立安装包。
                </p>
                <button
                  onClick={() => setItTicketApp(null)}
                  className="mt-6 px-6 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded text-xs font-mono"
                >
                  关闭窗口
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <label className="text-zinc-500 block mb-1">申请应用</label>
                    <input 
                      type="text" 
                      disabled 
                      value={itTicketApp.name} 
                      className="w-full bg-zinc-950 border border-zinc-900 text-zinc-300 p-2 rounded cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-500 block mb-1">工位 IP 地址 (自动)</label>
                    <input 
                      type="text" 
                      disabled 
                      value="10.240.18.52 (美术区)" 
                      className="w-full bg-zinc-950 border border-zinc-900 text-zinc-400 p-2 rounded cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-zinc-500 text-xs block mb-1 font-mono">工单主题</label>
                  <input 
                    type="text" 
                    value={itSubject} 
                    onChange={e => setItSubject(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#00ff00] outline-none text-zinc-200 p-2 text-xs rounded font-mono"
                  />
                </div>

                <div>
                  <label className="text-zinc-500 text-xs block mb-1 font-mono">升级情况说明及原因</label>
                  <textarea 
                    rows={4}
                    value={itMessage} 
                    onChange={e => setItMessage(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#00ff00] outline-none text-zinc-200 p-2.5 text-xs rounded font-mono resize-none leading-relaxed"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2 font-mono">
                  <button 
                    onClick={() => setItTicketApp(null)}
                    className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors btn-secondary"
                  >
                    取消
                  </button>
                  <button
                    onClick={submitItTicket}
                    className="px-5 py-1.5 bg-[#00ff00] text-black font-semibold rounded text-xs transition-all hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] glow-btn flex items-center gap-1 font-bold btn-special"
                  >
                    {submittingIt && <RotateCw size={12} className="animate-spin text-black mr-1" />}
                    确认派遣工单
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

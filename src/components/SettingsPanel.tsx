import React, { useState } from 'react';
import { 
  Settings, 
  Trash2, 
  FolderOpen, 
  Info, 
  HardDrive, 
  CheckCircle,
  HelpCircle,
  AlertOctagon,
  RefreshCw,
  PowerOff
} from 'lucide-react';
import { AppId, AppStatus, AppConfig, ArtAsset } from '../types';

interface SettingsPanelProps {
  apps: AppConfig[];
  setApps: React.Dispatch<React.SetStateAction<AppConfig[]>>;
  assets: ArtAsset[];
  downloadedAssetIds: Set<string>;
  simulatedDiskGB: number;
  setSimulatedDiskGB: React.Dispatch<React.SetStateAction<number>>;
  tempCacheMB: number;
  setTempCacheMB: React.Dispatch<React.SetStateAction<number>>;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error', options?: { toast?: boolean }) => void;
}

export default function SettingsPanel({
  apps,
  setApps,
  assets,
  downloadedAssetIds,
  simulatedDiskGB,
  setSimulatedDiskGB,
  tempCacheMB,
  setTempCacheMB,
  addLog
}: SettingsPanelProps) {
  // Clear modal confirmed state
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Calculates sizes for representation F10
  const appInstallersSizeGB = apps
    .filter(a => a.status !== AppStatus.NotReady)
    .reduce((sum, a) => sum + a.sizeGB, 0);

  const downloadedAssetsMB = assets
    .filter(a => downloadedAssetIds.has(a.id))
    .reduce((sum, a) => sum + a.sizeMB, 0);

  const simulatedDiskRangeProgress = ((simulatedDiskGB - 2) / (100 - 2)) * 100;

  // Folder Open Trigger
  const handleOpenFolder = (categoryName: string, pathMock: string) => {
    addLog(`📁 在资源管理器中开启目录: ${pathMock}`, 'info');
    alert(`[仿真资源管理器]\n已成功召唤 Windows Explorer 定位到 ${categoryName} 本地缓存。目录：\n\n${pathMock}`);
  };

  // Perform一键清理 F10
  const handleClearTemp = () => {
    setTempCacheMB(0);
    setSimulatedDiskGB(prev => Math.min(256, prev + 2.4)); // refund saved GBs to simulated disk
    addLog('🧹 一键清理临时文件和日志缓存成功！已释放 2.4 GB 物理磁盘限额。', 'success');
    setShowClearConfirm(false);
  };

  // Simulated disconnect button (Sandbox controller)
  const handleSimulateDisconnection = () => {
    const connectedApps = apps.filter(a => a.status === AppStatus.Connected);
    if (connectedApps.length === 0) {
      addLog('⚠️ 当前无任何 DCC 软件处于【已连接】活跃状态，无需模拟进程异常。', 'warning');
      return;
    }

    setApps(prev => prev.map(a => {
      if (a.status === AppStatus.Connected) {
        addLog(`🚨 [异常进程退出模拟] 检测到 DCC 外部程序 ${a.name} (PID: ${Math.floor(2000 + Math.random() * 8000)}) 出现退出信号。10秒内自动恢复离线状态。`, 'error');
        return { ...a, status: AppStatus.InstalledOffline };
      }
      return a;
    }));
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 font-sans">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
          <Settings size={22} className="text-[#00ff00]" />
          本地缓存与平台设置
        </h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Local Cache Management (F10) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-5">
            <h2 className="text-sm font-bold text-white mb-4 font-display flex items-center gap-2">
              <HardDrive size={16} className="text-[#00ff00]" />
              本地存储占用详情 (仿真分类)
            </h2>

            <div className="divide-y divide-zinc-900 border-t border-b border-zinc-900">
              {/* Row 1: App package */}
              <div className="py-4 flex justify-between items-center text-xs">
                <div>
                  <h4 className="text-zinc-200 font-bold font-sans">平台托管应用安装包</h4>
                  <p className="text-zinc-500 text-[10px] mt-0.5 font-mono">
                    路径: C:\Program Files\ArtPlatform\managed
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-300 font-mono font-semibold">
                    {appInstallersSizeGB > 0 ? `${appInstallersSizeGB.toFixed(1)} GB` : '0.0 GB'}
                  </span>
                  <button 
                    onClick={() => handleOpenFolder('应用包', 'C:\\Program Files\\ArtPlatform\\managed')}
                    className="bg-[#121214] hover:bg-zinc-900 border border-zinc-850 hover:text-[#00ff00] text-zinc-400 px-2.5 py-1 text-[11px] rounded transition-colors font-mono cursor-pointer flex items-center gap-1 btn-secondary"
                  >
                    <FolderOpen size={11} />
                    打开文件夹
                  </button>
                </div>
              </div>

              {/* Row 2: Extension files */}
              <div className="py-4 flex justify-between items-center text-xs">
                <div>
                  <h4 className="text-zinc-200 font-bold font-sans">项目拓展与定制插件文件</h4>
                  <p className="text-zinc-500 text-[10px] mt-0.5 font-mono">
                    包含各宿主 DCC 的 python plugins 源文件
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-300 font-mono font-semibold">
                    {apps.some(a => a.id === AppId.Blender && a.status === AppStatus.Connected) ? '252.8 MB' : '12.4 MB'}
                  </span>
                  <button 
                    onClick={() => handleOpenFolder('插件库', 'C:\\Program Files\\ArtPlatform\\extensions')}
                    className="bg-[#121214] hover:bg-zinc-900 border border-zinc-850 hover:text-[#00ff00] text-zinc-400 px-2.5 py-1 text-[11px] rounded transition-colors font-mono cursor-pointer flex items-center gap-1 btn-secondary"
                  >
                    <FolderOpen size={11} />
                    打开文件夹
                  </button>
                </div>
              </div>

              {/* Row 3: Material files */}
              <div className="py-4 flex justify-between items-center text-xs">
                <div>
                  <h4 className="text-zinc-200 font-bold font-sans">美术资产包源文件缓存</h4>
                  <p className="text-zinc-500 text-[10px] mt-0.5 font-mono">
                    路径: C:\Program Files\ArtPlatform\downloads
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-300 font-mono font-semibold">
                    {downloadedAssetsMB > 0 ? `${downloadedAssetsMB.toFixed(1)} MB` : '0.0 MB'}
                  </span>
                  <button 
                    onClick={() => handleOpenFolder('素材包', 'C:\\Program Files\\ArtPlatform\\downloads')}
                    className="bg-[#121214] hover:bg-zinc-900 border border-zinc-850 hover:text-[#00ff00] text-zinc-400 px-2.5 py-1 text-[11px] rounded transition-colors font-mono cursor-pointer flex items-center gap-1 btn-secondary"
                  >
                    <FolderOpen size={11} />
                    打开文件夹
                  </button>
                </div>
              </div>

              {/* Row 4: Temporary files - Cleans up */}
              <div className="py-4 flex justify-between items-center text-xs">
                <div>
                  <h4 className="text-zinc-200 font-bold font-sans">系统缩略图、烘焙及日志缓存</h4>
                  <p className="text-zinc-500 text-[10px] mt-0.5 font-mono">
                    用于加速预览并记录端口异常回执
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono font-semibold ${tempCacheMB > 0 ? 'text-zinc-300' : 'text-zinc-650'}`}>
                    {tempCacheMB > 0 ? `${(tempCacheMB / 1024).toFixed(1)} GB (${tempCacheMB} MB)` : '0.0 字节'}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleOpenFolder('快照临时缓存', 'C:\\Program Files\\ArtPlatform\\temp')}
                      className="bg-[#121214] hover:bg-zinc-900 border border-zinc-850 text-zinc-455 px-2 py-1 text-[10.5px] rounded transition-colors font-mono cursor-pointer flex items-center gap-1 btn-secondary"
                    >
                      打开
                    </button>
                    <button 
                      disabled={tempCacheMB === 0}
                      onClick={() => setShowClearConfirm(true)}
                      className={`font-mono transition-colors text-[11px] px-2.5 py-1 rounded flex items-center gap-1 cursor-pointer ${
                        tempCacheMB > 0 
                          ? 'bg-red-950/40 border border-red-500/50 hover:bg-red-900/40 text-red-400' 
                          : 'bg-zinc-900/30 border border-zinc-900 text-zinc-600 cursor-not-allowed'
                      }`}
                    >
                      <Trash2 size={11} />
                      一键清理
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 font-mono italic mt-4">
              注：根据 PRD v1 物理规范设计，仅允许一键清理【系统临时文件的缓存】。应用本体、素材源文件等支持打开文件夹由用户手工定位及管理，避免意外清除项目生产资产。
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Sandbox Controller for testing and demonstrating */}
        <div className="space-y-6">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-5">
            <h2 className="text-sm font-bold text-white mb-3 font-display flex items-center gap-2">
              <RefreshCw size={16} className="text-[#00ff00] animate-spin-slow" />
              PRD 异常演示与仿真 D: 盘调配
            </h2>
            <div className="space-y-4 text-xs">
              <p className="text-zinc-400 leading-relaxed font-mono text-[11px] bg-zinc-950 p-2.5 rounded border border-zinc-900">
                💡 <b>测试导览：</b><br/>
                大型 DCC 部署需 15 GB 磁盘容量。在此处模拟配置磁盘空闲限制。
              </p>

              {/* Slider for Simulated Disk space */}
              <div className="space-y-2 border-t border-zinc-900 pt-3 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-[11px]">仿真可用磁盘空间 (GB):</span>
                  <span className={`text-sm font-bold ${simulatedDiskGB < 15 ? 'text-amber-500' : 'text-[#00ff00]'}`}>
                    {simulatedDiskGB.toFixed(1)} GB
                  </span>
                </div>
                
                <input 
                  type="range"
                  min="2"
                  max="100"
                  step="0.5"
                  value={simulatedDiskGB}
                  onChange={(e) => setSimulatedDiskGB(parseFloat(e.target.value))}
                  className="settings-range w-full accent-[#00ff00] h-1 rounded-lg cursor-pointer"
                  style={{ '--range-progress': `${simulatedDiskRangeProgress}%` } as React.CSSProperties}
                />

                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>2.0 GB (极低)</span>
                  <span>15.0 GB (Comfy界限)</span>
                  <span>100.0 GB (通顺)</span>
                </div>
              </div>

              {/* Instant crash simulation */}
              <div className="border-t border-zinc-900 pt-4 space-y-2 font-mono">
                <label className="text-zinc-400 text-[11px] block">模拟外部状态变更 (F3 崩溃自动还原)</label>
                <button
                  onClick={handleSimulateDisconnection}
                  className="w-full bg-[#1e0707] hover:bg-[#340d0d] border border-red-900/60 text-red-300 py-2 rounded text-xs transition-colors font-mono flex items-center justify-center gap-2 cursor-pointer"
                >
                  <PowerOff size={13} />
                  一键模拟 DCC 进程因异常崩溃断开
                </button>
                <span className="text-[10px] text-zinc-500 leading-normal block mt-1">
                  ※ 选中启动一个或多个 DCC 连接后，点击此键模拟宿主崩溃退出。Launcher 会在 10s 内探测到进程静止，并全自动将卡片写回“已安装·离线”状态。
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* MODAL: CLEAR DUST CONFIRMATION */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-sm w-full font-sans">
            <h3 className="text-base font-bold text-white font-display flex items-center gap-2 mb-2">
              <Trash2 size={18} className="text-red-500" />
              确认一键清理临时缓存文件？
            </h3>
            <p className="text-xs text-zinc-400 mb-6 font-mono leading-relaxed">
              清理范围包括缩略图快照文件、多重操作日志记录。此操作不会破坏您已经装好的 DCC 主程序及各种项目共享素材包。磁盘容量会回收 2.4 GB 额度。
            </p>

            <div className="flex gap-3 justify-end font-mono">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleClearTemp}
                className="px-5 py-1.5 bg-red-650 hover:bg-red-500 text-white rounded text-xs transition-colors"
              >
                确定清理
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { 
  Layers, 
  Search, 
  Download, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  HelpCircle,
  Clock,
  Play,
  X,
  ChevronDown,
  Check
} from 'lucide-react';
import { AppId, AppStatus, AppConfig, DccExtension, SpaceId, ProjectSpace } from '../types';

interface ExtensionManagerProps {
  currentSpace: ProjectSpace;
  apps: AppConfig[];
  setApps: React.Dispatch<React.SetStateAction<AppConfig[]>>;
  extensions: DccExtension[];
  setExtensions: React.Dispatch<React.SetStateAction<DccExtension[]>>;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  theme: 'light' | 'dark';
}

export default function ExtensionManager({
  currentSpace,
  apps,
  setApps,
  extensions,
  setExtensions,
  addLog,
  theme
}: ExtensionManagerProps) {
  // Filters
  const [selectedDccFilter, setSelectedDccFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [keywordSearch, setKeywordSearch] = useState<string>('');

  // Dropdown states
  const [dccFilterOpen, setDccFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

  // Refs for click outside
  const dccDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dccDropdownRef.current && !dccDropdownRef.current.contains(event.target as Node)) {
        setDccFilterOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Local UI State
  const [installingExtId, setInstallingExtId] = useState<string | null>(null);
  const [rebootNeededExt, setRebootNeededExt] = useState<DccExtension | null>(null);
  const [uninstallConfirmExt, setUninstallConfirmExt] = useState<DccExtension | null>(null);

  // Constants
  const isProjectA = currentSpace.id === SpaceId.ProjectA;

  // Render variables helper
  const getDccApp = (dccId: AppId): AppConfig | undefined => {
    return apps.find(a => a.id === dccId);
  };

  // F5 Install Trigger
  const handleInstallExt = (ext: DccExtension) => {
    const dcc = getDccApp(ext.dccId);
    if (!dcc || dcc.status !== AppStatus.Connected) {
      addLog(`❌ 无法安装拓展：对应主程序 ${ext.dccId.toUpperCase()} 必须处于【已连接】状态。`, 'error');
      return;
    }

    setInstallingExtId(ext.id);
    addLog(`⏳ 正在将插件 ${ext.name} 分发复制到 ${dcc.name} 的 plugins 插件目录中...`, 'info');

    // Simulate file copy (takes 1.2s)
    setTimeout(() => {
      setInstallingExtId(null);
      
      const updatedExtensions = extensions.map(e => {
        if (e.id === ext.id) {
          return { 
            ...e, 
            installed: true, 
            isActivated: !e.needsRestart // Maya/3dsmax activated immediately, Blender/ComfyUI/PS requires restart
          };
        }
        return e;
      });
      setExtensions(updatedExtensions);

      addLog(`✅ 插件 ${ext.name} 写入 DCC 插件目录成功。`, 'success');

      if (ext.needsRestart) {
        // Blender, ComfyUI, Photoshop need reboot
        const targetedExt = updatedExtensions.find(e => e.id === ext.id);
        if (targetedExt) {
          setRebootNeededExt(targetedExt);
        }
      } else {
        addLog(`⚡ [热加载成功] ${ext.name} 已成功加载并在 ${dcc.name} 中即时激活，可立即可用！`, 'success');
      }
    }, 1200);
  };

  // Functional simulated restart of DCC to activate extensions
  const performDccRestart = (dccId: AppId) => {
    setRebootNeededExt(null);
    const dcc = getDccApp(dccId);
    if (!dcc) return;

    addLog(`🔄 正在自动呼叫外部命令重启 ${dcc.name} 主实例...`, 'info');
    
    // Set app to Connecting (simulates restart process)
    setApps(prev => prev.map(a => {
      if (a.id === dccId) {
        return { ...a, status: AppStatus.Connecting };
      }
      return a;
    }));

    // Timeout simulations
    setTimeout(() => {
      setApps(prev => prev.map(a => {
        if (a.id === dccId) {
          addLog(`⚡ ${dcc.name} 重新挂载完毕，全部待加载插件已变更为【已激活】就绪状态！`, 'success');
          return { ...a, status: AppStatus.Connected };
        }
        return a;
      }));
      
      // Update Extensions activation status
      setExtensions(prev => prev.map(e => {
        if (e.dccId === dccId && e.installed) {
          return { ...e, isActivated: true };
        }
        return e;
      }));

    }, 2000);
  };

  // Uninstall flow - F6
  const requestUninstallExt = (ext: DccExtension) => {
    setUninstallConfirmExt(ext);
  };

  const confirmUninstallExt = () => {
    if (!uninstallConfirmExt) return;
    const ext = uninstallConfirmExt;
    const dcc = getDccApp(ext.dccId);
    const isRunning = dcc?.status === AppStatus.Connected;

    setExtensions(prev => prev.map(e => {
      if (e.id === ext.id) {
        return { ...e, installed: false, isActivated: false };
      }
      return e;
    }));

    addLog(`🗑️ 已移除 ${ext.name} 极其相关的配置文件。`, 'warning');
    if (isRunning && ext.needsRestart) {
      addLog(`⚠️ 提示: 由于 ${dcc?.name} 处于连接运行中，部分写入缓存将跟随下次 DCC 重启时完成彻底卸载抹除。`, 'info');
    }

    setUninstallConfirmExt(null);
  };

  // Filtering Logic
  const filteredExtensions = extensions.filter(ext => {
    // Space Filter: Only Space A has extensions in V1, others have 0
    if (!isProjectA) return false;

    // DCC Filter
    if (selectedDccFilter !== 'all' && ext.dccId !== selectedDccFilter) return false;

    // Status Filter
    if (selectedStatusFilter === 'installed' && !ext.installed) return false;
    if (selectedStatusFilter === 'not_installed' && ext.installed) return false;

    // Keyword Search
    if (keywordSearch.trim() !== '') {
      const matchWord = keywordSearch.toLowerCase();
      const nameMatch = ext.name.toLowerCase().includes(matchWord);
      const descMatch = ext.desc.toLowerCase().includes(matchWord);
      const authorMatch = ext.author.toLowerCase().includes(matchWord);
      return nameMatch || descMatch || authorMatch;
    }

    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col font-sans">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
          <Layers size={22} className="text-[#00ff00]" />
          应用插件与拓展 <span className="text-xs text-zinc-500 font-mono font-normal">Extensions & Plugins</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          将专属优化扩展及常用自动化节点无缝装载至指定 DCC 软件中。
          <span className="text-zinc-500 italic block mt-0.5">※ 拓展库数据跟随项目空间而变化。当前空间：{currentSpace.name}</span>
        </p>
      </div>

      {!isProjectA ? (
        /* Empty State for other spaces - PRD Scope V1 Empty Data */
        <div className="flex-1 border border-dashed border-[#27272a] bg-[#0c0c0e]/30 rounded flex flex-col items-center justify-center p-12 text-center select-none my-auto">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-[#27272a] flex items-center justify-center text-zinc-500 mb-4/5 text-zinc-600">
            <Layers size={28} />
          </div>
          <h3 className="text-sm font-bold text-zinc-300 font-display mt-4">当前空间无专有拓展</h3>
          <p className="text-xs text-zinc-500 mt-2 max-w-sm leading-relaxed font-mono">
            【{currentSpace.name}】暂未由网管后台（管理员）配置自定义美术插件源。
            <br/>
            请通过边栏空间下拉器切换至 <span className="text-[#00ff00] underline font-bold cursor-pointer hover:text-white" onClick={() => setSelectedDccFilter('all')}>项目空间 A (三国奇幻RPG)</span> 体验插件的下载与热加载！
          </p>
        </div>
      ) : (
        <>
          {/* Filtering Tools Panel */}
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-4 mb-4 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
                <input 
                  type="text" 
                  value={keywordSearch}
                  onChange={e => setKeywordSearch(e.target.value)}
                  placeholder="搜索插件名称、描述或作者..."
                  className="w-full bg-zinc-950 border border-zinc-900 focus:border-[#00ff00] transition-colors outline-none text-xs rounded py-2 pl-9 pr-4 text-zinc-200"
                />
              </div>

              {/* DCC Sort Selector */}
              <div className="flex items-center gap-1.5 font-mono relative" ref={dccDropdownRef}>
                <span className="text-[10px] text-zinc-500 uppercase">DCC 类型:</span>
                <button
                  type="button"
                  onClick={() => setDccFilterOpen(!dccFilterOpen)}
                  className={`flex items-center justify-between text-xs py-1.5 px-3 rounded-md border min-w-[140px] text-left transition-all font-sans cursor-pointer ${
                    theme === 'light'
                      ? 'bg-white border-slate-200 text-slate-800 hover:border-[#00C800]'
                      : 'bg-[#000000] border-zinc-900 text-zinc-300 hover:border-[#00ff00]'
                  }`}
                >
                  <span>{
                    selectedDccFilter === 'all' ? '显示全部 DCC' :
                    selectedDccFilter === 'comfyui' ? 'ComfyUI' :
                    selectedDccFilter === 'blender' ? 'Blender' :
                    selectedDccFilter === 'maya' ? 'Autodesk Maya' :
                    selectedDccFilter === 'photoshop' ? 'Adobe Photoshop' :
                    selectedDccFilter === 'max3ds' ? 'Autodesk 3ds Max' : '显示全部 DCC'
                  }</span>
                  <ChevronDown size={11} className={`ml-2 text-zinc-500 transition-transform ${dccFilterOpen ? 'rotate-180' : ''}`} />
                </button>

                {dccFilterOpen && (
                  <div className={`absolute right-0 top-full mt-1 z-50 rounded-md shadow-xl border p-1 w-44 flex flex-col gap-[1px] ${
                    theme === 'light'
                      ? 'bg-white border-slate-200'
                      : 'bg-[#121214] border-zinc-850'
                  }`}>
                    {[
                      { value: 'all', label: '显示全部 DCC' },
                      { value: 'comfyui', label: 'ComfyUI' },
                      { value: 'blender', label: 'Blender' },
                      { value: 'maya', label: 'Autodesk Maya' },
                      { value: 'photoshop', label: 'Adobe Photoshop' },
                      { value: 'max3ds', label: 'Autodesk 3ds Max' }
                    ].map(opt => {
                      const isActive = selectedDccFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSelectedDccFilter(opt.value);
                            setDccFilterOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-sans text-left transition-colors ${
                            isActive
                              ? (theme === 'light' ? 'bg-emerald-50 text-[#00C800] font-semibold' : 'bg-[#1c1c1f] text-[#00ff00] font-semibold')
                              : (theme === 'light' ? 'text-slate-700 hover:bg-slate-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white')
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isActive && <Check size={11} className={theme === 'light' ? 'text-[#00C800]' : 'text-[#00ff00]'} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Install Status Selector */}
              <div className="flex items-center gap-1.5 font-mono relative" ref={statusDropdownRef}>
                <span className="text-[10px] text-zinc-500 uppercase">安装状态:</span>
                <button
                  type="button"
                  onClick={() => setStatusFilterOpen(!statusFilterOpen)}
                  className={`flex items-center justify-between text-xs py-1.5 px-3 rounded-md border min-w-[125px] text-left transition-all font-sans cursor-pointer ${
                    theme === 'light'
                      ? 'bg-white border-slate-200 text-slate-800 hover:border-[#00C800]'
                      : 'bg-[#000000] border-zinc-900 text-zinc-300 hover:border-[#00ff00]'
                  }`}
                >
                  <span>{
                    selectedStatusFilter === 'all' ? '显示全部状态' :
                    selectedStatusFilter === 'installed' ? '已安装' :
                    selectedStatusFilter === 'not_installed' ? '未安装' : '显示全部状态'
                  }</span>
                  <ChevronDown size={11} className={`ml-2 text-zinc-500 transition-transform ${statusFilterOpen ? 'rotate-180' : ''}`} />
                </button>

                {statusFilterOpen && (
                  <div className={`absolute right-0 top-full mt-1 z-50 rounded-md shadow-xl border p-1 w-36 flex flex-col gap-[1px] ${
                    theme === 'light'
                      ? 'bg-white border-slate-200'
                      : 'bg-[#121214] border-[#27272a]'
                  }`}>
                    {[
                      { value: 'all', label: '显示全部状态' },
                      { value: 'installed', label: '已安装' },
                      { value: 'not_installed', label: '未安装' }
                    ].map(opt => {
                      const isActive = selectedStatusFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSelectedStatusFilter(opt.value);
                            setStatusFilterOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-sans text-left transition-colors ${
                            isActive
                              ? (theme === 'light' ? 'bg-emerald-50 text-[#00C800] font-semibold' : 'bg-[#1c1c1f] text-[#00ff00] font-semibold')
                              : (theme === 'light' ? 'text-slate-700 hover:bg-slate-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white')
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isActive && <Check size={11} className={theme === 'light' ? 'text-[#00C800]' : 'text-[#00ff00]'} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Tags Ribbon */}
            <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-zinc-900">
              <span className="text-[10px] uppercase font-mono text-zinc-500 mr-2">快速标签:</span>
              {['all', 'comfyui', 'blender', 'maya', 'photoshop', 'max3ds'].map(dccKey => {
                const isAct = selectedDccFilter === dccKey;
                let label = dccKey === 'all' ? '全部' : dccKey.toUpperCase();
                if (dccKey === 'max3ds') label = '3DS MAX';
                return (
                  <button
                    key={dccKey}
                    onClick={() => setSelectedDccFilter(dccKey)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-all border ${
                      isAct 
                        ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00] font-bold' 
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core Extensions Grid */}
          {filteredExtensions.length === 0 ? (
            <div className="flex-1 border border-zinc-900 bg-[#0c0c0e]/10 rounded flex flex-col items-center justify-center p-8 text-center py-20 select-none">
              <span className="text-zinc-600 font-mono text-xs">没有匹配的查询结果，请调整搜索条件或分类。</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredExtensions.map((ext) => {
                const dccApp = getDccApp(ext.dccId);
                const isDccConnected = dccApp?.status === AppStatus.Connected;
                const isInstalling = installingExtId === ext.id;

                return (
                  <div 
                    key={ext.id}
                    className="bg-[#0c0c0e] border border-[#27272a] rounded p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors"
                  >
                    {/* Header Row */}
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-xs font-bold text-white tracking-wide font-sans">{ext.name}</h3>
                            <span className="text-[9.5px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 px-1 py-0.2 rounded">
                              {ext.version}
                            </span>
                          </div>
                          
                          {/* DCC Associated info */}
                          <div className="mt-1 flex items-center gap-1.5 text-[9.5px] font-mono text-[#00ff00]">
                            <span>宿主 DCC:</span>
                            <span className="underline uppercase">{ext.dccId === AppId.Max3ds ? '3DS MAX' : ext.dccId}</span>
                          </div>
                        </div>

                        {/* Status Label */}
                        <div className="text-right">
                          {!ext.installed ? (
                            <span className="text-[9.5px] font-mono border border-dashed border-zinc-800 text-zinc-600 px-1.5 py-0.2 rounded">
                              未安装
                            </span>
                          ) : ext.isActivated ? (
                            <span className="text-[9px] font-mono bg-[#00ff00]/15 text-[#00ff00] px-1.5 py-0.2 rounded border border-[#00ff00]/30 font-bold">
                              已激活
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono bg-amber-900/40 text-amber-300 px-1.5 py-0.2 rounded border border-amber-800/40 font-bold animate-pulse" title="已复制，需要重启相应 DCC 软件方能完全加载">
                              待重启生效
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Desc snippet */}
                      <p className="text-xs text-zinc-400 mt-2 font-sans leading-relaxed line-clamp-2">
                        {ext.desc}
                      </p>
                    </div>

                    {/* Bottom Controls */}
                    <div className="mt-4 pt-3 border-t border-zinc-900/60 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <div>
                        <span>作者: {ext.author}</span>
                      </div>

                      <div>
                        {isInstalling ? (
                          <div className="flex items-center gap-1.5 text-[#00ff00]">
                            <RefreshCw size={11} className="animate-spin" />
                            <span>正在写入...</span>
                          </div>
                        ) : !ext.installed ? (
                          <div className="flex items-center gap-2">
                            {/* If DCC not connected, disable button according to PRD rule */}
                            {!isDccConnected ? (
                              <div className="relative group/tip flex items-center">
                                <button
                                  disabled
                                  className={`px-2.5 py-1 text-[10.5px] rounded border transition-all flex items-center gap-1 cursor-not-allowed ${
                                    theme === 'light'
                                      ? 'bg-slate-50 border-slate-200 text-slate-400'
                                      : 'bg-[#121214] border-zinc-800/80 text-zinc-500/80'
                                  }`}
                                >
                                  <Download size={11} />
                                  安装限制
                                </button>
                                
                                {/* Float Tooltip */}
                                <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover/tip:block bg-black border border-red-500/50 p-2.5 rounded shadow-2xl z-50 w-52 text-zinc-300 leading-tight">
                                  <div className="flex items-start gap-1 p-0.5">
                                    <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                                    <span>请先在应用管理中 <b>启动并且连接</b> 【{ext.dccId.toUpperCase()}】主程序，系统检测到端口通顺后方可下发插件安装包。</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleInstallExt(ext)}
                                className="bg-white hover:bg-zinc-200 text-black font-semibold px-3 py-1 text-[10.5px] rounded transition-colors flex items-center gap-1 cursor-pointer btn-primary"
                              >
                                <Download size={11} />
                                写入宿主
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {ext.needsRestart && !ext.isActivated && isDccConnected && (
                              <button
                                onClick={() => setRebootNeededExt(ext)}
                                className="bg-amber-900/20 hover:bg-amber-900/40 border border-amber-600/60 text-amber-400 px-2 py-0.5 rounded text-[10px] cursor-pointer mr-1.5 flex items-center gap-0.5 transition-colors"
                              >
                                <RefreshCw size={10} />
                                重启 DCC
                              </button>
                            )}
                            <button
                              onClick={() => requestUninstallExt(ext)}
                              className="text-red-500/65 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Trash2 size={11} />
                              卸载
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* DETAILED MODAL 1: REBOOT REQUIRED PROMPT AND SIMULATION (F5) */}
      {rebootNeededExt && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-md w-full font-sans">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-amber-950/40 border border-amber-900 rounded text-amber-400">
                <Clock size={22} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">已部署完成 · 重启生效</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  插件 <span className="text-[#00ff00] font-bold">{rebootNeededExt.name}</span> 已经复制到系统对应目录。
                </p>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded text-xs font-mono space-y-2 mb-6 text-zinc-300 leading-relaxed">
              根据 DCC 应用兼容手册，<b>{rebootNeededExt.dccId.toUpperCase()}</b> 不支持插件热插拔挂载（冷启动限制）。
              <br/>
              <br/>
              您可以<b>点击下方一键按钮重启宿主软件</b>，平台会自动存储必要缓存，并在 3 秒内自动执行安全复启，唤起插件：
            </div>

            <div className="flex gap-3 justify-end font-mono">
              <button 
                onClick={() => setRebootNeededExt(null)}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors btn-secondary"
              >
                稍后我手动重启
              </button>
              <button
                onClick={() => performDccRestart(rebootNeededExt.dccId)}
                className="px-5 py-1.5 bg-[#00ff00] text-black font-semibold rounded text-xs transition-all hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] glow-btn flex items-center gap-1 font-bold cursor-pointer btn-special"
              >
                <RefreshCw size={12} className="animate-spin text-black" />
                立即重启 DCC 软件
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED MODAL 2: UNINSTALL CONFIRMATION WARNING DYNAMIC (F6) */}
      {uninstallConfirmExt && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-md w-full font-sans">
            <h3 className="text-base font-bold text-white font-display flex items-center gap-2 mb-2">
              <Trash2 size={18} className="text-red-500" />
              确认卸载该项目拓展插件
            </h3>
            <p className="text-xs text-zinc-400 mb-4 font-mono leading-relaxed">
              您确定要将拓展 <b>{uninstallConfirmExt.name}</b> 从软件主目录中完全删除吗？删除后将无法在此 DCC 的节点面板/主页面中调用它的指令。
            </p>

            {/* If corresponding DCC is connected, show restart warning! */}
            {getDccApp(uninstallConfirmExt.dccId)?.status === AppStatus.Connected && (
              <div className="bg-red-950/20 border border-red-500/30 p-3 rounded text-zinc-300 text-xs font-mono mb-6 leading-relaxed flex items-start gap-2">
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <span>
                  <b>⚠️ 实时运行警告：</b><br/>
                  对应软件 <b>{uninstallConfirmExt.dccId.toUpperCase()}</b> 目前正在运行中。文件物理层删除后，需手动完成一次主程序的【重启/重新连接】才能在宿主界面中完全移除此菜单。
                </span>
              </div>
            )}

            <div className="flex gap-3 justify-end font-mono">
              <button 
                onClick={() => setUninstallConfirmExt(null)}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors btn-secondary"
              >
                取消
              </button>
              <button
                onClick={confirmUninstallExt}
                className="px-5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs transition-colors"
              >
                授权卸载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

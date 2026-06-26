import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  ChevronUp, 
  ChevronDown, 
  X, 
  HelpCircle,
  Database,
  Info
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { PROJECT_SPACES, INITIAL_APPS, EXTENSIONS_PROJECT_A, ART_ASSETS_PROJECT_A } from './data';
import { ProjectSpace, AppConfig, DccExtension, ArtAsset, PersonalUploadedAsset, SpaceId } from './types';

// Importing child components
import Sidebar from './components/Sidebar';
import AppManager from './components/AppManager';
import ExtensionManager from './components/ExtensionManager';
import AssetLibrary from './components/AssetLibrary';
import SettingsPanel from './components/SettingsPanel';
import PermissionManager from './components/PermissionManager';

interface LogLine {
  text: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export default function App() {
  // Theme state - Persists locally
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('art-launcher-theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('art-launcher-theme', nextTheme);
    addLog(`🌓 切换客户端显示模式: 【${nextTheme === 'light' ? '极简亮色 (Light Mode)' : '深邃暗色 (Dark Mode)'}】`, 'success');
  };

  // Sidebar and space states - F7
  const [currentTab, setCurrentTab] = useState<string>('assets');
  const [currentSpace, setCurrentSpace] = useState<ProjectSpace>(
    PROJECT_SPACES.find((space) => space.id === SpaceId.ProjectA) ?? PROJECT_SPACES[0]
  );
  const [isInitial, setIsInitial] = useState<boolean>(true);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);

  // Global Sync Status Containers
  const [apps, setApps] = useState<AppConfig[]>(INITIAL_APPS);
  const [extensions, setExtensions] = useState<DccExtension[]>(EXTENSIONS_PROJECT_A);
  const [assets] = useState<ArtAsset[]>(ART_ASSETS_PROJECT_A);
  const [personalAssets, setPersonalAssets] = useState<PersonalUploadedAsset[]>([]);

  // Pre-seed some downloaded assets to show the "Already Downloaded" status immediately in V1 demo
  const [downloadedAssetIds, setDownloadedAssetIds] = useState<Set<string>>(
    new Set(['asset-02', 'asset-05']) // pre-download Weapon model and Scene atmosphere
  );

  // Simulation settings - F10 Cache Sizes & Storage Bounds
  const [simulatedDiskGB, setSimulatedDiskGB] = useState<number>(12.0); // 12GB available by default to trigger ComfyUI 15GB space check!
  const [tempCacheMB, setTempCacheMB] = useState<number>(2457.6); // 2.4 GB of temp logs

  // Retractable Terminal Console States
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [consoleExpanded, setConsoleExpanded] = useState<boolean>(false);

  // Initializing default launcher notifications
  useEffect(() => {
    addLog('🖥️ Art Launcher Client v1.0.4 初始化启动...', 'info');
    addLog('🔍 自动检索物理注册表: 发现 Blender 4.1.0 路径及 Photoshop v24.0.', 'info');
    addLog('🔍 自动检索物理注册表: Autodesk Maya 2024 安装定位就绪。', 'info');
    addLog('⚠️ 警告: Autodesk 3ds Max 运行文件校验失败，状态变更为【未就绪】，请配置手工桥接。', 'warning');
    addLog('📁 项目空间【三国奇幻RPGA】分发中心握手完毕，已加载 22 个定制插件、100+美术共享元数据。', 'success');
  }, []);

  // System logging helper
  const addLog = (text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs(prev => [...prev, { text, timestamp: timeStr, type }]);
  };

  // Switch Space side effect logging
  useEffect(() => {
    addLog(`🔄 切换项目空间至: 【${currentSpace.name}】`, 'info');
    if (currentSpace.id !== SpaceId.ProjectA) {
      addLog(`⚠️ 【${currentSpace.name}】无预置缓存。应用插件和美术素材清单已清空。`, 'warning');
    } else {
      addLog(`📁 已重新加载【项目空间 A】下 22 个专属拓展及 100+ 模型原画元数据包。`, 'success');
    }

    if (isInitial) {
      setIsInitial(false);
    } else {
      setToast({
        id: Date.now(),
        message: `已切换至【${currentSpace.name}】`,
        type: 'success'
      });
    }
  }, [currentSpace]);

  // Toast auto-dismiss timer
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Render correct panel subcomponent
  const renderTabContent = () => {
    switch (currentTab) {
      case 'extensions':
        return (
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <AppManager
              apps={apps}
              setApps={setApps}
              simulatedDiskGB={simulatedDiskGB}
              setSimulatedDiskGB={setSimulatedDiskGB}
              addLog={addLog}
              theme={theme}
            />
            <ExtensionManager
              currentSpace={currentSpace}
              apps={apps}
              setApps={setApps}
              extensions={extensions}
              setExtensions={setExtensions}
              addLog={addLog}
              theme={theme}
            />
          </div>
        );
      case 'assets':
        return (
          <AssetLibrary
            currentSpace={currentSpace}
            setCurrentSpace={setCurrentSpace}
            apps={apps}
            assets={assets}
            personalAssets={personalAssets}
            setPersonalAssets={setPersonalAssets}
            downloadedAssetIds={downloadedAssetIds}
            setDownloadedAssetIds={setDownloadedAssetIds}
            simulatedDiskGB={simulatedDiskGB}
            setSimulatedDiskGB={setSimulatedDiskGB}
            addLog={addLog}
          />
        );
      case 'settings':
        return (
          <SettingsPanel
            apps={apps}
            setApps={setApps}
            assets={assets}
            downloadedAssetIds={downloadedAssetIds}
            simulatedDiskGB={simulatedDiskGB}
            setSimulatedDiskGB={setSimulatedDiskGB}
            tempCacheMB={tempCacheMB}
            setTempCacheMB={setTempCacheMB}
            addLog={addLog}
          />
        );
      case 'canvas':
        return <div className="flex-1"></div>;
      case 'permissions':
        return <PermissionManager addLog={addLog} />;
      default:
        return (
          <div className="flex-1 p-8 text-zinc-500 font-mono">
            未发现选项卡对应区块
          </div>
        );
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden font-sans select-none antialiased transition-colors duration-200 relative ${
      theme === 'light' ? 'bg-[#f8fafc] text-zinc-800 light' : 'bg-[#09090b] text-zinc-200 dark'
    }`}>
      
      {/* Global Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-3 py-2 rounded-md shadow-xl border text-[11px] font-mono select-none"
            style={{
              backgroundColor: theme === 'light' ? '#ffffff' : '#0a0a0c',
              borderColor: theme === 'light' ? '#cbd5e1' : '#27272a',
              color: theme === 'light' ? '#0f172a' : '#f4f4f5',
              boxShadow: theme === 'light' ? '0 10px 15px -3px rgba(0,0,0,0.1)' : '0 10px 15px -3px rgba(0,0,0,0.5)',
            }}
          >
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${theme === 'light' ? 'bg-[#00C800]' : 'bg-[#00ff00]'}`}></div>
            <span className="font-semibold">{toast.message}</span>
            <button 
              onClick={() => setToast(null)}
              className={`ml-2 text-zinc-500 transition-colors cursor-pointer shrink-0 ${
                theme === 'light' ? 'hover:text-[#00C800]' : 'hover:text-[#00ff00]'
              }`}
            >
              <X size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. Left Navigation Sidebar */}
      <Sidebar 
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        currentSpace={currentSpace}
        simulatedDiskGB={simulatedDiskGB}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* 2. Main Work Content Area (split with bottom collapsible terminal log) */}
      <div className={`flex-1 flex flex-col h-screen min-w-0 relative ${
        theme === 'light' ? 'bg-[#f8fafc]' : 'bg-[#09090b]'
      }`}>
        
        {/* Core panel interface renderer */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {renderTabContent()}
        </div>

        {/* 3. Retractable Launcher System Console Drawer at Bottom */}
        <div className="shrink-0 bg-[#070708] border-t border-[#1c1c1f] flex flex-col z-40 transition-all font-mono">
          
          {/* Console Header Bar */}
          <div 
            onClick={() => setConsoleExpanded(!consoleExpanded)}
            className="px-4 py-2 bg-[#0a0a0c] hover:bg-[#121214] flex items-center justify-between text-[11px] text-zinc-400 font-bold tracking-wider cursor-pointer border-b border-[#18181a] select-none console-header-bar"
          >
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-[#00ff00]" />
              <span className="text-[#f4f4f5]">运行日志与派发流</span>
              <span className="text-[9px] bg-zinc-900 border border-zinc-800 text-zinc-500 rounded px-1 min-w-[30px] text-center font-normal">
                {logs.length} 条
              </span>
            </div>
            
            <div className="flex items-center gap-3 font-normal text-[10px]">
              <span className="text-zinc-600 truncate max-w-[240px] md:max-w-md hidden sm:inline">
                {logs.length > 0 ? `最新: ${logs[logs.length - 1].text}` : ''}
              </span>
              <div className="text-zinc-400">
                {consoleExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </div>
            </div>
          </div>

          {/* Collapsible Console Feed Lines */}
          {consoleExpanded && (
            <div className="h-32 p-3 overflow-y-auto text-[10.5px] leading-relaxed space-y-1 font-mono selection:bg-[#00ff00]/20 selection:text-white">
              {logs.length === 0 ? (
                <div className="text-zinc-700 italic select-none">等待客户端交互...</div>
              ) : (
                logs.map((log, index) => {
                  let badgeColor = 'text-zinc-500';
                  if (log.type === 'success') badgeColor = 'text-[#00ff00] font-bold';
                  else if (log.type === 'warning') badgeColor = 'text-amber-500';
                  else if (log.type === 'error') badgeColor = 'text-red-500 font-bold';

                  return (
                    <div key={index} className="flex items-start gap-2.5 hover:bg-zinc-90 w-full p-0.5 rounded transition-colors group">
                      <span className="text-zinc-650 select-none shrink-0">[{log.timestamp}]</span>
                      <span className={`${badgeColor} uppercase text-[9.2px] border border-black group-hover:border-zinc-900 cursor-default font-semibold shrink-0 px-1 rounded-sm tracking-wide`}>
                        {log.type}
                      </span>
                      <span className="text-zinc-300 break-all select-text font-mono flex-1">{log.text}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

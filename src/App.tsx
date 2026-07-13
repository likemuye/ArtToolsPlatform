import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  ChevronUp, 
  ChevronDown, 
  X, 
  HelpCircle,
  Database,
  Info,
  Bell,
  CheckCheck,
  FolderOpen,
  Palette,
  Wrench
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { PROJECT_SPACES, INITIAL_APPS, EXTENSIONS_PROJECT_A, ART_ASSETS_PROJECT_A } from './data';
import { ProjectSpace, AppConfig, DccExtension, ArtAsset, PersonalUploadedAsset, SpaceId, AuthSession, AppNotification, NotificationDomain } from './types';
import {
  loadSession,
  saveSession,
  clearSession,
  isExpired,
  needsRenewal,
  renewSession
} from './auth';

// Importing child components
import Sidebar from './components/Sidebar';
import ExtensionManager from './components/ExtensionManager';
import AssetLibrary from './components/AssetLibrary';
import CanvasLibrary from './components/CanvasLibrary';
import CanvasEditorWindow from './components/CanvasEditorWindow';
import SettingsPanel from './components/SettingsPanel';
import PermissionManager from './components/PermissionManager';
import LoginPage from './components/LoginPage';

interface LogLine {
  text: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

const EXTENSION_STATE_STORAGE_KEY = 'pixgo-extensions-v03';
const DCC_STATE_STORAGE_KEY = 'pixgo-dcc-state-v03';

const NOTIFICATION_DOMAIN_META: Record<NotificationDomain, { label: string; icon: typeof Bell; accent: string }> = {
  canvas: { label: '画布', icon: Palette, accent: '#38bdf8' },
  asset: { label: '素材', icon: FolderOpen, accent: '#22c55e' },
  tool: { label: '工具', icon: Wrench, accent: '#f59e0b' }
};

const buildInitialNotifications = (): AppNotification[] => {
  const now = Date.now();
  return [
    {
      id: 'notification-canvas-share-demo',
      domain: 'canvas',
      node: 'canvas-share',
      trigger: '画布被分享 / 授权',
      recipient: '被分享用户',
      title: '分享画布权限',
      content: '赵云 将画布「赵云盔甲细节讨论」分享给您，权限：编辑者',
      canvasName: '赵云盔甲细节讨论',
      actorName: '赵云',
      createdAt: new Date(now - 1000 * 60 * 12).toISOString(),
      unread: true
    },
    {
      id: 'notification-discussion-invite-demo',
      domain: 'canvas',
      node: 'discussion-invite',
      trigger: '发起或邀请加入音频讨论',
      recipient: '被邀请协作者',
      title: '邀请讨论',
      content: '慕也 邀请您加入画布「冰河三国主视觉方向」的音频讨论',
      canvasName: '冰河三国主视觉方向',
      actorName: '慕也',
      createdAt: new Date(now - 1000 * 60 * 37).toISOString(),
      unread: true
    },
    {
      id: 'notification-discussion-summary-demo',
      domain: 'canvas',
      node: 'discussion-summary',
      trigger: 'AI 讨论总结生成完成',
      recipient: '讨论发起人',
      title: '讨论总结完成',
      content: '画布「冰河三国主视觉方向」的讨论总结已生成，点击查看',
      canvasName: '冰河三国主视觉方向',
      actorName: 'AI 讨论总结',
      createdAt: new Date(now - 1000 * 60 * 58).toISOString(),
      unread: false
    },
    {
      id: 'notification-comment-mention-demo',
      domain: 'canvas',
      node: 'comment-mention',
      trigger: '评论中 @某用户',
      recipient: '被@用户',
      title: '评论 @提醒',
      content: '诸葛亮 在画布「场景雾效参考整合」中提到了您：@慕也 这里的雾效层次可以更明确一些',
      canvasName: '场景雾效参考整合',
      actorName: '诸葛亮',
      createdAt: new Date(now - 1000 * 60 * 83).toISOString(),
      unread: false
    }
  ];
};

export default function App() {
  const isCanvasEditorWindow = new URLSearchParams(window.location.search).has('canvasId');

  // Theme preference: 'light' | 'dark' | 'system'（跟随系统）。
  const [themePref, setThemePref] = useState<'dark' | 'light' | 'system'>(() => {
    const stored = localStorage.getItem('art-launcher-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'dark';
  });

  // 系统配色（仅当 themePref === 'system' 时生效）。
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() => (
    typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark'
  ));

  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'light' : 'dark');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // 实际生效的主题。
  const theme: 'dark' | 'light' = themePref === 'system' ? systemTheme : themePref;

  // 设置主题偏好（浅色/深色/跟随系统）。
  const setThemePreference = (pref: 'dark' | 'light' | 'system') => {
    setThemePref(pref);
    localStorage.setItem('art-launcher-theme', pref);
    const label = pref === 'light' ? '极简亮色 (Light)' : pref === 'dark' ? '深邃暗色 (Dark)' : '跟随系统 (System)';
    addLog(`🌓 切换客户端显示模式: 【${label}】`, 'success');
  };

  // 旧入口兼容：在浅/深之间切换（折叠态等仍可用）。
  const toggleTheme = () => setThemePreference(theme === 'dark' ? 'light' : 'dark');

  // 登录会话（钉钉扫码 → Token，7 天有效，过期前 1 天静默续期）。
  const [session, setSession] = useState<AuthSession | null>(() => {
    const stored = loadSession();
    if (!stored) return null;
    return isExpired(stored, Date.now()) ? null : stored;
  });

  // Sidebar and space states - F7
  const [currentTab, setCurrentTab] = useState<string>('assets');
  const [currentSpace, setCurrentSpace] = useState<ProjectSpace>(
    PROJECT_SPACES.find((space) => space.id === SpaceId.ProjectA) ?? PROJECT_SPACES[0]
  );
  const [isInitial, setIsInitial] = useState<boolean>(true);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>(buildInitialNotifications);
  const [notificationDetailId, setNotificationDetailId] = useState<string | null>(null);

  // Global Sync Status Containers
  const [apps, setApps] = useState<AppConfig[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DCC_STATE_STORAGE_KEY) ?? '[]') as AppConfig[];
      if (!Array.isArray(stored)) return INITIAL_APPS;
      return INITIAL_APPS.map(initial => ({ ...initial, ...stored.find(item => item.id === initial.id) }));
    } catch {
      return INITIAL_APPS;
    }
  });
  const [extensions, setExtensions] = useState<DccExtension[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(EXTENSION_STATE_STORAGE_KEY) ?? '[]') as DccExtension[];
      return Array.isArray(stored) && stored.length > 0 ? stored : EXTENSIONS_PROJECT_A;
    } catch {
      return EXTENSIONS_PROJECT_A;
    }
  });
  const [assets] = useState<ArtAsset[]>(ART_ASSETS_PROJECT_A);
  const [personalAssets, setPersonalAssets] = useState<PersonalUploadedAsset[]>([]);
  const [activeExtensionDownloadCount, setActiveExtensionDownloadCount] = useState(0);

  // Pre-seed some downloaded assets to show the "Already Downloaded" status immediately in V1 demo
  const [downloadedAssetIds, setDownloadedAssetIds] = useState<Set<string>>(
    new Set(['asset-02', 'asset-05']) // pre-download Weapon model and Scene atmosphere
  );

  // Simulation settings - F10 Cache Sizes & Storage Bounds
  const [simulatedDiskGB, setSimulatedDiskGB] = useState<number>(12.0);
  const [tempCacheMB, setTempCacheMB] = useState<number>(2457.6); // 2.4 GB of temp logs

  // Retractable Terminal Console States
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [consoleExpanded, setConsoleExpanded] = useState<boolean>(false);

  // Initializing default client notifications
  useEffect(() => {
    addLog('🖥️ PixGo Client v1.0.4 初始化启动...', 'info');
    addLog('🔍 自动检索物理注册表: 发现 Blender 4.1.0 路径及 Photoshop v24.0.', 'info');
    addLog('🔍 自动检索物理注册表: Autodesk Maya 2024 安装定位就绪。', 'info');
    addLog('⚠️ 警告: Autodesk 3ds Max 运行文件校验失败，状态变更为【未就绪】，请配置手工桥接。', 'warning');
    addLog('📁 项目空间【三国奇幻RPGA】分发中心握手完毕，已加载 22 个定制插件、100+美术共享元数据。', 'success');
  }, []);

  useEffect(() => {
    localStorage.setItem(DCC_STATE_STORAGE_KEY, JSON.stringify(apps));
  }, [apps]);

  useEffect(() => {
    localStorage.setItem(EXTENSION_STATE_STORAGE_KEY, JSON.stringify(extensions));
  }, [extensions]);

  // System logging helper. Success/error also raise a global toast (1.5s), unless the caller
  // opts out via { toast: false } — used by sub-flows that already show an inline message.
  const addLog = (
    text: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    options?: { toast?: boolean }
  ) => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs(prev => [...prev, { text, timestamp: timeStr, type }]);

    const shouldToast = options?.toast !== false && (type === 'success' || type === 'error');
    if (shouldToast) {
      // Strip a leading emoji + spaces so the toast reads cleanly.
      const message = text.replace(/^[^一-龥A-Za-z0-9]+/, '').trim() || text;
      setToast({ id: Date.now(), message, type });
    }
  };

  const addNotification = (notification: Omit<AppNotification, 'id' | 'createdAt' | 'unread'> & { createdAt?: string; unread?: boolean }) => {
    const nextNotification: AppNotification = {
      ...notification,
      id: `notification-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: notification.createdAt ?? new Date().toISOString(),
      unread: notification.unread ?? true
    };
    setNotifications(prev => [nextNotification, ...prev]);
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(item => ({ ...item, unread: false })));
  };

  const openNotificationDetail = (id: string) => {
    setNotificationDetailId(id);
    setNotifications(prev => prev.map(item => item.id === id ? { ...item, unread: false } : item));
  };

  const notificationDetail = notificationDetailId
    ? notifications.find(item => item.id === notificationDetailId) ?? null
    : null;

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

  // Toast auto-dismiss timer: 成功 1.5s；失败（含错误原因）停留更久，便于阅读。
  useEffect(() => {
    if (toast) {
      const duration = toast.type === 'error' ? 3500 : 1500;
      const timer = setTimeout(() => {
        setToast(null);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // 登录成功：保存 Token，进入主界面；首次登录提示已自动创建个人空间。
  const handleLogin = (newSession: AuthSession, isFirstLogin: boolean) => {
    saveSession(newSession);
    setSession(newSession);
    if (isFirstLogin) {
      addLog(`🎉 首次登录成功，已为【${newSession.name}】自动创建个人空间。`, 'success');
    } else {
      addLog(`✅ 欢迎回来，${newSession.name}！登录态有效期 7 天。`, 'success');
    }
  };

  // 主动登出：清 Token / 下载任务 / 缓存，返回登录页。
  const handleLogout = () => {
    clearSession();
    setSession(null);
    setDownloadedAssetIds(new Set());
    setPersonalAssets([]);
    setCurrentTab('assets');
    localStorage.removeItem('pixgo-extension-download-tasks-v03');
    setActiveExtensionDownloadCount(0);
    addLog('👋 已退出登录，本地令牌与下载任务已清除。', 'info', { toast: false });
  };

  // Token 生命周期守护：过期则自动登出；进入续期窗口（<1天）静默续期。
  useEffect(() => {
    if (!session) return;
    const guard = () => {
      const now = Date.now();
      if (isExpired(session, now)) {
        clearSession();
        setSession(null);
        setToast({ id: Date.now(), message: '登录态已过期，请重新扫码登录。', type: 'warning' });
        return;
      }
      if (needsRenewal(session, now)) {
        const renewed = renewSession(session, now);
        saveSession(renewed);
        setSession(renewed);
        addLog('🔄 登录令牌已静默续期，有效期顺延 7 天。', 'info', { toast: false });
      }
    };
    guard();
    const timer = window.setInterval(guard, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  // Render correct panel subcomponent
  const renderTabContent = () => {
    switch (currentTab) {
      case 'extensions':
        return null;
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
            extensions={extensions}
            assets={assets}
            downloadedAssetIds={downloadedAssetIds}
            simulatedDiskGB={simulatedDiskGB}
            setSimulatedDiskGB={setSimulatedDiskGB}
            tempCacheMB={tempCacheMB}
            setTempCacheMB={setTempCacheMB}
            activeDownloadCount={activeExtensionDownloadCount}
            theme={theme}
            addLog={addLog}
          />
        );
      case 'canvas':
        return (
          <CanvasLibrary
            currentSpace={currentSpace}
            setCurrentSpace={setCurrentSpace}
            addLog={addLog}
            addNotification={addNotification}
            theme={theme}
          />
        );
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
    <>
      {!session && (
        <div className={theme === 'light' ? 'light' : 'dark'}>
          <LoginPage theme={theme} onLogin={handleLogin} />
        </div>
      )}
      {session && (
        isCanvasEditorWindow ? (
          <CanvasEditorWindow theme={theme} />
        ) : (
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
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${
              toast.type === 'error' ? 'bg-red-500'
                : toast.type === 'warning' ? 'bg-amber-500'
                : (theme === 'light' ? 'bg-[#00C800]' : 'bg-[#00ff00]')
            }`}></div>
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
        themePref={themePref}
        setThemePreference={setThemePreference}
        toggleTheme={toggleTheme}
        apps={apps}
        setApps={setApps}
        addLog={addLog}
        session={session}
        onLogout={handleLogout}
        notifications={notifications}
        onMarkAllNotificationsRead={markAllNotificationsRead}
        onOpenNotification={openNotificationDetail}
      />

      {/* 2. Main Work Content Area (split with bottom collapsible terminal log) */}
      <div className={`flex-1 flex flex-col h-screen min-w-0 relative ${
        theme === 'light' ? 'bg-[#f8fafc]' : 'bg-[#09090b]'
      }`}>
        
        {/* Core panel interface renderer */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className={currentTab === 'extensions' ? 'flex flex-1 min-h-0' : 'hidden'}>
            <ExtensionManager
              apps={apps}
              setApps={setApps}
              extensions={extensions}
              setExtensions={setExtensions}
              simulatedDiskGB={simulatedDiskGB}
              onOpenSettings={() => setCurrentTab('settings')}
              onDownloadActivityChange={setActiveExtensionDownloadCount}
              addLog={addLog}
              theme={theme}
            />
          </div>
          {currentTab !== 'extensions' && renderTabContent()}
        </div>

        {/* 3. Retractable PixGo System Console Drawer at Bottom */}
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
        )
    )}
    {notificationDetail && (
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        onClick={() => setNotificationDetailId(null)}
      >
        <div
          className={`w-full max-w-[460px] overflow-hidden rounded-xl border shadow-2xl ${
            theme === 'light' ? 'border-slate-200 bg-white text-slate-900' : 'border-[#27272a] bg-[#0c0c0e] text-zinc-100'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const meta = NOTIFICATION_DOMAIN_META[notificationDetail.domain];
            const DetailIcon = meta.icon;
            return (
              <>
                <div className={`flex items-center justify-between border-b px-5 py-4 ${theme === 'light' ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded border"
                      style={{ backgroundColor: `${meta.accent}18`, borderColor: `${meta.accent}55`, color: meta.accent }}
                    >
                      <DetailIcon size={17} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold">{meta.label}</h3>
                      <p className={`mt-0.5 font-mono text-[10px] ${theme === 'light' ? 'text-slate-400' : 'text-zinc-500'}`}>
                        {new Date(notificationDetail.createdAt).toLocaleString('zh-CN', { hour12: false })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotificationDetailId(null)}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
                      theme === 'light' ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-zinc-500 hover:bg-[#18181b] hover:text-white'
                    }`}
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="space-y-4 px-5 py-5">
                  <p className={`rounded-lg border px-3 py-3 text-sm leading-relaxed ${
                    theme === 'light' ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-zinc-800 bg-black/30 text-zinc-200'
                  }`}>
                    {notificationDetail.content}
                  </p>

                  <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-xs">
                    <span className={theme === 'light' ? 'text-slate-400' : 'text-zinc-500'}>节点</span>
                    <span>{meta.label}</span>
                    <span className={theme === 'light' ? 'text-slate-400' : 'text-zinc-500'}>触发时机</span>
                    <span>{notificationDetail.trigger}</span>
                    <span className={theme === 'light' ? 'text-slate-400' : 'text-zinc-500'}>通知对象</span>
                    <span>{notificationDetail.recipient}</span>
                    <span className={theme === 'light' ? 'text-slate-400' : 'text-zinc-500'}>画布</span>
                    <span>{notificationDetail.canvasName}</span>
                    <span className={theme === 'light' ? 'text-slate-400' : 'text-zinc-500'}>发起人</span>
                    <span>{notificationDetail.actorName}</span>
                  </div>
                </div>

                <div className={`flex justify-end gap-2 border-t px-5 py-4 ${theme === 'light' ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
                      theme === 'light' ? 'border-slate-200 bg-white text-slate-500 hover:text-slate-900' : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
                    }`}
                  >
                    <CheckCheck size={12} />
                    全部已读
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotificationDetailId(null)}
                    className="rounded bg-[#00ff00] px-4 py-1.5 text-xs font-semibold text-black"
                  >
                    知道了
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    )}
    </>
  );
}

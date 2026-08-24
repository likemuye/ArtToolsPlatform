import React, { useState, useEffect, useRef } from 'react';
import {
  Archive,
  Grid2X2,
  Users,
  Settings,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Check,
  IdCard,
  X
} from 'lucide-react';
import { SpaceId, ProjectSpace, AppConfig, AuthSession, AppNotification } from '../types';
import DccMonitor from './DccMonitor';
import NotificationCenter from './NotificationCenter';
import { Tooltip } from './Tooltip';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentSpace: ProjectSpace;
  simulatedDiskGB: number;
  theme: 'dark' | 'light';
  themePref: 'dark' | 'light' | 'system';
  setThemePreference: (pref: 'dark' | 'light' | 'system') => void;
  toggleTheme: () => void;
  apps: AppConfig[];
  setApps: React.Dispatch<React.SetStateAction<AppConfig[]>>;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error', options?: { toast?: boolean }) => void;
  session: AuthSession | null;
  onLogout: () => void;
  notifications: AppNotification[];
  onMarkAllNotificationsRead: () => void;
  onOpenNotification: (id: string) => void;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  currentSpace,
  simulatedDiskGB,
  theme,
  themePref,
  setThemePreference,
  toggleTheme,
  apps,
  setApps,
  addLog,
  session,
  onLogout,
  notifications,
  onMarkAllNotificationsRead,
  onOpenNotification
}: SidebarProps) {
  // V1 sharing mode keeps the primary navigation collapsed; expansion is disabled for now.
  const isCollapsed = true;
  const themePickerRef = useRef<HTMLDivElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileInfoOpen, setProfileInfoOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const isLight = theme === 'light';
  const userName = session?.name ?? '未登录';
  const userDept = session?.department ?? '';
  const userEmail = session?.email ?? '';

  // Close profile menu on outside click.
  useEffect(() => {
    if (!profileMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!themeMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (themePickerRef.current && !themePickerRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeMenuOpen]);

  const THEME_OPTIONS: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }> = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '跟随系统', icon: Monitor }
  ];

  const confirmLogout = () => {
    setLogoutConfirmOpen(false);
    setProfileMenuOpen(false);
    onLogout();
  };


  const mainTabs = [
    { id: 'assets', name: '素材', icon: Archive, badge: currentSpace.id === SpaceId.ProjectA ? '100+' : '0' },
    { id: 'extensions', name: '工具', icon: Grid2X2, badge: '22' },
    // Canvas is temporarily hidden. Restore this item when the feature is reopened.
    { id: 'permissions', name: '管理', icon: Users },
  ];

  return (
    <div className={`app-primary-sidebar ${isCollapsed ? 'w-[72px]' : 'w-68'} bg-black h-screen border-r border-[#27272a] flex flex-col select-none font-sans justify-between transition-all duration-300 ease-out`}>
      {/* Upper Area */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Platform Title */}
        <div className={`app-sidebar-brand h-[52px] shrink-0 border-b border-[#27272a] bg-[#0c0c0e] ${isCollapsed ? 'px-3 flex items-center justify-center relative' : 'px-5 flex items-center justify-between'}`}>
          <div className={`flex items-center ${isCollapsed ? '' : 'gap-2'}`}>
            <div className="app-sidebar-logo relative flex h-9 w-9 items-center justify-center">
              <img className="app-sidebar-logo-mark" src="/logo.svg" alt="PixGo" />
            </div>
            {!isCollapsed && (
              <span className={`font-display font-bold tracking-widest text-sm ${theme === 'light' ? 'text-zinc-900' : 'text-[#f4f4f5]'}`}>
                PixGo <span className="text-[#00ff00] font-mono text-xs font-normal">V1</span>
              </span>
            )}
          </div>
          {/* Expand/collapse control intentionally disabled in V1 sharing mode. */}
        </div>

        {/* Navigation Tabs - F1 - F10 */}
        <div className="relative flex-1 min-h-0">
          <div className={`${isCollapsed ? 'p-2' : 'p-3'} h-full overflow-y-auto sidebar-nav-scroll`}>
          <div className={isCollapsed ? 'space-y-1.5' : 'space-y-1'}>
            {mainTabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`app-sidebar-tab ${isActive ? 'is-active' : ''} w-full transition-all rounded group cursor-pointer ${
                    isActive 
                      ? 'bg-[#18181b] text-white font-medium' 
                      : 'text-zinc-400 hover:text-white hover:bg-[#0c0c0e]'
                  } ${isCollapsed ? 'h-14 w-14 mx-auto p-1.5 flex flex-col items-center justify-center gap-0.5' : 'py-2 px-3 flex items-center justify-between text-left'}`}
                >
                  <div className={`flex ${isCollapsed ? 'flex-col items-center gap-1' : 'items-center gap-3'}`}>
                    <span className="app-sidebar-tab-icon relative inline-flex h-6 w-6 items-center justify-center">
                      <TabIcon size={isCollapsed ? 24 : 16} strokeWidth={1.8} className={isActive ? 'text-[#00ff00]' : 'text-zinc-400 group-hover:text-zinc-200'} />
                    </span>
                    <span className={isCollapsed ? 'block w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] leading-tight text-center' : 'text-xs'}>{tab.name}</span>
                  </div>
                  {!isCollapsed && tab.badge && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-[#00ff00] text-black font-semibold' : 'bg-[#1c1c1f] text-zinc-400'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </div>
        {isCollapsed && (
          <div className="sidebar-scroll-fade pointer-events-none absolute bottom-0 left-2 right-2 h-10"></div>
        )}
        </div>
      </div>

      {/* Bottom: DCC monitor + theme selector + profile */}
      <div className={`app-sidebar-footer ${isCollapsed ? 'p-2' : 'p-4'} border-t border-[#27272a] bg-[#0c0c0e] font-mono`}>
        <div className={`app-sidebar-footer-item ${isCollapsed ? '' : 'mb-3'}`}>
          <Tooltip content="设置" placement="right">
            <button
              type="button"
              onClick={() => setCurrentTab('settings')}
              className={`app-sidebar-control app-sidebar-settings h-14 w-14 mx-auto rounded border transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                currentTab === 'settings'
                  ? 'border-[#00ff00] text-[#00ff00] bg-[#00ff00]/5'
                  : 'border-[#27272a] text-zinc-400 hover:border-[#00ff00]/60 hover:text-[#00ff00]'
              }`}
            >
              <Settings size={20} strokeWidth={2} />
              <span className="app-sidebar-control-label text-[9px] font-sans">设置</span>
            </button>
          </Tooltip>
        </div>

        {/* Canvas collaboration notifications */}
        <div className={`app-sidebar-footer-item ${isCollapsed ? '' : 'mb-3'}`}>
          <NotificationCenter
            notifications={notifications}
            onMarkAllRead={onMarkAllNotificationsRead}
            onOpen={onOpenNotification}
            theme={theme}
            isCollapsed={isCollapsed}
          />
        </div>

        {/* Persistent DCC connection-status monitor */}
        <div className={`app-sidebar-footer-item ${isCollapsed ? '' : 'mb-3'}`}>
          <DccMonitor
            apps={apps}
            setApps={setApps}
            addLog={addLog}
            theme={theme}
            isCollapsed={isCollapsed}
          />
        </div>

        {/* Theme selector: 浅色 / 深色 / 跟随系统 */}
        {isCollapsed ? (
          <div className="app-sidebar-footer-item relative" ref={themePickerRef}>
            <Tooltip content="切换显示模式" placement="right">
              <button
                onClick={() => setThemeMenuOpen(prev => !prev)}
                className={`app-sidebar-theme-trigger h-14 w-14 mx-auto rounded border transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  themeMenuOpen
                    ? 'border-[#00ff00] text-[#00ff00] bg-[#00ff00]/5'
                    : 'border-[#27272a] hover:border-[#00ff00] text-zinc-400 hover:text-[#00ff00]'
                }`}
              >
                {themePref === 'system' ? (
                  <Monitor size={20} className={theme === 'light' ? 'text-slate-500' : 'text-zinc-300'} />
                ) : theme === 'dark' ? (
                  <Moon size={20} className="text-indigo-400" />
                ) : (
                  <Sun size={20} className="text-slate-500" />
                )}
                <span className="app-sidebar-control-label text-[10px] font-sans">{themePref === 'system' ? '系统' : theme === 'dark' ? '深色' : '浅色'}</span>
              </button>
            </Tooltip>

            {themeMenuOpen && (
              <div className={`absolute left-full bottom-0 ml-2 z-[80] w-28 overflow-hidden rounded-md border shadow-2xl ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#121214]'
              }`}>
                {THEME_OPTIONS.map(opt => {
                  const OptIcon = opt.icon;
                  const active = themePref === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setThemePreference(opt.value);
                        setThemeMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-sans transition-colors ${
                        active
                          ? (isLight ? 'bg-emerald-50 text-[#00795c] font-semibold' : 'bg-[#00ff00]/10 text-[#00ff00] font-semibold')
                          : (isLight ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-800' : 'text-zinc-400 hover:bg-[#18181b] hover:text-zinc-200')
                      }`}
                    >
                      <OptIcon size={13} />
                      <span className="flex-1">{opt.label}</span>
                      {active && <Check size={12} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className={`mb-3 grid grid-cols-3 gap-1 rounded-md border p-1 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-[#27272a] bg-[#121214]'}`}>
            {THEME_OPTIONS.map(opt => {
              const OptIcon = opt.icon;
              const active = themePref === opt.value;
              return (
                <Tooltip key={opt.value} content={opt.label} placement="top">
                  <button
                    onClick={() => setThemePreference(opt.value)}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded py-1.5 text-[9px] font-sans transition-colors cursor-pointer ${
                      active
                        ? (isLight ? 'bg-white text-[#00795c] shadow-sm font-bold' : 'bg-[#00ff00]/12 text-[#00ff00] font-bold')
                        : (isLight ? 'text-slate-500 hover:text-slate-700' : 'text-zinc-500 hover:text-zinc-300')
                    }`}
                  >
                    <OptIcon size={12} />
                    {opt.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Profile: avatar + name + department，点击弹出菜单 */}
        <div className="app-sidebar-footer-item relative" ref={profileRef}>
          <Tooltip content={`${userName}${userDept ? ' · ' + userDept : ''}`} placement={isCollapsed ? 'right' : 'top'} disabled={!isCollapsed}>
            <button
              onClick={() => setProfileMenuOpen(prev => !prev)}
              className={`app-sidebar-profile-trigger group w-full rounded transition-colors cursor-pointer ${
                profileMenuOpen
                  ? (isLight ? 'bg-emerald-50' : 'bg-[#00ff00]/5')
                  : (isLight ? 'bg-white hover:bg-slate-50' : 'bg-[#0c0c0e] hover:bg-[#18181b]')
              } ${isCollapsed ? 'h-14 w-14 mx-auto flex items-center justify-center' : 'flex items-center gap-2.5 px-2.5 py-2'}`}
            >
              <span
                className="app-sidebar-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              >
                {userName.charAt(0)}
              </span>
              {!isCollapsed && (
                <span className="min-w-0 flex-1 text-left">
                  <span className={`block truncate text-xs font-bold font-sans ${isLight ? 'text-slate-800' : 'text-zinc-100'}`}>{userName}</span>
                  <span className={`block truncate text-[10px] ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>{userDept || userEmail}</span>
                </span>
              )}
            </button>
          </Tooltip>

          {/* Profile dropdown menu */}
          {profileMenuOpen && (
            <div className={`absolute z-[80] w-52 overflow-hidden rounded-md border shadow-2xl ${
              isCollapsed ? 'left-full bottom-0 ml-2' : 'left-0 bottom-full mb-2'
            } ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#121214]'}`}>
              <div className={`flex items-center gap-2.5 px-3 py-3 border-b ${isLight ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#00C800,#0891b2)' }}>
                  {userName.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-xs font-bold font-sans ${isLight ? 'text-slate-800' : 'text-white'}`}>{userName}</p>
                  <p className={`truncate text-[10px] ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>{userDept}</p>
                </div>
              </div>
              <button
                onClick={() => { setProfileInfoOpen(true); setProfileMenuOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-sans transition-colors ${isLight ? 'text-slate-700 hover:bg-slate-50' : 'text-zinc-300 hover:bg-[#18181b]'}`}
              >
                <IdCard size={14} className={isLight ? 'text-slate-400' : 'text-zinc-400'} />
                个人信息
              </button>
              <button
                onClick={() => { setLogoutConfirmOpen(true); setProfileMenuOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-sans transition-colors ${isLight ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-red-950/30'}`}
              >
                <LogOut size={14} />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 个人信息弹窗 */}
      {profileInfoOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-lg border p-6 font-sans ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className={`flex items-center gap-2 text-base font-bold font-display ${isLight ? 'text-slate-800' : 'text-white'}`}>
                <IdCard size={18} className={isLight ? 'text-[#00C800]' : 'text-[#00ff00]'} />
                个人信息
              </h3>
              <button onClick={() => setProfileInfoOpen(false)} className={isLight ? 'text-slate-400 hover:text-slate-700' : 'text-zinc-400 hover:text-white'}>
                <X size={16} />
              </button>
            </div>
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: 'linear-gradient(135deg,#00C800,#0891b2)' }}>
                {userName.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className={`text-lg font-bold font-display ${isLight ? 'text-slate-800' : 'text-white'}`}>{userName}</p>
                <p className={`truncate text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>{userDept}</p>
              </div>
            </div>
            <div className={`space-y-2.5 rounded border p-4 text-xs font-mono ${isLight ? 'border-slate-200 bg-slate-50' : 'border-[#27272a] bg-zinc-950'}`}>
              <div className="flex justify-between gap-3">
                <span className={isLight ? 'text-slate-400' : 'text-zinc-500'}>邮箱</span>
                <span className={`truncate ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>{userEmail}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={isLight ? 'text-slate-400' : 'text-zinc-500'}>部门</span>
                <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>{userDept || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={isLight ? 'text-slate-400' : 'text-zinc-500'}>登录方式</span>
                <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>钉钉扫码</span>
              </div>
              {session && (
                <div className="flex justify-between gap-3">
                  <span className={isLight ? 'text-slate-400' : 'text-zinc-500'}>令牌到期</span>
                  <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>
                    {new Date(session.expiresAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setProfileInfoOpen(false)}
                className={`rounded px-5 py-1.5 text-xs font-bold transition-colors ${isLight ? 'bg-[#00C800] text-white hover:bg-[#00a000]' : 'bg-[#00ff00] text-black hover:bg-[#00dd00]'}`}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 退出登录二次确认 */}
      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-lg border p-6 font-sans ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded ${isLight ? 'bg-red-50' : 'bg-red-950/40'}`}>
                <LogOut size={18} className="text-red-500" />
              </div>
              <h3 className={`text-base font-bold font-display ${isLight ? 'text-slate-800' : 'text-white'}`}>确认退出登录？</h3>
            </div>
            <p className={`mb-6 text-xs leading-relaxed ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
              退出后将清除本地登录令牌、下载任务与会话缓存，并返回钉钉扫码登录页。
            </p>
            <div className="flex justify-end gap-3 font-mono">
              <button
                onClick={() => setLogoutConfirmOpen(false)}
                className={`rounded border px-4 py-1.5 text-xs transition-colors ${isLight ? 'border-slate-200 text-slate-500 hover:border-slate-400' : 'border-[#27272a] text-zinc-400 hover:border-zinc-500 hover:text-white'}`}
              >
                取消
              </button>
              <button
                onClick={confirmLogout}
                className="rounded bg-red-600 px-5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-500"
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import {
  Layers,
  Settings,
  HardDrive,
  User,
  FolderOpen,
  Palette,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck
} from 'lucide-react';
import { SpaceId, ProjectSpace } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentSpace: ProjectSpace;
  simulatedDiskGB: number;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  currentSpace,
  simulatedDiskGB,
  theme,
  toggleTheme
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const mainTabs = [
    { id: 'assets', name: '素材', icon: FolderOpen, badge: currentSpace.id === SpaceId.ProjectA ? '100+' : '0' },
    { id: 'extensions', name: '工具', icon: Layers, badge: currentSpace.id === SpaceId.ProjectA ? '22' : '0' },
    { id: 'canvas', name: '画布', icon: Palette },
    { id: 'permissions', name: '权限管理', icon: ShieldCheck },
    { id: 'settings', name: '缓存与设置', icon: Settings },
  ];

  return (
    <div className={`${isCollapsed ? 'w-[72px]' : 'w-68'} bg-black h-screen border-r border-[#27272a] flex flex-col select-none font-sans justify-between transition-all duration-300 ease-out`}>
      {/* Upper Area */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Platform Title */}
        <div className={`border-b border-[#27272a] bg-[#0c0c0e] ${isCollapsed ? 'p-3 flex items-center justify-center relative' : 'p-5 flex items-center justify-between'}`}>
          <div className={`flex items-center ${isCollapsed ? '' : 'gap-2'}`}>
            <div className="w-3 h-3 bg-[#00ff00] animate-pulse"></div>
            {!isCollapsed && (
              <span className={`font-display font-bold tracking-widest text-sm ${theme === 'light' ? 'text-zinc-900' : 'text-[#f4f4f5]'}`}>
                ARTLAUNCHER <span className="text-[#00ff00] font-mono text-xs font-normal">V1</span>
              </span>
            )}
          </div>
          {!isCollapsed && (
            <div className="text-[10px] bg-[#1c1c1f] px-1.5 py-0.5 rounded text-zinc-400 font-mono">
              WIN-64
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? '展开导航' : '收起导航'}
            className={`${isCollapsed ? 'absolute right-1.5 top-1/2 -translate-y-1/2' : ''} inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:text-[#00ff00] transition-colors cursor-pointer`}
          >
            {isCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
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
                  className={`w-full transition-all rounded group cursor-pointer ${
                    isActive 
                      ? 'bg-[#18181b] text-white font-medium' 
                      : 'text-zinc-400 hover:text-white hover:bg-[#0c0c0e]'
                  } ${isCollapsed ? 'h-14 w-14 mx-auto p-1.5 flex flex-col items-center justify-center gap-0.5' : 'py-2 px-3 flex items-center justify-between text-left'}`}
                >
                  <div className={`flex ${isCollapsed ? 'flex-col items-center gap-1' : 'items-center gap-3'}`}>
                    <TabIcon size={isCollapsed ? 15 : 16} className={isActive ? 'text-[#00ff00]' : 'text-zinc-400 group-hover:text-zinc-200'} />
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

      {/* Disk Space & User Details Indicator at Bottom */}
      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-[#27272a] bg-[#0c0c0e] font-mono`}>
        {isCollapsed ? (
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? '切换至明亮模式' : '切换至暗黑模式'}
            className="h-14 w-14 mx-auto rounded border border-[#27272a] hover:border-[#00ff00] text-zinc-400 hover:text-[#00ff00] transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5"
          >
            {theme === 'dark' ? (
              <Sun size={14} className="text-amber-500" />
            ) : (
              <Moon size={14} className="text-indigo-400" />
            )}
            <span className="text-[10px] font-sans">{theme === 'dark' ? '浅色' : '深色'}</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Disk Space Indicator */}
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span className="flex items-center gap-1">
                <HardDrive size={11} className="text-zinc-500" />
                本地存储已用 (D:)
              </span>
              <span className={`${simulatedDiskGB < 15 ? 'text-amber-500 font-bold' : 'text-zinc-300'}`}>
                {(256 - simulatedDiskGB).toFixed(1)} / 256 GB
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
              <div 
                className={`h-full ${simulatedDiskGB < 15 ? 'bg-amber-500' : 'bg-[#00ff00]'}`}
                style={{ width: `${((256 - simulatedDiskGB) / 256) * 100}%` }}
              ></div>
            </div>
            {simulatedDiskGB < 15 && (
              <div className="text-[9px] text-amber-500 leading-tight">
                ⚠️ 磁盘可用空间不足 15 GB，安装大型 DCC 或下载大素材将被阻断。请在设置中释放空间。
              </div>
            )}

            {/* Active User Indicator & Theme Toggle */}
            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#232326] text-[10px] text-zinc-500">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <User size={12} className="text-[#00ff00] shrink-0" />
                <span className="truncate text-zinc-400 group-hover:text-zinc-200" title="likemuye@gmail.com">
                  likemuye@gmail.com
                </span>
              </div>
              
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? '切换至明亮模式' : '切换至暗黑模式'}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] bg-[#121214] border border-[#27272a] hover:border-[#00ff00] text-zinc-400 hover:text-[#00ff00] transition-colors cursor-pointer shrink-0"
                style={{ contentVisibility: 'auto' }}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun size={11} className="text-amber-500 shrink-0" />
                    <span className="font-sans font-medium text-[9px]">浅色</span>
                  </>
                ) : (
                  <>
                    <Moon size={11} className="text-indigo-400 shrink-0" />
                    <span className="font-sans font-medium text-[9px]">深色</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

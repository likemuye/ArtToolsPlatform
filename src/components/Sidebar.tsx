import React, { useState } from 'react';
import { 
  Layers, 
  Settings, 
  Sparkles, 
  BookOpen, 
  HardDrive, 
  User,
  Monitor,
  FolderOpen,
  Palette,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Globe
} from 'lucide-react';
import { SpaceId, ProjectSpace } from '../types';
import { PROJECT_SPACES } from '../data';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentSpace: ProjectSpace;
  setCurrentSpace: (space: ProjectSpace) => void;
  simulatedDiskGB: number;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  currentSpace,
  setCurrentSpace,
  simulatedDiskGB,
  theme,
  toggleTheme
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const projectSpaces = PROJECT_SPACES.filter(
    (space) => space.id === SpaceId.ProjectA || space.id === SpaceId.ProjectB
  );
  const mySpaces = [
    PROJECT_SPACES.find((space) => space.id === SpaceId.Personal),
    PROJECT_SPACES.find((space) => space.id === SpaceId.Shared)
  ].filter((space): space is ProjectSpace => Boolean(space));

  const getSpaceLabel = (space: ProjectSpace) => {
    if (space.id === SpaceId.ProjectA) return '三国：冰河时代';
    if (space.id === SpaceId.ProjectB) return '项目空间B';
    if (space.id === SpaceId.Personal) return '个人空间';
    return '与我共享';
  };

  const getSpaceIcon = (space: ProjectSpace) => {
    if (space.id === SpaceId.Personal) return User;
    if (space.id === SpaceId.Shared) return Globe;
    return FolderOpen;
  };

  const mainTabs = [
    { id: 'apps', name: '应用', icon: Monitor },
    { id: 'extensions', name: '拓展', icon: Layers, badge: currentSpace.id === SpaceId.ProjectA ? '22' : '0' },
    { id: 'assets', name: '素材', icon: FolderOpen, badge: currentSpace.id === SpaceId.ProjectA ? '100+' : '0' },
    { id: 'canvas', name: '画布', icon: Palette },
    { id: 'settings', name: '缓存与设置', icon: Settings },
  ];

  const placeholderTabs = [
    { id: 'ai-assistant', name: '美术助手 (AI)', icon: Sparkles, badge: 'V2' },
    { id: 'docs', name: '项目说明档', icon: BookOpen, badge: 'V2' }
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

        {/* Space Selector */}
        <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-b border-[#27272a]`}>
          <div className={isCollapsed ? 'space-y-2' : 'space-y-3'}>
            <div>
              {!isCollapsed && (
                <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider block mb-1.5">
                  项目空间
                </label>
              )}
              <div className={isCollapsed ? 'space-y-1.5' : 'space-y-1'}>
                {projectSpaces.map((space) => {
                  const isActive = currentSpace.id === space.id;
                  const SpaceIcon = getSpaceIcon(space);
                  return (
                    <button
                      key={space.id}
                      onClick={() => setCurrentSpace(space)}
                      className={`rounded border transition-all cursor-pointer ${
                        isActive
                          ? (theme === 'light'
                            ? 'bg-emerald-50 border-[#00C800] text-[#00A900] font-semibold'
                            : 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00] font-semibold')
                          : (theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-700 hover:border-[#00C800]'
                            : 'bg-[#121214] border-[#27272a] text-zinc-300 hover:border-[#00ff00] hover:text-white')
                      } ${isCollapsed ? 'h-14 w-14 mx-auto p-1.5' : 'w-full py-2 px-3 text-xs text-left font-sans'}`}
                    >
                      {isCollapsed ? (
                        <div className="flex w-full flex-col items-center gap-0.5">
                          <SpaceIcon size={14} />
                          <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] leading-tight text-center">{getSpaceLabel(space)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <SpaceIcon size={13} className="shrink-0" />
                          <span className="truncate">{getSpaceLabel(space)}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              {!isCollapsed && (
                <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider block mb-1.5">
                  我的空间
                </label>
              )}
              <div className={isCollapsed ? 'space-y-1.5' : 'space-y-1'}>
                {mySpaces.map((space) => {
                  const isActive = currentSpace.id === space.id;
                  const SpaceIcon = getSpaceIcon(space);
                  return (
                    <button
                      key={space.id}
                      onClick={() => setCurrentSpace(space)}
                      className={`rounded border transition-all cursor-pointer ${
                        isActive
                          ? (theme === 'light'
                            ? 'bg-emerald-50 border-[#00C800] text-[#00A900] font-semibold'
                            : 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00] font-semibold')
                          : (theme === 'light'
                            ? 'bg-white border-slate-200 text-slate-700 hover:border-[#00C800]'
                            : 'bg-[#121214] border-[#27272a] text-zinc-300 hover:border-[#00ff00] hover:text-white')
                      } ${isCollapsed ? 'h-14 w-14 mx-auto p-1.5' : 'w-full py-2 px-3 text-xs text-left font-sans'}`}
                    >
                      {isCollapsed ? (
                        <div className="flex w-full flex-col items-center gap-0.5">
                          <SpaceIcon size={14} />
                          <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] leading-tight text-center">{getSpaceLabel(space)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <SpaceIcon size={13} className="shrink-0" />
                          <span className="truncate">{getSpaceLabel(space)}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs - F1 - F10 */}
        <div className="relative flex-1 min-h-0">
          <div className={`${isCollapsed ? 'p-2' : 'p-3'} h-full overflow-y-auto sidebar-nav-scroll`}>
          {!isCollapsed && (
            <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider pl-3 block mb-1">
              核心模块
            </label>
          )}
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
                  } ${isCollapsed ? 'h-14 w-14 mx-auto p-1.5 flex flex-col items-center gap-0.5' : 'py-2 px-3 flex items-center justify-between text-left'}`}
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

          {/* Placeholders for V2 */}
          <div
            className={
              isCollapsed
                ? (theme === 'light' ? 'mt-3 pt-3 border-t border-slate-200' : 'mt-3 pt-3 border-t border-[#1b1b1d]')
                : 'mt-6'
            }
          >
            {!isCollapsed && (
              <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider pl-3 block mb-1">
                预留模块
              </label>
            )}
            <div className={isCollapsed ? 'space-y-1.5' : 'space-y-1'}>
              {placeholderTabs.map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <div
                    key={tab.id}
                    title="PRD 规划 V2 版本，当前仅作原型占位"
                    className={`w-full border border-dashed border-zinc-800/40 opacity-40 cursor-not-allowed text-zinc-500 rounded ${
                      isCollapsed ? 'h-14 w-14 mx-auto p-1.5 flex flex-col items-center gap-0.5' : 'py-2 px-3 flex items-center justify-between text-left'
                    }`}
                  >
                    <div className={`flex ${isCollapsed ? 'flex-col items-center gap-1' : 'items-center gap-3'}`}>
                      <TabIcon size={isCollapsed ? 15 : 16} />
                      <span className={isCollapsed ? 'block w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] leading-tight text-center' : 'text-xs'}>{tab.name}</span>
                    </div>
                    {!isCollapsed && (
                      <span className="text-[9px] font-mono border border-zinc-700 text-zinc-400 px-1 rounded uppercase">
                        {tab.badge}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
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
                ⚠️ 磁盘可用空间不足 15 GB，安装 ComfyUI 或下载大素材将被阻断。请在设置中释放空间。
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

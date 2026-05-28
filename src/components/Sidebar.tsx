import React, { useState, useRef, useEffect } from 'react';
import { 
  Layers, 
  Settings, 
  Sparkles, 
  BookOpen, 
  HardDrive, 
  Database,
  User,
  Globe,
  Monitor,
  FolderOpen,
  ChevronDown,
  Sun,
  Moon,
  Check
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
  const [spaceDropdownOpen, setSpaceDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSpaceDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const mainTabs = [
    { id: 'apps', name: '应用管理', icon: Monitor },
    { id: 'extensions', name: '应用拓展', icon: Layers, badge: currentSpace.id === SpaceId.ProjectA ? '22' : '0' },
    { id: 'assets', name: '素材库', icon: FolderOpen, badge: currentSpace.id === SpaceId.ProjectA ? '100+' : '0' },
    { id: 'settings', name: '缓存与设置', icon: Settings },
  ];

  const placeholderTabs = [
    { id: 'ai-assistant', name: '美术助手 (AI)', icon: Sparkles, badge: 'V2' },
    { id: 'docs', name: '项目说明档', icon: BookOpen, badge: 'V2' }
  ];

  return (
    <div className="w-68 bg-black h-screen border-r border-[#27272a] flex flex-col select-none font-sans justify-between">
      {/* Upper Area */}
      <div className="flex flex-col">
        {/* Platform Title */}
        <div className="p-5 border-b border-[#27272a] bg-[#0c0c0e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#00ff00] animate-pulse"></div>
            <span className={`font-display font-bold tracking-widest text-sm ${theme === 'light' ? 'text-zinc-900' : 'text-[#f4f4f5]'}`}>
              ARTLAUNCHER <span className="text-[#00ff00] font-mono text-xs font-normal">V1</span>
            </span>
          </div>
          <div className="text-[10px] bg-[#1c1c1f] px-1.5 py-0.5 rounded text-zinc-400 font-mono">
            WIN-64
          </div>
        </div>

        {/* Project Space Selector - F7 */}
        <div ref={dropdownRef} className="p-4 border-b border-[#27272a] relative">
          <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider block mb-1.5">
            CURRENT PROJECT SPACE / 当前空间
          </label>
          <button
            onClick={() => setSpaceDropdownOpen(!spaceDropdownOpen)}
            className={`w-full flex items-center justify-between transition-all py-2 px-3 text-left rounded border ${
              spaceDropdownOpen 
                ? (theme === 'light' ? 'border-[#00C800] bg-white ring-1 ring-[#00C800]/20' : 'border-[#00ff00] bg-[#121214] ring-1 ring-[#00ff00]/20')
                : (theme === 'light' ? 'bg-white border-slate-200 hover:border-[#00C800]' : 'bg-[#121214] border-[#27272a] hover:border-[#00ff00]')
            }`}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {currentSpace.id === SpaceId.ProjectA ? (
                <div className="w-1.5 h-1.5 rounded-full bg-[#00ff00]"></div>
              ) : currentSpace.id === SpaceId.ProjectB ? (
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
              ) : currentSpace.id === SpaceId.Shared ? (
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
              )}
              <span className={`text-xs font-medium truncate font-sans ${theme === 'light' ? 'text-slate-800' : 'text-zinc-200'}`}>
                {currentSpace.name}
              </span>
            </div>
            <ChevronDown size={14} className={`text-zinc-400 transition-transform ${spaceDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Space Selector Dropdown */}
          {spaceDropdownOpen && (
            <div className={`absolute left-4 right-4 mt-1 z-50 shadow-2xl rounded p-1 flex flex-col gap-[2px] border ${
              theme === 'light' ? 'bg-white border-slate-200' : 'bg-[#121214] border-[#27272a]'
            }`}>
              {PROJECT_SPACES.map((space) => {
                const isActive = currentSpace.id === space.id;
                let dotColor = 'bg-zinc-600';
                if (space.id === SpaceId.ProjectA) dotColor = 'bg-[#00ff00]';
                else if (space.id === SpaceId.ProjectB) dotColor = 'bg-blue-500';
                else if (space.id === SpaceId.Shared) dotColor = 'bg-yellow-500';
                else if (space.id === SpaceId.Personal) dotColor = 'bg-purple-500';

                return (
                  <button
                    key={space.id}
                    onClick={() => {
                      setCurrentSpace(space);
                      setSpaceDropdownOpen(false);
                    }}
                    className={`w-full flex flex-col text-left p-2 rounded transition-all group ${
                      isActive 
                        ? (theme === 'light' ? 'bg-emerald-50/70' : 'bg-[#1a1a1f]') 
                        : (theme === 'light' ? 'bg-transparent hover:bg-slate-50' : 'bg-transparent hover:bg-[#18181c]')
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
                        <span className={`text-xs ${
                          isActive 
                            ? (theme === 'light' ? 'text-[#00C800] font-semibold' : 'text-[#00ff00] font-semibold') 
                            : (theme === 'light' ? 'text-slate-700 group-hover:text-slate-900' : 'text-zinc-300 group-hover:text-white')
                        }`}>
                          {space.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {space.extensionCount > 0 && (
                          <span className={`text-[9px] font-mono px-1 rounded ${
                            theme === 'light' ? 'bg-slate-200/50 text-slate-500' : 'bg-[#27272a] text-zinc-400'
                          }`}>
                            {space.extensionCount} 拓展
                          </span>
                        )}
                        {isActive && (
                          <Check size={12} className={theme === 'light' ? 'text-[#00C800]' : 'text-[#00ff00]'} />
                        )}
                      </div>
                    </div>
                    <span className={`text-[9.5px] mt-1 pl-3.5 line-clamp-1 ${
                      isActive 
                        ? (theme === 'light' ? 'text-emerald-700/80' : 'text-zinc-400') 
                        : 'text-zinc-500'
                    }`}>
                      {space.description}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Navigation Tabs - F1 - F10 */}
        <div className="p-3">
          <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider pl-3 block mb-1">
            Core Modules
          </label>
          <div className="space-y-1">
            {mainTabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`w-full flex items-center justify-between py-2 px-3 text-left transition-all rounded group ${
                    isActive 
                      ? 'bg-[#18181b] text-white font-medium' 
                      : 'text-zinc-400 hover:text-white hover:bg-[#0c0c0e]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <TabIcon size={16} className={isActive ? 'text-[#00ff00]' : 'text-zinc-400 group-hover:text-zinc-200'} />
                    <span className="text-xs">{tab.name}</span>
                  </div>
                  {tab.badge && (
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
          <div className="mt-6">
            <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider pl-3 block mb-1">
              Future Modules (Scope Out)
            </label>
            <div className="space-y-1">
              {placeholderTabs.map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <div
                    key={tab.id}
                    title="PRD 规划 V2 版本，当前仅作原型占位"
                    className="w-full flex items-center justify-between py-2 px-3 text-left border border-dashed border-zinc-800/40 opacity-40 cursor-not-allowed text-zinc-500 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <TabIcon size={16} />
                      <span className="text-xs">{tab.name}</span>
                    </div>
                    <span className="text-[9px] font-mono border border-zinc-700 text-zinc-400 px-1 rounded uppercase">
                      {tab.badge}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Disk Space & User Details Indicator at Bottom */}
      <div className="p-4 border-t border-[#27272a] bg-[#0c0c0e] font-mono">
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
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  X
} from 'lucide-react';
import { AppNotification, NotificationDomain } from '../types';
import { Tooltip } from './Tooltip';

interface NotificationCenterProps {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onOpen: (id: string) => void;
  theme: 'dark' | 'light';
  isCollapsed: boolean;
}

const DOMAIN_META: Record<NotificationDomain, { label: string; accent: string }> = {
  canvas: { label: '画布', accent: '#38bdf8' },
  asset: { label: '素材', accent: '#22c55e' },
  tool: { label: '工具', accent: '#f59e0b' }
};

const formatTime = (source: string) => {
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return '--:--';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
};

export default function NotificationCenter({
  notifications,
  onMarkAllRead,
  onOpen,
  theme,
  isCollapsed
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const rootRef = useRef<HTMLDivElement>(null);
  const isLight = theme === 'light';
  const unreadCount = notifications.filter(item => item.unread).length;
  const visibleNotifications = filter === 'unread'
    ? notifications.filter(item => item.unread)
    : notifications;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Tooltip content={`通知 ${unreadCount} 条未读`} placement={isCollapsed ? 'right' : 'top'} disabled={!isCollapsed}>
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className={`group w-full rounded border transition-all cursor-pointer ${
            open
              ? (isLight ? 'border-[#00C800] bg-emerald-50' : 'border-[#00ff00]/60 bg-[#00ff00]/5')
              : (isLight ? 'border-slate-200 bg-white hover:border-[#00C800]' : 'border-[#27272a] bg-[#0c0c0e] hover:border-[#00ff00]/50')
          } ${isCollapsed ? 'h-14 w-14 mx-auto flex flex-col items-center justify-center gap-0.5' : 'flex items-center justify-between px-2.5 py-2'}`}
        >
          {isCollapsed ? (
            <>
              <span className="relative">
                <Bell size={15} className={open ? (isLight ? 'text-[#00C800]' : 'text-[#00ff00]') : (isLight ? 'text-slate-500' : 'text-zinc-400')} />
                {unreadCount > 0 && (
                  <span className="absolute -right-2 -top-2 min-w-[14px] rounded-full bg-red-500 px-1 text-[8px] font-bold leading-[14px] text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span className={`text-[9px] font-sans ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>通知</span>
            </>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <Bell size={14} className={isLight ? 'text-slate-500' : 'text-zinc-400'} />
                <span className={`text-[11px] font-medium font-sans ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>通知</span>
              </span>
              <span className={`text-[10px] font-mono font-bold ${unreadCount > 0 ? 'text-red-400' : (isLight ? 'text-slate-400' : 'text-zinc-500')}`}>
                {unreadCount}
              </span>
            </>
          )}
        </button>
      </Tooltip>

      {open && (
        <div
          className={`absolute z-[85] w-[360px] overflow-hidden rounded-lg border shadow-2xl font-sans ${
            isCollapsed ? 'left-full bottom-0 ml-2' : 'left-0 bottom-full mb-2'
          } ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}
        >
          <div className={`flex items-center justify-between border-b px-3.5 py-2.5 ${isLight ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
            <div className="min-w-0">
              <p className={`flex items-center gap-1.5 text-xs font-bold font-display ${isLight ? 'text-slate-800' : 'text-white'}`}>
                <Bell size={14} className={isLight ? 'text-[#00C800]' : 'text-[#00ff00]'} />
                通知中心
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip content="全部已读" placement="top">
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                    isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-[#00C800]' : 'text-zinc-500 hover:bg-[#18181b] hover:text-[#00ff00]'
                  }`}
                >
                  <CheckCheck size={13} />
                </button>
              </Tooltip>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                  isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-zinc-500 hover:bg-[#18181b] hover:text-white'
                }`}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className={`border-b px-3.5 py-1.5 ${isLight ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
            <div className={`grid grid-cols-2 gap-0.5 rounded border p-0.5 ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-[#27272a] bg-black/20'
            }`}>
              {([
                { id: 'all' as const, label: '全部', count: notifications.length },
                { id: 'unread' as const, label: '未读', count: unreadCount }
              ]).map(item => {
                const active = filter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={`flex h-5 items-center justify-center gap-1 rounded px-1.5 text-[10px] transition-colors ${
                      active
                        ? (isLight ? 'bg-white text-[#00795c] shadow-sm font-semibold' : 'bg-[#00ff00]/12 text-[#00ff00] font-semibold')
                        : (isLight ? 'text-slate-500 hover:text-slate-700' : 'text-zinc-500 hover:text-zinc-300')
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className={`font-mono text-[8px] ${active ? '' : 'opacity-75'}`}>{item.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto py-1.5">
            {visibleNotifications.length === 0 ? (
              <div className={`px-4 py-8 text-center text-xs ${isLight ? 'text-slate-400' : 'text-zinc-600'}`}>
                {filter === 'unread' ? '暂无未读通知' : '暂无通知'}
              </div>
            ) : (
              visibleNotifications.map((item) => {
                const meta = DOMAIN_META[item.domain];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className={`flex w-full px-3.5 py-3 text-left transition-colors ${
                      isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121214]'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold leading-none"
                            style={{ backgroundColor: `${meta.accent}12`, borderColor: `${meta.accent}44`, color: meta.accent }}
                          >
                            {meta.label}
                          </span>
                          <span className={`truncate text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-zinc-100'}`}>{item.title}</span>
                          {item.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                        </span>
                        <span className={`shrink-0 font-mono text-[9px] ${isLight ? 'text-slate-400' : 'text-zinc-600'}`}>{formatTime(item.createdAt)}</span>
                      </span>
                      <span className={`mt-1 block text-[11px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>{item.content}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

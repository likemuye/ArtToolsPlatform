import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { CURRENT_USER_EMAIL, PLATFORM_USERS } from '../data';
import { PlatformUser } from '../types';

export const PLATFORM_USER_PICKER_MAX_USERS = 20;

interface PlatformUserPickerProps {
  query: string;
  selectedUsers: PlatformUser[];
  existingEmails: ReadonlySet<string>;
  onQueryChange: (query: string) => void;
  onSelect: (user: PlatformUser) => void;
  onRemove: (user: PlatformUser) => void;
  isLight: boolean;
  maxUsers?: number;
  label?: string;
}

export function PlatformUserPicker({
  query,
  selectedUsers,
  existingEmails,
  onQueryChange,
  onSelect,
  onRemove,
  isLight,
  maxUsers = PLATFORM_USER_PICKER_MAX_USERS,
  label = '邀请协作者'
}: PlatformUserPickerProps) {
  const selectedEmails = useMemo(
    () => new Set(selectedUsers.map(user => user.email.toLowerCase())),
    [selectedUsers]
  );
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const pool = PLATFORM_USERS.filter(user => (
      !user.isFormer
      && user.email.toLowerCase() !== CURRENT_USER_EMAIL.toLowerCase()
      && !selectedEmails.has(user.email.toLowerCase())
    ));
    if (!normalizedQuery) return pool.slice(0, 8);
    return pool.filter(user => (
      user.name.toLowerCase().includes(normalizedQuery)
      || user.email.toLowerCase().includes(normalizedQuery)
    )).slice(0, 8);
  }, [query, selectedEmails]);
  const atLimit = selectedUsers.length >= maxUsers;
  const firstSelectableMatch = matches.find(user => !existingEmails.has(user.email.toLowerCase()));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>{label}</label>
        <span className={`font-mono text-[10px] ${atLimit ? 'text-amber-500' : (isLight ? 'text-slate-400' : 'text-zinc-600')}`}>
          {selectedUsers.length}/{maxUsers}
        </span>
      </div>
      <div className="relative">
        <input
          type="text"
          value={query}
          disabled={atLimit}
          onChange={event => onQueryChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && firstSelectableMatch) {
              event.preventDefault();
              onSelect(firstSelectableMatch);
            }
          }}
          placeholder={atLimit ? `已达上限 ${maxUsers} 人` : '输入姓名或邮箱，支持模糊匹配'}
          className={`h-10 w-full rounded-lg border px-3 text-xs outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isLight ? 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500' : 'border-[#27272a] bg-[#121214] text-zinc-200 placeholder:text-zinc-600 focus:border-[#00ff00]'}`}
        />
        {query.trim() && !atLimit && matches.length > 0 && (
          <div className={`absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border py-1 shadow-xl ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
            {matches.map(user => {
              const alreadyShared = existingEmails.has(user.email.toLowerCase());
              return (
                <button
                  key={user.id}
                  type="button"
                  disabled={alreadyShared}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => onSelect(user)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${alreadyShared ? 'cursor-default' : (isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121214]')}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${alreadyShared ? (isLight ? 'bg-slate-100 text-slate-400' : 'bg-zinc-800 text-zinc-500') : (isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-[#00ff00]/15 text-[#00ff00]')}`}>
                    {user.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-xs ${alreadyShared ? (isLight ? 'text-slate-400' : 'text-zinc-500') : (isLight ? 'text-slate-800' : 'text-zinc-200')}`}>{user.name}</span>
                    <span className={`mt-0.5 block truncate font-mono text-[10px] ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>{user.email}</span>
                  </span>
                  {alreadyShared && (
                    <span className={`shrink-0 rounded border px-2 py-0.5 text-[9px] ${isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
                      已分享
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {query.trim() && !atLimit && matches.length === 0 && (
          <div className={`absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border px-3 py-2 text-[11px] shadow-xl ${isLight ? 'border-slate-200 bg-white text-slate-400' : 'border-[#27272a] bg-[#0c0c0e] text-zinc-500'}`}>
            无匹配的平台用户
          </div>
        )}
      </div>
      {selectedUsers.length > 0 && (
        <div className={`mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-1.5 ${isLight ? 'border-slate-200 bg-slate-50/70' : 'border-[#27272a] bg-[#121214]/40'}`}>
          {selectedUsers.map(user => (
            <div key={user.id} className="flex items-center gap-2 rounded px-2 py-1.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-[#00ff00]/15 text-[#00ff00]'}`}>
                {user.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-xs font-medium ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>{user.name}</span>
                <span className={`mt-0.5 block truncate font-mono text-[10px] ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>{user.email}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(user)}
                title={`删除 ${user.name}`}
                aria-label={`删除 ${user.name}`}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors ${isLight ? 'border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600' : 'border-zinc-800 text-zinc-500 hover:border-red-500/60 hover:text-red-400'}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

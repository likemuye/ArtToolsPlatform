import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Users,
  FolderTree,
  UserPlus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Eye,
  Search,
  Check,
  X,
  Crown,
  User as UserIcon
} from 'lucide-react';
import { SpaceId, ProjectSpace, ProjectRole, ProjectMember, AssetFolder } from '../types';
import { PROJECT_SPACES, PLATFORM_USERS, INITIAL_PROJECT_MEMBERS, CURRENT_USER_EMAIL } from '../data';

interface PermissionManagerProps {
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error', options?: { toast?: boolean }) => void;
}

const PROJECT_MEMBERS_STORAGE_KEY = 'art-launcher-project-members-v1';
const ASSET_FOLDER_STORAGE_KEY = 'art-launcher-asset-folders-v2';
const FOLDER_SCOPE_SEPARATOR = '::';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Project-type spaces only (个人/共享 spaces are out of scope for project-group permissions).
const PROJECT_GROUPS: ProjectSpace[] = PROJECT_SPACES.filter(
  space => space.id === SpaceId.ProjectA || space.id === SpaceId.ProjectB
);

// Anchor folder ids mirror AssetLibrary's local constants — top-level project folders
// hang off these anchors in the scoped folder tree.
const PROJECT_ANCHOR_IDS: Record<string, string> = {
  [SpaceId.ProjectA]: 'space-node-projectA',
  [SpaceId.ProjectB]: 'space-node-projectB'
};

const ROLE_LABELS: Record<ProjectRole, string> = {
  admin: '管理员',
  member: '项目成员'
};

const formatJoinedAt = (source?: string) => {
  if (!source) return '--';
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return '--';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
};

const sanitizeMembers = (value: unknown): Record<SpaceId, ProjectMember[]> => {
  const base: Record<SpaceId, ProjectMember[]> = {
    [SpaceId.ProjectA]: [...INITIAL_PROJECT_MEMBERS[SpaceId.ProjectA]],
    [SpaceId.ProjectB]: [...INITIAL_PROJECT_MEMBERS[SpaceId.ProjectB]],
    [SpaceId.Shared]: [],
    [SpaceId.Personal]: []
  };
  if (!value || typeof value !== 'object') return base;
  const parsed = value as Record<string, unknown>;
  ([SpaceId.ProjectA, SpaceId.ProjectB] as SpaceId[]).forEach(spaceId => {
    const list = parsed[spaceId];
    if (Array.isArray(list)) {
      base[spaceId] = list.filter((item): item is ProjectMember => (
        !!item &&
        typeof item === 'object' &&
        typeof (item as ProjectMember).id === 'string' &&
        typeof (item as ProjectMember).email === 'string' &&
        ((item as ProjectMember).role === 'admin' || (item as ProjectMember).role === 'member')
      ));
    }
  });
  return base;
};

const getInitialMembers = (): Record<SpaceId, ProjectMember[]> => {
  try {
    const stored = localStorage.getItem(PROJECT_MEMBERS_STORAGE_KEY);
    if (!stored) return sanitizeMembers(null);
    return sanitizeMembers(JSON.parse(stored));
  } catch {
    return sanitizeMembers(null);
  }
};

const readScopedFolders = (spaceId: SpaceId): AssetFolder[] => {
  try {
    const stored = localStorage.getItem(ASSET_FOLDER_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as AssetFolder[];
    if (!Array.isArray(parsed)) return [];
    const prefix = `${spaceId}${FOLDER_SCOPE_SEPARATOR}`;
    return parsed.filter(folder => (
      !!folder && typeof folder.id === 'string' && folder.id.startsWith(prefix)
    ));
  } catch {
    return [];
  }
};

export default function PermissionManager({ addLog }: PermissionManagerProps) {
  const [members, setMembers] = useState<Record<SpaceId, ProjectMember[]>>(getInitialMembers);
  const [selectedProjectId, setSelectedProjectId] = useState<SpaceId>(SpaceId.ProjectA);
  const [activeTab, setActiveTab] = useState<'members' | 'assets'>('members');

  // Add-member modal state
  const [isAddMemberOpen, setIsAddMemberOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [nameDraft, setNameDraft] = useState<string>('');
  const [emailDraft, setEmailDraft] = useState<string>('');
  const [roleDraft, setRoleDraft] = useState<ProjectRole>('member');
  const [isAddSubmitAttempted, setIsAddSubmitAttempted] = useState<boolean>(false);

  // Remove confirmation + asset share-scope modal
  const [pendingRemove, setPendingRemove] = useState<ProjectMember | null>(null);
  const [viewingShareFolderId, setViewingShareFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());

  // Live folder tree snapshot for the selected project (read fresh when tab/project changes)
  const [scopedFolders, setScopedFolders] = useState<AssetFolder[]>([]);

  useEffect(() => {
    localStorage.setItem(PROJECT_MEMBERS_STORAGE_KEY, JSON.stringify(members));
  }, [members]);

  useEffect(() => {
    if (activeTab !== 'assets') return;
    const folders = readScopedFolders(selectedProjectId);
    setScopedFolders(folders);
    // Expand all top-level folders by default for visibility.
    const anchorId = PROJECT_ANCHOR_IDS[selectedProjectId];
    const folderIds = new Set(folders.map(f => f.id));
    const topLevel = folders.filter(f => f.parentId === anchorId || !folderIds.has(f.parentId ?? ''));
    setExpandedFolderIds(new Set(topLevel.map(f => f.id)));
  }, [activeTab, selectedProjectId]);

  const selectedProject = PROJECT_GROUPS.find(group => group.id === selectedProjectId) ?? PROJECT_GROUPS[0];
  const currentMembers = members[selectedProjectId] ?? [];
  const adminCount = currentMembers.filter(member => member.role === 'admin').length;
  const currentUserMember = currentMembers.find(member => member.email === CURRENT_USER_EMAIL) ?? null;
  const isCurrentUserAdmin = currentUserMember?.role === 'admin';

  const sortedMembers = useMemo(() => {
    return [...currentMembers].sort((a, b) => {
      // Admins first, then by joined time ascending.
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });
  }, [currentMembers]);

  const platformMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const existingEmails = new Set(currentMembers.map(member => member.email.toLowerCase()));
    return PLATFORM_USERS
      .filter(user => !existingEmails.has(user.email.toLowerCase()))
      .filter(user => {
        if (!query) return true;
        return user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [searchQuery, currentMembers]);

  const addMemberError = useMemo(() => {
    const name = nameDraft.trim();
    const email = emailDraft.trim();
    if (!name) return '请输入成员姓名';
    if (!email) return '请输入成员邮箱';
    if (!EMAIL_REGEX.test(email)) return '邮箱格式不正确';
    if (currentMembers.some(member => member.email.toLowerCase() === email.toLowerCase())) {
      return '该成员已在项目组中';
    }
    return '';
  }, [nameDraft, emailDraft, currentMembers]);
  const shouldShowAddError = isAddSubmitAttempted && !!addMemberError;

  const resetAddMemberModal = () => {
    setIsAddMemberOpen(false);
    setSearchQuery('');
    setNameDraft('');
    setEmailDraft('');
    setRoleDraft('member');
    setIsAddSubmitAttempted(false);
  };

  // Guard for demote/remove on an admin: the project must always keep ≥1 admin.
  // This also enforces "an admin can't demote/remove themselves unless another admin exists",
  // since a self-action while being the only admin is exactly the adminCount<=1 case.
  const guardAdminAction = (target: ProjectMember): string => {
    if (target.role === 'admin' && adminCount <= 1) {
      return target.email === CURRENT_USER_EMAIL
        ? '请先提升其他成员为管理员，再降级或移除自己'
        : '项目组至少需保留 1 名管理员';
    }
    return '';
  };

  const handleAddMember = () => {
    setIsAddSubmitAttempted(true);
    if (addMemberError) {
      addLog(`❌ 添加成员被拦截：${addMemberError}`, 'error', { toast: false });
      return;
    }
    const newMember: ProjectMember = {
      id: `member-${selectedProjectId}-${Date.now()}`,
      name: nameDraft.trim(),
      email: emailDraft.trim(),
      role: roleDraft,
      joinedAt: new Date().toISOString()
    };
    setMembers(prev => ({
      ...prev,
      [selectedProjectId]: [...(prev[selectedProjectId] ?? []), newMember]
    }));
    addLog(`👥 已将【${newMember.name}】添加到项目组「${selectedProject.name}」，角色：${ROLE_LABELS[newMember.role]}。`, 'success');
    resetAddMemberModal();
  };

  const handleSelectPlatformUser = (userName: string, userEmail: string) => {
    setNameDraft(userName);
    setEmailDraft(userEmail);
  };

  const handleChangeRole = (target: ProjectMember) => {
    if (!isCurrentUserAdmin) return;
    const nextRole: ProjectRole = target.role === 'admin' ? 'member' : 'admin';

    if (nextRole === 'member') {
      const error = guardAdminAction(target);
      if (error) {
        addLog(`❌ 变更角色被拦截：${error}`, 'error');
        return;
      }
    }

    setMembers(prev => ({
      ...prev,
      [selectedProjectId]: (prev[selectedProjectId] ?? []).map(member => (
        member.id === target.id ? { ...member, role: nextRole } : member
      ))
    }));
    const verb = nextRole === 'admin' ? '提升为管理员' : '降级为项目成员';
    addLog(`🔁 已将【${target.name}】${verb}。`, 'success');
  };

  const requestRemoveMember = (target: ProjectMember) => {
    if (!isCurrentUserAdmin) return;
    const error = guardAdminAction(target);
    if (error) {
      addLog(`❌ 移除成员被拦截：${error}`, 'error');
      return;
    }
    setPendingRemove(target);
  };

  const confirmRemoveMember = () => {
    if (!pendingRemove) return;
    const target = pendingRemove;
    setMembers(prev => ({
      ...prev,
      [selectedProjectId]: (prev[selectedProjectId] ?? []).filter(member => member.id !== target.id)
    }));
    addLog(`🗑️ 已将【${target.name}】移出项目组「${selectedProject.name}」，其授权立即失效。`, 'warning');
    setPendingRemove(null);
  };

  // --- Asset folder tree ---------------------------------------------------
  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, AssetFolder[]>();
    scopedFolders.forEach(folder => {
      const list = map.get(folder.parentId) ?? [];
      list.push(folder);
      map.set(folder.parentId, list);
    });
    map.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true })));
    return map;
  }, [scopedFolders]);

  const folderById = useMemo(() => {
    return scopedFolders.reduce<Record<string, AssetFolder>>((acc, folder) => {
      acc[folder.id] = folder;
      return acc;
    }, {});
  }, [scopedFolders]);

  const anchorId = PROJECT_ANCHOR_IDS[selectedProjectId];
  const rootFolders = useMemo(() => {
    const folderIds = new Set(scopedFolders.map(f => f.id));
    return scopedFolders
      .filter(folder => folder.parentId === anchorId || !folderIds.has(folder.parentId ?? ''))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));
  }, [scopedFolders, anchorId]);

  const getFolderPath = (folderId: string): string => {
    const names: string[] = [];
    const visited = new Set<string>();
    let cursor: AssetFolder | undefined = folderById[folderId];
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      names.unshift(cursor.name);
      cursor = cursor.parentId ? folderById[cursor.parentId] : undefined;
    }
    return `${selectedProject.name} / ${names.join(' / ')}`;
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderFolderRow = (folder: AssetFolder, depth: number): React.ReactNode => {
    const children = foldersByParent.get(folder.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolderIds.has(folder.id);

    return (
      <div key={folder.id}>
        <div
          className="group flex items-center gap-1.5 rounded py-1.5 pr-2 hover:bg-[#0c0c0e]"
          style={{ paddingLeft: `${8 + depth * 18}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleFolderExpanded(folder.id)}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors ${
              hasChildren ? 'text-zinc-500 hover:text-[#00ff00]' : 'text-zinc-700'
            }`}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            ) : (
              <span className="h-1 w-1 rounded-full bg-current" />
            )}
          </button>
          {isExpanded && hasChildren ? (
            <FolderOpen size={14} className="shrink-0 text-zinc-500" />
          ) : (
            <Folder size={14} className="shrink-0 text-zinc-500" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{folder.name}</span>
          <button
            type="button"
            onClick={() => setViewingShareFolderId(folder.id)}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-400 opacity-0 transition-all hover:border-[#00ff00]/60 hover:text-[#00ff00] group-hover:opacity-100"
          >
            <Eye size={11} />
            查看权限
          </button>
        </div>
        {hasChildren && isExpanded && children.map(child => renderFolderRow(child, depth + 1))}
      </div>
    );
  };

  const shareFolder = viewingShareFolderId ? folderById[viewingShareFolderId] : null;

  const roleBadge = (role: ProjectRole) => (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-mono ${
        role === 'admin'
          ? 'border-[#00ff00]/50 bg-[#00ff00]/10 text-[#00ff00]'
          : 'border-zinc-700 bg-zinc-900 text-zinc-400'
      }`}
    >
      {role === 'admin' ? <Crown size={10} /> : <UserIcon size={10} />}
      {ROLE_LABELS[role]}
    </span>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden font-sans">
      {/* Left: project group selector */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-[#27272a] bg-[#0c0c0e]/40">
        <div className="flex items-center gap-2 border-b border-[#27272a] px-4 py-3">
          <ShieldCheck size={16} className="text-[#00ff00]" />
          <span className="text-xs font-bold text-white">权限管理</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <label className="mb-1 block pl-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">项目组</label>
          <div className="space-y-1">
            {PROJECT_GROUPS.map(group => {
              const isActive = group.id === selectedProjectId;
              const memberCount = (members[group.id] ?? []).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedProjectId(group.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded border-l-2 px-3 py-2 text-left transition-all ${
                    isActive
                      ? 'border-[#00ff00] bg-[#18181b] text-white'
                      : 'border-transparent text-zinc-400 hover:bg-[#0c0c0e] hover:text-white'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{group.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">{memberCount}人</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Right: tabs + content */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header with project name + tabs */}
        <div className="shrink-0 border-b border-[#27272a] bg-[#0c0c0e]/60 px-5 pt-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-bold text-white">{selectedProject.name}</span>
            {!isCurrentUserAdmin && (
              <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                仅查看
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {([
              { id: 'members' as const, name: '成员管理', icon: Users }
              // 素材管理 tab 暂时下线
              // { id: 'assets' as const, name: '素材管理', icon: FolderTree }
            ]).map(tab => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? 'border-[#00ff00] text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <TabIcon size={14} className={isActive ? 'text-[#00ff00]' : ''} />
                  {tab.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'members' ? (
            <div>
              {/* Toolbar */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-zinc-500">
                  共 {currentMembers.length} 名成员 · {adminCount} 名管理员
                </span>
                <button
                  type="button"
                  disabled={!isCurrentUserAdmin}
                  title={isCurrentUserAdmin ? '添加成员' : '仅管理员可操作'}
                  onClick={() => setIsAddMemberOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded border border-[#00ff00]/40 bg-[#00ff00]/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-[#00ff00] transition-colors hover:border-[#00ff00] hover:bg-[#00ff00]/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-transparent disabled:text-zinc-600"
                >
                  <UserPlus size={13} />
                  添加成员
                </button>
              </div>

              {/* Members table */}
              <div className="overflow-hidden rounded border border-[#27272a]">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#27272a] bg-[#0c0c0e] font-mono text-[10.5px] uppercase tracking-wide text-zinc-500">
                      <th className="px-3 py-2 font-medium">姓名</th>
                      <th className="px-3 py-2 font-medium">邮箱</th>
                      <th className="px-3 py-2 font-medium">角色</th>
                      <th className="px-3 py-2 font-medium">加入时间</th>
                      <th className="px-3 py-2 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMembers.map(member => {
                      const isSelf = member.email === CURRENT_USER_EMAIL;
                      return (
                        <tr key={member.id} className="border-b border-[#1c1c1f] last:border-b-0 hover:bg-[#0c0c0e]/60">
                          <td className="px-3 py-2.5 text-xs text-zinc-200">
                            <span className="flex items-center gap-1.5">
                              {member.name}
                              {isSelf && <span className="rounded bg-zinc-800 px-1 font-mono text-[9px] text-zinc-400">我</span>}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-400">{member.email}</td>
                          <td className="px-3 py-2.5">{roleBadge(member.role)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-zinc-400">{formatJoinedAt(member.joinedAt)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={!isCurrentUserAdmin}
                                title={isCurrentUserAdmin ? (member.role === 'admin' ? '降级为项目成员' : '提升为管理员') : '仅管理员可操作'}
                                onClick={() => handleChangeRole(member)}
                                className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:border-[#00ff00]/60 hover:text-[#00ff00] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300"
                              >
                                权限配置
                              </button>
                              <button
                                type="button"
                                disabled={!isCurrentUserAdmin}
                                title={isCurrentUserAdmin ? '移出项目组' : '仅管理员可操作'}
                                onClick={() => requestRemoveMember(member)}
                                className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-black px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:border-red-500/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {sortedMembers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-xs text-zinc-600">该项目组暂无成员。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-3 font-mono text-[11px] text-zinc-500">
                当前项目组文件夹结构（仅展示文件夹）。点击右侧「查看权限」可查看该目录的分享范围。
              </p>
              <div className="rounded border border-[#27272a] bg-[#0c0c0e]/40 p-2">
                {rootFolders.length === 0 ? (
                  <div className="px-3 py-8 text-center text-xs text-zinc-600">
                    该项目组暂无文件夹，请先在素材库中创建目录。
                  </div>
                ) : (
                  rootFolders.map(folder => renderFolderRow(folder, 0))
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Add member modal */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={resetAddMemberModal}>
          <div
            className="w-full max-w-md overflow-hidden rounded-lg border border-[#27272a] bg-[#0a0a0c] shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#27272a] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <UserPlus size={15} className="text-[#00ff00]" />
                添加成员
              </span>
              <button type="button" onClick={resetAddMemberModal} className="text-zinc-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              {/* Platform user search */}
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">从平台用户选择</label>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="搜索姓名或邮箱进行匹配"
                    className="w-full rounded border border-zinc-800 bg-black py-2 pl-9 pr-3 text-xs text-zinc-200 outline-none focus:border-[#00ff00]"
                  />
                </div>
                {searchQuery.trim() && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded border border-zinc-800 bg-black">
                    {platformMatches.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] text-zinc-600">无匹配的平台用户</div>
                    ) : (
                      platformMatches.map(user => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleSelectPlatformUser(user.name, user.email)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-[#121214]"
                        >
                          <span className="text-xs text-zinc-200">{user.name}</span>
                          <span className="font-mono text-[10px] text-zinc-500">{user.email}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">姓名</label>
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={event => setNameDraft(event.target.value)}
                    placeholder="成员姓名"
                    className="w-full rounded border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#00ff00]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">邮箱</label>
                  <input
                    type="text"
                    value={emailDraft}
                    onChange={event => setEmailDraft(event.target.value)}
                    placeholder="name@studio.com"
                    className="w-full rounded border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#00ff00]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">角色</label>
                <div className="flex gap-2">
                  {(['member', 'admin'] as ProjectRole[]).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setRoleDraft(role)}
                      className={`flex-1 rounded border px-3 py-2 text-xs transition-colors ${
                        roleDraft === role
                          ? 'border-[#00ff00]/60 bg-[#00ff00]/10 text-[#00ff00]'
                          : 'border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
              </div>

              {shouldShowAddError && (
                <p className="font-mono text-[10.5px] text-red-400">{addMemberError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#27272a] px-4 py-3">
              <button
                type="button"
                onClick={resetAddMemberModal}
                className="rounded border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddMember}
                className="inline-flex items-center gap-1.5 rounded bg-[#00ff00] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#00ff00]/90"
              >
                <Check size={13} />
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      {pendingRemove && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setPendingRemove(null)}>
          <div
            className="w-full max-w-sm overflow-hidden rounded-lg border border-[#27272a] bg-[#0a0a0c] shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="border-b border-[#27272a] px-4 py-3 text-sm font-bold text-white">移出项目组</div>
            <div className="px-4 py-4 text-xs leading-relaxed text-zinc-300">
              确认将 <span className="font-semibold text-white">{pendingRemove.name}</span>（{pendingRemove.email}）移出项目组「{selectedProject.name}」？
              <p className="mt-2 text-[11px] text-amber-500">移除后其在该项目组内的授权将立即失效。</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#27272a] px-4 py-3">
              <button
                type="button"
                onClick={() => setPendingRemove(null)}
                className="rounded border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                className="inline-flex items-center gap-1.5 rounded bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
              >
                <Trash2 size={13} />
                确认移除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share-scope modal */}
      {shareFolder && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setViewingShareFolderId(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-[#27272a] bg-[#0a0a0c] shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#27272a] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <Eye size={15} className="text-[#00ff00]" />
                分享范围
              </span>
              <button type="button" onClick={() => setViewingShareFolderId(null)} className="text-zinc-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4">
              <div className="mb-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  <Folder size={14} className="text-zinc-400" />
                  {shareFolder.name}
                </span>
                <p className="mt-1 break-all font-mono text-[10.5px] text-zinc-500">{getFolderPath(shareFolder.id)}</p>
              </div>
              <p className="mb-2 text-[11px] text-zinc-400">该目录在本项目组内对下列成员可见：</p>

              <div className="mb-3 rounded border border-[#00ff00]/30 bg-[#00ff00]/5 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#00ff00]">
                  <Users size={13} />
                  项目组：{selectedProject.name}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">{currentMembers.length} 名成员</span>
              </div>

              <div className="space-y-1.5">
                {currentMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-black px-3 py-2">
                    <div className="min-w-0">
                      <span className="block truncate text-xs text-zinc-200">{member.name}</span>
                      <span className="block truncate font-mono text-[10px] text-zinc-500">{member.email}</span>
                    </div>
                    {roleBadge(member.role)}
                  </div>
                ))}
                {currentMembers.length === 0 && (
                  <div className="px-3 py-4 text-center text-[11px] text-zinc-600">该项目组暂无成员。</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Circle,
  Clock,
  FileImage,
  Hand,
  History,
  Image,
  MessageSquare,
  Mic,
  MousePointer2,
  PenLine,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shapes,
  Square,
  Type,
  Users,
  Video,
  X
} from 'lucide-react';
import {
  CanvasCommentThread,
  CanvasDocument,
  CanvasElement,
  CanvasElementKind,
  CanvasHistoryEntry,
  CanvasRole,
  SpaceId
} from '../types';
import {
  CURRENT_USER_EMAIL,
  CURRENT_USER_NAME
} from '../data';
import {
  CANVAS_COMMENTS_STORAGE_KEY,
  CANVAS_ELEMENTS_STORAGE_KEY,
  CANVAS_HISTORY_STORAGE_KEY,
  CANVASES_STORAGE_KEY,
  readCanvasComments,
  readCanvasElements,
  readCanvasHistory,
  readCanvasShares,
  readCanvases,
  readProjectMembers,
  writeStorage
} from '../canvasStorage';

interface CanvasEditorWindowProps {
  theme: 'light' | 'dark';
}

type EditorTool = 'select' | 'text' | 'shape' | 'image' | 'pen' | 'audio' | 'video' | 'model' | 'comment' | 'discussion';
type RightPanelTab = 'comments' | 'history' | 'discussion';

const formatDateTime = (source: string) => {
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return '--';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

const getRoleLabel = (role: CanvasRole) => {
  if (role === 'owner') return '作者';
  if (role === 'editor') return '编辑者';
  return '使用者';
};

const roleCanEdit = (role: CanvasRole) => role === 'owner' || role === 'editor';

const getKindLabel = (kind: CanvasElementKind) => {
  if (kind === 'text') return '文本';
  if (kind === 'shape') return '形状';
  if (kind === 'image') return '图片';
  if (kind === 'audio') return '音频';
  if (kind === 'video') return '视频';
  return '模型';
};

const getElementIcon = (kind: CanvasElementKind) => {
  if (kind === 'text') return Type;
  if (kind === 'shape') return Shapes;
  if (kind === 'image') return Image;
  if (kind === 'audio') return Play;
  if (kind === 'video') return Video;
  return FileImage;
};

const getCanvasRole = (canvas: CanvasDocument, queryRole: CanvasRole | null): CanvasRole => {
  if (canvas.ownerEmail.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase()) return 'owner';
  const shares = readCanvasShares();
  const directShare = shares.find(share => (
    share.canvasId === canvas.id &&
    share.granteeEmail.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase()
  ));
  if (directShare) return directShare.role;
  if (canvas.spaceId === SpaceId.ProjectA || canvas.spaceId === SpaceId.ProjectB) {
    const members = readProjectMembers();
    const currentMember = members[canvas.spaceId]?.find(member => member.email.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase());
    if (currentMember) {
      if (currentMember.role === 'admin') return 'editor';
      const groupShare = shares.find(share => share.canvasId === canvas.id && share.viaGroup === canvas.spaceId);
      return groupShare?.role ?? 'editor';
    }
  }
  return queryRole ?? 'viewer';
};

const toolbarItems: Array<{ id: EditorTool; label: string; icon: typeof MousePointer2; editRequired?: boolean }> = [
  { id: 'select', label: '选择', icon: MousePointer2 },
  { id: 'text', label: '文字', icon: Type, editRequired: true },
  { id: 'shape', label: '形状', icon: Square, editRequired: true },
  { id: 'image', label: '图片', icon: Image, editRequired: true },
  { id: 'pen', label: '画笔', icon: PenLine, editRequired: true },
  { id: 'audio', label: '音频', icon: Play, editRequired: true },
  { id: 'video', label: '视频', icon: Video, editRequired: true },
  { id: 'model', label: '模型', icon: FileImage, editRequired: true },
  { id: 'comment', label: '评论', icon: MessageSquare },
  { id: 'discussion', label: '讨论', icon: Mic }
];

const panelTabs: Array<{ id: RightPanelTab; label: string; icon: typeof MessageSquare }> = [
  { id: 'comments', label: '评论', icon: MessageSquare },
  { id: 'history', label: '历史', icon: History },
  { id: 'discussion', label: '讨论', icon: Mic }
];

export default function CanvasEditorWindow({ theme }: CanvasEditorWindowProps) {
  const query = new URLSearchParams(window.location.search);
  const canvasId = query.get('canvasId') ?? '';
  const queryRole = query.get('role') as CanvasRole | null;
  const [canvases, setCanvases] = useState<CanvasDocument[]>(readCanvases);
  const [elements, setElements] = useState<CanvasElement[]>(readCanvasElements);
  const [history, setHistory] = useState<CanvasHistoryEntry[]>(readCanvasHistory);
  const [comments, setComments] = useState<CanvasCommentThread[]>(readCanvasComments);
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [rightTab, setRightTab] = useState<RightPanelTab>('comments');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [discussionActive, setDiscussionActive] = useState(false);

  const canvas = canvases.find(item => item.id === canvasId && !item.isDeleted) ?? null;
  const role = canvas ? getCanvasRole(canvas, queryRole) : 'viewer';
  const canEdit = roleCanEdit(role);

  const canvasElements = useMemo(() => (
    elements
      .filter(element => element.canvasId === canvasId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  ), [canvasId, elements]);

  const canvasHistory = useMemo(() => (
    history
      .filter(entry => entry.canvasId === canvasId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  ), [canvasId, history]);

  const canvasComments = useMemo(() => (
    comments
      .filter(comment => comment.canvasId === canvasId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  ), [canvasId, comments]);

  useEffect(() => {
    document.title = canvas ? `${canvas.name} - PixGo 画布` : 'PixGo 画布';
  }, [canvas]);

  const updateCanvases = (next: CanvasDocument[]) => {
    setCanvases(next);
    writeStorage(CANVASES_STORAGE_KEY, next);
  };

  const updateElements = (next: CanvasElement[]) => {
    setElements(next);
    writeStorage(CANVAS_ELEMENTS_STORAGE_KEY, next);
  };

  const updateHistory = (next: CanvasHistoryEntry[]) => {
    setHistory(next);
    writeStorage(CANVAS_HISTORY_STORAGE_KEY, next);
  };

  const updateComments = (next: CanvasCommentThread[]) => {
    setComments(next);
    writeStorage(CANVAS_COMMENTS_STORAGE_KEY, next);
  };

  const touchCanvas = (summary: string, nextElementCount = elements.filter(element => element.canvasId === canvas?.id).length) => {
    if (!canvas) return;
    const now = new Date().toISOString();
    updateCanvases(canvases.map(item => item.id === canvas.id ? {
      ...item,
      updatedAt: now,
      elementCount: nextElementCount
    } : item));
    updateHistory([
      { id: `history-${Date.now()}`, canvasId: canvas.id, actorName: CURRENT_USER_NAME, createdAt: now, summary },
      ...history
    ]);
  };

  const addElement = (kind: CanvasElementKind) => {
    if (!canvas || !canEdit) {
      setStatus('您是使用者，无编辑权限，可联系作者授权。');
      return;
    }
    const now = new Date().toISOString();
    const nextElement: CanvasElement = {
      id: `element-${Date.now()}`,
      canvasId: canvas.id,
      kind,
      x: 16 + (canvasElements.length % 4) * 18,
      y: 16 + (canvasElements.length % 3) * 16,
      width: kind === 'text' ? 250 : 220,
      height: kind === 'text' ? 96 : 136,
      title: kind === 'text' ? '新文本块' : `新${getKindLabel(kind)}素材`,
      body: kind === 'text' ? '双击后接入 Excalidraw 富文本编辑。' : '素材卡片已加入画布，可在正式编辑器中替换内容。',
      color: kind === 'shape' ? '#0f766e' : kind === 'image' ? '#1d4ed8' : kind === 'audio' ? '#b45309' : kind === 'video' ? '#be123c' : kind === 'model' ? '#7c3aed' : '#334155',
      createdByName: CURRENT_USER_NAME,
      createdAt: now
    };
    const nextElements = [...elements, nextElement];
    updateElements(nextElements);
    setSelectedElementId(nextElement.id);
    setStatus(`已添加${getKindLabel(kind)}元素。`);
    touchCanvas(`添加${getKindLabel(kind)}元素。`, nextElements.filter(element => element.canvasId === canvas.id).length);
  };

  const addComment = () => {
    if (!canvas) return;
    const now = new Date().toISOString();
    const targetElement = selectedElementId ? elements.find(element => element.id === selectedElementId) : null;
    const nextComment: CanvasCommentThread = {
      id: `comment-${Date.now()}`,
      canvasId: canvas.id,
      x: targetElement ? Math.min(92, targetElement.x + 10) : 56,
      y: targetElement ? Math.min(86, targetElement.y + 12) : 48,
      authorName: CURRENT_USER_NAME,
      body: targetElement ? `请看一下「${targetElement.title}」这里。` : '新增一条画布评论。',
      createdAt: now,
      resolved: false,
      replies: []
    };
    updateComments([nextComment, ...comments]);
    updateHistory([
      { id: `history-${Date.now()}`, canvasId: canvas.id, actorName: CURRENT_USER_NAME, createdAt: now, summary: '新增评论。' },
      ...history
    ]);
    setRightTab('comments');
    setStatus('已添加评论。');
  };

  const handleToolClick = (tool: EditorTool, editRequired?: boolean) => {
    if (editRequired && !canEdit) {
      setStatus('您是使用者，无编辑权限，可联系作者授权。');
      return;
    }
    setActiveTool(tool);
    if (tool === 'comment') {
      addComment();
      return;
    }
    if (tool === 'discussion') {
      setDiscussionActive(true);
      setRightTab('discussion');
      setStatus('讨论已进入准备状态。');
      return;
    }
    if (tool === 'text') addElement('text');
    if (tool === 'shape') addElement('shape');
    if (tool === 'image') addElement('image');
    if (tool === 'audio') addElement('audio');
    if (tool === 'video') addElement('video');
    if (tool === 'model') addElement('model');
  };

  const markCommentResolved = (commentId: string) => {
    updateComments(comments.map(comment => comment.id === commentId ? { ...comment, resolved: !comment.resolved } : comment));
  };

  if (!canvas) {
    return (
      <div className={`canvas-editor-window flex h-screen items-center justify-center ${theme === 'light' ? 'light bg-[#f8fafc]' : 'dark bg-[#09090b]'} text-zinc-200`}>
        <div className="max-w-sm rounded-xl border border-[#27272a] bg-[#0c0c0e] p-6 text-center">
          <PaletteFallback />
          <h1 className="mt-3 text-sm font-bold text-white">画布加载失败</h1>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">该画布不存在，或已被作者删除。</p>
          <button type="button" onClick={() => window.close()} className="mt-5 rounded border border-zinc-800 bg-black px-4 py-2 text-xs text-zinc-300 hover:text-white">
            关闭窗口
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`canvas-editor-window flex h-screen flex-col overflow-hidden font-sans ${theme === 'light' ? 'light bg-[#f8fafc] text-zinc-900' : 'dark bg-[#09090b] text-zinc-200'}`}>
      <header className="canvas-editor-header flex h-14 shrink-0 items-center gap-3 border-b border-[#1c1c1f] bg-[#0c0c0e] px-3">
        <button type="button" onClick={() => window.close()} className="canvas-editor-icon-btn" title="关闭窗口">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-bold text-white">{canvas.name}</h1>
            <span className="canvas-role-badge">{getRoleLabel(role)}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-zinc-500">
            创建人 {canvas.ownerName} · 最后更新 {formatDateTime(canvas.updatedAt)}
          </p>
        </div>
        <div className="hidden items-center gap-1 lg:flex">
          <span className="canvas-collab-avatar bg-emerald-500">慕</span>
          <span className="canvas-collab-avatar bg-sky-500">赵</span>
          <span className="canvas-collab-avatar bg-violet-500">诸</span>
        </div>
        <button type="button" className="canvas-editor-save-btn" onClick={() => setStatus('画布已保存。')}>
          <Save size={14} />
          保存
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="canvas-tool-sidebar flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[#1c1c1f] bg-[#0a0a0c] py-2">
          {toolbarItems.map(item => {
            const ToolIcon = item.icon;
            const disabled = item.editRequired && !canEdit;
            const active = activeTool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => handleToolClick(item.id, item.editRequired)}
                className={`canvas-tool-btn ${active ? 'is-active' : ''}`}
                title={disabled ? '无编辑权限' : item.label}
              >
                <ToolIcon size={15} />
              </button>
            );
          })}
        </aside>

        <main className="canvas-stage-wrap relative min-w-0 flex-1 overflow-auto bg-[#101114]">
          {!canEdit && (
            <div className="canvas-permission-banner absolute left-4 top-4 z-20 rounded border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
              您是使用者，无编辑权限，可联系作者授权。
            </div>
          )}
          {status && (
            <div className="canvas-status-toast absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded border border-zinc-700 bg-black/85 px-3 py-2 text-[11px] text-zinc-200">
              {status}
            </div>
          )}

          <div className="canvas-board relative mx-auto my-10 h-[820px] w-[1180px] overflow-hidden rounded border border-[#27272a] bg-[#f4f1e8]">
            <div className="canvas-grid absolute inset-0" />
            <div className="absolute left-6 top-5 flex items-center gap-2 rounded border border-black/10 bg-white/80 px-2.5 py-1.5 text-[10px] font-mono text-slate-600">
              <Hand size={12} />
              100% · {canvasElements.length} 元素 · {canvasComments.filter(comment => !comment.resolved).length} 未解决评论
            </div>

            <div className="absolute left-[68%] top-[12%] h-20 w-20 rounded-full border border-dashed border-slate-400/50" />
            <div className="absolute left-[72%] top-[23%] h-28 w-28 rounded border border-dashed border-slate-400/50" />
            <div className="absolute left-[63%] top-[38%] h-24 w-52 rounded-full border border-dashed border-slate-400/40" />

            {canvasElements.map(element => {
              const ElementIcon = getElementIcon(element.kind);
              const isSelected = selectedElementId === element.id;
              return (
                <button
                  key={element.id}
                  type="button"
                  onClick={() => setSelectedElementId(element.id)}
                  className={`canvas-element absolute rounded-lg border bg-white text-left transition-colors ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    left: `${element.x}%`,
                    top: `${element.y}%`,
                    width: element.width,
                    minHeight: element.height,
                    borderColor: isSelected ? '#2563eb' : 'rgba(15, 23, 42, 0.16)'
                  }}
                >
                  <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded" style={{ backgroundColor: `${element.color}18`, color: element.color }}>
                      <ElementIcon size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{element.title}</p>
                      <p className="text-[9px] text-slate-500">{getKindLabel(element.kind)} · {element.createdByName}</p>
                    </div>
                  </div>
                  <div className="px-3 py-2 text-[11px] leading-relaxed text-slate-600">{element.body}</div>
                  {isSelected && (
                    <>
                      <span className="canvas-handle left-[-5px] top-[-5px]" />
                      <span className="canvas-handle right-[-5px] top-[-5px]" />
                      <span className="canvas-handle bottom-[-5px] left-[-5px]" />
                      <span className="canvas-handle bottom-[-5px] right-[-5px]" />
                    </>
                  )}
                </button>
              );
            })}

            {canvasComments.filter(comment => !comment.resolved).map(comment => (
              <button
                key={comment.id}
                type="button"
                onClick={() => setRightTab('comments')}
                className="canvas-comment-pin absolute z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-[#2563eb] text-[10px] font-bold text-white"
                style={{ left: `${comment.x}%`, top: `${comment.y}%` }}
                title={comment.body}
              >
                <MessageSquare size={13} />
              </button>
            ))}
          </div>
        </main>

        <aside className="canvas-right-panel flex w-[340px] shrink-0 flex-col border-l border-[#1c1c1f] bg-[#0c0c0e]">
          <div className="grid shrink-0 grid-cols-3 border-b border-[#1c1c1f] p-2">
            {panelTabs.map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRightTab(tab.id)}
                  className={`canvas-panel-tab ${rightTab === tab.id ? 'is-active' : ''}`}
                >
                  <TabIcon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {rightTab === 'comments' && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-white">评论串</p>
                <button type="button" onClick={addComment} className="canvas-mini-btn">
                  <Plus size={12} />
                  评论
                </button>
              </div>
              <div className="space-y-2">
                {canvasComments.length === 0 && <p className="rounded border border-dashed border-zinc-800 px-3 py-8 text-center text-[11px] text-zinc-600">暂无评论</p>}
                {canvasComments.map(comment => (
                  <div key={comment.id} className={`canvas-side-card ${comment.resolved ? 'opacity-55' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-zinc-200">{comment.authorName}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-600">{formatDateTime(comment.createdAt)}</p>
                      </div>
                      <button type="button" onClick={() => markCommentResolved(comment.id)} className="text-[10px] text-zinc-500 hover:text-[#00ff00]">
                        {comment.resolved ? '重新打开' : '解决'}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-300">{comment.body}</p>
                    {comment.replies.length > 0 && (
                      <div className="mt-2 space-y-1 border-l border-zinc-800 pl-2">
                        {comment.replies.map(reply => (
                          <p key={reply.id} className="text-[10px] leading-relaxed text-zinc-500">
                            <span className="text-zinc-400">{reply.authorName}：</span>{reply.body}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rightTab === 'history' && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-white">操作历史</p>
                <button type="button" disabled={!canEdit} className="canvas-mini-btn disabled:cursor-not-allowed disabled:opacity-40">
                  <RotateCcw size={12} />
                  恢复
                </button>
              </div>
              <div className="space-y-2">
                {canvasHistory.length === 0 && <p className="rounded border border-dashed border-zinc-800 px-3 py-8 text-center text-[11px] text-zinc-600">暂无历史</p>}
                {canvasHistory.map(entry => (
                  <div key={entry.id} className="canvas-side-card">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                      <Clock size={11} />
                      {formatDateTime(entry.createdAt)}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-zinc-200">{entry.actorName}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{entry.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rightTab === 'discussion' && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-white">音频讨论</p>
                <button type="button" onClick={() => setDiscussionActive(prev => !prev)} className="canvas-mini-btn">
                  <Mic size={12} />
                  {discussionActive ? '结束' : '发起'}
                </button>
              </div>
              <div className="canvas-side-card">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${discussionActive ? 'bg-[#00ff00]' : 'bg-zinc-700'}`} />
                  <p className="text-xs font-semibold text-zinc-200">{discussionActive ? '讨论进行中' : '暂无进行中的讨论'}</p>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  {discussionActive ? '已创建画布讨论会话，等待接入钉钉会议 API。' : '发起后将在此显示参与人、时长和 AI 总结状态。'}
                </p>
                {discussionActive && (
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
                    <Users size={12} />
                    慕也、赵云、诸葛亮
                  </div>
                )}
              </div>
              <div className="mt-3 canvas-side-card">
                <p className="text-xs font-semibold text-zinc-200">AI 总结草稿</p>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">讨论结束后，系统会把画布内容与语音时序提交生成结构化总结。</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PaletteFallback() {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-black text-zinc-500">
      <Circle size={18} />
    </div>
  );
}

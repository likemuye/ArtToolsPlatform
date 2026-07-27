import React from 'react';
import {
  AlertCircle,
  Check,
  FileArchive,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  SquareTerminal,
  Upload,
  X
} from 'lucide-react';
import {
  AppId,
  ComfyUISubtype,
  DccExtension,
  ExtensionArtStage,
  ExtensionHostId
} from '../types';
import { FileDropzoneSelection, PlatformFileDropzone } from './PlatformFileDropzone';

export interface ExtensionTypeMeta {
  label: string;
  short: string;
  color: string;
  logoSrc?: string;
}

export const EXTENSION_TYPE_META: Record<ExtensionHostId, ExtensionTypeMeta> = {
  comfyui: { label: 'ComfyUI', short: 'CU', color: '#22c55e' },
  [AppId.Blender]: { label: 'Blender', short: 'B', color: '#f5792a', logoSrc: '/logos/blender.svg' },
  [AppId.Photoshop]: { label: 'Photoshop', short: 'Ps', color: '#31a8ff', logoSrc: '/logos/photoshop.svg' },
  [AppId.Maya]: { label: 'Maya', short: 'M', color: '#00a6a6', logoSrc: '/logos/maya.svg' },
  [AppId.Max3ds]: { label: '3ds Max', short: '3D', color: '#37a5cc', logoSrc: '/logos/3dsmax.svg' },
  'substance-painter': { label: 'Substance Painter', short: 'SP', color: '#f59e0b' },
  motionbuilder: { label: 'MotionBuilder', short: 'MB', color: '#06b6d4' },
  'unreal-engine': { label: 'UE 插件', short: 'UE', color: '#a78bfa' },
  unity: { label: 'Unity 插件', short: 'U', color: '#64748b' },
  exe: { label: 'exe', short: 'EXE', color: '#64748b' },
  web: { label: 'web', short: 'WEB', color: '#0ea5e9' },
  [AppId.Houdini]: { label: 'Houdini', short: 'H', color: '#ff4713', logoSrc: '/logos/houdini.svg' }
};

export const EXTENSION_TYPE_OPTIONS: ExtensionHostId[] = [
  'comfyui',
  AppId.Blender,
  AppId.Photoshop,
  AppId.Maya,
  AppId.Max3ds,
  'substance-painter',
  'motionbuilder',
  'unreal-engine',
  'unity',
  'exe',
  'web'
];

export const EXTENSION_STAGE_META: Record<ExtensionArtStage, string> = {
  character_concept: '角色原画',
  scene_concept: '场景原画',
  character_model: '角色模型',
  scene_model: '场景模型',
  animation: '动画',
  vfx: '动效',
  ued: 'UED'
};

export const EXTENSION_STAGE_OPTIONS = Object.keys(EXTENSION_STAGE_META) as ExtensionArtStage[];

const HOST_VERSION_OPTIONS: Partial<Record<ExtensionHostId, string[]>> = {
  comfyui: ['0.3+', '0.4+', '0.5+'],
  [AppId.Blender]: ['3.6+', '4.0+', '4.2+'],
  [AppId.Photoshop]: ['2023+', '2024+', '2025+'],
  [AppId.Maya]: ['2022+', '2024+', '2025+'],
  [AppId.Max3ds]: ['2022+', '2024+', '2025+'],
  'substance-painter': ['9.0+', '10.0+', '11.0+'],
  motionbuilder: ['2022+', '2024+', '2025+'],
  'unreal-engine': ['5.2+', '5.3+', '5.4+'],
  unity: ['2022.3 LTS+', '2023.2+', '6.0+'],
  [AppId.Houdini]: ['19.5+', '20.0+', '20.5+']
};

export interface ExtensionDraft {
  type: ExtensionHostId;
  name: string;
  desc: string;
  thumbnail: string;
  thumbnailFileName: string;
  stage: ExtensionArtStage;
  minimumHostVersion: string;
  packagePath: string;
  command: string;
  webUrl: string;
  comfySubtype: ComfyUISubtype;
}

export const createEmptyExtensionDraft = (): ExtensionDraft => ({
  type: 'comfyui',
  name: '',
  desc: '',
  thumbnail: '',
  thumbnailFileName: '',
  stage: 'character_concept',
  minimumHostVersion: HOST_VERSION_OPTIONS.comfyui?.[0] ?? '',
  packagePath: '',
  command: '',
  webUrl: '',
  comfySubtype: 'node'
});

export const createExtensionDraft = (extension: DccExtension): ExtensionDraft => ({
  type: extension.dccId,
  name: extension.name,
  desc: extension.desc,
  thumbnail: extension.thumbnail,
  thumbnailFileName: extension.thumbnailFileName || '当前缩略图',
  stage: extension.stage,
  minimumHostVersion: extension.minimumHostVersion || HOST_VERSION_OPTIONS[extension.dccId]?.[0] || '',
  packagePath: extension.packagePath || (extension.dccId === 'web' ? '' : `已发布资源包 / ${extension.name}`),
  command: extension.command || '',
  webUrl: extension.webUrl || '',
  comfySubtype: extension.comfySubtype || 'node'
});

const DISPLAY_FIELDS: Array<keyof ExtensionDraft> = ['name', 'desc', 'thumbnail', 'thumbnailFileName', 'stage'];
const VERSION_FIELDS: Array<keyof ExtensionDraft> = ['type', 'minimumHostVersion', 'packagePath', 'command', 'webUrl', 'comfySubtype'];

export const hasDraftChanges = (before: ExtensionDraft, after: ExtensionDraft) => (
  [...DISPLAY_FIELDS, ...VERSION_FIELDS].some(key => before[key] !== after[key])
);

export const hasVersionedDraftChanges = (before: ExtensionDraft, after: ExtensionDraft) => (
  VERSION_FIELDS.some(key => before[key] !== after[key])
);

export const isExtensionDraftValid = (draft: ExtensionDraft) => {
  if (!draft.name.trim() || !draft.desc.trim() || !draft.thumbnail || !draft.stage) return false;
  if (draft.type === 'web') return /^https?:\/\/\S+$/i.test(draft.webUrl.trim());
  if (!draft.packagePath.trim()) return false;
  if (draft.type !== 'exe' && !draft.minimumHostVersion) return false;
  return true;
};

export const applyDraftToExtension = (extension: DccExtension, draft: ExtensionDraft): DccExtension => ({
  ...extension,
  name: draft.name.trim(),
  desc: draft.desc.trim(),
  dccId: draft.type,
  stage: draft.stage,
  thumbnail: draft.thumbnail,
  previewUrl: draft.thumbnail,
  thumbnailFileName: draft.thumbnailFileName,
  minimumHostVersion: draft.type === 'exe' || draft.type === 'web' ? undefined : draft.minimumHostVersion,
  packagePath: draft.type === 'web' ? undefined : draft.packagePath.trim(),
  command: draft.command.trim() || undefined,
  webUrl: draft.type === 'web' ? draft.webUrl.trim() : undefined,
  comfySubtype: draft.type === 'comfyui' ? draft.comfySubtype : undefined,
  needsRestart: draft.type !== 'exe' && draft.type !== 'web',
  updatedAt: new Date().toISOString()
});

interface ExtensionEditorProps {
  mode: 'create' | 'edit';
  draft: ExtensionDraft;
  onChange: (draft: ExtensionDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isLight: boolean;
  currentVersion?: string;
  message?: string;
}

export function ExtensionEditor({
  mode,
  draft,
  onChange,
  onCancel,
  onSubmit,
  isLight,
  currentVersion,
  message
}: ExtensionEditorProps) {
  const meta = EXTENSION_TYPE_META[draft.type];
  const versionOptions = HOST_VERSION_OPTIONS[draft.type] ?? [];
  const valid = isExtensionDraftValid(draft);
  const isWeb = draft.type === 'web';
  const isExe = draft.type === 'exe';
  const isComfy = draft.type === 'comfyui';
  const typeOptions = mode === 'edit' && !EXTENSION_TYPE_OPTIONS.includes(draft.type)
    ? [draft.type, ...EXTENSION_TYPE_OPTIONS]
    : EXTENSION_TYPE_OPTIONS;
  const inputClass = `h-10 w-full rounded border px-3 text-xs outline-none transition-colors ${isLight
    ? 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-500'
    : 'border-zinc-700 bg-black text-zinc-100 placeholder:text-zinc-600 focus:border-[#00ff00]'}`;
  const panelClass = isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]';

  const update = <K extends keyof ExtensionDraft>(key: K, value: ExtensionDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  const selectType = (type: ExtensionHostId) => {
    if (mode === 'edit') return;
    onChange({
      ...draft,
      type,
      minimumHostVersion: HOST_VERSION_OPTIONS[type]?.[0] ?? '',
      packagePath: type === 'web' ? '' : draft.packagePath,
      webUrl: type === 'web' ? draft.webUrl : ''
    });
  };

  const chooseThumbnail = ({ files }: FileDropzoneSelection) => {
    const file = files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      onChange({ ...draft, thumbnail: reader.result, thumbnailFileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  const choosePackage = ({ files, rootName }: FileDropzoneSelection) => {
    const firstFile = files[0];
    if (!firstFile) return;

    if (isComfy && draft.comfySubtype === 'workflow') {
      update('packagePath', firstFile.name);
      return;
    }

    const folderName = rootName || firstFile.webkitRelativePath.split('/')[0] || firstFile.name;
    update('packagePath', `${folderName} (${files.length} 个文件)`);
  };

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <section role="dialog" aria-modal="true" aria-label={mode === 'create' ? '创建工具拓展' : '修改工具拓展'} className={`flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded border shadow-2xl ${panelClass}`}>
        <header className={`flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 ${isLight ? 'border-slate-200' : 'border-zinc-800'}`}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-base font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>{mode === 'create' ? '创建工具拓展' : '修改工具拓展'}</h2>
              {mode === 'edit' && currentVersion && <span className={`rounded border px-2 py-0.5 text-[10px] font-mono ${isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-zinc-700 bg-black text-zinc-400'}`}>{currentVersion}</span>}
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">版本号由平台自动管理</p>
          </div>
          <button type="button" title="关闭" onClick={onCancel} className={`inline-flex h-8 w-8 items-center justify-center rounded border ${isLight ? 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}><X size={15} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div>
            <div className="mb-2 flex items-center justify-between"><FieldLabel required>拓展类型</FieldLabel><span className="text-[9px] text-zinc-500">{mode === 'edit' ? '创建后不可变更' : '全部类型'}</span></div>
            <div role="tablist" aria-label="拓展类型" className="flex flex-wrap gap-1.5">
              {typeOptions.map(type => {
                const typeMeta = EXTENSION_TYPE_META[type];
                const active = draft.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-disabled={mode === 'edit'}
                    disabled={mode === 'edit'}
                    onClick={() => selectType(type)}
                    className={`h-8 rounded border px-3 text-[10px] font-medium transition-colors disabled:cursor-not-allowed ${active
                      ? (isLight ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-white bg-white text-black')
                      : mode === 'edit'
                        ? (isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-zinc-800 bg-black/20 text-zinc-600')
                        : (isLight ? 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-800' : 'border-zinc-700 bg-black/30 text-zinc-400 hover:border-zinc-500 hover:text-white')}`}
                  >
                    {typeMeta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`mt-5 rounded border p-4 ${isLight ? 'border-slate-200 bg-slate-50/50' : 'border-zinc-800 bg-black/20'}`}>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <label>
                <FieldLabel required>名称</FieldLabel>
                <input data-testid="extension-name" value={draft.name} onChange={event => update('name', event.target.value)} placeholder="输入拓展名称" className={inputClass} />
              </label>
              <label>
                <FieldLabel required>美术环节</FieldLabel>
                <select data-testid="extension-stage" value={draft.stage} onChange={event => update('stage', event.target.value as ExtensionArtStage)} className={inputClass}>
                  {EXTENSION_STAGE_OPTIONS.map(stage => <option key={stage} value={stage}>{EXTENSION_STAGE_META[stage]}</option>)}
                </select>
              </label>
              <label className="col-span-2 max-md:col-span-1">
                <FieldLabel required>描述</FieldLabel>
                <textarea data-testid="extension-description" value={draft.desc} onChange={event => update('desc', event.target.value)} placeholder="说明工具用途" rows={3} className={`${inputClass} h-auto min-h-[78px] resize-y py-2.5 leading-5`} />
              </label>
              <div className="col-span-2 max-md:col-span-1">
                <FieldLabel required>缩略图</FieldLabel>
                <PlatformFileDropzone
                  icon={ImageIcon}
                  value={draft.thumbnailFileName}
                  title="点击或拖拽上传缩略图"
                  hint="支持 PNG、JPG、WebP，建议使用 16:9 图片"
                  actionLabel="选择图片"
                  onChoose={chooseThumbnail}
                  onRemove={() => onChange({ ...draft, thumbnail: '', thumbnailFileName: '' })}
                  accept="image/*"
                  isLight={isLight}
                  previewSrc={draft.thumbnail}
                />
              </div>
            </div>
          </div>

          <div className={`mt-4 rounded border p-4 ${isLight ? 'border-slate-200' : 'border-zinc-800'}`}>
            <div className="mb-4 flex items-center gap-2">
              <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded border text-[10px] font-bold" style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}10` }}>
                <span>{meta.short}</span>
                {meta.logoSrc && (
                  <img
                    src={meta.logoSrc}
                    alt={`${meta.label} logo`}
                    className="absolute inset-0 h-full w-full object-contain p-1.5"
                    onError={event => { event.currentTarget.style.display = 'none'; }}
                  />
                )}
              </span>
              <div><h3 className={`text-xs font-semibold ${isLight ? 'text-slate-900' : 'text-zinc-200'}`}>{meta.label} 配置</h3><p className="mt-0.5 text-[9px] text-zinc-500">按拓展类型填写发布内容</p></div>
            </div>

            {isComfy && (
              <div className="mb-4">
                <FieldLabel required>ComfyUI 子类型</FieldLabel>
                <div className={`inline-flex rounded border p-1 ${isLight ? 'border-slate-200 bg-slate-100' : 'border-zinc-700 bg-black'}`}>
                  {(['node', 'workflow'] as ComfyUISubtype[]).map(subtype => (
                    <button key={subtype} type="button" onClick={() => { if (draft.comfySubtype !== subtype) onChange({ ...draft, comfySubtype: subtype, packagePath: '' }); }} className={`h-8 rounded border px-4 text-[10px] font-medium transition-colors ${draft.comfySubtype === subtype ? (isLight ? 'border-emerald-300 bg-white text-emerald-700 shadow-sm' : 'border-white bg-white text-black') : (isLight ? 'border-transparent text-slate-500 hover:text-emerald-700' : 'border-transparent text-zinc-500 hover:text-white')}`}>{subtype === 'node' ? 'node' : 'workflow'}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              {!isExe && !isWeb && (
                <label>
                  <FieldLabel required>{draft.type === 'unreal-engine' || draft.type === 'unity' ? '依赖引擎最低版本' : '依赖软件最低版本'}</FieldLabel>
                  <select data-testid="extension-host-version" value={draft.minimumHostVersion} onChange={event => update('minimumHostVersion', event.target.value)} className={inputClass}>
                    {versionOptions.map(version => <option key={version} value={version}>{version}</option>)}
                  </select>
                </label>
              )}

              {isWeb ? (
                <label className="col-span-2 max-md:col-span-1">
                  <FieldLabel required>Web 访问 URL</FieldLabel>
                  <div className="relative"><Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" /><input data-testid="extension-web-url" value={draft.webUrl} onChange={event => update('webUrl', event.target.value)} placeholder="https://example.com/tool" className={`${inputClass} pl-9`} /></div>
                  {draft.webUrl && !/^https?:\/\/\S+$/i.test(draft.webUrl.trim()) && <p className="mt-1.5 flex items-center gap-1 text-[10px] text-red-500"><AlertCircle size={11} /> 请输入有效的 http 或 https 地址</p>}
                </label>
              ) : (
                <div className="col-span-2 max-md:col-span-1">
                  <FieldLabel required>{isComfy ? (draft.comfySubtype === 'workflow' ? 'workflow JSON' : 'custom_nodes 节点包') : isExe ? 'exe 工程目录' : '插件文件包'}</FieldLabel>
                  <PlatformFileDropzone
                    icon={isExe ? FolderOpen : FileArchive}
                    value={draft.packagePath}
                    title={isComfy && draft.comfySubtype === 'workflow' ? '点击或拖拽上传 workflow JSON' : isComfy ? '点击或拖拽上传 custom_nodes 节点包' : isExe ? '点击或拖拽上传 exe 工程目录' : '点击或拖拽上传插件文件包'}
                    hint={isComfy && draft.comfySubtype === 'workflow' ? '仅支持 JSON 文件' : '支持拖拽文件夹，上传中断后需重新选择'}
                    actionLabel={isComfy && draft.comfySubtype === 'workflow' ? '选择 JSON' : '选择文件夹'}
                    onChoose={choosePackage}
                    onRemove={() => update('packagePath', '')}
                    accept={isComfy && draft.comfySubtype === 'workflow' ? "application/json,.json" : undefined}
                    directory={!(isComfy && draft.comfySubtype === 'workflow')}
                    isLight={isLight}
                  />
                </div>
              )}

              <label className="col-span-2 max-md:col-span-1">
                <FieldLabel>指令</FieldLabel>
                <div className="relative"><SquareTerminal size={14} className="absolute left-3 top-3 text-zinc-500" /><textarea data-testid="extension-command" value={draft.command} onChange={event => update('command', event.target.value)} placeholder={isExe ? '例如：tool.exe --project current' : '环境变量注入或工具启动命令'} rows={3} className={`${inputClass} h-auto min-h-[78px] resize-y py-2.5 pl-9 font-mono leading-5`} /></div>
              </label>
            </div>
          </div>

          {message && <p role="status" className={`mt-4 flex items-center gap-2 rounded border px-3 py-2 text-[11px] ${isLight ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}><AlertCircle size={13} />{message}</p>}
        </div>

        <footer className={`flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-zinc-800 bg-black/25'}`}>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">{valid ? <><Check size={12} className="text-emerald-500" />必填项已完成</> : <><AlertCircle size={12} className="text-red-500" />请完成所有必填项</>}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className={`h-9 rounded border px-4 text-[11px] ${isLight ? 'border-slate-300 bg-white text-slate-600 hover:text-slate-950' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>取消</button>
            <button data-testid="extension-submit" type="button" disabled={!valid} onClick={onSubmit} className="inline-flex h-9 items-center gap-1.5 rounded bg-[#00ff00] px-4 text-[11px] font-bold text-black hover:bg-[#35ff35] disabled:cursor-not-allowed disabled:opacity-35"><Upload size={13} />{mode === 'create' ? '完成创建' : '完成修改'}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function FieldLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return <span className="mb-1.5 block text-[10px] font-medium text-zinc-500">{children}{required && <span className="ml-1 text-red-500">*</span>}</span>;
}

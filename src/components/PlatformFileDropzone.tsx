import React, { useRef, useState } from 'react';
import { Trash2, type LucideIcon } from 'lucide-react';

export interface FileDropzoneSelection {
  files: File[];
  rootName?: string;
}

interface PlatformFileDropzoneProps {
  icon: LucideIcon;
  value: string;
  title: string;
  hint: string;
  actionLabel: string;
  onChoose: (selection: FileDropzoneSelection) => void;
  onRemove: () => void;
  accept?: string;
  directory?: boolean;
  isLight: boolean;
  previewSrc?: string;
}

const readDirectoryEntries = async (entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
};

const collectEntryFiles = async (entry: FileSystemEntry): Promise<File[]> => {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return [await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))];
  }

  if (!entry.isDirectory) return [];
  const entries = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
  return (await Promise.all(entries.map(collectEntryFiles))).flat();
};

const matchesAccept = (file: File, accept?: string) => {
  if (!accept) return true;

  return accept.split(',').some(rawRule => {
    const rule = rawRule.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule);
    if (rule.endsWith('/*')) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
    return file.type.toLowerCase() === rule;
  });
};

const readDropSelection = async (dataTransfer: DataTransfer): Promise<FileDropzoneSelection> => {
  const items = Array.from(dataTransfer.items);
  const entries = items
    .map(item => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length === 0) {
    const files = Array.from(dataTransfer.files);
    return {
      files,
      rootName: files[0]?.webkitRelativePath.split('/')[0] || undefined
    };
  }

  return {
    files: (await Promise.all(entries.map(collectEntryFiles))).flat(),
    rootName: entries.length === 1 && entries[0].isDirectory ? entries[0].name : undefined
  };
};

export function PlatformFileDropzone({
  icon: Icon,
  value,
  title,
  hint,
  actionLabel,
  onChoose,
  onRemove,
  accept,
  directory = false,
  isLight,
  previewSrc
}: PlatformFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const directoryProps = directory
    ? ({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)
    : {};

  const commitSelection = (selection: FileDropzoneSelection) => {
    if (directory && !selection.rootName) {
      setError('请拖拽完整文件夹，或点击右侧按钮选择目录');
      return;
    }

    const acceptedFiles = directory
      ? selection.files
      : selection.files.filter(file => matchesAccept(file, accept)).slice(0, 1);

    if (acceptedFiles.length === 0) {
      setError(directory ? '未检测到可上传文件' : '文件格式不符合要求');
      return;
    }

    setError('');
    onChoose({ ...selection, files: acceptedFiles });
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${actionLabel}，支持点击或拖拽`}
        data-dragging={isDragging ? 'true' : 'false'}
        onClick={openPicker}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={event => {
          event.preventDefault();
          dragDepthRef.current += 1;
          setIsDragging(true);
        }}
        onDragOver={event => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={event => {
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDragging(false);
        }}
        onDrop={async event => {
          event.preventDefault();
          dragDepthRef.current = 0;
          setIsDragging(false);
          commitSelection(await readDropSelection(event.dataTransfer));
        }}
        className={`group flex min-h-[82px] w-full cursor-pointer items-center gap-3 rounded border border-dashed px-3.5 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${isDragging
          ? (isLight ? 'border-emerald-500 bg-emerald-50' : 'border-[#00ff00] bg-[#00ff00]/10')
          : (isLight ? 'border-slate-300 bg-slate-50/70 hover:border-emerald-400 hover:bg-emerald-50/60' : 'border-zinc-700 bg-black/25 hover:border-[#00ff00]/60 hover:bg-[#00ff00]/5')}`}
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border transition-colors ${isDragging
          ? (isLight ? 'border-emerald-200 bg-white text-emerald-600' : 'border-[#00ff00]/35 bg-black text-[#00ff00]')
          : (isLight ? 'border-slate-200 bg-white text-slate-500 group-hover:text-emerald-600' : 'border-zinc-700 bg-zinc-900 text-zinc-500 group-hover:text-[#00ff00]')}`}
        >
          <Icon size={18} />
        </span>

        <span className="min-w-0 flex-1 text-left">
          <span className={`flex items-center gap-1.5 truncate text-[11px] font-semibold ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>
            {isDragging ? '释放以上传' : value ? '点击或拖拽重新上传' : title}
          </span>
          <span className={`mt-1 block text-[9px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{isDragging ? '松开鼠标后读取文件' : hint}</span>
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        accept={accept}
        multiple={directory}
        {...directoryProps}
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          const rootName = files[0]?.webkitRelativePath.split('/')[0] || undefined;
          commitSelection({ files, rootName });
          event.currentTarget.value = '';
        }}
      />
      {value && (
        <div className={`mt-2 flex min-h-12 items-center gap-2.5 rounded border px-2.5 py-2 ${isLight ? 'border-slate-200 bg-white' : 'border-zinc-800 bg-black/25'}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border ${isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-[#00ff00]/30 bg-[#00ff00]/5 text-[#00ff00]'}`}>
            {previewSrc ? <img src={previewSrc} alt="" className="h-full w-full object-cover" /> : <Icon size={15} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[10px] ${isLight ? 'text-slate-700' : 'text-zinc-300'}`} title={value}>{value}</span>
          </span>
          <button
            type="button"
            title={`删除 ${value}`}
            aria-label={`删除 ${value}`}
            onClick={() => {
              setError('');
              if (inputRef.current) inputRef.current.value = '';
              onRemove();
            }}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border transition-colors ${isLight ? 'border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600' : 'border-zinc-700 text-zinc-500 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400'}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
      {error && <p role="alert" className={`mt-1.5 text-[9px] ${isLight ? 'text-red-600' : 'text-red-400'}`}>{error}</p>}
    </div>
  );
}

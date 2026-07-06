import {
  CanvasCommentThread,
  CanvasDocument,
  CanvasElement,
  CanvasFolder,
  CanvasHistoryEntry,
  CanvasShareGrant,
  ProjectMember,
  SpaceId
} from './types';
import {
  INITIAL_CANVAS_COMMENTS,
  INITIAL_CANVAS_ELEMENTS,
  INITIAL_CANVAS_FOLDERS,
  INITIAL_CANVAS_HISTORY,
  INITIAL_CANVAS_SHARES,
  INITIAL_CANVASES,
  INITIAL_PROJECT_MEMBERS
} from './data';

export const CANVAS_FOLDERS_STORAGE_KEY = 'pixgo-canvas-folders-v011';
export const CANVASES_STORAGE_KEY = 'pixgo-canvases-v011';
export const CANVAS_SHARES_STORAGE_KEY = 'pixgo-canvas-shares-v011';
export const CANVAS_HISTORY_STORAGE_KEY = 'pixgo-canvas-history-v011';
export const CANVAS_COMMENTS_STORAGE_KEY = 'pixgo-canvas-comments-v011';
export const CANVAS_ELEMENTS_STORAGE_KEY = 'pixgo-canvas-elements-v011';
export const PROJECT_MEMBERS_STORAGE_KEY = 'art-launcher-project-members-v1';

export const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeStorage = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const mergeCanvasFolders = (storedFolders: CanvasFolder[]) => {
  const byId = new Map<string, CanvasFolder>();

  storedFolders.forEach((folder) => {
    byId.set(folder.id, folder);
  });

  INITIAL_CANVAS_FOLDERS.forEach((seedFolder) => {
    byId.set(seedFolder.id, {
      ...byId.get(seedFolder.id),
      ...seedFolder
    });
  });

  const validIds = new Set(byId.keys());
  return Array.from(byId.values()).filter(folder => folder.parentId === null || validIds.has(folder.parentId));
};

export const readCanvasFolders = () => mergeCanvasFolders(readStorage<CanvasFolder[]>(CANVAS_FOLDERS_STORAGE_KEY, INITIAL_CANVAS_FOLDERS));

export const readCanvases = () => readStorage<CanvasDocument[]>(CANVASES_STORAGE_KEY, INITIAL_CANVASES);

export const readCanvasShares = () => readStorage<CanvasShareGrant[]>(CANVAS_SHARES_STORAGE_KEY, INITIAL_CANVAS_SHARES);

export const readCanvasHistory = () => readStorage<CanvasHistoryEntry[]>(CANVAS_HISTORY_STORAGE_KEY, INITIAL_CANVAS_HISTORY);

export const readCanvasComments = () => readStorage<CanvasCommentThread[]>(CANVAS_COMMENTS_STORAGE_KEY, INITIAL_CANVAS_COMMENTS);

export const readCanvasElements = () => readStorage<CanvasElement[]>(CANVAS_ELEMENTS_STORAGE_KEY, INITIAL_CANVAS_ELEMENTS);

export const readProjectMembers = (): Record<SpaceId, ProjectMember[]> => {
  const fallback: Record<SpaceId, ProjectMember[]> = {
    [SpaceId.ProjectA]: [...INITIAL_PROJECT_MEMBERS[SpaceId.ProjectA]],
    [SpaceId.ProjectB]: [...INITIAL_PROJECT_MEMBERS[SpaceId.ProjectB]],
    [SpaceId.Personal]: [],
    [SpaceId.Shared]: []
  };
  return readStorage(PROJECT_MEMBERS_STORAGE_KEY, fallback);
};

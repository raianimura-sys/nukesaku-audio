import {createProject, validateProject} from './project.js?v=2.2.0';

export const STORAGE = {
  draft:'harmony.draft.v1', backup:'harmony.draft.backup.v1', unreadable:'harmony.draft.unreadable.v1',
  library:'harmony.library.v1', trash:'harmony.library.trash.v1', picker:'harmony.pattern-picker.v1',
};
const clone = value => JSON.parse(JSON.stringify(value));
const uid = () => globalThis.crypto?.randomUUID?.() ?? `saved-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const decode = raw => validateProject(JSON.parse(raw));
const legacyId = (project,index) => {
  let hash=2166136261;
  for (const character of JSON.stringify(project)) hash=Math.imul(hash^character.charCodeAt(0),16777619)>>>0;
  return `legacy-${hash.toString(16)}-${index}`;
};
const entries = raw => {
  const list = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('ライブラリを読み込めませんでした。');
  return list.map((p,index) => ({...validateProject(p),
    id:typeof p.id==='string'&&p.id?p.id.slice(0,100):legacyId(p,index), savedAt:p.savedAt,
    ...(typeof p.restoredFrom==='string'?{restoredFrom:p.restoredFrom}:{})}));
};

/** Keep existing keys, preserve unreadable drafts, and never silently replace another tab's work. */
export class ProjectStorage {
  constructor(storage = () => localStorage) {
    this.storage = storage;
    this.expectedDraft = null;
    this.draftBlocked = null;
  }
  loadDraft() {
    try {
      const raw = this.storage().getItem(STORAGE.draft);
      this.expectedDraft = raw;
      this.draftBlocked = null;
      if (raw === null) return {project:createProject(), status:'missing'};
      try { return {project:decode(raw), status:'ready'}; }
      catch {
        this.draftBlocked = 'invalid';
        const backup = this.loadBackup();
        return {project:backup || createProject(), status:backup?'recovered':'invalid'};
      }
    } catch {
      this.draftBlocked = 'unavailable';
      return {project:createProject(), status:'unavailable'};
    }
  }
  loadBackup() {
    try {
      const raw = this.storage().getItem(STORAGE.backup);
      return raw === null ? null : decode(raw);
    } catch { return null; }
  }
  rawDraft() {
    try { return this.storage().getItem(STORAGE.draft); } catch { return null; }
  }
  saveDraft(project, {resolve=false}={}) {
    try {
      const storage = this.storage(), current = storage.getItem(STORAGE.draft);
      if (!resolve && this.draftBlocked === 'invalid') return {status:'invalid'};
      if (!resolve && (current !== this.expectedDraft || this.draftBlocked === 'conflict')) {
        this.draftBlocked = 'conflict';
        return {status:'conflict'};
      }
      const raw = JSON.stringify(project);
      if (current !== null && current !== raw) {
        let valid = false;
        try { decode(current); valid = true; } catch { /* Preserve the original bytes below. */ }
        if (!valid && !resolve) { this.draftBlocked = 'invalid'; return {status:'invalid'}; }
        // Failure to retain the old data must also cancel the primary write.
        if (valid) storage.setItem(STORAGE.backup,current);
        else {
          const previous=storage.getItem(STORAGE.unreadable);
          const history=previous===null?[]:JSON.parse(previous);
          if (!Array.isArray(history)) throw new Error('元のデータを保護できませんでした。');
          storage.setItem(STORAGE.unreadable,JSON.stringify([...history,{raw:current,savedAt:Date.now()}]));
        }
      }
      if (current !== raw) storage.setItem(STORAGE.draft, raw);
      this.expectedDraft = raw;
      this.draftBlocked = null;
      return {status:'saved'};
    } catch { return {status:'unavailable'}; }
  }
  noteExternalDraft(raw) {
    if (raw === this.expectedDraft) return false;
    this.draftBlocked = 'conflict';
    return true;
  }
  loadLibrary() {
    try { return {projects:entries(this.storage().getItem(STORAGE.library)), status:'ready'}; }
    catch { return {projects:[], status:'unavailable'}; }
  }
  loadTrash() {
    const raw = this.storage().getItem(STORAGE.trash), list = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error('削除した進行を読み込めませんでした。');
    return list.map(item => {
      if (!item || typeof item.token !== 'string') throw new Error('削除した進行を読み込めませんでした。');
      return {...item, project:{...validateProject(item.project), savedAt:item.project.savedAt}};
    });
  }
  saveLibraryProject(project, {asCopy=false}={}) {
    const storage = this.storage(), next = entries(storage.getItem(STORAGE.library));
    const entry = {...clone(project), savedAt:Date.now()};
    if (asCopy) { entry.id = uid(); entry.title = `${(entry.title || 'Untitled progression').slice(0,55)} のコピー`; }
    const index = next.findIndex(p => p.id === entry.id);
    if (index >= 0) next[index] = entry; else next.unshift(entry);
    storage.setItem(STORAGE.library, JSON.stringify(next));
    return next;
  }
  removeLibraryProject(id) {
    const storage = this.storage(), next = entries(storage.getItem(STORAGE.library));
    const index = next.findIndex(p => p.id === id);
    if (index < 0) throw new Error('進行は別の画面で変更されています。ライブラリを開き直してください。');
    const trash = this.loadTrash();
    trash.unshift({token:uid(), project:next[index], index, deletedAt:Date.now()});
    // Retain a recoverable copy before changing the visible library.
    storage.setItem(STORAGE.trash, JSON.stringify(trash));
    next.splice(index,1);
    storage.setItem(STORAGE.library, JSON.stringify(next));
    return next;
  }
  restoreLibraryProject(token) {
    const storage = this.storage(), next = entries(storage.getItem(STORAGE.library)), trash = this.loadTrash();
    const index = trash.findIndex(item => item.token === token);
    if (index < 0) throw new Error('この進行はすでに復元されています。');
    const item = trash[index], project = clone(item.project);
    if (next.some(p=>p.restoredFrom===token)) {
      trash.splice(index,1);
      storage.setItem(STORAGE.trash,JSON.stringify(trash));
      return next;
    }
    // A newly saved project with the same ID remains intact; restore as a separate copy.
    if (next.some(p => p.id === project.id)) { project.id = uid(); project.title = `${project.title.slice(0,56)}（復元）`; }
    project.restoredFrom=token;
    next.splice(Math.max(0,Math.min(next.length,item.index || 0)),0,project);
    storage.setItem(STORAGE.library,JSON.stringify(next));
    trash.splice(index,1);
    storage.setItem(STORAGE.trash,JSON.stringify(trash));
    return next;
  }
}

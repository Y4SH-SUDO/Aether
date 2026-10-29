import { AetherDB } from './database';
import { demoDb } from './demo';

export type DataMode = 'demo' | 'mine';

let realDb: AetherDB | null = null;

export function getMode(): DataMode {
  try {
    return localStorage.getItem('aether-mode') === 'mine' ? 'mine' : 'demo';
  } catch {
    return 'demo';
  }
}

export function setMode(mode: DataMode): void {
  try {
    localStorage.setItem('aether-mode', mode);
  } catch {
    // The in-memory mode remains available when storage is unavailable.
  }
}

export function getActiveDb(mode: DataMode): AetherDB {
  if (mode === 'demo') return demoDb;
  realDb ??= new AetherDB('aether');
  return realDb;
}

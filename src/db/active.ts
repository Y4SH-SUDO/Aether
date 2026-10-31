import { AetherDB } from './database';
import { demoDb, resetDemoData, ensureDemoData } from './demo';
import { DexieFinancialRepository } from '../repositories/dexie';
import type { FinancialRepository } from '../repositories/types';

export type DataMode = 'demo' | 'mine';

let realDb: AetherDB | null = null;
let realRepository: FinancialRepository | null = null;
const demoRepository = new DexieFinancialRepository(demoDb, resetDemoData);

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

export function getActiveRepository(mode: DataMode): FinancialRepository {
  if (mode === 'demo') return demoRepository;
  realDb ??= new AetherDB('aether');
  realRepository ??= new DexieFinancialRepository(realDb);
  return realRepository;
}

export async function ensureActiveData(mode: DataMode): Promise<void> {
  if (mode === 'demo') await ensureDemoData();
}

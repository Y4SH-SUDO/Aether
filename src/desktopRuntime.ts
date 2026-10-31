import { invoke } from '@tauri-apps/api/core';

export interface PrototypeStatus {
  runtime: 'tauri-windows';
  healthUrl: string;
  databaseReady: boolean;
}

export interface PrototypeRecord {
  id: string;
  label: string;
  createdAt: string;
}

export interface PrototypeRecordInput {
  id?: string;
  label: string;
}

export function isDesktopRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function getPrototypeStatus(): Promise<PrototypeStatus> {
  return invoke<PrototypeStatus>('prototype_status');
}

export function createAndGetPrototypeRecord(input: PrototypeRecordInput): Promise<PrototypeRecord> {
  return invoke<PrototypeRecord>('prototype_round_trip', { input });
}

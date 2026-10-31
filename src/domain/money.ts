import type { Money } from './types';

export function assertMoney(value: number, label = 'Money'): Money {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of paise`);
  }
  return value;
}

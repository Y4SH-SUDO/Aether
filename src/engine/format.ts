import type { Money } from '../domain/types';

const rupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const rupeeFormatterWithPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRupees(paise: Money, options?: { showPaise?: boolean }): string {
  return (options?.showPaise ? rupeeFormatterWithPaise : rupeeFormatter).format(paise / 100);
}

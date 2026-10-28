import type { Money } from '../db/types';

const rupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatRupees(paise: Money): string {
  return rupeeFormatter.format(paise / 100);
}

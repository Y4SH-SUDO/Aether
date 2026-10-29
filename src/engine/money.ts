export function parseRupees(text: string, options: { allowNegative?: boolean } = {}): number {
  let value = text.trim().replace(/₹/g, '').replace(/,/g, '').replace(/\s/g, '');
  const negative = value.startsWith('-');
  if (negative) {
    if (!options.allowNegative) throw new Error('Negative amounts are not allowed');
    value = value.slice(1);
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || /^0(?:\.0{1,2})?$/.test(value) && value !== '0.00') {
    throw new Error('Invalid rupee amount');
  }
  const [whole, fraction = ''] = value.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (paise === 0 && value !== '0.00') throw new Error('Invalid rupee amount');
  return negative ? -paise : paise;
}

export function parseOptionalRupees(text: string): number {
  const normalized = text.trim();
  if (!normalized || normalized === '0') return 0;
  return parseRupees(normalized);
}

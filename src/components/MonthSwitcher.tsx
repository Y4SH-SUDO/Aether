interface MonthSwitcherProps {
  month: string;
  firstMonth: string;
  lastMonth: string;
  onChange: (month: string) => void;
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MonthSwitcher({ month, firstMonth, lastMonth, onChange }: MonthSwitcherProps) {
  const [year, monthNumber] = month.split('-');
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        aria-label="Previous month"
        disabled={month === firstMonth}
        onClick={() => onChange(shiftMonthValue(month, -1))}
        className="text-2xl leading-none opacity-70 transition-opacity duration-150 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        ‹
      </button>
      <span className="min-w-32 text-center">{monthNames[Number(monthNumber) - 1]} {year}</span>
      <button
        type="button"
        aria-label="Next month"
        disabled={month === lastMonth}
        onClick={() => onChange(shiftMonthValue(month, 1))}
        className="text-2xl leading-none opacity-70 transition-opacity duration-150 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}

function shiftMonthValue(month: string, delta: number): string {
  const [yearText, monthText] = month.split('-');
  const monthIndex = Number(yearText) * 12 + Number(monthText) - 1 + delta;
  const year = Math.floor(monthIndex / 12);
  const monthNumber = (monthIndex % 12) + 1;
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
}

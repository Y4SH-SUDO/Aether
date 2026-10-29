import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import type { RecentMonth } from '../engine/dashboard';
import { formatRupees } from '../engine/format';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface MoneyInOutChartProps {
  months: RecentMonth[];
  selectedMonth: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const [year, month] = label?.split('-') ?? [];
  const monthName = monthNames[Number(month) - 1];
  return (
    <div className="border border-rule bg-paper px-3 py-2 text-sm text-ink">
      <p className="mb-1 text-muted">{monthName} {year}</p>
      {payload.map((item) => (
        <p key={item.name}>{item.name}: {formatRupees(Number(item.value) || 0)}</p>
      ))}
    </div>
  );
}

export function MoneyInOutChart({ months, selectedMonth }: MoneyInOutChartProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="w-full">
      <div className="h-64 border-b border-rule">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} barGap={5} barCategoryGap="28%">
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(value: string) => {
                const shortMonth = monthNames[Number(value.slice(5)) - 1].slice(0, 3);
                return value.slice(0, 4) === selectedMonth.slice(0, 4)
                  ? shortMonth
                  : `${shortMonth} ’${value.slice(2, 4)}`;
              }}
            />
            <Tooltip cursor={false} content={<ChartTooltip />} />
            <Bar dataKey="moneyIn" name="Money in" fill="var(--ink)" barSize={10} isAnimationActive={!reducedMotion} animationDuration={700} animationEasing="ease-out" />
            <Bar dataKey="moneyOut" name="Money out" fill="transparent" stroke="var(--ink)" strokeWidth={1.5} barSize={10} isAnimationActive={!reducedMotion} animationDuration={700} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex gap-5 text-xs text-muted">
        <span className="flex items-center gap-2"><i className="h-2 w-2 bg-ink" />Money in</span>
        <span className="flex items-center gap-2"><i className="h-2 w-2 border border-ink" />Money out</span>
      </div>
    </div>
  );
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

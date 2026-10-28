import { formatRupees } from '../engine/format';
import type { DashboardCategory } from '../engine/dashboard';

interface CategoryBarsProps {
  categories: DashboardCategory[];
  names: Map<string, string>;
}

export function CategoryBars({ categories, names }: CategoryBarsProps) {
  const biggest = categories[0]?.amount ?? 0;
  return (
    <div className="space-y-5">
      {categories.map((category) => (
        <div key={category.categoryId}>
          <div className="flex items-baseline justify-between gap-4 text-base">
            <span>{category.categoryId === 'uncategorized' ? 'Other' : names.get(category.categoryId) ?? category.categoryId}</span>
            <span className="text-sm">{formatRupees(category.amount)}</span>
          </div>
          <div className="mt-2 h-0.5 bg-rule">
            <div
              className="h-full origin-left bg-ink transition-[width] duration-[600ms] ease-out"
              style={{ width: `${biggest === 0 ? 0 : (category.amount / biggest) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {categories.length === 0 ? <p className="text-sm italic text-muted">No expenses recorded this month.</p> : null}
    </div>
  );
}

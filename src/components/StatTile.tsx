interface StatTileProps {
  label: string;
  value: string;
  caption?: string;
}

export function StatTile({ label, value, caption }: StatTileProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-2xl">{value}</p>
      {caption ? <p className="mt-1 text-sm italic text-muted">{caption}</p> : null}
    </div>
  );
}

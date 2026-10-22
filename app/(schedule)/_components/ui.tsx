import { Input } from "@/components/ui/input";

export function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border bg-card p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function NumberField({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <Input
      aria-label={label}
      type="number"
      min={0}
      step={0.5}
      value={value}
      onChange={(event) =>
        onChange(Math.max(0, Number(event.currentTarget.value) || 0))
      }
      className="w-28"
    />
  );
}

export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

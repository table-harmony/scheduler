import { DutyDayEditor } from "@/app/(schedule)/duties/editor";
import { weekDays } from "@/lib/types";

export default function DutiesPage() {
  return (
    <div className="space-y-4">
      <header className="mb-2">
        <h2 className="text-2xl font-semibold">Member duties</h2>
        <p className="mt-1 text-muted-foreground">
          Assign the configured duty types. Their restrictions are set in Types
          & rules.
        </p>
      </header>
      {weekDays.map((day) => (
        <DutyDayEditor day={day} key={day} />
      ))}
    </div>
  );
}

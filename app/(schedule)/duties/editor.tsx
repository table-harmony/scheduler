"use client";

import { Plus, Trash2 } from "lucide-react";
import { useScheduler } from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import { type Weekday } from "@/lib/types";
import { SectionCard } from "@/app/(schedule)/components/ui";
import { dayNames } from "@/lib/types";

export function DutyDayEditor({ day }: { day: Weekday }) {
  const { data, addDuty, setDuty, removeDuty } = useScheduler();
  const dutyTypes = Object.keys(data.weights.tasks);

  return (
    <SectionCard>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-medium">{dayNames[day]}</h3>
        <Button
          size="sm"
          variant="outline"
          disabled={!dutyTypes.length || !data.people.length}
          onClick={() => addDuty(day)}
        >
          <Plus data-icon="inline-start" />
          Add duty
        </Button>
      </div>
      <div className="space-y-3">
        {data.tasks[day].map((entry, index) => (
          <div
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            key={`${day}-task-${index}`}
          >
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Member
              <select
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-[3px]"
                value={entry.member}
                onChange={(event) =>
                  setDuty(day, index, "member", event.currentTarget.value)
                }
              >
                <option value="">Select member</option>
                {data.people.map((person, personIndex) => (
                  <option key={`${person}-${personIndex}`} value={person}>
                    {person || "Unnamed member"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Duty
              <select
                aria-label={`${dayNames[day]} duty ${index + 1}`}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-[3px]"
                value={entry.task}
                onChange={(event) =>
                  setDuty(day, index, "task", event.currentTarget.value)
                }
              >
                {dutyTypes.map((name) => (
                  <option value={name} key={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove duty"
                onClick={() => removeDuty(day, index)}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
        {!data.tasks[day].length && (
          <p className="text-sm text-muted-foreground">
            No duties recorded for this day.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

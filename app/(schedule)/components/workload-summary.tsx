"use client";

import { useScheduler } from "@/app/scheduler-context";
import { weekDays } from "@/lib/types";
import { SectionCard, formatPoints } from "@/app/(schedule)/components/ui";
import { dayNames } from "@/lib/types";

export function WorkloadSummary() {
  const { data, workloads } = useScheduler();
  return (
    <section aria-label="Member workload">
      <h2 className="mb-3 text-xl font-semibold">Weekly workload</h2>
      {data.people.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.people.map((person, index) => (
            <SectionCard key={`${person}-${index}`}>
              <p className="font-medium">{person || "Unnamed member"}</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatPoints(workloads[person] ?? 0)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  points
                </span>
              </p>
            </SectionCard>
          ))}
        </div>
      ) : (
        <SectionCard>
          <p className="text-muted-foreground">
            Add members before generating chore assignments.
          </p>
        </SectionCard>
      )}
    </section>
  );
}

"use client";

import { Users } from "lucide-react";
import type { GeneratedSchedule } from "@/app/scheduler-context";
import { SectionCard, formatPoints } from "@/app/(schedule)/_components/ui";

export function WorkloadSummary({
  generated,
}: {
  generated: GeneratedSchedule | null;
}) {
  return (
    <section aria-label="Member workload">
      <div className="mb-3 flex items-center gap-2">
        <Users className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Weekly workload</h2>
      </div>
      {generated?.people.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {generated.people.map((person, index) => (
            <SectionCard key={`${person}-${index}`}>
              <p className="font-medium">{person || "Unnamed member"}</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatPoints(generated.workloads[person] ?? 0)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  points
                </span>
              </p>
            </SectionCard>
          ))}
        </div>
      ) : (
        <SectionCard className="py-4">
          <p className="text-sm text-muted-foreground">
            {generated
              ? "Invite group members to see their workload after generating the schedule."
              : "Generate the schedule to compare members’ weighted workload."}
          </p>
        </SectionCard>
      )}
    </section>
  );
}

import { useScheduler } from "@/app/scheduler-context";
import { weekDays } from "@/lib/types";
import { SectionCard, formatPoints } from "@/app/(schedule)/components/ui";
import { dayNames } from "@/lib/types";
import { WorkloadSummary } from "./components/workload-summary";

export default function SchedulePage() {
  const { data, assignments } = useScheduler();

  return (
    <div className="space-y-6">
      <WorkloadSummary />
      <SectionCard>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Chore assignments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each member gets at most one chore per day. If no one is eligible,
            the chore is marked unassigned.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/60">
                <th className="px-4 py-3 font-medium">Day</th>
                <th className="px-4 py-3 font-medium">Chore</th>
                <th className="px-4 py-3 font-medium">Assigned member</th>
                <th className="px-4 py-3 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {weekDays.flatMap((day) =>
                assignments[day].map(({ chore, member }, index) => (
                  <tr
                    className="border-b last:border-0"
                    key={`${day}-${index}`}
                  >
                    <td className="px-4 py-3">{dayNames[day]}</td>
                    <td className="px-4 py-3">{chore}</td>
                    <td className="px-4 py-3">
                      {member ?? (
                        <span className="text-muted-foreground">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatPoints(
                        data.weights.chores[chore] ??
                          data.weights.defaultChoreWeight,
                      )}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          {weekDays.every((day) => assignments[day].length === 0) && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              There are no chores scheduled for this week yet.
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

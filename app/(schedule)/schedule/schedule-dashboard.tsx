"use client";

import { CalendarDays, History, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  useScheduler,
  type GeneratedSchedule,
} from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { SectionCard } from "@/app/(schedule)/_components/ui";
import {
  weekDays,
  type Weekday,
  type WeeklyChoreAssignments,
  type WeeklyTasks,
} from "@/lib/types";
import { calculateWeeklyWorkloads } from "@/lib/assignChores";
import { AssignmentTable } from "./assignment-table";
import { WorkloadSummary } from "./workload-summary";

function toWeeklyTasks(
  entries: Record<Weekday, { member: string; task: string }[]>,
): WeeklyTasks {
  const tasks: Partial<Record<Weekday, Record<string, string[]>>> = {};
  for (const day of weekDays) {
    tasks[day] = {};
    for (const { member, task } of entries[day]) {
      if (member.trim() && task.trim()) {
        (tasks[day][member] ??= []).push(task);
      }
    }
  }
  return tasks;
}

export function ScheduleDashboard() {
  const {
    data,
    savedSchedules,
    generateSchedule,
    createManualSchedule,
    saveScheduleHistory,
    setChoreAssignment,
    loaded,
    saving,
  } = useScheduler();
  const [generated, setGenerated] = useState<GeneratedSchedule | null>(null);
  const [viewingHistory, setViewingHistory] = useState<string | null>(null);

  function generateSchedulePreview() {
    setGenerated(generateSchedule());
    setViewingHistory(null);
  }

  function viewSavedSchedule(savedId: string) {
    const saved = savedSchedules.find(({ id }) => id === savedId);
    if (!saved) {
      return;
    }
    const assignments = Object.fromEntries(
      weekDays.map((day) => [
        day,
        saved.assignments
          .filter((assignment) => assignment.day === day)
          .map(({ chore, member }) => ({ chore, member })),
      ]),
    ) as WeeklyChoreAssignments;
    const tasks = toWeeklyTasks(data.tasks);
    setGenerated({
      assignments,
      workloads: calculateWeeklyWorkloads(
        data.people,
        tasks,
        assignments,
        data.weights,
      ),
      people: [...data.people],
      weights: data.weights,
    });
    setViewingHistory(savedId);
  }

  async function archiveCurrentSchedule() {
    if (generated && (await saveScheduleHistory(generated.assignments))) {
      setViewingHistory(null);
    }
  }

  async function updateAssignment(
    day: Weekday,
    index: number,
    member: string | null,
  ) {
    if (!(await setChoreAssignment(day, index, member))) {
      return;
    }
    setGenerated((current) => {
      if (!current) {
        return current;
      }
      const previousMember = current.assignments[day][index]?.member ?? null;
      const chore = current.assignments[day][index]?.chore;
      if (!chore) {
        return current;
      }
      const assignments = {
        ...current.assignments,
        [day]: current.assignments[day].map((assignment, assignmentIndex) =>
          assignmentIndex === index ? { ...assignment, member } : assignment,
        ),
      };
      const workloads = { ...current.workloads };
      const weight =
        current.weights.chores[chore] ?? current.weights.defaultChoreWeight;
      if (previousMember) {
        workloads[previousMember] = Math.max(
          0,
          (workloads[previousMember] ?? 0) - weight,
        );
      }
      if (member) {
        workloads[member] = (workloads[member] ?? 0) + weight;
      }
      return { ...current, assignments, workloads };
    });
  }

  return (
    <div className="space-y-6">
      <SectionCard className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <CalendarDays className="size-4" />
              WEEKLY OVERVIEW
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Chore assignments
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Generate balanced assignments or build the schedule yourself.
              Changes stay as a draft until you confirm and save them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={!loaded}
              onClick={() => {
                setGenerated(createManualSchedule());
                setViewingHistory(null);
              }}
            >
              Create/edit manually
            </Button>
            <Form
              className="shrink-0"
              onFormSubmit={generateSchedulePreview}
            >
              <Button type="submit" size="lg" disabled={!loaded}>
                <Sparkles data-icon="inline-start" />
                {generated ? "Regenerate schedule" : "Generate schedule"}
              </Button>
            </Form>
          </div>
        </div>
      </SectionCard>

      <WorkloadSummary generated={generated} />

      {(generated || savedSchedules.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {generated && viewingHistory === null && (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={archiveCurrentSchedule}
            >
              Confirm and save schedule
            </Button>
          )}
          {savedSchedules.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <History className="size-4" />
                Previous weeks:
              </span>
              {savedSchedules.map((saved) => (
                <Button
                  key={saved.id}
                  type="button"
                  size="sm"
                  variant={viewingHistory === saved.id ? "secondary" : "ghost"}
                  onClick={() => viewSavedSchedule(saved.id)}
                >
                  {new Date(saved.savedAt).toLocaleDateString()}
                </Button>
              ))}
              {viewingHistory !== null && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setGenerated(createManualSchedule());
                    setViewingHistory(null);
                  }}
                >
                  Back to current week
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {generated ? (
        <AssignmentTable
          generated={generated}
          members={data.people}
          tasks={toWeeklyTasks(data.tasks)}
          rules={data.rules}
          memberConstraints={data.memberConstraints}
          readOnly={viewingHistory !== null}
          onAssignmentChange={updateAssignment}
        />
      ) : (
        <SectionCard className="flex min-h-52 flex-col items-center justify-center text-center">
          <div className="mb-3 rounded-full bg-primary/10 p-3 text-primary">
            <CalendarDays className="size-6" />
          </div>
          <h3 className="font-semibold">Your week is ready to plan</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Create/edit manually to assign each chore yourself, or generate a
            balanced schedule. Chores are configured on the Members &amp; chores
            page.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

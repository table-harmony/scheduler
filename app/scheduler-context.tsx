"use client";

import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  defaultWorkloadWeights,
  weekDays,
  type SchedulingRules,
  type TaskRestriction,
  type Weekday,
  type WeeklyTasks,
  type WorkloadWeights,
} from "@/lib/types";
import {
  assignWeeklyChores,
  calculateWeeklyWorkloads,
} from "@/lib/assignChores";

export type TaskEntry = {
  member: string;
  task: string;
};

export type SchedulerData = {
  people: string[];
  tasks: Record<Weekday, TaskEntry[]>;
  chores: Record<Weekday, string[]>;
  weights: WorkloadWeights;
  rules: SchedulingRules;
};

export type PageKind = "schedule" | "members" | "duties" | "rules";

export type SchedulerContextValue = {
  data: SchedulerData;
  assignments: ReturnType<typeof assignWeeklyChores>;
  workloads: Record<string, number>;
  loaded: boolean;
  saving: boolean;
  error: string | null;
  setMemberName: (index: number, name: string) => void;
  addMember: () => void;
  removeMember: (index: number) => void;
  addChore: (day: Weekday) => void;
  setChore: (day: Weekday, index: number, name: string) => void;
  removeChore: (day: Weekday, index: number) => void;
  addDuty: (day: Weekday) => void;
  setDuty: (
    day: Weekday,
    index: number,
    key: keyof TaskEntry,
    value: string,
  ) => void;
  removeDuty: (day: Weekday, index: number) => void;
  addType: (category: "chores" | "tasks", name: string) => void;
  renameType: (
    category: "chores" | "tasks",
    oldName: string,
    newName: string,
  ) => void;
  setTypeWeight: (
    category: "chores" | "tasks",
    name: string,
    weight: number,
  ) => void;
  removeType: (category: "chores" | "tasks", name: string) => void;
  setDefaultWeight: (
    key: "defaultChoreWeight" | "defaultTaskWeight",
    weight: number,
  ) => void;
  setTaskRestriction: (name: string, restriction: TaskRestriction) => void;
  setAllowedChore: (task: string, chore: string, allowed: boolean) => void;
  reset: () => void;
};

const SchedulerContext = createContext<SchedulerContextValue | null>(null);

function mapWeek<T>(mapper: (day: Weekday) => T): Record<Weekday, T> {
  return {
    sunday: mapper("sunday"),
    monday: mapper("monday"),
    tuesday: mapper("tuesday"),
    wednesday: mapper("wednesday"),
    thursday: mapper("thursday"),
    friday: mapper("friday"),
    saturday: mapper("saturday"),
  };
}

function createEmptySchedule(): SchedulerData {
  return {
    people: [],
    tasks: mapWeek(() => []),
    chores: mapWeek(() => []),
    weights: defaultWorkloadWeights,
    rules: { tasks: {} },
  };
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function toWeeklyTasks(entries: Record<Weekday, TaskEntry[]>): WeeklyTasks {
  const tasks: Partial<Record<Weekday, Record<string, string[]>>> = {};
  for (const day of weekDays) {
    tasks[day] = {};
    for (const { member, task } of entries[day]) {
      const cleanMember = member.trim();
      const cleanTask = task.trim();
      if (cleanMember && cleanTask) {
        (tasks[day][cleanMember] ??= []).push(cleanTask);
      }
    }
  }
  return tasks;
}

export function SchedulerProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(createEmptySchedule);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHydrated = useRef(false);
  const skipNextSave = useRef(false);
  const snapshot = useQuery(api.scheduler.getSnapshot, {});
  const saveSnapshot = useMutation(api.scheduler.saveSnapshot);

  useEffect(() => {
    if (snapshot === undefined || hasHydrated.current) {
      return;
    }
    const timeout = window.setTimeout(() => {
      hasHydrated.current = true;
      skipNextSave.current = true;
      setData(snapshot);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [snapshot]);

  useEffect(() => {
    if (!loaded || skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSaving(true);
      try {
        await saveSnapshot({
          members: data.people,
          choreTypes: Object.entries(data.weights.chores).map(
            ([name, weight]) => ({ name, weight }),
          ),
          dutyTypes: Object.entries(data.weights.tasks).map(
            ([name, weight]) => {
              const rule = data.rules.tasks[name] ?? {
                restriction: "none" as const,
                allowedChores: [],
              };
              return {
                name,
                weight,
                restriction: rule.restriction,
                allowedChores: [...rule.allowedChores],
              };
            },
          ),
          chores: weekDays.flatMap((day) =>
            data.chores[day]
              .filter((chore) => chore.trim())
              .map((chore) => ({ day, chore })),
          ),
          duties: weekDays.flatMap((day) =>
            data.tasks[day]
              .filter((entry) => entry.member.trim() && entry.task.trim())
              .map((entry) => ({
                day,
                member: entry.member.trim(),
                duty: entry.task.trim(),
              })),
          ),
          defaultChoreWeight: data.weights.defaultChoreWeight,
          defaultDutyWeight: data.weights.defaultTaskWeight,
        });
        setError(null);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? `Could not save schedule: ${saveError.message}`
            : "Could not save schedule.",
        );
      } finally {
        setSaving(false);
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [data, loaded, saveSnapshot]);

  const tasks = useMemo(() => toWeeklyTasks(data.tasks), [data.tasks]);
  const assignments = useMemo(
    () =>
      assignWeeklyChores(
        data.people,
        tasks,
        data.chores,
        data.weights,
        data.rules,
      ),
    [data.people, data.chores, data.weights, data.rules, tasks],
  );
  const workloads = useMemo(
    () =>
      calculateWeeklyWorkloads(data.people, tasks, assignments, data.weights),
    [data.people, data.weights, assignments, tasks],
  );

  function setMemberName(index: number, name: string) {
    setData((current) => {
      const previousName = current.people[index];
      return {
        ...current,
        people: current.people.map((member, memberIndex) =>
          memberIndex === index ? name : member,
        ),
        tasks: mapWeek((day) =>
          current.tasks[day].map((entry) =>
            entry.member === previousName ? { ...entry, member: name } : entry,
          ),
        ),
      };
    });
  }

  function addMember() {
    setData((current) => ({ ...current, people: [...current.people, ""] }));
  }

  function removeMember(index: number) {
    setData((current) => {
      const removed = current.people[index];
      return {
        ...current,
        people: current.people.filter(
          (_, memberIndex) => memberIndex !== index,
        ),
        tasks: mapWeek((day) =>
          current.tasks[day].filter((entry) => entry.member !== removed),
        ),
      };
    });
  }

  function addChore(day: Weekday) {
    setData((current) => {
      const firstType = Object.keys(current.weights.chores)[0];
      return firstType
        ? {
            ...current,
            chores: {
              ...current.chores,
              [day]: [...current.chores[day], firstType],
            },
          }
        : current;
    });
  }

  function setChore(day: Weekday, index: number, name: string) {
    setData((current) => ({
      ...current,
      chores: {
        ...current.chores,
        [day]: current.chores[day].map((chore, choreIndex) =>
          choreIndex === index ? name : chore,
        ),
      },
    }));
  }

  function removeChore(day: Weekday, index: number) {
    setData((current) => ({
      ...current,
      chores: {
        ...current.chores,
        [day]: current.chores[day].filter(
          (_, choreIndex) => choreIndex !== index,
        ),
      },
    }));
  }

  function addDuty(day: Weekday) {
    setData((current) => {
      const firstType = Object.keys(current.weights.tasks)[0];
      return firstType
        ? {
            ...current,
            tasks: {
              ...current.tasks,
              [day]: [...current.tasks[day], { member: "", task: firstType }],
            },
          }
        : current;
    });
  }

  function setDuty(
    day: Weekday,
    index: number,
    key: keyof TaskEntry,
    value: string,
  ) {
    setData((current) => ({
      ...current,
      tasks: {
        ...current.tasks,
        [day]: current.tasks[day].map((entry, taskIndex) =>
          taskIndex === index ? { ...entry, [key]: value } : entry,
        ),
      },
    }));
  }

  function removeDuty(day: Weekday, index: number) {
    setData((current) => ({
      ...current,
      tasks: {
        ...current.tasks,
        [day]: current.tasks[day].filter((_, taskIndex) => taskIndex !== index),
      },
    }));
  }

  function addType(category: "chores" | "tasks", name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      return;
    }
    setData((current) => {
      if (
        Object.keys(current.weights[category]).some(
          (existingName) =>
            normalizeName(existingName) === normalizeName(cleanName),
        )
      ) {
        return current;
      }
      return {
        ...current,
        weights: {
          ...current.weights,
          [category]: { ...current.weights[category], [cleanName]: 1 },
        },
        rules:
          category === "tasks"
            ? {
                tasks: {
                  ...current.rules.tasks,
                  [cleanName]: { restriction: "none", allowedChores: [] },
                },
              }
            : current.rules,
      };
    });
  }

  function renameType(
    category: "chores" | "tasks",
    oldName: string,
    newName: string,
  ) {
    setData((current) => {
      const name = newName.trim();
      if (
        !name ||
        (name !== oldName &&
          Object.keys(current.weights[category]).some(
            (existing) =>
              existing !== oldName &&
              normalizeName(existing) === normalizeName(name),
          ))
      ) {
        return current;
      }
      const weights = Object.fromEntries(
        Object.entries(current.weights[category]).map(([key, value]) => [
          key === oldName ? name : key,
          value,
        ]),
      );
      const choreNames = category === "chores";
      return {
        ...current,
        weights: { ...current.weights, [category]: weights },
        chores: choreNames
          ? mapWeek((day) =>
              current.chores[day].map((chore) =>
                chore === oldName ? name : chore,
              ),
            )
          : current.chores,
        tasks: !choreNames
          ? mapWeek((day) =>
              current.tasks[day].map((entry) =>
                entry.task === oldName ? { ...entry, task: name } : entry,
              ),
            )
          : current.tasks,
        rules: {
          tasks: choreNames
            ? Object.fromEntries(
                Object.entries(current.rules.tasks).map(([task, rule]) => [
                  task,
                  {
                    ...rule,
                    allowedChores: rule.allowedChores.map((chore) =>
                      chore === oldName ? name : chore,
                    ),
                  },
                ]),
              )
            : Object.fromEntries(
                Object.entries(current.rules.tasks).map(([task, rule]) => [
                  task === oldName ? name : task,
                  rule,
                ]),
              ),
        },
      };
    });
  }

  function setTypeWeight(
    category: "chores" | "tasks",
    name: string,
    weight: number,
  ) {
    setData((current) => ({
      ...current,
      weights: {
        ...current.weights,
        [category]: { ...current.weights[category], [name]: weight },
      },
    }));
  }

  function removeType(category: "chores" | "tasks", name: string) {
    setData((current) => {
      const weights = { ...current.weights[category] };
      delete weights[name];
      return {
        ...current,
        weights: { ...current.weights, [category]: weights },
        chores:
          category === "chores"
            ? mapWeek((day) =>
                current.chores[day].filter((chore) => chore !== name),
              )
            : current.chores,
        tasks:
          category === "tasks"
            ? mapWeek((day) =>
                current.tasks[day].filter((entry) => entry.task !== name),
              )
            : current.tasks,
        rules: {
          tasks:
            category === "tasks"
              ? Object.fromEntries(
                  Object.entries(current.rules.tasks).filter(
                    ([task]) => task !== name,
                  ),
                )
              : Object.fromEntries(
                  Object.entries(current.rules.tasks).map(([task, rule]) => [
                    task,
                    {
                      ...rule,
                      allowedChores: rule.allowedChores.filter(
                        (chore) => chore !== name,
                      ),
                    },
                  ]),
                ),
        },
      };
    });
  }

  function setDefaultWeight(
    key: "defaultChoreWeight" | "defaultTaskWeight",
    weight: number,
  ) {
    setData((current) => ({
      ...current,
      weights: { ...current.weights, [key]: weight },
    }));
  }

  function setTaskRestriction(name: string, restriction: TaskRestriction) {
    setData((current) => ({
      ...current,
      rules: {
        tasks: {
          ...current.rules.tasks,
          [name]: {
            ...(current.rules.tasks[name] ?? { allowedChores: [] }),
            restriction,
          },
        },
      },
    }));
  }

  function setAllowedChore(task: string, chore: string, allowed: boolean) {
    setData((current) => {
      const rule = current.rules.tasks[task] ?? {
        restriction: "none" as const,
        allowedChores: [],
      };
      return {
        ...current,
        rules: {
          tasks: {
            ...current.rules.tasks,
            [task]: {
              ...rule,
              allowedChores: allowed
                ? [...new Set([...rule.allowedChores, chore])]
                : rule.allowedChores.filter((name) => name !== chore),
            },
          },
        },
      };
    });
  }

  const value: SchedulerContextValue = {
    data,
    assignments,
    workloads,
    loaded,
    saving,
    error,
    setMemberName,
    addMember,
    removeMember,
    addChore,
    setChore,
    removeChore,
    addDuty,
    setDuty,
    removeDuty,
    addType,
    renameType,
    setTypeWeight,
    removeType,
    setDefaultWeight,
    setTaskRestriction,
    setAllowedChore,
    reset: () => setData(createEmptySchedule()),
  };

  return (
    <SchedulerContext.Provider value={value}>
      {children}
    </SchedulerContext.Provider>
  );
}

export function useScheduler(): SchedulerContextValue {
  const context = useContext(SchedulerContext);
  if (!context) {
    throw new Error("useScheduler must be used inside SchedulerProvider.");
  }
  return context;
}

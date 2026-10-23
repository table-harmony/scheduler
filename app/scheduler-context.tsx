"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  defaultWorkloadWeights,
  weekDays,
  type SchedulingRules,
  type MemberConstraints,
  type TaskRestriction,
  type Weekday,
  type WeeklyTasks,
  type WorkloadWeights,
} from "@/lib/types";
import {
  assignWeeklyChores,
  calculateWeeklyWorkloads,
} from "@/lib/assignChores";
import { canAssignChore } from "@/lib/choreEligibility";
import type { WeeklyChoreAssignments } from "@/lib/types";

export type TaskEntry = {
  member: string;
  task: string;
};

export type SchedulerData = {
  people: string[];
  memberIds: (Id<"members"> | null)[];
  tasks: Record<Weekday, TaskEntry[]>;
  chores: Record<Weekday, string[]>;
  weights: WorkloadWeights;
  rules: SchedulingRules;
  memberConstraints: MemberConstraints;
  memberConstraintsById: MemberConstraints;
};

export type SavedSchedule = {
  id: Id<"savedSchedules">;
  savedAt: number;
  assignments: { day: Weekday; chore: string; member: string | null }[];
};

export type GeneratedSchedule = {
  assignments: ReturnType<typeof assignWeeklyChores>;
  workloads: Record<string, number>;
  people: string[];
  weights: WorkloadWeights;
};

export type PageKind = "schedule" | "members" | "duties" | "rules";
export type GroupRole = "manager" | "member";

export type SchedulerContextValue = {
  role: GroupRole;
  currentMemberId: Id<"members">;
  data: SchedulerData;
  savedAssignments: Record<Weekday, (string | null)[]>;
  persistedAssignments: Record<Weekday, (string | null)[]>;
  savedSchedules: SavedSchedule[];
  generateSchedule: () => GeneratedSchedule;
  createManualSchedule: () => GeneratedSchedule;
  saveScheduleHistory: (
    assignments: WeeklyChoreAssignments,
  ) => Promise<boolean>;
  deleteSavedSchedule: (scheduleId: Id<"savedSchedules">) => Promise<boolean>;
  setChoreAssignment: (
    day: Weekday,
    index: number,
    member: string | null,
  ) => Promise<boolean>;
  loaded: boolean;
  saving: boolean;
  error: string | null;
  setMemberName: (index: number, name: string) => void;
  addMember: () => void;
  removeMember: (index: number) => void;
  setMemberConstraint: (
    member: string,
    category: "blockedDuties" | "blockedChores",
    name: string,
    blocked: boolean,
  ) => void;
  setMemberDayOff: (member: string, day: Weekday, isOff: boolean) => void;
  setMemberConstraintById: (
    memberId: Id<"members">,
    member: string,
    category: "blockedDuties" | "blockedChores",
    name: string,
    blocked: boolean,
  ) => void;
  setMemberDayOffById: (
    memberId: Id<"members">,
    member: string,
    day: Weekday,
    isOff: boolean,
  ) => void;
  setChoreRestriction: (name: string, onePerMemberPerDay: boolean) => void;
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
    memberIds: [],
    tasks: mapWeek(() => []),
    chores: mapWeek(() => []),
    weights: defaultWorkloadWeights,
    rules: { tasks: {}, chores: {} },
    memberConstraints: {},
    memberConstraintsById: {},
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

function hasAssignmentConflict(
  data: SchedulerData,
  savedAssignments: Record<Weekday, (string | null)[]>,
  tasks: Record<Weekday, TaskEntry[]> = data.tasks,
  chores: Record<Weekday, string[]> = data.chores,
  rules: SchedulingRules = data.rules,
  memberConstraints: MemberConstraints = data.memberConstraints,
): boolean {
  const weeklyTasks = toWeeklyTasks(tasks);
  return weekDays.some((day) =>
    (chores[day] ?? []).some((chore, index) => {
      const member = savedAssignments[day][index];
      return (
        member !== null &&
        member !== undefined &&
        !canAssignChore(
          member,
          day,
          chore,
          weeklyTasks,
          rules,
          memberConstraints,
          (chores[day] ?? []).map((assignedChore, assignmentIndex) => ({
            chore: assignedChore,
            member:
              assignmentIndex === index
                ? null
                : savedAssignments[day][assignmentIndex] ?? null,
          })),
        )
      );
    }),
  );
}

export function SchedulerProvider({
  children,
  role,
  currentMemberId,
}: {
  children: React.ReactNode;
  role: GroupRole;
  currentMemberId: Id<"members">;
}) {
  const [data, setData] = useState(createEmptySchedule);
  const [savedAssignments, setSavedAssignments] = useState<
    Record<Weekday, (string | null)[]>
  >(mapWeek(() => []));
  const [persistedAssignments, setPersistedAssignments] = useState<
    Record<Weekday, (string | null)[]>
  >(mapWeek(() => []));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHydrated = useRef(false);
  const hasDraftChanges = useRef(false);
  const skipNextSave = useRef(false);
  const snapshot = useQuery(api.scheduler.getSnapshot, {});
  const savedSchedules = useQuery(api.scheduler.getSavedSchedules, {});
  const saveSnapshot = useMutation(api.scheduler.saveSnapshot);
  const archiveSchedule = useMutation(api.scheduler.saveScheduleHistory);
  const removeSavedSchedule = useMutation(api.scheduler.deleteSavedSchedule);

  useEffect(() => {
    if (snapshot === undefined || hasHydrated.current) {
      return;
    }
    const timeout = window.setTimeout(() => {
      hasHydrated.current = true;
      skipNextSave.current = true;
      setData({
        people: snapshot.people,
        memberIds: snapshot.memberIds,
        tasks: snapshot.tasks,
        chores: snapshot.chores,
        weights: {
          ...snapshot.weights,
          chores: Object.fromEntries(
            snapshot.choreTypes.map(({ name, weight }) => [name, weight]),
          ),
          tasks: Object.fromEntries(
            snapshot.dutyTypes.map(({ name, weight }) => [name, weight]),
          ),
        },
        rules: {
          chores: Object.fromEntries(
            snapshot.choreTypes.map(({ name, onePerMemberPerDay }) => [
              name,
              { onePerMemberPerDay },
            ]),
          ),
          tasks: Object.fromEntries(
            snapshot.dutyTypes.map(
              ({ name, restriction, allowedChores }) => [
                name,
                { restriction, allowedChores },
              ],
            ),
          ),
        },
        memberConstraints: Object.fromEntries(
          snapshot.memberConstraints.map(
            ({ member, blockedDuties, blockedChores, daysOff }) => [
              member,
              { blockedDuties, blockedChores, daysOff },
            ],
          ),
        ),
        memberConstraintsById: Object.fromEntries(
          snapshot.memberConstraints.map(
            ({ memberId, blockedDuties, blockedChores, daysOff }) => [
              memberId,
              { blockedDuties, blockedChores, daysOff },
            ],
          ),
        ),
      });
      setSavedAssignments(
        mapWeek((day) => snapshot.assignments[day].map(({ member }) => member)),
      );
      setPersistedAssignments(
        mapWeek((day) => snapshot.assignments[day].map(({ member }) => member)),
      );
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [snapshot]);

  useEffect(() => {
    if (!hasHydrated.current || snapshot === undefined) {
      return;
    }
    setData((current) => {
      const memberIds = [...current.memberIds];
      let changed = false;
      const assigned = new Set(
        memberIds.filter((memberId): memberId is Id<"members"> =>
          Boolean(memberId),
        ),
      );
      for (const [index, name] of current.people.entries()) {
        if (memberIds[index] || !name.trim()) {
          continue;
        }
        const snapshotIndex = snapshot.people.findIndex(
          (savedName, savedIndex) =>
            savedName === name.trim() &&
            !assigned.has(snapshot.memberIds[savedIndex]),
        );
        if (snapshotIndex >= 0) {
          memberIds[index] = snapshot.memberIds[snapshotIndex];
          assigned.add(snapshot.memberIds[snapshotIndex]);
          changed = true;
        }
      }
      return changed ? { ...current, memberIds } : current;
    });
    const next = mapWeek((day) =>
      snapshot.assignments[day].map(({ member }) => member),
    );
    setPersistedAssignments(next);
    if (!hasDraftChanges.current) {
      setSavedAssignments(next);
    }
  }, [snapshot]);

  useEffect(() => {
    if (role !== "manager" || !loaded || skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        await saveSnapshot({
          members: data.people,
          memberIds: data.memberIds,
          choreTypes: Object.entries(data.weights.chores).map(
            ([name, weight]) => ({
              name,
              weight,
              onePerMemberPerDay:
                data.rules.chores?.[name]?.onePerMemberPerDay ?? false,
            }),
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
          assignments: weekDays.flatMap((day) =>
            data.chores[day].flatMap((chore, index) =>
              chore.trim()
                ? [
                    {
                      day,
                      chore,
                      member:
                        savedAssignments[day][index]?.trim() || null,
                    },
                  ]
                : [],
            ),
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
          memberConstraints: data.people.map((member, index) => {
            const memberId = data.memberIds[index] ?? null;
            const constraint =
              (memberId && data.memberConstraintsById[memberId]) ||
              data.memberConstraints[member] || {
                blockedDuties: [],
                blockedChores: [],
                daysOff: [],
              };
            return {
              member,
              memberId,
              blockedDuties: [...constraint.blockedDuties],
              blockedChores: [...constraint.blockedChores],
              daysOff: [...(constraint.daysOff ?? [])],
            };
          }),
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
    }, 300);
    setSaving(true);
    return () => window.clearTimeout(timeout);
  }, [data, loaded, role, saveSnapshot, savedAssignments]);

  function generateSchedule(): GeneratedSchedule {
    const tasks = toWeeklyTasks(data.tasks);
    const assignments = assignWeeklyChores(
      data.people,
      tasks,
      data.chores,
      data.weights,
      data.rules,
      data.memberConstraints,
    );
    return {
      assignments,
      workloads: calculateWeeklyWorkloads(
        data.people,
        tasks,
        assignments,
        data.weights,
      ),
      people: [...data.people],
      weights: data.weights,
    };
  }

  function createManualSchedule(): GeneratedSchedule {
    const assignments = mapWeek((day) =>
      data.chores[day].map((chore, index) => ({
        chore,
        member: savedAssignments[day][index] ?? null,
      })),
    ) as WeeklyChoreAssignments;
    const tasks = toWeeklyTasks(data.tasks);
    return {
      assignments,
      workloads: calculateWeeklyWorkloads(
        data.people,
        tasks,
        assignments,
        data.weights,
      ),
      people: [...data.people],
      weights: data.weights,
    };
  }

  async function saveScheduleHistory(
    assignments: WeeklyChoreAssignments,
  ): Promise<boolean> {
    try {
      await archiveSchedule({
        assignments: weekDays.flatMap((day) =>
          assignments[day].map(({ chore, member }) => ({ day, chore, member })),
        ),
      });
      const assignmentsByDay = mapWeek((day) =>
        assignments[day].map(({ member }) => member),
      );
      setSavedAssignments(assignmentsByDay);
      setPersistedAssignments(assignmentsByDay);
      hasDraftChanges.current = false;
      setError(null);
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? `Could not save this week: ${saveError.message}`
          : "Could not save this week.",
      );
      return false;
    }
  }

  async function deleteScheduleHistory(
    scheduleId: Id<"savedSchedules">,
  ): Promise<boolean> {
    try {
      await removeSavedSchedule({ scheduleId });
      setError(null);
      return true;
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? `Could not delete this saved week: ${deleteError.message}`
          : "Could not delete this saved week.",
      );
      return false;
    }
  }

  async function setChoreAssignment(
    day: Weekday,
    index: number,
    member: string | null,
  ): Promise<boolean> {
    const chore = data.chores[day][index];
    if (chore === undefined) {
      setError("That chore is no longer on the schedule. Reload and try again.");
      return false;
    }
    if (
      member !== null &&
      (!data.people.includes(member) ||
        !canAssignChore(
          member,
          day,
          chore,
          toWeeklyTasks(data.tasks),
          data.rules,
          data.memberConstraints,
          data.chores[day]
            .map((assignmentChore, assignmentIndex) => ({
              chore: assignmentChore,
              member:
                assignmentIndex === index
                  ? null
                  : savedAssignments[day][assignmentIndex] ?? null,
            })),
        ))
    ) {
      setError(
        `${member} is not eligible for "${chore}" on ${day}.`,
      );
      return false;
    }

    setSavedAssignments((current) => ({
      ...current,
      [day]: current[day].map((savedMember, assignmentIndex) =>
        assignmentIndex === index ? member : savedMember,
      ),
    }));
    hasDraftChanges.current = true;
    setError(null);
    return true;
  }

  function setMemberName(index: number, name: string) {
    const previousName = data.people[index];
    setSavedAssignments((assignments) =>
      mapWeek((day) =>
        assignments[day].map((member) =>
          member === previousName ? name : member,
        ),
      ),
    );
    hasDraftChanges.current = true;
    setData((current) => {
      const memberConstraints = { ...current.memberConstraints };
      if (previousName !== name && memberConstraints[previousName]) {
        memberConstraints[name] = memberConstraints[previousName];
        delete memberConstraints[previousName];
      }
      return {
        ...current,
        memberConstraints,
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
    setData((current) => ({
      ...current,
      people: [...current.people, ""],
      memberIds: [...current.memberIds, null],
    }));
  }

  function removeMember(index: number) {
    const removed = data.people[index];
    const removedId = data.memberIds[index];
    setSavedAssignments((assignments) =>
      mapWeek((day) =>
        assignments[day].map((member) => (member === removed ? null : member)),
      ),
    );
    hasDraftChanges.current = true;
    setData((current) => {
      return {
        ...current,
        people: current.people.filter(
          (_, memberIndex) => memberIndex !== index,
        ),
        memberIds: current.memberIds.filter(
          (_, memberIndex) => memberIndex !== index,
        ),
        memberConstraints: Object.fromEntries(
          Object.entries(current.memberConstraints).filter(
            ([name]) => name !== removed,
          ),
        ),
        memberConstraintsById: Object.fromEntries(
          Object.entries(current.memberConstraintsById).filter(
            ([memberId]) => memberId !== removedId,
          ),
        ),
        tasks: mapWeek((day) =>
          current.tasks[day].filter((entry) => entry.member !== removed),
        ),
      };
    });
  }

  function setMemberConstraint(
    member: string,
    category: "blockedDuties" | "blockedChores",
    name: string,
    blocked: boolean,
  ) {
    if (blocked) {
      const conflicts =
        category === "blockedDuties"
          ? weekDays.some((day) =>
              data.tasks[day].some(
                (entry) => entry.member === member && entry.task === name,
              ),
            )
          : weekDays.some((day) =>
              data.chores[day].some(
                (chore, index) =>
                  chore === name && savedAssignments[day][index] === member,
              ),
            );
      if (conflicts) {
        setError(
          `Remove ${member} from "${name}" in the current schedule before blocking it.`,
        );
        return;
      }
    }
    setError(null);
    setData((current) => {
      const constraint = current.memberConstraints[member] ?? {
        blockedDuties: [],
        blockedChores: [],
      };
      const names = new Set(constraint[category]);
      if (blocked) {
        names.add(name);
      } else {
        names.delete(name);
      }
      return {
        ...current,
        memberConstraints: {
          ...current.memberConstraints,
          [member]: { ...constraint, [category]: [...names] },
        },
      };
    });
  }

  function setMemberDayOff(member: string, day: Weekday, isOff: boolean) {
    if (
      isOff &&
      data.tasks[day].some((entry) => entry.member === member)
    ) {
      setError(
        `Remove ${member}'s duty on ${day} before marking them unavailable.`,
      );
      return;
    }
    if (
      isOff &&
      data.chores[day].some((_, index) => savedAssignments[day][index] === member)
    ) {
      setError(`Unassign ${member}'s chores on ${day} before marking them off.`);
      return;
    }
    setError(null);
    setData((current) => {
      const constraint = current.memberConstraints[member] ?? {
        blockedDuties: [],
        blockedChores: [],
        daysOff: [],
      };
      const daysOff = new Set(constraint.daysOff ?? []);
      if (isOff) {
        daysOff.add(day);
      } else {
        daysOff.delete(day);
      }
      return {
        ...current,
        memberConstraints: {
          ...current.memberConstraints,
          [member]: { ...constraint, daysOff: [...daysOff] },
        },
      };
    });
  }

  function setMemberConstraintById(
    memberId: Id<"members">,
    member: string,
    category: "blockedDuties" | "blockedChores",
    name: string,
    blocked: boolean,
  ) {
    if (blocked) {
      const conflicts =
        category === "blockedDuties"
          ? weekDays.some((day) =>
              data.tasks[day].some(
                (entry) => entry.member === member && entry.task === name,
              ),
            )
          : weekDays.some((day) =>
              data.chores[day].some(
                (chore, index) =>
                  chore === name && savedAssignments[day][index] === member,
              ),
            );
      if (conflicts) {
        setError(
          `Remove ${member} from "${name}" in the current schedule before blocking it.`,
        );
        return;
      }
    }
    const constraint = data.memberConstraintsById[memberId] ??
      data.memberConstraints[member] ?? {
        blockedDuties: [],
        blockedChores: [],
        daysOff: [],
      };
    const names = new Set(constraint[category]);
    if (blocked) {
      names.add(name);
    } else {
      names.delete(name);
    }
    const updated = { ...constraint, [category]: [...names] };
    setError(null);
    setData((current) => ({
      ...current,
      memberConstraints: {
        ...current.memberConstraints,
        [member]: updated,
      },
      memberConstraintsById: {
        ...current.memberConstraintsById,
        [memberId]: updated,
      },
    }));
  }

  function setMemberDayOffById(
    memberId: Id<"members">,
    member: string,
    day: Weekday,
    isOff: boolean,
  ) {
    if (
      isOff &&
      data.tasks[day].some((entry) => entry.member === member)
    ) {
      setError(
        `Remove ${member}'s duty on ${day} before marking them unavailable.`,
      );
      return;
    }
    if (
      isOff &&
      data.chores[day].some((_, index) => savedAssignments[day][index] === member)
    ) {
      setError(`Unassign ${member}'s chores on ${day} before marking them off.`);
      return;
    }
    const constraint = data.memberConstraintsById[memberId] ??
      data.memberConstraints[member] ?? {
        blockedDuties: [],
        blockedChores: [],
        daysOff: [],
      };
    const daysOff = new Set(constraint.daysOff ?? []);
    if (isOff) {
      daysOff.add(day);
    } else {
      daysOff.delete(day);
    }
    const updated = { ...constraint, daysOff: [...daysOff] };
    setError(null);
    setData((current) => ({
      ...current,
      memberConstraints: {
        ...current.memberConstraints,
        [member]: updated,
      },
      memberConstraintsById: {
        ...current.memberConstraintsById,
        [memberId]: updated,
      },
    }));
  }

  function setChoreRestriction(name: string, onePerMemberPerDay: boolean) {
    const rules = {
      ...data.rules,
      chores: {
        ...data.rules.chores,
        [name]: { onePerMemberPerDay },
      },
    };
    if (
      hasAssignmentConflict(
        data,
        savedAssignments,
        data.tasks,
        data.chores,
        rules,
      )
    ) {
      setError(
        "Unassign conflicting chores before changing this chore restriction.",
      );
      return;
    }
    if (onePerMemberPerDay) {
      const duplicateConflict = weekDays.some((day) => {
        const assigned = data.chores[day]
          .map((chore, index) => ({
            chore,
            member: savedAssignments[day][index],
          }))
          .filter(
            (entry): entry is { chore: string; member: string } =>
              entry.member !== null,
          );
        return assigned.some((assignment) => {
          const sameMember = assigned.filter(
            (entry) => entry.member === assignment.member,
          );
          return (
            sameMember.length > 1 &&
            sameMember.some(
              (entry) =>
                entry.chore === name ||
                data.rules.chores?.[entry.chore]?.onePerMemberPerDay,
            )
          );
        });
      });
      if (duplicateConflict) {
        setError(
          "Unassign duplicate chores before requiring one-per-member-per-day.",
        );
        return;
      }
    }
    setData((current) => ({ ...current, rules }));
    setError(null);
  }

  function addChore(day: Weekday) {
    if (!Object.keys(data.weights.chores).length) {
      return;
    }
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
    setSavedAssignments((current) => ({
      ...current,
      [day]: [...current[day], null],
    }));
    hasDraftChanges.current = true;
  }

  function setChore(day: Weekday, index: number, name: string) {
    const chores = {
      ...data.chores,
      [day]: data.chores[day].map((chore, choreIndex) =>
        choreIndex === index ? name : chore,
      ),
    };
    if (hasAssignmentConflict(data, savedAssignments, data.tasks, chores)) {
      setError("Unassign this chore before changing it to a type the member cannot do.");
      return;
    }
    setData((current) => ({
      ...current,
      chores,
    }));
    setError(null);
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
    setSavedAssignments((current) => ({
      ...current,
      [day]: current[day].filter(
        (_, assignmentIndex) => assignmentIndex !== index,
      ),
    }));
    hasDraftChanges.current = true;
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
    const currentEntry = data.tasks[day][index];
    if (
      (key === "member" &&
        data.memberConstraints[value]?.daysOff?.includes(day)) ||
      (key === "member" &&
        data.memberConstraints[value]?.blockedDuties.includes(
          currentEntry?.task ?? "",
        )) ||
      (key === "task" &&
        currentEntry?.member &&
        data.memberConstraints[currentEntry.member]?.blockedDuties.includes(value))
    ) {
      setError("This member is not allowed to perform that duty.");
      return;
    }
    const tasks = {
      ...data.tasks,
      [day]: data.tasks[day].map((entry, taskIndex) =>
        taskIndex === index ? { ...entry, [key]: value } : entry,
      ),
    };
    if (hasAssignmentConflict(data, savedAssignments, tasks)) {
      setError("This duty change conflicts with a saved chore assignment.");
      return;
    }
    setData((current) => ({
      ...current,
      tasks,
    }));
    setError(null);
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
            : {
                ...current.rules,
                chores: {
                  ...current.rules.chores,
                  [cleanName]: { onePerMemberPerDay: false },
                },
              },
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
      const memberConstraints = Object.fromEntries(
        Object.entries(current.memberConstraints).map(([member, constraint]) => [
          member,
          choreNames
            ? {
                ...constraint,
                blockedChores: constraint.blockedChores.map((chore) =>
                  chore === oldName ? name : chore,
                ),
              }
            : {
                ...constraint,
                blockedDuties: constraint.blockedDuties.map((duty) =>
                  duty === oldName ? name : duty,
                ),
              },
        ]),
      );
      return {
        ...current,
        memberConstraints,
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
            chores: choreNames
              ? Object.fromEntries(
                  Object.entries(current.rules.chores ?? {}).map(
                    ([chore, rule]) => [
                      chore === oldName ? name : chore,
                      rule,
                    ],
                  ),
                )
              : current.rules.chores,
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
    if (category === "chores") {
      setSavedAssignments((assignments) =>
        mapWeek((day) =>
          assignments[day].filter(
            (_, index) => data.chores[day][index] !== name,
          ),
        ),
      );
      hasDraftChanges.current = true;
    }
    setData((current) => {
      const weights = { ...current.weights[category] };
      delete weights[name];
      return {
        ...current,
        memberConstraints: Object.fromEntries(
          Object.entries(current.memberConstraints).map(([member, constraint]) => [
            member,
            category === "chores"
              ? {
                  ...constraint,
                  blockedChores: constraint.blockedChores.filter(
                    (chore) => chore !== name,
                  ),
                }
              : {
                  ...constraint,
                  blockedDuties: constraint.blockedDuties.filter(
                    (duty) => duty !== name,
                  ),
                },
          ]),
        ),
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
          chores:
            category === "chores"
              ? Object.fromEntries(
                  Object.entries(current.rules.chores ?? {}).filter(
                    ([chore]) => chore !== name,
                  ),
                )
              : current.rules.chores,
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
    const rules = {
      tasks: {
        ...data.rules.tasks,
        [name]: {
          ...(data.rules.tasks[name] ?? { allowedChores: [] }),
          restriction,
        },
      },
    };
    if (hasAssignmentConflict(data, savedAssignments, data.tasks, data.chores, rules)) {
      setError("This duty restriction conflicts with a saved chore assignment.");
      return;
    }
    setData((current) => ({
      ...current,
      rules,
    }));
    setError(null);
  }

  function setAllowedChore(task: string, chore: string, allowed: boolean) {
    const currentRule = data.rules.tasks[task] ?? {
      restriction: "none" as const,
      allowedChores: [],
    };
    const rules = {
      tasks: {
        ...data.rules.tasks,
        [task]: {
          ...currentRule,
          allowedChores: allowed
            ? [...new Set([...currentRule.allowedChores, chore])]
            : currentRule.allowedChores.filter((name) => name !== chore),
        },
      },
    };
    if (hasAssignmentConflict(data, savedAssignments, data.tasks, data.chores, rules)) {
      setError("This chore rule conflicts with a saved chore assignment.");
      return;
    }
    setData((current) => {
      const rule = current.rules.tasks[task] ?? {
        restriction: "none" as const,
        allowedChores: [],
      };
      return {
        ...current,
        rules: {
          chores: current.rules.chores,
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
    setError(null);
  }

  function reset() {
    setData(createEmptySchedule());
    setSavedAssignments(mapWeek(() => []));
    hasDraftChanges.current = true;
    setError(null);
  }

  const value: SchedulerContextValue = {
    role,
    currentMemberId,
    data,
    savedAssignments,
    persistedAssignments,
    savedSchedules: savedSchedules ?? [],
    generateSchedule,
    createManualSchedule,
    saveScheduleHistory,
    deleteSavedSchedule: deleteScheduleHistory,
    setChoreAssignment,
    loaded,
    saving,
    error,
    setMemberName,
    addMember,
    removeMember,
    setMemberConstraint,
    setMemberDayOff,
    setMemberConstraintById,
    setMemberDayOffById,
    setChoreRestriction,
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
    reset,
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

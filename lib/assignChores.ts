import {
  type SchedulingRules,
  type MemberConstraints,
  type WeeklyChoreAssignments,
  type WeeklyChores,
  type WeeklyTasks,
  type Weekday,
  type WorkloadWeights,
  defaultWorkloadWeights,
  weekDays,
} from "@/lib/types";
import { canAssignChore } from "@/lib/choreEligibility";

function normalizeWeightKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getWeight(
  name: string,
  weights: Readonly<Record<string, number>>,
  fallback: number,
): number {
  const normalizedName = normalizeWeightKey(name);
  const matchingEntry = Object.entries(weights).find(
    ([key]) => normalizeWeightKey(key) === normalizedName,
  );
  const weight = matchingEntry?.[1] ?? fallback;

  if (!Number.isFinite(weight) || weight < 0) {
    throw new RangeError(`Weight for "${name}" must be a non-negative number.`);
  }

  return weight;
}

export function assignWeeklyChores(
  people: readonly string[],
  tasks: WeeklyTasks,
  chores: WeeklyChores,
  weights: WorkloadWeights = defaultWorkloadWeights,
  rules: SchedulingRules = { tasks: {} },
  memberConstraints: MemberConstraints = {},
): WeeklyChoreAssignments {
  const members = [...new Set(people.filter((person) => person.trim()))];
  const memberIndex = new Map(members.map((member, index) => [member, index]));
  const weeklyLoad = new Map(members.map((member) => [member, 0]));
  for (const day of weekDays) {
    for (const [member, memberTasks] of Object.entries(tasks[day] ?? {})) {
      if (weeklyLoad.has(member)) {
        const taskLoad = memberTasks.reduce(
          (total, task) =>
            total + getWeight(task, weights.tasks, weights.defaultTaskWeight),
          0,
        );
        weeklyLoad.set(member, (weeklyLoad.get(member) ?? 0) + taskLoad);
      }
    }
  }

  const result: WeeklyChoreAssignments = {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };
  let tieBreaker = 0;

  for (const day of weekDays) {
    const dayChores = (chores[day] ?? [])
      .map((chore) => chore.trim())
      .filter(Boolean);
    const choreWeights = dayChores.map((chore) =>
      getWeight(chore, weights.chores, weights.defaultChoreWeight),
    );
    const choreOrder = dayChores
      .map((_, index) => index)
      .sort(
        (left, right) => {
          const leftChore = dayChores[left];
          const rightChore = dayChores[right];
          const leftCandidateCount = members.filter((member) =>
            canAssignChore(
              member,
              day,
              leftChore,
              tasks,
              rules,
              memberConstraints,
            ),
          ).length;
          const rightCandidateCount = members.filter((member) =>
            canAssignChore(
              member,
              day,
              rightChore,
              tasks,
              rules,
              memberConstraints,
            ),
          ).length;
          return (
            Number(
              rules.chores?.[rightChore]?.onePerMemberPerDay ?? false,
            ) -
              Number(
                rules.chores?.[leftChore]?.onePerMemberPerDay ?? false,
              ) ||
            leftCandidateCount - rightCandidateCount ||
            choreWeights[right] - choreWeights[left]
          );
        },
      );
    const assignments: WeeklyChoreAssignments[Weekday] = dayChores.map(
      (chore) => ({ chore, member: null }),
    );
    for (const choreIndex of choreOrder) {
      const chore = dayChores[choreIndex];
      const candidates = members
        .filter((member) =>
          canAssignChore(
            member,
            day,
            chore,
            tasks,
            rules,
            memberConstraints,
            assignments,
          ),
        )
        .sort((left, right) => {
          const loadDifference =
            (weeklyLoad.get(left) ?? 0) - (weeklyLoad.get(right) ?? 0);
          if (loadDifference !== 0) {
            return loadDifference;
          }
          const leftIndex = memberIndex.get(left) ?? 0;
          const rightIndex = memberIndex.get(right) ?? 0;
          const leftPriority =
            (leftIndex - tieBreaker + members.length) % members.length;
          const rightPriority =
            (rightIndex - tieBreaker + members.length) % members.length;
          return leftPriority - rightPriority;
        });
      const member = candidates[0] ?? null;
      if (member !== null) {
        weeklyLoad.set(
          member,
          (weeklyLoad.get(member) ?? 0) +
            getWeight(chore, weights.chores, weights.defaultChoreWeight),
        );
        tieBreaker = ((memberIndex.get(member) ?? 0) + 1) % members.length;
      }
      assignments[choreIndex] = { chore, member };
    }

    result[day] = assignments;
  }

  return result;
}

export function calculateWeeklyWorkloads(
  people: readonly string[],
  tasks: WeeklyTasks,
  assignments: WeeklyChoreAssignments,
  weights: WorkloadWeights = defaultWorkloadWeights,
): Record<string, number> {
  const workloads: Record<string, number> = Object.fromEntries(
    [...new Set(people.filter((person) => person.trim()))].map((member) => [
      member,
      0,
    ]),
  );

  for (const day of weekDays) {
    for (const [member, memberTasks] of Object.entries(tasks[day] ?? {})) {
      if (member in workloads) {
        workloads[member] += memberTasks.reduce(
          (total, task) =>
            total + getWeight(task, weights.tasks, weights.defaultTaskWeight),
          0,
        );
      }
    }

    for (const { chore, member } of assignments[day]) {
      if (member && member in workloads) {
        workloads[member] += getWeight(
          chore,
          weights.chores,
          weights.defaultChoreWeight,
        );
      }
    }
  }

  return workloads;
}

import {
  type SchedulingRules,
  type TaskRule,
  type WeeklyChoreAssignments,
  type WeeklyChores,
  type WeeklyTasks,
  type WorkloadWeights,
  defaultWorkloadWeights,
  weekDays,
} from "@/lib/types";

function normalizeWeightKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getTaskRule(
  rules: SchedulingRules,
  task: string,
): TaskRule | undefined {
  const normalizedTask = normalizeWeightKey(task);
  return Object.entries(rules.tasks).find(
    ([name]) => normalizeWeightKey(name) === normalizedTask,
  )?.[1];
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

  for (const [dayIndex, day] of weekDays.entries()) {
    const dayTasks = tasks[day] ?? {};
    const unavailableToday = new Set<string>();
    const allowedChoresToday = new Map<string, Set<string>>();

    for (const [member, memberTasks] of Object.entries(dayTasks)) {
      for (const task of memberTasks) {
        const taskRule = getTaskRule(rules, task);
        const restriction = taskRule?.restriction ?? "none";
        if (
          restriction === "unavailable-today" ||
          restriction === "unavailable-today-and-previous-day"
        ) {
          unavailableToday.add(member);
        } else if (restriction === "only-selected-chores") {
          const allowedForTask = new Set(
            (taskRule?.allowedChores ?? []).map(normalizeWeightKey),
          );
          const allowedForMember = allowedChoresToday.get(member);
          if (allowedForMember) {
            for (const chore of allowedForMember) {
              if (!allowedForTask.has(chore)) {
                allowedForMember.delete(chore);
              }
            }
          } else {
            allowedChoresToday.set(member, allowedForTask);
          }
        }
      }
    }

    const nextDay = weekDays[dayIndex + 1];
    if (nextDay) {
      for (const [member, memberTasks] of Object.entries(
        tasks[nextDay] ?? {},
      )) {
        if (
          memberTasks.some((task) => {
            const restriction = getTaskRule(rules, task)?.restriction;
            return restriction === "unavailable-today-and-previous-day";
          })
        ) {
          unavailableToday.add(member);
        }
      }
    }

    const dayChores = (chores[day] ?? [])
      .map((chore) => chore.trim())
      .filter(Boolean);
    const choreWeights = dayChores.map((chore) =>
      getWeight(chore, weights.chores, weights.defaultChoreWeight),
    );
    const candidatesByChore = dayChores.map((chore) =>
      members
        .filter(
          (member) =>
            !unavailableToday.has(member) &&
            (!allowedChoresToday.has(member) ||
              allowedChoresToday.get(member)?.has(normalizeWeightKey(chore))),
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
        }),
    );

    const choreOrder = dayChores
      .map((_, index) => index)
      .sort(
        (left, right) =>
          candidatesByChore[left].length - candidatesByChore[right].length ||
          choreWeights[right] - choreWeights[left],
      );
    const choreByMember = new Map<string, number>();

    const placeChore = (choreIndex: number, visited: Set<string>): boolean => {
      for (const member of candidatesByChore[choreIndex]) {
        if (visited.has(member)) {
          continue;
        }
        visited.add(member);

        const previousChore = choreByMember.get(member);
        if (previousChore === undefined || placeChore(previousChore, visited)) {
          choreByMember.set(member, choreIndex);
          return true;
        }
      }
      return false;
    };

    for (const choreIndex of choreOrder) {
      placeChore(choreIndex, new Set());
    }

    let improved = true;
    while (improved) {
      improved = false;
      const assignments = [...choreByMember.entries()];

      for (let first = 0; first < assignments.length; first++) {
        for (let second = first + 1; second < assignments.length; second++) {
          const [firstMember, firstChore] = assignments[first];
          const [secondMember, secondChore] = assignments[second];
          const firstCanTakeSecond =
            candidatesByChore[secondChore].includes(firstMember);
          const secondCanTakeFirst =
            candidatesByChore[firstChore].includes(secondMember);

          if (!firstCanTakeSecond || !secondCanTakeFirst) {
            continue;
          }

          const firstLoad = weeklyLoad.get(firstMember) ?? 0;
          const secondLoad = weeklyLoad.get(secondMember) ?? 0;
          const currentSpread =
            (firstLoad + choreWeights[firstChore]) ** 2 +
            (secondLoad + choreWeights[secondChore]) ** 2;
          const swappedSpread =
            (firstLoad + choreWeights[secondChore]) ** 2 +
            (secondLoad + choreWeights[firstChore]) ** 2;

          if (swappedSpread < currentSpread) {
            choreByMember.set(firstMember, secondChore);
            choreByMember.set(secondMember, firstChore);
            improved = true;
            break;
          }
        }
        if (improved) {
          break;
        }
      }
    }

    const memberByChore = new Map<number, string>();
    for (const [member, choreIndex] of choreByMember) {
      memberByChore.set(choreIndex, member);
    }

    const assignments = dayChores.map((chore, choreIndex) => {
      const member = memberByChore.get(choreIndex) ?? null;
      if (member !== null) {
        weeklyLoad.set(
          member,
          (weeklyLoad.get(member) ?? 0) + choreWeights[choreIndex],
        );
        tieBreaker = ((memberIndex.get(member) ?? 0) + 1) % members.length;
      }
      return { chore, member };
    });

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

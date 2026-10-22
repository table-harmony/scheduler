import {
  weekDays,
  type SchedulingRules,
  type MemberConstraints,
  type Weekday,
  type WeeklyTasks,
} from "@/lib/types";

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function canAssignChore(
  member: string,
  day: Weekday,
  chore: string,
  tasks: WeeklyTasks,
  rules: SchedulingRules,
  constraints: MemberConstraints = {},
  assignments: readonly { chore: string; member: string | null }[] = [],
): boolean {
  const choreName = normalizeName(chore);
  const memberDuties = tasks[day]?.[member] ?? [];
  const memberConstraint = Object.entries(constraints).find(
    ([name]) => normalizeName(name) === normalizeName(member),
  )?.[1];
  if (
    memberConstraint?.daysOff?.includes(day) ||
    memberConstraint?.blockedChores.some(
      (blockedChore) => normalizeName(blockedChore) === choreName,
    ) ||
    memberDuties.some((duty) =>
      memberConstraint?.blockedDuties.some(
        (blockedDuty) => normalizeName(blockedDuty) === normalizeName(duty),
      ),
    )
  ) {
    return false;
  }

  if (
    rules.chores?.[chore]?.onePerMemberPerDay &&
    assignments.some((assignment) => assignment.member === member)
  ) {
    return false;
  }
  if (
    assignments.some(
      (assignment) =>
        assignment.member === member &&
        rules.chores?.[assignment.chore]?.onePerMemberPerDay,
    )
  ) {
    return false;
  }

  for (const duty of memberDuties) {
    const rule = rules.tasks[duty];
    if (
      rule?.restriction === "unavailable-today" ||
      rule?.restriction === "unavailable-today-and-previous-day"
    ) {
      return false;
    }
    if (
      rule?.restriction === "only-selected-chores" &&
      !rule.allowedChores.some(
        (allowedChore) => normalizeName(allowedChore) === choreName,
      )
    ) {
      return false;
    }
  }

  const nextDay = weekDays[weekDays.indexOf(day) + 1];
  if (
    nextDay &&
    (tasks[nextDay]?.[member] ?? []).some(
      (duty) =>
        rules.tasks[duty]?.restriction ===
        "unavailable-today-and-previous-day",
    )
  ) {
    return false;
  }

  return true;
}

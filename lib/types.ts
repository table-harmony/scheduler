export const dayNames: Record<Weekday, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

export const weekDays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Weekday = (typeof weekDays)[number];

export type WeeklyTasks = Partial<
  Record<Weekday, Readonly<Record<string, readonly string[]>>>
>;

export type WeeklyChores = Partial<Record<Weekday, readonly string[]>>;

export type ChoreAssignment = {
  chore: string;
  member: string | null;
};

export type WeeklyChoreAssignments = Record<Weekday, ChoreAssignment[]>;

export type WorkloadWeights = {
  chores: Readonly<Record<string, number>>;
  tasks: Readonly<Record<string, number>>;
  defaultChoreWeight: number;
  defaultTaskWeight: number;
};

export type TaskRestriction =
  | "none"
  | "unavailable-today"
  | "unavailable-today-and-previous-day"
  | "only-selected-chores";

export type TaskRule = {
  restriction: TaskRestriction;
  allowedChores: readonly string[];
};

export type SchedulingRules = {
  tasks: Readonly<Record<string, TaskRule>>;
};

export const defaultWorkloadWeights: WorkloadWeights = {
  chores: {},
  tasks: {},
  defaultChoreWeight: 0,
  defaultTaskWeight: 0,
};

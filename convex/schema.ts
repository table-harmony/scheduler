import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const weekDay = v.union(
  v.literal("sunday"),
  v.literal("monday"),
  v.literal("tuesday"),
  v.literal("wednesday"),
  v.literal("thursday"),
  v.literal("friday"),
  v.literal("saturday"),
);

const taskRestriction = v.union(
  v.literal("none"),
  v.literal("unavailable-today"),
  v.literal("unavailable-today-and-previous-day"),
  v.literal("only-selected-chores"),
);

export default defineSchema({
  members: defineTable({
    name: v.string(),
    daysOff: v.optional(v.array(weekDay)),
  }).index("by_name", ["name"]),
  choreTypes: defineTable({
    name: v.string(),
    weight: v.number(),
    onePerMemberPerDay: v.optional(v.boolean()),
  }).index("by_name", ["name"]),
  dutyTypes: defineTable({
    name: v.string(),
    weight: v.number(),
    restriction: taskRestriction,
    allowedChores: v.array(v.string()),
  }).index("by_name", ["name"]),
  chores: defineTable({
    day: weekDay,
    choreTypeId: v.id("choreTypes"),
    assignedMemberId: v.optional(v.id("members")),
  }).index("by_day", ["day"]),
  duties: defineTable({
    day: weekDay,
    memberId: v.id("members"),
    dutyTypeId: v.id("dutyTypes"),
  }).index("by_day", ["day"]),
  memberConstraints: defineTable({
    memberId: v.id("members"),
    blockedDuties: v.array(v.string()),
    blockedChores: v.array(v.string()),
  }).index("by_member", ["memberId"]),
  savedSchedules: defineTable({
    savedAt: v.number(),
    assignments: v.array(
      v.object({
        day: weekDay,
        chore: v.string(),
        member: v.union(v.string(), v.null()),
      }),
    ),
  }).index("by_saved_at", ["savedAt"]),
  schedulerSettings: defineTable({
    defaultChoreWeight: v.number(),
    defaultDutyWeight: v.number(),
  }),
});

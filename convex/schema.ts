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
  }).index("by_name", ["name"]),
  choreTypes: defineTable({
    name: v.string(),
    weight: v.number(),
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
  }).index("by_day", ["day"]),
  duties: defineTable({
    day: weekDay,
    memberId: v.id("members"),
    dutyTypeId: v.id("dutyTypes"),
  }).index("by_day", ["day"]),
  schedulerSettings: defineTable({
    defaultChoreWeight: v.number(),
    defaultDutyWeight: v.number(),
  }),
});

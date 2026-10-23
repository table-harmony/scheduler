import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

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
  ...authTables,
  groups: defineTable({
    name: v.string(),
    inviteCode: v.string(),
    createdBy: v.string(),
  }).index("by_invite_code", ["inviteCode"]),
  groupMemberships: defineTable({
    groupId: v.id("groups"),
    userId: v.string(),
    memberId: v.id("members"),
    role: v.union(v.literal("manager"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_group", ["groupId"])
    .index("by_member", ["memberId"]),
  members: defineTable({
    name: v.string(),
    groupId: v.optional(v.id("groups")),
    userId: v.optional(v.string()),
    daysOff: v.optional(v.array(weekDay)),
    daysOffRemaining: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_group", ["groupId"]),
  choreTypes: defineTable({
    name: v.string(),
    groupId: v.optional(v.id("groups")),
    weight: v.number(),
    onePerMemberPerDay: v.optional(v.boolean()),
  })
    .index("by_name", ["name"])
    .index("by_group", ["groupId"]),
  dutyTypes: defineTable({
    name: v.string(),
    groupId: v.optional(v.id("groups")),
    weight: v.number(),
    restriction: taskRestriction,
    allowedChores: v.array(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_group", ["groupId"]),
  chores: defineTable({
    groupId: v.optional(v.id("groups")),
    day: weekDay,
    choreTypeId: v.id("choreTypes"),
    assignedMemberId: v.optional(v.id("members")),
  })
    .index("by_day", ["day"])
    .index("by_group", ["groupId"]),
  duties: defineTable({
    groupId: v.optional(v.id("groups")),
    day: weekDay,
    memberId: v.id("members"),
    dutyTypeId: v.id("dutyTypes"),
  })
    .index("by_day", ["day"])
    .index("by_group", ["groupId"]),
  memberConstraints: defineTable({
    groupId: v.optional(v.id("groups")),
    memberId: v.id("members"),
    blockedDuties: v.array(v.string()),
    blockedChores: v.array(v.string()),
  })
    .index("by_member", ["memberId"])
    .index("by_group", ["groupId"]),
  memberAbsences: defineTable({
    groupId: v.optional(v.id("groups")),
    memberId: v.id("members"),
    date: v.string(),
    kind: v.union(v.literal("day-off"), v.literal("sick")),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
    ),
  })
    .index("by_member_date", ["memberId", "date"])
    .index("by_group", ["groupId"]),
  savedSchedules: defineTable({
    groupId: v.optional(v.id("groups")),
    savedAt: v.number(),
    assignments: v.array(
      v.object({
        day: weekDay,
        chore: v.string(),
        member: v.union(v.string(), v.null()),
      }),
    ),
  })
    .index("by_saved_at", ["savedAt"])
    .index("by_group", ["groupId"]),
  schedulerSettings: defineTable({
    groupId: v.optional(v.id("groups")),
    defaultChoreWeight: v.number(),
    defaultDutyWeight: v.number(),
  }).index("by_group", ["groupId"]),
});

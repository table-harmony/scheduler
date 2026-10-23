import { v } from "convex/values";
import {
  defaultWorkloadWeights,
  weekDays,
  type Weekday,
} from "../lib/types";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

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

const snapshotValidator = {
  members: v.array(v.string()),
  memberIds: v.array(v.union(v.id("members"), v.null())),
  choreTypes: v.array(
    v.object({
      name: v.string(),
      weight: v.number(),
      onePerMemberPerDay: v.boolean(),
    }),
  ),
  dutyTypes: v.array(
    v.object({
      name: v.string(),
      weight: v.number(),
      restriction: taskRestriction,
      allowedChores: v.array(v.string()),
    }),
  ),
  chores: v.array(v.object({ day: weekDay, chore: v.string() })),
  assignments: v.array(
    v.object({
      day: weekDay,
      chore: v.string(),
      member: v.union(v.string(), v.null()),
    }),
  ),
  duties: v.array(
    v.object({ day: weekDay, member: v.string(), duty: v.string() }),
  ),
  memberConstraints: v.array(
    v.object({
      member: v.string(),
      memberId: v.union(v.id("members"), v.null()),
      blockedDuties: v.array(v.string()),
      blockedChores: v.array(v.string()),
      daysOff: v.array(weekDay),
    }),
  ),
  defaultChoreWeight: v.number(),
  defaultDutyWeight: v.number(),
};

function normalizedMemberName(name: string): string {
  return name.trim().toLowerCase();
}

type AuthenticatedContext = QueryCtx | MutationCtx;

async function getIdentity(ctx: AuthenticatedContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Sign in to continue.");
  }
  return identity;
}

async function getMembership(ctx: AuthenticatedContext, userId: string) {
  return ctx.db
    .query("groupMemberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function requireGroup(ctx: AuthenticatedContext) {
  const identity = await getIdentity(ctx);
  const membership = await getMembership(ctx, identity.subject);
  if (!membership) {
    throw new Error("Join or create a group to access its schedule.");
  }
  const group = await ctx.db.get(membership.groupId);
  if (!group) {
    throw new Error("This group no longer exists.");
  }
  return { identity, membership, group };
}

async function requireManager(ctx: AuthenticatedContext) {
  const access = await requireGroup(ctx);
  if (access.membership.role !== "manager") {
    throw new Error("Only the group manager can edit the schedule.");
  }
  return access;
}

async function migrateLegacySchedule(
  ctx: MutationCtx,
  groupId: Id<"groups">,
) {
  const tables = [
    "members",
    "choreTypes",
    "dutyTypes",
    "chores",
    "duties",
    "memberConstraints",
    "memberAbsences",
    "savedSchedules",
    "schedulerSettings",
  ] as const;
  for (const table of tables) {
    const documents = await ctx.db.query(table).collect();
    for (const document of documents) {
      if (document.groupId === undefined) {
        await ctx.db.patch(document._id, { groupId });
      }
    }
  }
}

export const getMyGroup = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const membership = await getMembership(ctx, identity.subject);
    if (!membership) {
      return null;
    }
    const [group, member] = await Promise.all([
      ctx.db.get(membership.groupId),
      ctx.db.get(membership.memberId),
    ]);
    if (!group || !member) {
      return null;
    }
    return {
      id: group._id,
      name: group.name,
      inviteCode: group.inviteCode,
      role: membership.role,
      memberId: member._id,
      memberName: member.name,
    };
  },
});

export const getGroupInvitePreview = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    await getIdentity(ctx);
    if (!inviteCode.trim()) {
      return null;
    }
    const group = await ctx.db
      .query("groups")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", inviteCode.trim()))
      .unique();
    if (!group) {
      return null;
    }
    const [members, memberships] = await Promise.all([
      ctx.db
        .query("members")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect(),
      ctx.db
        .query("groupMemberships")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect(),
    ]);
    const claimedIds = new Set(memberships.map(({ memberId }) => memberId));
    return {
      id: group._id,
      name: group.name,
      unclaimedMembers: members
        .filter((member) => !claimedIds.has(member._id))
        .map(({ _id, name }) => ({ id: _id, name })),
    };
  },
});

export const createGroup = mutation({
  args: {
    name: v.string(),
    memberName: v.string(),
    inviteCode: v.string(),
  },
  handler: async (ctx, { name, memberName, inviteCode }) => {
    const identity = await getIdentity(ctx);
    if (await getMembership(ctx, identity.subject)) {
      throw new Error("Your account already belongs to a group.");
    }
    const cleanName = name.trim();
    const cleanMemberName = memberName.trim();
    if (!cleanName || cleanName.length > 80) {
      throw new Error("Group name must be between 1 and 80 characters.");
    }
    if (!cleanMemberName || cleanMemberName.length > 80) {
      throw new Error("Member name must be between 1 and 80 characters.");
    }
    if (inviteCode.length < 32 || inviteCode.length > 80) {
      throw new Error("Generate a valid group invite code.");
    }
    const existingCode = await ctx.db
      .query("groups")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", inviteCode))
      .unique();
    if (existingCode) {
      throw new Error("Invite code collision. Please try again.");
    }
    const existingGroups = await ctx.db.query("groups").collect();
    const groupId = await ctx.db.insert("groups", {
      name: cleanName,
      inviteCode,
      createdBy: identity.subject,
    });
    if (existingGroups.length === 0) {
      await migrateLegacySchedule(ctx, groupId);
    }
    const legacyMembers = await ctx.db
      .query("members")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    const existingMember = legacyMembers.find(
      (member) =>
        normalizedMemberName(member.name) ===
          normalizedMemberName(cleanMemberName) &&
        !member.userId,
    );
    if (
      legacyMembers.some(
        (member) =>
          normalizedMemberName(member.name) ===
            normalizedMemberName(cleanMemberName) &&
          member._id !== existingMember?._id,
      )
    ) {
      throw new Error("Member names must be unique within a group.");
    }
    const memberId =
      existingMember?._id ??
      (await ctx.db.insert("members", {
        groupId,
        userId: identity.subject,
        name: cleanMemberName,
        daysOff: [],
        daysOffRemaining: 0,
      }));
    if (existingMember) {
      await ctx.db.patch(existingMember._id, { userId: identity.subject });
    }
    await ctx.db.insert("groupMemberships", {
      groupId,
      userId: identity.subject,
      memberId,
      role: "manager",
      joinedAt: Date.now(),
    });
  },
});

export const joinGroup = mutation({
  args: {
    inviteCode: v.string(),
    memberName: v.string(),
    existingMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, { inviteCode, memberName, existingMemberId }) => {
    const identity = await getIdentity(ctx);
    if (await getMembership(ctx, identity.subject)) {
      throw new Error("Your account already belongs to a group.");
    }
    const group = await ctx.db
      .query("groups")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", inviteCode.trim()))
      .unique();
    if (!group) {
      throw new Error("That group invite code is invalid.");
    }
    const cleanMemberName = memberName.trim();
    if (!existingMemberId && (!cleanMemberName || cleanMemberName.length > 80)) {
      throw new Error("Member name must be between 1 and 80 characters.");
    }
    const groupMembers = await ctx.db
      .query("members")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    let memberId: Id<"members">;
    if (existingMemberId) {
      const member = await ctx.db.get(existingMemberId);
      if (!member || member.groupId !== group._id || member.userId) {
        throw new Error("That unclaimed member profile is not available.");
      }
      if (
        groupMembers.some(
          (groupMember) =>
            groupMember._id !== member._id &&
            normalizedMemberName(groupMember.name) ===
              normalizedMemberName(member.name),
        )
      ) {
        throw new Error("Member names must be unique within a group.");
      }
      memberId = member._id;
      await ctx.db.patch(memberId, { userId: identity.subject });
    } else {
      if (
        groupMembers.some(
          (groupMember) =>
            normalizedMemberName(groupMember.name) ===
            normalizedMemberName(cleanMemberName),
        )
      ) {
        throw new Error("Member names must be unique within a group.");
      }
      memberId = await ctx.db.insert("members", {
        groupId: group._id,
        userId: identity.subject,
        name: cleanMemberName,
        daysOff: [],
        daysOffRemaining: 0,
      });
    }
    await ctx.db.insert("groupMemberships", {
      groupId: group._id,
      userId: identity.subject,
      memberId,
      role: "member",
      joinedAt: Date.now(),
    });
  },
});

export const rotateGroupInviteCode = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const { group } = await requireManager(ctx);
    if (inviteCode.length < 32 || inviteCode.length > 80) {
      throw new Error("Generate a valid group invite code.");
    }
    const existingCode = await ctx.db
      .query("groups")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", inviteCode))
      .unique();
    if (existingCode && existingCode._id !== group._id) {
      throw new Error("Invite code collision. Please try again.");
    }
    await ctx.db.patch(group._id, { inviteCode });
  },
});

export const getGroupMembers = query({
  args: {},
  handler: async (ctx) => {
    const { group } = await requireGroup(ctx);
    const [members, memberships] = await Promise.all([
      ctx.db
        .query("members")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect(),
      ctx.db
        .query("groupMemberships")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect(),
    ]);
    const membershipByMember = new Map(
      memberships.map((membership) => [membership.memberId, membership]),
    );
    const identity = await ctx.auth.getUserIdentity();
    return members.map((member) => ({
      id: member._id,
      name: member.name,
      role: membershipByMember.get(member._id)?.role ?? "unclaimed",
      isSelf: membershipByMember.get(member._id)?.userId === identity?.subject,
    }));
  },
});

export const getSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const { group } = await requireGroup(ctx);
    const [members, choreTypes, dutyTypes, chores, duties, memberConstraints, settings] =
      await Promise.all([
        ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("choreTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("dutyTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("chores").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("duties").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("memberConstraints").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("schedulerSettings").withIndex("by_group", (q) => q.eq("groupId", group._id)).first(),
      ]);
    chores.sort((left, right) => left._creationTime - right._creationTime);

    const memberNames = new Map(
      members.map((member) => [member._id, member.name]),
    );
    const choreNames = new Map(
      choreTypes.map((chore) => [chore._id, chore.name]),
    );
    const dutyNames = new Map(
      dutyTypes.map((duty) => [duty._id, duty.name]),
    );
    const tasksByDay = {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
    } as Record<Weekday, { member: string; task: string }[]>;
    const choresByDay = {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
    } as Record<Weekday, string[]>;
    const assignmentsByDay = {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
    } as Record<Weekday, { chore: string; member: string | null }[]>;

    for (const duty of duties) {
      const member = memberNames.get(duty.memberId);
      const task = dutyNames.get(duty.dutyTypeId);
      if (member && task) {
        tasksByDay[duty.day].push({ member, task });
      }
    }
    for (const chore of chores) {
      const name = choreNames.get(chore.choreTypeId);
      if (name) {
        choresByDay[chore.day].push(name);
        assignmentsByDay[chore.day].push({
          chore: name,
          member: chore.assignedMemberId
            ? memberNames.get(chore.assignedMemberId) ?? null
            : null,
        });
      }
    }

    return {
      people: members.map((member) => member.name),
      memberIds: members.map((member) => member._id),
      tasks: tasksByDay,
      chores: choresByDay,
      assignments: assignmentsByDay,
      choreTypes: choreTypes.map(
        ({ name, weight, onePerMemberPerDay }) => ({
          name,
          weight,
          onePerMemberPerDay: onePerMemberPerDay ?? false,
        }),
      ),
      dutyTypes: dutyTypes.map(
        ({ name, weight, restriction, allowedChores }) => ({
          name,
          weight,
          restriction,
          allowedChores,
        }),
      ),
      memberConstraints: members.map((member) => {
        const constraint = memberConstraints.find(
          (entry) => entry.memberId === member._id,
        );
        return {
          member: member.name,
          memberId: member._id,
          blockedDuties: constraint?.blockedDuties ?? [],
          blockedChores: constraint?.blockedChores ?? [],
          daysOff: member.daysOff ?? [],
        };
      }),
      weights: {
        defaultChoreWeight:
          settings?.defaultChoreWeight ??
          defaultWorkloadWeights.defaultChoreWeight,
        defaultTaskWeight:
          settings?.defaultDutyWeight ??
          defaultWorkloadWeights.defaultTaskWeight,
      },
    };
  },
});

export const getMemberProfile = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const { group, membership } = await requireGroup(ctx);
    const member = await ctx.db.get(memberId);
    if (!member || member.groupId !== group._id) {
      return null;
    }
    if (membership.role !== "manager" && membership.memberId !== memberId) {
      return null;
    }

    const [chores, choreTypes, duties, dutyTypes, constraints, absences] =
      await Promise.all([
        ctx.db.query("chores").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("choreTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("duties").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db.query("dutyTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
        ctx.db
          .query("memberConstraints")
          .withIndex("by_member", (q) => q.eq("memberId", memberId))
          .first(),
        ctx.db
          .query("memberAbsences")
          .withIndex("by_member_date", (q) => q.eq("memberId", memberId))
          .collect(),
      ]);
    const choreNames = new Map(choreTypes.map((chore) => [chore._id, chore.name]));
    const dutyNames = new Map(dutyTypes.map((duty) => [duty._id, duty.name]));

    return {
      id: member._id,
      name: member.name,
      role: membership.role,
      daysOff: member.daysOff ?? [],
      daysOffRemaining: member.daysOffRemaining ?? 0,
      blockedDuties: constraints?.blockedDuties ?? [],
      blockedChores: constraints?.blockedChores ?? [],
      activities: {
        chores: chores.flatMap((chore) =>
          chore.assignedMemberId === memberId
            ? [{ day: chore.day, name: choreNames.get(chore.choreTypeId) ?? "" }]
            : [],
        ),
        duties: duties.flatMap((duty) =>
          duty.memberId === memberId
            ? [{ day: duty.day, name: dutyNames.get(duty.dutyTypeId) ?? "" }]
            : [],
        ),
      },
      absences: absences.map(({ _id, date, kind, status }) => ({
        id: _id,
        date,
        kind,
        status,
      })),
    };
  },
});

export const setMemberDaysOffRemaining = mutation({
  args: {
    memberId: v.id("members"),
    daysOffRemaining: v.number(),
  },
  handler: async (ctx, { memberId, daysOffRemaining }) => {
    const { group } = await requireManager(ctx);
    if (!Number.isSafeInteger(daysOffRemaining) || daysOffRemaining < 0) {
      throw new Error("Remaining days off must be a non-negative whole number.");
    }
    const member = await ctx.db.get(memberId);
    if (!member || member.groupId !== group._id) {
      throw new Error("This member no longer exists.");
    }
    await ctx.db.patch(memberId, { daysOffRemaining });
  },
});

function isValidISODate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

function nextWeekStartISO(now: Date): string {
  const nextWeek = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - now.getUTCDay() + 7,
    ),
  );
  return nextWeek.toISOString().slice(0, 10);
}

function isNextWeekDate(date: string, now: Date): boolean {
  if (!isValidISODate(date)) {
    return false;
  }
  const start = new Date(`${nextWeekStartISO(now)}T00:00:00.000Z`).getTime();
  const value = new Date(`${date}T00:00:00.000Z`).getTime();
  return value >= start && value < start + 7 * 24 * 60 * 60 * 1000;
}

export const requestMemberDayOff = mutation({
  args: { memberId: v.id("members"), date: v.string() },
  handler: async (ctx, { memberId, date }) => {
    const { group, membership } = await requireGroup(ctx);
    if (membership.memberId !== memberId) {
      throw new Error("You can only request time off for your own member profile.");
    }
    if (!isNextWeekDate(date, new Date())) {
      throw new Error("Day-off requests can only be made for next week.");
    }
    const member = await ctx.db.get(memberId);
    if (!member || member.groupId !== group._id) {
      throw new Error("This member no longer exists.");
    }
    const existing = await ctx.db
      .query("memberAbsences")
      .withIndex("by_member_date", (q) =>
        q.eq("memberId", memberId).eq("date", date),
      )
      .collect();
    if (existing.some((absence) => absence.status !== "declined")) {
      throw new Error("An absence is already recorded for that date.");
    }
    const remaining = member.daysOffRemaining ?? 0;
    const pendingCount = (
      await ctx.db
        .query("memberAbsences")
        .withIndex("by_member_date", (q) => q.eq("memberId", memberId))
        .collect()
    ).filter(
      (absence) =>
        absence.kind === "day-off" && absence.status === "pending",
    ).length;
    if (remaining - pendingCount < 1) {
      throw new Error("No unreserved days off remain to request.");
    }
    await ctx.db.insert("memberAbsences", {
      groupId: group._id,
      memberId,
      date,
      kind: "day-off",
      status: "pending",
    });
  },
});

export const reportMemberSickDay = mutation({
  args: { memberId: v.id("members"), date: v.string() },
  handler: async (ctx, { memberId, date }) => {
    const { group, membership } = await requireGroup(ctx);
    if (membership.memberId !== memberId) {
      throw new Error("You can only report sick days for your own member profile.");
    }
    if (!isValidISODate(date)) {
      throw new Error("Choose a valid date for the sick-day report.");
    }
    if (date > new Date().toISOString().slice(0, 10)) {
      throw new Error("Sick days can only be reported for today or an earlier date.");
    }
    const member = await ctx.db.get(memberId);
    if (!member || member.groupId !== group._id) {
      throw new Error("This member no longer exists.");
    }
    const existing = await ctx.db
      .query("memberAbsences")
      .withIndex("by_member_date", (q) =>
        q.eq("memberId", memberId).eq("date", date),
      )
      .collect();
    if (existing.some((absence) => absence.status !== "declined")) {
      throw new Error("An absence is already recorded for that date.");
    }
    await ctx.db.insert("memberAbsences", {
      groupId: group._id,
      memberId,
      date,
      kind: "sick",
      status: "approved",
    });
  },
});

export const reviewMemberDayOffRequest = mutation({
  args: {
    absenceId: v.id("memberAbsences"),
    approve: v.boolean(),
  },
  handler: async (ctx, { absenceId, approve }) => {
    const { group } = await requireManager(ctx);
    const absence = await ctx.db.get(absenceId);
    if (
      !absence ||
      absence.groupId !== group._id ||
      absence.kind !== "day-off" ||
      absence.status !== "pending"
    ) {
      throw new Error("This day-off request is no longer pending.");
    }
    if (!approve) {
      await ctx.db.patch(absenceId, { status: "declined" });
      return;
    }
    if (absence.date < new Date().toISOString().slice(0, 10)) {
      throw new Error("Past day-off requests cannot be approved.");
    }
    const member = await ctx.db.get(absence.memberId);
    if (!member || member.groupId !== group._id) {
      throw new Error("This member no longer exists.");
    }
    const remaining = member.daysOffRemaining ?? 0;
    if (remaining < 1) {
      throw new Error("This member has no remaining days off.");
    }
    await ctx.db.patch(member._id, { daysOffRemaining: remaining - 1 });
    await ctx.db.patch(absenceId, { status: "approved" });
  },
});

export const saveSnapshot = mutation({
  args: snapshotValidator,
  handler: async (ctx, snapshot) => {
    const { group } = await requireManager(ctx);
    if (snapshot.memberIds.length !== snapshot.members.length) {
      throw new Error("Member identities do not match the member list.");
    }
    const uniqueNames = new Set<string>();
    for (const name of snapshot.members) {
      const normalizedName = normalizedMemberName(name);
      if (!normalizedName) {
        continue;
      }
      if (uniqueNames.has(normalizedName)) {
        throw new Error("Member names must be unique within a group.");
      }
      uniqueNames.add(normalizedName);
    }
    if (
      !Number.isFinite(snapshot.defaultChoreWeight) ||
      snapshot.defaultChoreWeight < 0 ||
      !Number.isFinite(snapshot.defaultDutyWeight) ||
      snapshot.defaultDutyWeight < 0
    ) {
      throw new Error("Default workload weights must be non-negative.");
    }

    for (const chore of snapshot.choreTypes) {
      if (!Number.isFinite(chore.weight) || chore.weight < 0) {
        throw new Error(`Chore weight for "${chore.name}" must be non-negative.`);
      }
    }
    for (const duty of snapshot.dutyTypes) {
      if (!Number.isFinite(duty.weight) || duty.weight < 0) {
        throw new Error(`Duty weight for "${duty.name}" must be non-negative.`);
      }
    }
    for (const duty of snapshot.duties) {
      const constraint = snapshot.memberConstraints.find(
        (entry) => entry.member.trim() === duty.member.trim(),
      );
      if (constraint?.blockedDuties.includes(duty.duty)) {
        throw new Error(
          `${duty.member} is not allowed to perform "${duty.duty}".`,
        );
      }
    }
    const assignmentsByDay = new Map<Weekday, typeof snapshot.assignments>();
    for (const day of weekDays) {
      const choresForDay = snapshot.chores.filter((chore) => chore.day === day);
      const assignmentsForDay = snapshot.assignments.filter(
        (assignment) => assignment.day === day,
      );
      if (
        choresForDay.length !== assignmentsForDay.length ||
        choresForDay.some(
          (chore, index) => chore.chore !== assignmentsForDay[index]?.chore,
        )
      ) {
        throw new Error("Chore assignments do not match the current schedule.");
      }
      assignmentsByDay.set(day, assignmentsForDay);

      const choresByMember = new Map<string, typeof assignmentsForDay>();
      for (const assignment of assignmentsForDay) {
        if (!assignment.member) continue;
        const member = snapshot.members.find(
          (name) => name.trim() === assignment.member,
        );
        if (!member) {
          throw new Error(`"${assignment.member}" is not a saved member.`);
        }
        const constraint = snapshot.memberConstraints.find(
          (entry) => entry.member.trim() === member,
        );
        if (constraint?.daysOff.includes(day)) {
          throw new Error(`${member} is unavailable on ${day}.`);
        }
        const assigned = choresByMember.get(member) ?? [];
        assigned.push(assignment);
        choresByMember.set(member, assigned);

        const memberDuties = snapshot.duties.filter(
          (duty) => duty.member.trim() === member,
        );
        const dutiesToday = memberDuties
          .filter((duty) => duty.day === day)
          .map((duty) =>
            snapshot.dutyTypes.find(
              (dutyType) => dutyType.name === duty.duty.trim(),
            ),
          )
          .filter((dutyType) => dutyType !== undefined);
        const nextDay = weekDays[weekDays.indexOf(day) + 1];
        const blockedByDuty =
          dutiesToday.some(
            (duty) =>
              duty.restriction === "unavailable-today" ||
              duty.restriction === "unavailable-today-and-previous-day" ||
              (duty.restriction === "only-selected-chores" &&
                !duty.allowedChores.includes(assignment.chore)),
          ) ||
          (nextDay !== undefined &&
            memberDuties.some(
              (duty) =>
                duty.day === nextDay &&
                snapshot.dutyTypes.find(
                  (dutyType) => dutyType.name === duty.duty.trim(),
                )?.restriction === "unavailable-today-and-previous-day",
            ));
        if (
          blockedByDuty ||
          constraint?.blockedChores.includes(assignment.chore) ||
          dutiesToday.some((duty) =>
            constraint?.blockedDuties.includes(duty.name),
          )
        ) {
          throw new Error(`${member} is not eligible for "${assignment.chore}" on ${day}.`);
        }
      }

      for (const [member, assigned] of choresByMember) {
        if (
          assigned.length > 1 &&
          assigned.some((assignment) =>
            snapshot.choreTypes.find(
              (choreType) => choreType.name === assignment.chore,
            )?.onePerMemberPerDay,
          )
        ) {
          throw new Error(
            `${member} cannot have multiple chores on ${day} because of a one-per-day restriction.`,
          );
        }
      }
    }

    const previousChores = (await ctx.db
      .query("chores")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect()).sort(
      (left, right) => left._creationTime - right._creationTime,
    );
    const previousMembers = await ctx.db
      .query("members")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const previousMemberNames = new Map(
      previousMembers.map((member) => [member._id, member.name]),
    );
    const previousChoreTypes = await ctx.db
      .query("choreTypes")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const previousChoreNames = new Map(
      previousChoreTypes.map((choreType) => [choreType._id, choreType.name]),
    );
    const previousAssignments = previousChores.map((chore) => ({
      day: chore.day,
      chore: previousChoreNames.get(chore.choreTypeId) ?? "",
      member: chore.assignedMemberId
        ? previousMemberNames.get(chore.assignedMemberId) ?? null
        : null,
    }));
    const currentAssignments = snapshot.assignments;
    const assignmentKey = (
      entries: typeof snapshot.assignments,
    ) =>
      JSON.stringify(
        [...entries]
          .map(({ day, chore, member }) => ({ day, chore, member }))
          .sort(
            (left, right) =>
              weekDays.indexOf(left.day) - weekDays.indexOf(right.day) ||
              left.chore.localeCompare(right.chore) ||
              (left.member ?? "").localeCompare(right.member ?? ""),
          ),
      );
    const scheduleChanged =
      previousAssignments.length > 0 &&
      assignmentKey(previousAssignments) !== assignmentKey(currentAssignments);

    const members = previousMembers;
    const memberIds = new Map<string, Id<"members">>();
    const retainedMemberIds = new Set<Id<"members">>();
    for (const [index, name] of snapshot.members.entries()) {
      const cleanName = name.trim();
      if (!cleanName) {
        if (snapshot.memberIds[index]) {
          throw new Error("Member names cannot be empty.");
        }
        continue;
      }
      const requestedId = snapshot.memberIds[index];
      const requestedMember = requestedId
        ? await ctx.db.get(requestedId)
        : null;
      if (requestedMember && requestedMember.groupId !== group._id) {
        throw new Error("A member belongs to a different group.");
      }
      const existing =
        requestedMember ??
        members.find(
          (member) =>
            member.name === cleanName && !retainedMemberIds.has(member._id),
        );
      const attendance =
        (requestedId
          ? snapshot.memberConstraints.find(
              (constraint) => constraint.memberId === requestedId,
            )
          : undefined) ??
        snapshot.memberConstraints.find(
          (constraint) => constraint.member.trim() === cleanName,
        );
      const memberId =
        existing?._id ??
        (await ctx.db.insert("members", {
          groupId: group._id,
          name: cleanName,
          daysOff: attendance?.daysOff,
        }));
      if (!memberIds.has(cleanName)) {
        memberIds.set(cleanName, memberId);
      }
      retainedMemberIds.add(memberId);
      if (
        existing &&
        (existing.name !== cleanName ||
          JSON.stringify(existing.daysOff ?? []) !==
            JSON.stringify(attendance?.daysOff ?? []))
      ) {
        await ctx.db.patch(existing._id, {
          groupId: group._id,
          name: cleanName,
          daysOff: attendance?.daysOff,
        });
      }
    }
    for (const member of members) {
      if (!retainedMemberIds.has(member._id)) {
        const memberships = await ctx.db
          .query("groupMemberships")
          .withIndex("by_member", (q) => q.eq("memberId", member._id))
          .collect();
        if (memberships.some((membership) => membership.role === "manager")) {
          throw new Error("The group manager profile cannot be removed.");
        }
        const absences = await ctx.db
          .query("memberAbsences")
          .withIndex("by_member_date", (q) => q.eq("memberId", member._id))
          .collect();
        for (const absence of absences) {
          await ctx.db.delete(absence._id);
        }
        for (const membership of memberships) {
          await ctx.db.delete(membership._id);
        }
        await ctx.db.delete(member._id);
      }
    }

    const choreTypeDocuments = await ctx.db
      .query("choreTypes")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const choreTypesByName = new Map(
      choreTypeDocuments.map((chore) => [chore.name, chore]),
    );
    const choreTypeIds = new Map<string, Id<"choreTypes">>();
    for (const chore of snapshot.choreTypes) {
      const name = chore.name.trim();
      if (!name || choreTypeIds.has(name)) {
        continue;
      }
      const existing = choreTypesByName.get(name);
      const id = existing?._id ?? (await ctx.db.insert("choreTypes", {
        groupId: group._id,
        name,
        weight: chore.weight,
        onePerMemberPerDay: chore.onePerMemberPerDay,
      }));
      if (
        existing &&
        (existing.weight !== chore.weight ||
          (existing.onePerMemberPerDay ?? false) !== chore.onePerMemberPerDay)
      ) {
        await ctx.db.patch(existing._id, {
          weight: chore.weight,
          onePerMemberPerDay: chore.onePerMemberPerDay,
        });
      }
      choreTypeIds.set(name, id);
    }
    for (const chore of choreTypeDocuments) {
      if (!choreTypeIds.has(chore.name)) {
        await ctx.db.delete(chore._id);
      }
    }

    const dutyTypeDocuments = await ctx.db
      .query("dutyTypes")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const dutyTypesByName = new Map(
      dutyTypeDocuments.map((duty) => [duty.name, duty]),
    );
    const dutyTypeIds = new Map<string, Id<"dutyTypes">>();
    for (const duty of snapshot.dutyTypes) {
      const name = duty.name.trim();
      if (!name || dutyTypeIds.has(name)) {
        continue;
      }
      const allowedChores = duty.allowedChores.filter((chore) =>
        choreTypeIds.has(chore),
      );
      const existing = dutyTypesByName.get(name);
      const id =
        existing?._id ??
        (await ctx.db.insert("dutyTypes", {
          groupId: group._id,
          name,
          weight: duty.weight,
          restriction: duty.restriction,
          allowedChores,
        }));
      if (
        existing &&
        (existing.weight !== duty.weight ||
          existing.restriction !== duty.restriction ||
          JSON.stringify(existing.allowedChores) !== JSON.stringify(allowedChores))
      ) {
        await ctx.db.patch(existing._id, {
          weight: duty.weight,
          restriction: duty.restriction,
          allowedChores,
        });
      }
      dutyTypeIds.set(name, id);
    }
    for (const duty of dutyTypeDocuments) {
      if (!dutyTypeIds.has(duty.name)) {
        await ctx.db.delete(duty._id);
      }
    }

    const chores = await ctx.db
      .query("chores")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    chores.sort((left, right) => left._creationTime - right._creationTime);
    const retainedChoreIds = new Set<Id<"chores">>();
    const choreOccurrences = new Map<string, number>();
    for (const chore of snapshot.chores) {
      const occurrenceKey = `${chore.day}\u0000${chore.chore.trim()}`;
      const occurrence = choreOccurrences.get(occurrenceKey) ?? 0;
      choreOccurrences.set(occurrenceKey, occurrence + 1);
      const choreTypeId = choreTypeIds.get(chore.chore.trim());
      if (!choreTypeId) {
        continue;
      }
      const assignment = assignmentsByDay
        .get(chore.day)
        ?.filter((entry) => entry.chore === chore.chore.trim())[occurrence];
      const assignedMemberId = assignment?.member
        ? memberIds.get(assignment.member)
        : undefined;
      const existing = chores.find(
        (entry) =>
          !retainedChoreIds.has(entry._id) &&
          entry.day === chore.day &&
          entry.choreTypeId === choreTypeId,
      );
      if (existing) {
        retainedChoreIds.add(existing._id);
        if (existing.assignedMemberId !== assignedMemberId) {
          await ctx.db.patch(existing._id, { assignedMemberId });
        }
      } else {
        const id = await ctx.db.insert("chores", {
          groupId: group._id,
          day: chore.day,
          choreTypeId,
          ...(assignedMemberId ? { assignedMemberId } : {}),
        });
        retainedChoreIds.add(id);
      }
    }
    for (const chore of chores) {
      if (!retainedChoreIds.has(chore._id)) {
        await ctx.db.delete(chore._id);
      }
    }

    const duties = await ctx.db
      .query("duties")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const retainedDutyIds = new Set<Id<"duties">>();
    for (const duty of snapshot.duties) {
      const memberId = memberIds.get(duty.member.trim());
      const dutyTypeId = dutyTypeIds.get(duty.duty.trim());
      if (memberId && dutyTypeId) {
        const attendance = snapshot.memberConstraints.find(
          (constraint) => constraint.member.trim() === duty.member.trim(),
        );
        if (attendance?.daysOff.includes(duty.day)) {
          throw new Error(
            `${duty.member} is marked unavailable on ${duty.day} and cannot be assigned a duty.`,
          );
        }
        const existing = duties.find(
          (entry) =>
            !retainedDutyIds.has(entry._id) &&
            entry.day === duty.day &&
            entry.memberId === memberId &&
            entry.dutyTypeId === dutyTypeId,
        );
        if (existing) {
          retainedDutyIds.add(existing._id);
        } else {
          const id = await ctx.db.insert("duties", {
            groupId: group._id,
            day: duty.day,
            memberId,
            dutyTypeId,
          });
          retainedDutyIds.add(id);
        }
      }
    }
    for (const duty of duties) {
      if (!retainedDutyIds.has(duty._id)) {
        await ctx.db.delete(duty._id);
      }
    }

    const constraintDocuments = await ctx.db
      .query("memberConstraints")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const constraintsByMember = new Map(
      constraintDocuments.map((constraint) => [
        constraint.memberId,
        constraint,
      ]),
    );
    const retainedConstraintIds = new Set<Id<"memberConstraints">>();
    for (const constraint of snapshot.memberConstraints) {
      const memberId =
        constraint.memberId ?? memberIds.get(constraint.member.trim());
      if (!memberId) {
        continue;
      }
      const blockedDuties = constraint.blockedDuties.filter((name) =>
        dutyTypeIds.has(name),
      );
      const blockedChores = constraint.blockedChores.filter((name) =>
        choreTypeIds.has(name),
      );
      const existing = constraintsByMember.get(memberId);
      if (existing) {
        await ctx.db.patch(existing._id, { blockedDuties, blockedChores });
        retainedConstraintIds.add(existing._id);
      } else {
        const id = await ctx.db.insert("memberConstraints", {
          groupId: group._id,
          memberId,
          blockedDuties,
          blockedChores,
        });
        retainedConstraintIds.add(id);
      }
    }
    for (const constraint of constraintDocuments) {
      if (!retainedConstraintIds.has(constraint._id)) {
        await ctx.db.delete(constraint._id);
      }
    }

    const currentDuties = duties;
    const currentDutyTypes = dutyTypeDocuments;
    const currentDutyTypesById = new Map(
      currentDutyTypes.map((dutyType) => [dutyType._id, dutyType]),
    );
    const currentMemberConstraints = await ctx.db
      .query("memberConstraints")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const currentConstraintsByMember = new Map(
      currentMemberConstraints.map((constraint) => [
        constraint.memberId,
        constraint,
      ]),
    );
    const memberIdsInDatabase = retainedMemberIds;
    const currentMembersById = new Map(
      members.map((member) => [member._id, member]),
    );
    const choreTypesById = new Map(
      choreTypeDocuments.map((choreType) => [
        choreType._id,
        choreType,
      ]),
    );
    const choresWithAssignments = chores;
    for (const chore of choresWithAssignments) {
      const memberId = chore.assignedMemberId;
      if (!memberId) {
        continue;
      }
      const choreType = choreTypesById.get(chore.choreTypeId);
      const choreName = choreType?.name;
      const member = currentMembersById.get(memberId);
      const constraint = currentConstraintsByMember.get(memberId);
      const memberDuties = currentDuties.filter(
        (duty) => duty.memberId === memberId,
      );
      const otherAssignedChores = choresWithAssignments.filter(
        (other) =>
          other._id !== chore._id &&
          other.day === chore.day &&
          other.assignedMemberId === memberId,
      );
      const dutiesToday = memberDuties
        .filter((duty) => duty.day === chore.day)
        .map((duty) => currentDutyTypesById.get(duty.dutyTypeId))
        .filter((dutyType) => dutyType !== undefined);
      const nextDay = weekDays[weekDays.indexOf(chore.day) + 1];
      const eligible =
        memberIdsInDatabase.has(memberId) &&
        !member?.daysOff?.includes(chore.day) &&
        choreName !== undefined &&
        !constraint?.blockedChores.includes(choreName) &&
        !memberDuties.some((duty) =>
          constraint?.blockedDuties.includes(
            currentDutyTypesById.get(duty.dutyTypeId)?.name ?? "",
          ),
        ) &&
        !dutiesToday.some(
          (dutyType) =>
            dutyType.restriction === "unavailable-today" ||
            dutyType.restriction === "unavailable-today-and-previous-day" ||
            (dutyType.restriction === "only-selected-chores" &&
              !dutyType.allowedChores.includes(choreName)),
        ) &&
        !(nextDay !== undefined &&
          memberDuties.some(
            (duty) =>
              duty.day === nextDay &&
              currentDutyTypesById.get(duty.dutyTypeId)?.restriction ===
                "unavailable-today-and-previous-day",
          )) &&
        !(
          choreType?.onePerMemberPerDay ||
          otherAssignedChores.some(
            (other) =>
              choreTypesById.get(other.choreTypeId)?.onePerMemberPerDay,
          )
        );
      if (!eligible) {
        await ctx.db.patch(chore._id, { assignedMemberId: undefined });
      }
    }

    const settings = await ctx.db
      .query("schedulerSettings")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const settingsDocument = settings[0];
    const settingValues = {
      defaultChoreWeight: snapshot.defaultChoreWeight,
      defaultDutyWeight: snapshot.defaultDutyWeight,
    };
    if (settingsDocument) {
      await ctx.db.patch(settingsDocument._id, settingValues);
      for (const duplicate of settings.slice(1)) {
        await ctx.db.delete(duplicate._id);
      }
    } else {
      await ctx.db.insert("schedulerSettings", {
        ...settingValues,
        groupId: group._id,
      });
    }
    if (scheduleChanged) {
      await ctx.db.insert("savedSchedules", {
        groupId: group._id,
        savedAt: Date.now(),
        assignments: currentAssignments,
      });
    }
  },
});

export const saveAssignments = mutation({
  args: {
    assignments: v.array(
      v.object({
        day: weekDay,
        chore: v.string(),
        member: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, { assignments }) => {
    const { group } = await requireManager(ctx);
    const [
      members,
      choreTypes,
      dutyTypes,
      chores,
      duties,
      memberConstraints,
    ] = await Promise.all([
      ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("choreTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("dutyTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("chores").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("duties").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("memberConstraints").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ]);
    const membersByName = new Map(members.map((member) => [member.name, member]));
    const choreTypesById = new Map(
      choreTypes.map((choreType) => [choreType._id, choreType]),
    );
    const dutyTypesById = new Map(
      dutyTypes.map((dutyType) => [dutyType._id, dutyType]),
    );
    const constraintsByMemberId = new Map(
      memberConstraints.map((constraint) => [constraint.memberId, constraint]),
    );
    const choresByDay = new Map<Weekday, typeof chores>();
    for (const day of weekDays) {
      choresByDay.set(
        day,
        chores
          .filter((chore) => chore.day === day)
          .sort((left, right) => left._creationTime - right._creationTime),
      );
    }
    const assignmentsByDay = new Map<Weekday, typeof assignments>();
    for (const day of weekDays) {
      assignmentsByDay.set(
        day,
        assignments.filter((assignment) => assignment.day === day),
      );
    }
    const nextDayFor = new Map(
      weekDays.map((day, index) => [day, weekDays[index + 1]]),
    );

    for (const day of weekDays) {
      const dayChores = choresByDay.get(day) ?? [];
      const dayAssignments = assignmentsByDay.get(day) ?? [];
      if (dayChores.length !== dayAssignments.length) {
        throw new Error("The chore list changed. Reload before saving assignments.");
      }

      for (const [index, chore] of dayChores.entries()) {
        const assignment = dayAssignments[index];
        const choreType = choreTypesById.get(chore.choreTypeId);
        if (assignment.chore !== choreType?.name) {
          throw new Error("The chore list changed. Reload before saving assignments.");
        }

        if (assignment.member === null) {
          continue;
        }
        const member = membersByName.get(assignment.member);
        if (!member) {
          throw new Error(`"${assignment.member}" is not a saved member.`);
        }
        if (member.daysOff?.includes(day)) {
          throw new Error(`${assignment.member} is unavailable on ${day}.`);
        }
        if (
          dayAssignments.some((other, otherIndex) => {
            if (otherIndex === index || other.member !== assignment.member) {
              return false;
            }
            const otherChore = dayChores[otherIndex];
            return choreTypesById.get(otherChore.choreTypeId)
              ?.onePerMemberPerDay;
          }) ||
          (choreType?.onePerMemberPerDay &&
            dayAssignments.some(
              (other, otherIndex) =>
                otherIndex !== index && other.member === assignment.member,
            ))
        ) {
          throw new Error(
            `${assignment.member} cannot have multiple chores on ${day} because of a one-per-day restriction.`,
          );
        }
        const memberDuties = duties.filter(
          (duty) => duty.memberId === member._id,
        );
        const sameDayDuties = memberDuties
          .filter((duty) => duty.day === day)
          .map((duty) => dutyTypesById.get(duty.dutyTypeId))
          .filter((dutyType) => dutyType !== undefined);
        const nextDay = nextDayFor.get(day);
        const restrictedByNextDay =
          nextDay !== undefined &&
          memberDuties.some(
            (duty) =>
              duty.day === nextDay &&
              dutyTypesById.get(duty.dutyTypeId)?.restriction ===
                "unavailable-today-and-previous-day",
          );
        const restrictedToday = sameDayDuties.some(
          (dutyType) =>
            dutyType.restriction === "unavailable-today" ||
            dutyType.restriction === "unavailable-today-and-previous-day" ||
            (dutyType.restriction === "only-selected-chores" &&
              !dutyType.allowedChores.includes(assignment.chore)),
        );
        const memberConstraint = constraintsByMemberId.get(member._id);
        const restrictedByMemberPreference =
          memberConstraint?.blockedChores.includes(assignment.chore) ||
          sameDayDuties.some((dutyType) =>
            memberConstraint?.blockedDuties.includes(dutyType.name),
          );
        if (
          restrictedByNextDay ||
          restrictedToday ||
          restrictedByMemberPreference
        ) {
          throw new Error(
            `${assignment.member} cannot do "${assignment.chore}" on ${day} because of their restrictions.`,
          );
        }
      }
    }

    for (const day of weekDays) {
      const dayChores = choresByDay.get(day) ?? [];
      const dayAssignments = assignmentsByDay.get(day) ?? [];
      for (const [index, chore] of dayChores.entries()) {
        const memberName = dayAssignments[index].member;
        await ctx.db.patch(chore._id, {
          assignedMemberId:
            memberName === null ? undefined : membersByName.get(memberName)?._id,
        });
      }
    }
  },
});

export const setAssignment = mutation({
  args: {
    day: weekDay,
    index: v.number(),
    chore: v.string(),
    member: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { day, index, chore, member }) => {
    const { group } = await requireManager(ctx);
    const groupChores = await ctx.db
      .query("chores")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const dayChores = groupChores.filter((entry) => entry.day === day).sort(
      (left, right) => left._creationTime - right._creationTime,
    );
    const target = dayChores[index];
    const choreTypeDocument = target
      ? await ctx.db.get(target.choreTypeId)
      : null;
    if (!target || choreTypeDocument?.name !== chore) {
      throw new Error(
        "The chore list changed. Reload before editing assignments.",
      );
    }

    if (member === null) {
      await ctx.db.patch(target._id, { assignedMemberId: undefined });
      return;
    }

    const memberDocument = groupChores.length
      ? await ctx.db
          .query("members")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .filter((q) => q.eq(q.field("name"), member))
          .first()
      : null;
    if (!memberDocument) {
      throw new Error(`"${member}" is not a saved member.`);
    }
    if (memberDocument.daysOff?.includes(day)) {
      throw new Error(`${member} is marked unavailable on ${day}.`);
    }
    const [dutyTypes, duties] = await Promise.all([
      ctx.db.query("dutyTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("duties").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ]);
    const assignedOnDay = dayChores.filter(
      (entry, choreIndex) =>
        choreIndex !== index &&
        entry.assignedMemberId === memberDocument._id,
    );
    const choreTypesForDay = await Promise.all(
      dayChores.map((entry) => ctx.db.get(entry.choreTypeId)),
    );
    if (
      choreTypesForDay[index]?.onePerMemberPerDay ||
      assignedOnDay.some((entry) => {
        const otherIndex = dayChores.findIndex(
          (dayChore) => dayChore._id === entry._id,
        );
        return choreTypesForDay[otherIndex]?.onePerMemberPerDay;
      })
    ) {
      throw new Error(
        `${member} cannot be assigned this chore because it has a one-per-day restriction.`,
      );
    }
    const memberConstraint = await ctx.db
      .query("memberConstraints")
      .withIndex("by_member", (query) =>
        query.eq("memberId", memberDocument._id),
      )
      .first();
    const dutyTypesById = new Map(
      dutyTypes.map((dutyType) => [dutyType._id, dutyType]),
    );
    const memberDuties = duties.filter(
      (duty) => duty.memberId === memberDocument._id,
    );
    const sameDayDuties = memberDuties
      .filter((duty) => duty.day === day)
      .map((duty) => dutyTypesById.get(duty.dutyTypeId))
      .filter((dutyType) => dutyType !== undefined);
    const nextDay = weekDays[weekDays.indexOf(day) + 1];
    const restrictedByNextDay =
      nextDay !== undefined &&
      memberDuties.some(
        (duty) =>
          duty.day === nextDay &&
          dutyTypesById.get(duty.dutyTypeId)?.restriction ===
            "unavailable-today-and-previous-day",
      );
    const restrictedToday = sameDayDuties.some(
      (dutyType) =>
        dutyType.restriction === "unavailable-today" ||
        dutyType.restriction === "unavailable-today-and-previous-day" ||
        (dutyType.restriction === "only-selected-chores" &&
          !dutyType.allowedChores.includes(choreTypeDocument.name)),
    );
    const restrictedByMemberPreference =
      memberConstraint?.blockedChores.includes(choreTypeDocument.name) ||
      sameDayDuties.some((dutyType) =>
        memberConstraint?.blockedDuties.includes(dutyType.name),
      );
    if (restrictedToday || restrictedByNextDay || restrictedByMemberPreference) {
      throw new Error(
        `${member} cannot do "${chore}" on ${day} because of their restrictions.`,
      );
    }

    await ctx.db.patch(target._id, { assignedMemberId: memberDocument._id });
  },
});

export const getSavedSchedules = query({
  args: {},
  handler: async (ctx) => {
    const { group } = await requireGroup(ctx);
    const schedules = await ctx.db
      .query("savedSchedules")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    return schedules
      .sort((left, right) => right.savedAt - left.savedAt)
      .map(({ _id, savedAt, assignments }) => ({
      id: _id,
      savedAt,
      assignments,
      }));
  },
});

export const deleteSavedSchedule = mutation({
  args: { scheduleId: v.id("savedSchedules") },
  handler: async (ctx, { scheduleId }) => {
    const { group } = await requireManager(ctx);
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule || schedule.groupId !== group._id) {
      throw new Error("This saved week no longer exists.");
    }
    await ctx.db.delete(scheduleId);
  },
});

export const saveScheduleHistory = mutation({
  args: {
    assignments: v.array(
      v.object({
        day: weekDay,
        chore: v.string(),
        member: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, { assignments }) => {
    const { group } = await requireManager(ctx);
    const [members, choreTypes, chores, dutyTypes, duties, memberConstraints] =
      await Promise.all([
      ctx.db.query("members").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("choreTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("chores").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("dutyTypes").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("duties").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
      ctx.db.query("memberConstraints").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ]);
    const membersByName = new Map(members.map((member) => [member.name, member]));
    const dutyTypesById = new Map(
      dutyTypes.map((dutyType) => [dutyType._id, dutyType]),
    );
    const constraintsByMemberId = new Map(
      memberConstraints.map((constraint) => [constraint.memberId, constraint]),
    );
    const choreNamesById = new Map(
      choreTypes.map((choreType) => [choreType._id, choreType.name]),
    );
    const choreTypesByName = new Map(
      choreTypes.map((choreType) => [choreType.name, choreType]),
    );
    const assignmentsByDay = new Map<Weekday, typeof assignments>();
    for (const day of weekDays) {
      assignmentsByDay.set(
        day,
        assignments.filter((assignment) => assignment.day === day),
      );
      const existing = chores.filter((chore) => chore.day === day);
      const requested = assignmentsByDay.get(day) ?? [];
      const existingNames = existing
        .map((chore) => choreNamesById.get(chore.choreTypeId) ?? "")
        .sort();
      const requestedNames = requested.map(({ chore }) => chore).sort();
      if (
        existingNames.length !== requestedNames.length ||
        existingNames.some((name, index) => name !== requestedNames[index])
      ) {
        throw new Error("The chore list changed. Reload before saving the week.");
      }
      for (let index = 0; index < existing.length; index++) {
        const choreName = choreNamesById.get(existing[index].choreTypeId);
        const occurrence = existing
          .slice(0, index + 1)
          .filter(
            (entry) =>
              choreNamesById.get(entry.choreTypeId) === choreName,
          ).length;
        const assignment = requested.filter(
          (entry) => entry.chore === choreName,
        )[occurrence - 1];
        if (!assignment?.member) {
          continue;
        }
        const member = membersByName.get(assignment.member);
        if (!member) {
          throw new Error(`"${assignment.member}" is not a saved member.`);
        }
        if (member.daysOff?.includes(day)) {
          throw new Error(`${assignment.member} is unavailable on ${day}.`);
        }
        const sameMemberAssignments = requested.filter(
          (entry) => entry.member === assignment.member,
        );
        if (
          sameMemberAssignments.length > 1 &&
          sameMemberAssignments.some(
            (entry) =>
              choreTypesByName.get(entry.chore)?.onePerMemberPerDay,
          )
        ) {
          throw new Error(
            `${assignment.member} cannot have multiple chores on ${day} because of a one-per-day restriction.`,
          );
        }
        const memberDuties = duties.filter(
          (duty) => duty.memberId === member._id,
        );
        const sameDayDuties = memberDuties
          .filter((duty) => duty.day === day)
          .map((duty) => dutyTypesById.get(duty.dutyTypeId))
          .filter((dutyType) => dutyType !== undefined);
        const nextDay = weekDays[weekDays.indexOf(day) + 1];
        const dutyRestricted =
          sameDayDuties.some(
            (dutyType) =>
              dutyType.restriction === "unavailable-today" ||
              dutyType.restriction === "unavailable-today-and-previous-day" ||
              (dutyType.restriction === "only-selected-chores" &&
                !dutyType.allowedChores.includes(assignment.chore)),
          ) ||
          (nextDay !== undefined &&
            memberDuties.some(
              (duty) =>
                duty.day === nextDay &&
                dutyTypesById.get(duty.dutyTypeId)?.restriction ===
                  "unavailable-today-and-previous-day",
            ));
        const constraint = constraintsByMemberId.get(member._id);
        if (
          dutyRestricted ||
          constraint?.blockedChores.includes(assignment.chore) ||
          sameDayDuties.some((dutyType) =>
            constraint?.blockedDuties.includes(dutyType.name),
          )
        ) {
          throw new Error(
            `${assignment.member} is not eligible for "${assignment.chore}" on ${day}.`,
          );
        }
      }
    }

    for (const day of weekDays) {
      const existing = chores.filter((chore) => chore.day === day);
      const requested = assignmentsByDay.get(day) ?? [];
      for (let index = 0; index < existing.length; index++) {
        const choreName = choreNamesById.get(existing[index].choreTypeId);
        const occurrence = existing
          .slice(0, index + 1)
          .filter(
            (entry) =>
              choreNamesById.get(entry.choreTypeId) === choreName,
          ).length;
        const memberName = requested.filter(
          (entry) => entry.chore === choreName,
        )[occurrence - 1].member;
        await ctx.db.patch(existing[index]._id, {
          assignedMemberId:
            memberName === null
              ? undefined
              : membersByName.get(memberName)?._id,
        });
      }
    }

    await ctx.db.insert("savedSchedules", {
      groupId: group._id,
      savedAt: Date.now(),
      assignments,
    });
  },
});

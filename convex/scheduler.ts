import { v } from "convex/values";
import {
  defaultWorkloadWeights,
  weekDays,
  type Weekday,
} from "../lib/types";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

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
  duties: v.array(
    v.object({ day: weekDay, member: v.string(), duty: v.string() }),
  ),
  memberConstraints: v.array(
    v.object({
      member: v.string(),
      blockedDuties: v.array(v.string()),
      blockedChores: v.array(v.string()),
      daysOff: v.array(weekDay),
    }),
  ),
  defaultChoreWeight: v.number(),
  defaultDutyWeight: v.number(),
};

export const getSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const [
      members,
      choreTypes,
      dutyTypes,
      chores,
      duties,
      memberConstraints,
      settings,
    ] = await Promise.all([
      ctx.db.query("members").collect(),
      ctx.db.query("choreTypes").collect(),
      ctx.db.query("dutyTypes").collect(),
      ctx.db.query("chores").collect(),
      ctx.db.query("duties").collect(),
      ctx.db.query("memberConstraints").collect(),
      ctx.db.query("schedulerSettings").first(),
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

export const saveSnapshot = mutation({
  args: snapshotValidator,
  handler: async (ctx, snapshot) => {
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

    const members = await ctx.db.query("members").collect();
    const membersByName = new Map(members.map((member) => [member.name, member]));
    const memberIds = new Map<string, Id<"members">>();
    for (const name of snapshot.members) {
      const cleanName = name.trim();
      if (!cleanName || memberIds.has(cleanName)) {
        continue;
      }
      const existing = membersByName.get(cleanName);
      const attendance = snapshot.memberConstraints.find(
        (constraint) => constraint.member.trim() === cleanName,
      );
      const memberId =
        existing?._id ??
        (await ctx.db.insert("members", {
          name: cleanName,
          daysOff: attendance?.daysOff,
        }));
      memberIds.set(cleanName, memberId);
      if (
        existing &&
        JSON.stringify(existing.daysOff ?? []) !==
          JSON.stringify(attendance?.daysOff ?? [])
      ) {
        await ctx.db.patch(existing._id, { daysOff: attendance?.daysOff });
      }
    }
    for (const member of members) {
      if (!memberIds.has(member.name)) {
        await ctx.db.delete(member._id);
      }
    }

    const choreTypeDocuments = await ctx.db.query("choreTypes").collect();
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

    const dutyTypeDocuments = await ctx.db.query("dutyTypes").collect();
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

    const chores = await ctx.db.query("chores").collect();
    const retainedChoreIds = new Set<Id<"chores">>();
    for (const chore of snapshot.chores) {
      const choreTypeId = choreTypeIds.get(chore.chore.trim());
      if (!choreTypeId) {
        continue;
      }
      const existing = chores.find(
        (entry) =>
          !retainedChoreIds.has(entry._id) &&
          entry.day === chore.day &&
          entry.choreTypeId === choreTypeId,
      );
      if (existing) {
        retainedChoreIds.add(existing._id);
      } else {
        const id = await ctx.db.insert("chores", {
          day: chore.day,
          choreTypeId,
        });
        retainedChoreIds.add(id);
      }
    }
    for (const chore of chores) {
      if (!retainedChoreIds.has(chore._id)) {
        await ctx.db.delete(chore._id);
      }
    }

    const duties = await ctx.db.query("duties").collect();
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
      .collect();
    const constraintsByMember = new Map(
      constraintDocuments.map((constraint) => [
        constraint.memberId,
        constraint,
      ]),
    );
    const retainedConstraintIds = new Set<Id<"memberConstraints">>();
    for (const constraint of snapshot.memberConstraints) {
      const memberId = memberIds.get(constraint.member.trim());
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

    const currentDuties = await ctx.db.query("duties").collect();
    const currentDutyTypes = await ctx.db.query("dutyTypes").collect();
    const currentDutyTypesById = new Map(
      currentDutyTypes.map((dutyType) => [dutyType._id, dutyType]),
    );
    const currentMemberConstraints = await ctx.db
      .query("memberConstraints")
      .collect();
    const currentConstraintsByMember = new Map(
      currentMemberConstraints.map((constraint) => [
        constraint.memberId,
        constraint,
      ]),
    );
    const memberIdsInDatabase = new Set(memberIds.values());
    const currentMembersById = new Map(
      members.map((member) => [member._id, member]),
    );
    const choreTypesById = new Map(
      (await ctx.db.query("choreTypes").collect()).map((choreType) => [
        choreType._id,
        choreType,
      ]),
    );
    const choresWithAssignments = await ctx.db.query("chores").collect();
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

    const settings = await ctx.db.query("schedulerSettings").collect();
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
      await ctx.db.insert("schedulerSettings", settingValues);
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
    const [
      members,
      choreTypes,
      dutyTypes,
      chores,
      duties,
      memberConstraints,
    ] = await Promise.all([
      ctx.db.query("members").collect(),
      ctx.db.query("choreTypes").collect(),
      ctx.db.query("dutyTypes").collect(),
      ctx.db.query("chores").collect(),
      ctx.db.query("duties").collect(),
      ctx.db.query("memberConstraints").collect(),
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
    const dayChores = (await ctx.db
      .query("chores")
      .withIndex("by_day", (query) => query.eq("day", day))
      .collect()).sort(
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

    const memberDocument = await ctx.db
      .query("members")
      .withIndex("by_name", (query) => query.eq("name", member))
      .first();
    if (!memberDocument) {
      throw new Error(`"${member}" is not a saved member.`);
    }
    if (memberDocument.daysOff?.includes(day)) {
      throw new Error(`${member} is marked unavailable on ${day}.`);
    }
    const [dutyTypes, duties] = await Promise.all([
      ctx.db.query("dutyTypes").collect(),
      ctx.db.query("duties").collect(),
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
    const schedules = await ctx.db
      .query("savedSchedules")
      .withIndex("by_saved_at")
      .order("desc")
      .collect();
    return schedules.map(({ _id, savedAt, assignments }) => ({
      id: _id,
      savedAt,
      assignments,
    }));
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
    const [members, choreTypes, chores, dutyTypes, duties, memberConstraints] =
      await Promise.all([
      ctx.db.query("members").collect(),
      ctx.db.query("choreTypes").collect(),
      ctx.db.query("chores").collect(),
      ctx.db.query("dutyTypes").collect(),
      ctx.db.query("duties").collect(),
      ctx.db.query("memberConstraints").collect(),
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
      savedAt: Date.now(),
      assignments,
    });
  },
});

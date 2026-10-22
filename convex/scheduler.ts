import { v } from "convex/values";
import { defaultWorkloadWeights } from "../lib/assignChores";
import type { Weekday } from "../lib/assignChores";
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
    v.object({ name: v.string(), weight: v.number() }),
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
      settings,
    ] = await Promise.all([
      ctx.db.query("members").collect(),
      ctx.db.query("choreTypes").collect(),
      ctx.db.query("dutyTypes").collect(),
      ctx.db.query("chores").collect(),
      ctx.db.query("duties").collect(),
      ctx.db.query("schedulerSettings").first(),
    ]);

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
      }
    }

    return {
      people: members.map((member) => member.name),
      tasks: tasksByDay,
      chores: choresByDay,
      weights: {
        chores: Object.fromEntries(
          choreTypes.map((chore) => [chore.name, chore.weight]),
        ),
        tasks: Object.fromEntries(
          dutyTypes.map((duty) => [duty.name, duty.weight]),
        ),
        defaultChoreWeight:
          settings?.defaultChoreWeight ??
          defaultWorkloadWeights.defaultChoreWeight,
        defaultTaskWeight:
          settings?.defaultDutyWeight ??
          defaultWorkloadWeights.defaultTaskWeight,
      },
      rules: {
        tasks: Object.fromEntries(
          dutyTypes.map((duty) => [
            duty.name,
            {
              restriction: duty.restriction,
              allowedChores: duty.allowedChores,
            },
          ]),
        ),
      },
    };
  },
});

export const saveSnapshot = mutation({
  args: snapshotValidator,
  handler: async (ctx, snapshot) => {
    for (const table of [
      "chores",
      "duties",
      "members",
      "choreTypes",
      "dutyTypes",
      "schedulerSettings",
    ] as const) {
      const documents = await ctx.db.query(table).collect();
      for (const document of documents) {
        await ctx.db.delete(document._id);
      }
    }

    const memberIds = new Map<string, Id<"members">>();
    for (const name of snapshot.members) {
      const cleanName = name.trim();
      if (!cleanName || memberIds.has(cleanName)) {
        continue;
      }
      memberIds.set(cleanName, await ctx.db.insert("members", { name: cleanName }));
    }

    const choreTypeIds = new Map<string, Id<"choreTypes">>();
    for (const chore of snapshot.choreTypes) {
      const name = chore.name.trim();
      if (!name || choreTypeIds.has(name)) {
        continue;
      }
      if (!Number.isFinite(chore.weight) || chore.weight < 0) {
        throw new Error(`Chore weight for "${name}" must be non-negative.`);
      }
      choreTypeIds.set(
        name,
        await ctx.db.insert("choreTypes", { name, weight: chore.weight }),
      );
    }

    const dutyTypeIds = new Map<string, Id<"dutyTypes">>();
    for (const duty of snapshot.dutyTypes) {
      const name = duty.name.trim();
      if (!name || dutyTypeIds.has(name)) {
        continue;
      }
      if (!Number.isFinite(duty.weight) || duty.weight < 0) {
        throw new Error(`Duty weight for "${name}" must be non-negative.`);
      }
      dutyTypeIds.set(
        name,
        await ctx.db.insert("dutyTypes", {
          name,
          weight: duty.weight,
          restriction: duty.restriction,
          allowedChores: duty.allowedChores.filter((chore) =>
            choreTypeIds.has(chore),
          ),
        }),
      );
    }

    for (const chore of snapshot.chores) {
      const choreTypeId = choreTypeIds.get(chore.chore);
      if (choreTypeId) {
        await ctx.db.insert("chores", {
          day: chore.day,
          choreTypeId,
        });
      }
    }

    for (const duty of snapshot.duties) {
      const memberId = memberIds.get(duty.member);
      const dutyTypeId = dutyTypeIds.get(duty.duty);
      if (memberId && dutyTypeId) {
        await ctx.db.insert("duties", {
          day: duty.day,
          memberId,
          dutyTypeId,
        });
      }
    }

    if (
      !Number.isFinite(snapshot.defaultChoreWeight) ||
      snapshot.defaultChoreWeight < 0 ||
      !Number.isFinite(snapshot.defaultDutyWeight) ||
      snapshot.defaultDutyWeight < 0
    ) {
      throw new Error("Default workload weights must be non-negative.");
    }
    await ctx.db.insert("schedulerSettings", {
      defaultChoreWeight: snapshot.defaultChoreWeight,
      defaultDutyWeight: snapshot.defaultDutyWeight,
    });
  },
});

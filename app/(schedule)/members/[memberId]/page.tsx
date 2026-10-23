"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/app/(schedule)/_components/ui";
import { useScheduler } from "@/app/scheduler-context";
import { dayNames, weekDays, type Weekday } from "@/lib/types";

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function startOfCurrentWeek(from: Date): Date {
  const sunday = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  return sunday;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfNextWeek(from: Date): Date {
  const nextSunday = startOfCurrentWeek(from);
  nextSunday.setUTCDate(nextSunday.getUTCDate() + 7);
  return nextSunday;
}

function weekdayOf(date: Date): Weekday {
  return weekDays[date.getUTCDay()];
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The change could not be saved.";
}

export default function MemberPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const typedMemberId = memberId as Id<"members">;
  const profile = useQuery(api.scheduler.getMemberProfile, {
    memberId: typedMemberId,
  });
  const setDaysOffRemaining = useMutation(
    api.scheduler.setMemberDaysOffRemaining,
  );
  const requestDayOff = useMutation(api.scheduler.requestMemberDayOff);
  const reportSickDay = useMutation(api.scheduler.reportMemberSickDay);
  const reviewDayOff = useMutation(
    api.scheduler.reviewMemberDayOffRequest,
  );
  const {
    data,
    loaded,
    role,
    currentMemberId,
    setMemberDayOffById,
    setMemberConstraintById,
  } = useScheduler();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  });
  const [sickDate, setSickDate] = useState(() => formatDate(new Date()));
  const [daysOffDraft, setDaysOffDraft] = useState<{
    memberId: Id<"members"> | null;
    value: string;
  }>({ memberId: null, value: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const calendarDates = useMemo(() => {
    const first = new Date(
      Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), 1),
    );
    const gridStart = new Date(first);
    gridStart.setUTCDate(first.getUTCDate() - first.getUTCDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setUTCDate(gridStart.getUTCDate() + index);
      return date;
    });
  }, [visibleMonth]);

  if (profile === undefined || !loaded) {
    return <p className="text-sm text-muted-foreground">Loading member…</p>;
  }

  if (profile === null) {
    return (
      <SectionCard>
        <h2 className="text-xl font-semibold">Member not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This member may have been renamed or removed.
        </p>
        <Link
          className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/members"
        >
          Back to members
        </Link>
      </SectionCard>
    );
  }

  const constraints =
    data.memberConstraintsById[typedMemberId] ??
    data.memberConstraints[profile.name] ?? {
      blockedDuties: profile.blockedDuties,
      blockedChores: profile.blockedChores,
      daysOff: profile.daysOff,
    };
  const isManager = role === "manager";
  const isOwnProfile = currentMemberId === typedMemberId;
  const daysOffDraftValue =
    daysOffDraft.memberId === typedMemberId
      ? daysOffDraft.value
      : String(profile.daysOffRemaining);
  const pendingDayOffCount = profile.absences.filter(
    (absence) =>
      absence.kind === "day-off" && absence.status === "pending",
  ).length;
  const requestableDaysOff = Math.max(
    0,
    profile.daysOffRemaining - pendingDayOffCount,
  );
  const currentWeekStart = formatDate(startOfCurrentWeek(new Date()));
  const nextWeekStart = startOfNextWeek(new Date());
  const nextWeekDates = Array.from({ length: 7 }, (_, index) => {
    return addDays(nextWeekStart, index);
  });
  const activeAbsence = (date: string) =>
    profile.absences.find(
      (absence) =>
        absence.date === date &&
        (absence.status === "approved" || absence.status === "pending"),
    );

  async function runChange(change: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await change();
    } catch (changeError) {
      setError(errorMessage(changeError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        href="/members"
      >
        <ArrowLeft aria-hidden="true" size={16} />
        Back to members
      </Link>

      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{profile.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Member profile, availability, exclusions, and attendance calendar.
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <SectionCard>
        <h3 className="text-lg font-semibold">Weekly availability</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Mark recurring days when this member is unavailable.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {weekDays.map((day) => (
            <label
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              key={day}
            >
              <Checkbox
                checked={constraints.daysOff?.includes(day) ?? false}
                disabled={!isManager}
                onCheckedChange={(checked) =>
                  setMemberDayOffById(
                    typedMemberId,
                    profile.name,
                    day,
                    checked === true,
                  )
                }
                aria-label={`${dayNames[day]} weekly day off`}
              />
              {dayNames[day]}
            </label>
          ))}
        </div>
      </SectionCard>

      <SectionCard>
        <h3 className="text-lg font-semibold">Exclusions</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the duties or chores this member cannot be assigned.
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-semibold">
              Cannot perform duties
            </legend>
            {Object.keys(data.weights.tasks).length ? (
              Object.keys(data.weights.tasks).map((duty) => (
                <label className="flex items-center gap-2 text-sm" key={duty}>
                  <Checkbox
                    checked={constraints.blockedDuties.includes(duty)}
                    disabled={!isManager}
                    onCheckedChange={(checked) =>
                      setMemberConstraintById(
                        typedMemberId,
                        profile.name,
                        "blockedDuties",
                        duty,
                        checked === true,
                      )
                    }
                  />
                  {duty}
                </label>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No duty types have been created.
              </p>
            )}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-semibold">
              Cannot perform chores
            </legend>
            {Object.keys(data.weights.chores).length ? (
              Object.keys(data.weights.chores).map((chore) => (
                <label className="flex items-center gap-2 text-sm" key={chore}>
                  <Checkbox
                    checked={constraints.blockedChores.includes(chore)}
                    disabled={!isManager}
                    onCheckedChange={(checked) =>
                      setMemberConstraintById(
                        typedMemberId,
                        profile.name,
                        "blockedChores",
                        chore,
                        checked === true,
                      )
                    }
                  />
                  {chore}
                </label>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No chore types have been created.
              </p>
            )}
          </fieldset>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Days-off balance</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Approved requests use one available day.
            </p>
          </div>
          {isManager ? (
            <label className="flex items-center gap-3 text-sm font-medium">
              Days remaining
              <Input
                type="number"
                min={0}
                step={1}
                className="w-24"
                value={daysOffDraftValue}
                disabled={saving}
                onChange={(event) => {
                  setDaysOffDraft({
                    memberId: typedMemberId,
                    value: event.currentTarget.value,
                  });
                }}
                onBlur={() => {
                  const value = Number(daysOffDraftValue);
                  if (
                    !Number.isSafeInteger(value) ||
                    value < 0 ||
                    daysOffDraftValue.trim() === ""
                  ) {
                    setError(
                      "Remaining days off must be a non-negative whole number.",
                    );
                    setDaysOffDraft({
                      memberId: typedMemberId,
                      value: String(profile.daysOffRemaining),
                    });
                    return;
                  }
                  if (value !== profile.daysOffRemaining) {
                    void runChange(() =>
                      setDaysOffRemaining({
                        memberId: typedMemberId,
                        daysOffRemaining: value,
                      }),
                    );
                  }
                }}
              />
            </label>
          ) : (
            <p className="text-sm font-medium">
              {profile.daysOffRemaining} days remaining
            </p>
          )}
        </div>
      </SectionCard>

      {isOwnProfile && <SectionCard>
        <h3 className="text-lg font-semibold">Request next week off</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Requests need approval and only use a day from the balance once
          approved.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {nextWeekDates.map((date) => {
            const dateKey = formatDate(date);
            const absence = activeAbsence(dateKey);
            return (
              <div
                className="flex items-center justify-between gap-2 rounded-md border p-3"
                key={dateKey}
              >
                <div>
                  <p className="text-sm font-medium">
                    {date.toLocaleDateString(undefined, {
                      timeZone: "UTC",
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  {absence && (
                    <p className="text-xs text-muted-foreground">
                      Day off · {absence.status}
                    </p>
                  )}
                </div>
                {!absence && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving || requestableDaysOff < 1}
                    onClick={() =>
                      void runChange(() =>
                        requestDayOff({
                          memberId: typedMemberId,
                          date: dateKey,
                        }),
                      )
                    }
                  >
                    Request
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {requestableDaysOff < 1 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No unreserved days off remain to request.
          </p>
        )}
      </SectionCard>}

      {isOwnProfile && <SectionCard>
        <h3 className="text-lg font-semibold">Report a sick day</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Sick days are recorded immediately and do not use the days-off
          balance.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            Date
            <Input
              type="date"
              max={formatDate(new Date())}
              value={sickDate}
              onChange={(event) => setSickDate(event.currentTarget.value)}
            />
          </label>
          <Button
            disabled={
              saving || !sickDate || Boolean(activeAbsence(sickDate))
            }
            onClick={() =>
              void runChange(() =>
                reportSickDay({ memberId: typedMemberId, date: sickDate }),
              )
            }
          >
            Report sick day
          </Button>
        </div>
      </SectionCard>}

      {isManager && profile.absences.some(
        (absence) => absence.kind === "day-off" && absence.status === "pending",
      ) && (
        <SectionCard>
          <h3 className="text-lg font-semibold">Pending day-off requests</h3>
          <div className="mt-4 space-y-3">
            {profile.absences
              .filter(
                (absence) =>
                  absence.kind === "day-off" && absence.status === "pending",
              )
              .map((absence) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  key={absence.id}
                >
                  <p className="text-sm">
                    {new Date(`${absence.date}T00:00:00Z`).toLocaleDateString(
                      undefined,
                      {
                        timeZone: "UTC",
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        void runChange(() =>
                          reviewDayOff({
                            absenceId: absence.id,
                            approve: false,
                          }),
                        )
                      }
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() =>
                        void runChange(() =>
                          reviewDayOff({
                            absenceId: absence.id,
                            approve: true,
                          }),
                        )
                      }
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>
      )}

      <SectionCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Attendance calendar</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Dates in the current and next week show scheduled activities.
              Recorded day-off requests and sick days remain visible on their
              dates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() =>
                setVisibleMonth(
                  (month) =>
                      new Date(
                        Date.UTC(
                          month.getUTCFullYear(),
                          month.getUTCMonth() - 1,
                          1,
                        ),
                      ),
                )
              }
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">
              {visibleMonth.toLocaleDateString(undefined, {
                timeZone: "UTC",
                month: "long",
                year: "numeric",
              })}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              onClick={() =>
                setVisibleMonth(
                  (month) =>
                      new Date(
                        Date.UTC(
                          month.getUTCFullYear(),
                          month.getUTCMonth() + 1,
                          1,
                        ),
                      ),
                )
              }
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[42rem] grid-cols-7 border-l border-t">
            {weekDays.map((day) => (
              <div
                className="border-b border-r bg-muted/40 p-2 text-center text-xs font-semibold"
                key={day}
              >
                {dayNames[day].slice(0, 3)}
              </div>
            ))}
            {calendarDates.map((date) => {
              const dateKey = formatDate(date);
              const sameMonth =
                date.getUTCMonth() === visibleMonth.getUTCMonth();
              const absence = activeAbsence(dateKey);
              const weekday = weekdayOf(date);
              const chores = profile.activities.chores
                .filter((activity) => activity.day === weekday)
                .map((activity) => activity.name);
              const duties = profile.activities.duties
                .filter((activity) => activity.day === weekday)
                .map((activity) => activity.name);
              const isWeeklyDayOff = profile.daysOff.includes(weekday);
              const showScheduledActivities =
                dateKey >= currentWeekStart &&
                dateKey < formatDate(addDays(nextWeekStart, 7));
              return (
                <div
                  className={`min-h-32 border-b border-r p-2 ${sameMonth ? "" : "bg-muted/20 text-muted-foreground"}`}
                  key={dateKey}
                >
                  <p className="text-xs font-semibold">{date.getUTCDate()}</p>
                  {absence && (
                    <p
                      className={`mt-1 rounded px-1.5 py-1 text-xs ${
                        absence.kind === "sick"
                          ? "bg-destructive/10 text-destructive"
                          : absence.status === "pending"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                            : "bg-primary/10 text-primary"
                      }`}
                    >
                      {absence.kind === "sick"
                        ? "Sick day"
                        : absence.status === "pending"
                          ? "Day off pending"
                          : "Day off"}
                    </p>
                  )}
                  {!absence && isWeeklyDayOff && (
                    <p className="mt-1 rounded bg-primary/10 px-1.5 py-1 text-xs text-primary">
                      Weekly day off
                    </p>
                  )}
                  {!absence &&
                    !isWeeklyDayOff &&
                    showScheduledActivities && (
                      <div className="mt-1 space-y-1">
                        {chores.map((chore, index) => (
                          <p
                            className="truncate rounded bg-secondary px-1.5 py-1 text-xs"
                            key={`chore-${index}`}
                            title={`Chore: ${chore}`}
                          >
                            {chore}
                          </p>
                        ))}
                        {duties.map((duty, index) => (
                          <p
                            className="truncate rounded bg-muted px-1.5 py-1 text-xs"
                            key={`duty-${index}`}
                            title={`Duty: ${duty}`}
                          >
                            {duty}
                          </p>
                        ))}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { GeneratedSchedule } from "@/app/scheduler-context";
import { canAssignChore } from "@/lib/choreEligibility";
import { formatPoints, SectionCard } from "@/app/(schedule)/_components/ui";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  dayNames,
  weekDays,
  type SchedulingRules,
  type MemberConstraints,
  type Weekday,
  type WeeklyTasks,
} from "@/lib/types";

type DayFilter = "all" | Weekday;
type AssignmentFilter = "all" | "assigned" | "unassigned";

function isDayFilter(value: unknown): value is DayFilter {
  return value === "all" || weekDays.some((day) => day === value);
}

function isAssignmentFilter(value: unknown): value is AssignmentFilter {
  return value === "all" || value === "assigned" || value === "unassigned";
}

export function AssignmentTable({
  generated,
  members,
  tasks,
  rules,
  memberConstraints,
  readOnly = false,
  onAssignmentChange,
}: {
  generated: GeneratedSchedule;
  members: string[];
  tasks: WeeklyTasks;
  rules: SchedulingRules;
  memberConstraints: MemberConstraints;
  readOnly?: boolean;
  onAssignmentChange: (
    day: Weekday,
    index: number,
    member: string | null,
  ) => Promise<void>;
}) {
  const [selectedDay, setSelectedDay] = useState<DayFilter>("all");
  const [search, setSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>("all");

  const rows = useMemo(
    () =>
      weekDays
        .filter((day) => selectedDay === "all" || day === selectedDay)
        .flatMap((day) =>
          generated.assignments[day].map((assignment, index) => ({
            ...assignment,
            day,
            index,
            key: `${day}-${index}`,
          })),
        )
        .filter(({ chore, member, day }) => {
          const matchesSearch = `${dayNames[day]} ${chore} ${member ?? ""}`
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase());
          const matchesAssignment =
            assignmentFilter === "all" ||
            (assignmentFilter === "assigned" && member !== null) ||
            (assignmentFilter === "unassigned" && member === null);
          return matchesSearch && matchesAssignment;
        }),
    [assignmentFilter, generated.assignments, search, selectedDay],
  );

  const totalAssignments = weekDays.reduce(
    (total, day) => total + generated.assignments[day].length,
    0,
  );
  const currentDayLabel =
    selectedDay === "all" ? "All days" : dayNames[selectedDay];

  return (
    <SectionCard className="p-0">
      <div className="border-b p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Assignment details</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse one day at a time or review the complete week.
            </p>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {rows.length} of {totalAssignments} chores
          </p>
        </div>

        <Tabs
          value={selectedDay}
          onValueChange={(value) => {
            if (isDayFilter(value)) {
              setSelectedDay(value);
            }
          }}
        >
          <TabsList className="max-w-full flex-wrap">
            <TabsTrigger value="all">All days</TabsTrigger>
            {weekDays.map((day) => (
              <TabsTrigger value={day} key={day}>
                {dayNames[day]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_12rem]">
          <label className="relative block">
            <span className="sr-only">Search chores and members</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder={`Search ${currentDayLabel.toLowerCase()}...`}
              className="pl-9"
            />
          </label>
          <Select
            value={assignmentFilter}
            onValueChange={(value) => {
              if (isAssignmentFilter(value)) {
                setAssignmentFilter(value);
              }
            }}
          >
            <SelectTrigger
              aria-label="Filter assignment status"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignments</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.length ? (
        <Table>
          <TableCaption>
            Weighted chore points are based on the values set in Types &amp;
            rules.
          </TableCaption>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Day</TableHead>
              <TableHead>Chore</TableHead>
              <TableHead>Assigned member</TableHead>
              <TableHead className="text-right">Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ day, chore, member, index, key }) => {
              const eligibleMembers = members.filter((candidate) =>
                  canAssignChore(
                    candidate,
                    day,
                    chore,
                    tasks,
                    rules,
                    memberConstraints,
                    generated.assignments[day].filter(
                      (_, assignmentIndex) => assignmentIndex !== index,
                    ),
                  ),
              );
              const selectedMember =
                member && eligibleMembers.includes(member)
                  ? member
                  : "__unassigned";
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium">{dayNames[day]}</TableCell>
                  <TableCell>{chore}</TableCell>
                  <TableCell>
                    {readOnly ? (
                      member ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )
                    ) : (
                    <Select
                      value={selectedMember}
                      onValueChange={(value) => {
                        if (typeof value === "string") {
                          void onAssignmentChange(
                            day,
                            index,
                            value === "__unassigned" ? null : value,
                          );
                        }
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Assign ${chore} on ${dayNames[day]}`}
                        className="w-full min-w-40"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned">Unassigned</SelectItem>
                        {eligibleMembers.map((eligibleMember) => (
                          <SelectItem
                            value={eligibleMember}
                            key={eligibleMember}
                          >
                            {eligibleMember}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPoints(
                      generated.weights.chores[chore] ??
                        generated.weights.defaultChoreWeight,
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          {totalAssignments === 0
            ? "There are no chores scheduled for this week yet."
            : "No assignments match these filters."}
        </p>
      )}
    </SectionCard>
  );
}

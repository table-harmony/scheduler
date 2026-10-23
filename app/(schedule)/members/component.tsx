"use client";

import { Fragment } from "react";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useScheduler } from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dayNames, weekDays } from "@/lib/types";
import { SectionCard } from "@/app/(schedule)/_components/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function MembersSection() {
  const { data, role, currentMemberId, setMemberName } = useScheduler();
  const groupMembers = useQuery(api.scheduler.getGroupMembers, {});
  const groupMembersById = new Map(
    (groupMembers ?? []).map((member) => [member.id, member]),
  );

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Group accounts and their member profiles.
          </p>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Group role</TableHead>
            <TableHead>Profile</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.people.map((person, index) => (
            <TableRow key={data.memberIds[index] ?? `member-${index}`}>
              <TableCell className="font-medium">
                {role === "manager" ? (
                  <Input
                    aria-label={`Member ${index + 1} name`}
                    value={person}
                    onChange={(event) =>
                      setMemberName(index, event.currentTarget.value)
                    }
                  />
                ) : (
                  person
                )}
              </TableCell>
              <TableCell>
                {data.memberIds[index]
                  ? groupMembersById.get(data.memberIds[index])?.role ??
                    "Loading"
                  : "Unclaimed"}
              </TableCell>
              <TableCell>
                {person.trim() &&
                data.memberIds[index] &&
                (role === "manager" ||
                  data.memberIds[index] === currentMemberId) ? (
                  <Link
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    href={`/members/${data.memberIds[index]}`}
                  >
                    View details
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {role === "manager"
                      ? "Profile unavailable"
                      : "Private profile"}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!data.people.length && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No member profiles yet. Share the group invite code so members can join.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

export function ChoreWeekEditor() {
  const { data, addChore, setChore, removeChore, role } = useScheduler();
  const choreTypes = Object.keys(data.weights.chores);

  if (role !== "manager") {
    return null;
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Chores by day</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule chore types created in Types & rules.
        </p>
      </div>
      <SectionCard className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead>Chore type</TableHead>
              <TableHead className="w-16">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weekDays.map((day) => (
              <Fragment key={day}>
                <TableRow key={`${day}-header`} className="bg-muted/40">
                  <TableCell colSpan={3} className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{dayNames[day]}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!choreTypes.length}
                        onClick={() => addChore(day)}
                      >
                        <Plus data-icon="inline-start" />
                        Add chore
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {data.chores[day].map((chore, index) => (
                  <TableRow key={`${day}-${index}`}>
                    <TableCell className="text-muted-foreground">
                      {dayNames[day]}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={chore}
                        onValueChange={(value) => {
                          if (typeof value === "string") {
                            setChore(day, index, value);
                          }
                        }}
                      >
                        <SelectTrigger
                          aria-label={`${dayNames[day]} chore ${index + 1}`}
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {choreTypes.map((name) => (
                            <SelectItem value={name} key={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${chore} from ${dayNames[day]}`}
                        onClick={() => removeChore(day, index)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </section>
  );
}

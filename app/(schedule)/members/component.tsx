"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useScheduler } from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { weekDays, type Weekday } from "@/lib/types";
import { SectionCard } from "@/app/(schedule)/_components/ui";
import { dayNames } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function MembersSection() {
  const {
    data,
    addMember,
    setMemberName,
    removeMember,
    setMemberConstraint,
    setMemberDayOff,
    savedAssignments,
  } = useScheduler();
  const [selectedMember, setSelectedMember] = useState("");

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add everyone who can be assigned chores.
          </p>
        </div>
        <Button onClick={addMember}>
          <Plus data-icon="inline-start" />
          Add member
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Attendance / days off</TableHead>
            <TableHead>Eligibility restrictions</TableHead>
            <TableHead className="w-16">Remove</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.people.map((person, index) => (
            <TableRow key={`member-${index}`}>
              <TableCell>
                <Input
                  aria-label={`Member ${index + 1}`}
                  value={person}
                  placeholder="Member name"
                  onChange={(event) =>
                    setMemberName(index, event.currentTarget.value)
                  }
                />
              </TableCell>
              <TableCell>
                {person.trim() && (
                  <div className="flex flex-wrap gap-3">
                    {weekDays.map((day) => (
                      <label className="flex items-center gap-2" key={day}>
                        <Checkbox
                          checked={
                            data.memberConstraints[person]?.daysOff?.includes(day) ??
                            false
                          }
                          onCheckedChange={(checked) =>
                            setMemberDayOff(person, day, checked === true)
                          }
                        />
                        <span className="text-xs">{dayNames[day]}</span>
                      </label>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {person.trim() && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium">
                      Set exclusions
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-semibold text-muted-foreground">
                          Cannot perform duties
                        </legend>
                        {Object.keys(data.weights.tasks).map((duty) => (
                          <label className="flex items-center gap-2" key={duty}>
                            <Checkbox
                              checked={data.memberConstraints[person]?.blockedDuties.includes(duty) ?? false}
                              onCheckedChange={(checked) =>
                                setMemberConstraint(
                                  person,
                                  "blockedDuties",
                                  duty,
                                  checked === true,
                                )
                              }
                            />
                            {duty}
                          </label>
                        ))}
                      </fieldset>
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-semibold text-muted-foreground">
                          Cannot perform chores
                        </legend>
                        {Object.keys(data.weights.chores).map((chore) => (
                          <label className="flex items-center gap-2" key={chore}>
                            <Checkbox
                              checked={data.memberConstraints[person]?.blockedChores.includes(chore) ?? false}
                              onCheckedChange={(checked) =>
                                setMemberConstraint(
                                  person,
                                  "blockedChores",
                                  chore,
                                  checked === true,
                                )
                              }
                            />
                            {chore}
                          </label>
                        ))}
                      </fieldset>
                    </div>
                  </details>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${person || "member"}`}
                  onClick={() => removeMember(index)}
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!data.people.length && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No members added yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <section className="mt-6 space-y-3 border-t pt-5">
            <div>
              <h3 className="font-semibold">Member weekly view</h3>
              <p className="text-sm text-muted-foreground">
                Type a member&apos;s name to see their duties, chores, and attendance.
              </p>
            </div>
            <Input
              list="scheduler-members"
              value={selectedMember}
              onChange={(event) => setSelectedMember(event.currentTarget.value)}
              placeholder="Search or type a member name"
              aria-label="Member weekly view"
            />
            <datalist id="scheduler-members">
              {data.people.map((member) => (
                <option value={member} key={member} />
              ))}
            </datalist>
            {data.people.includes(selectedMember) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead>Duties</TableHead>
                    <TableHead>Chores</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weekDays.map((day) => (
                    <TableRow key={day}>
                      <TableCell className="font-medium">{dayNames[day]}</TableCell>
                      <TableCell>
                        {data.memberConstraints[selectedMember]?.daysOff?.includes(day)
                          ? "Day off / sick"
                          : "Available"}
                      </TableCell>
                      <TableCell>
                        {data.tasks[day]
                          .filter((entry) => entry.member === selectedMember)
                          .map((entry) => entry.task)
                          .join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        {data.chores[day]
                          .filter((_, index) => savedAssignments[day][index] === selectedMember)
                          .join(", ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
    </SectionCard>
  );
}

export function ChoreWeekEditor() {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Chores by day</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule chore types created in Types & rules.
        </p>
      </div>
      <div className="space-y-4">
        {weekDays.map((day) => (
          <ChoreDayEditor day={day} key={day} />
        ))}
      </div>
    </section>
  );
}

export function ChoreDayEditor({ day }: { day: Weekday }) {
  const { data, addChore, setChore, removeChore } = useScheduler();
  const choreTypes = Object.keys(data.weights.chores);
  const dayChores = data.chores[day];

  return (
    <SectionCard>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-medium">{dayNames[day]}</h3>
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Chore type</TableHead>
            <TableHead className="w-16">Remove</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dayChores.map((chore, index) => (
            <TableRow key={`${day}-${index}`}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <Select
                  value={chore}
                  onValueChange={(value) => {
                    if (typeof value === "string") setChore(day, index, value);
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
          {!dayChores.length && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No chores scheduled.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

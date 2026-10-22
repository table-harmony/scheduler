"use client";

import { Plus, Trash2 } from "lucide-react";
import { useScheduler } from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Weekday } from "@/lib/types";
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

export function DutyDayEditor({ day }: { day: Weekday }) {
  const { data, addDuty, setDuty, removeDuty } = useScheduler();
  const dutyTypes = Object.keys(data.weights.tasks);

  return (
    <SectionCard>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-medium">{dayNames[day]}</h3>
        <Button
          size="sm"
          variant="outline"
          disabled={!dutyTypes.length || !data.people.length}
          onClick={() => addDuty(day)}
        >
          <Plus data-icon="inline-start" />
          Add duty
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Duty</TableHead>
            <TableHead className="w-16">Remove</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
        {data.tasks[day].map((entry, index) => (
          <TableRow
            key={`${day}-task-${index}`}
          >
            <TableCell>
              <Select
                value={entry.member || "__unassigned"}
                onValueChange={(value) =>
                  setDuty(
                    day,
                    index,
                    "member",
                    value === "__unassigned" ? "" : value ?? "",
                  )
                }
              >
                <SelectTrigger aria-label={`${dayNames[day]} duty member ${index + 1}`} className="w-full">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Select member</SelectItem>
                {data.people
                  .filter(
                    (person) =>
                      person === entry.member ||
                      data.memberConstraints[person]?.daysOff?.includes(day) !== true &&
                      !data.memberConstraints[
                        person
                      ]?.blockedDuties.includes(entry.task),
                  )
                  .map((person, personIndex) => (
                    <SelectItem key={`${person}-${personIndex}`} value={person}>
                      {person || "Unnamed member"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              <Select
                value={entry.task}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setDuty(day, index, "task", value);
                  }
                }}
              >
                <SelectTrigger
                  aria-label={`${dayNames[day]} duty ${index + 1}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dutyTypes
                    .filter(
                      (name) =>
                        name === entry.task ||
                        !data.memberConstraints[
                          entry.member
                        ]?.blockedDuties.includes(name),
                    )
                    .map((name) => (
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
                aria-label="Remove duty"
                onClick={() => removeDuty(day, index)}
              >
                <Trash2 />
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {!data.tasks[day].length && (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-muted-foreground">
              No duties recorded for this day.
            </TableCell>
          </TableRow>
        )}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

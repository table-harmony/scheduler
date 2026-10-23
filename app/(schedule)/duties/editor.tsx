"use client";

import { Fragment } from "react";
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
import { SectionCard } from "@/app/(schedule)/_components/ui";
import { dayNames, weekDays } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DutyWeekEditor() {
  const { data, addDuty, setDuty, removeDuty } = useScheduler();
  const dutyTypes = Object.keys(data.weights.tasks);

  return (
    <SectionCard className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Day</TableHead>
            <TableHead>Member</TableHead>
            <TableHead>Duty</TableHead>
            <TableHead className="w-16">Remove</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {weekDays.map((day) => (
            <Fragment key={day}>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={4} className="py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{dayNames[day]}</span>
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
                </TableCell>
              </TableRow>
              {data.tasks[day].map((entry, index) => (
                <TableRow key={`${day}-task-${index}`}>
                  <TableCell className="text-muted-foreground">
                    {dayNames[day]}
                  </TableCell>
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
                      <SelectTrigger
                        aria-label={`${dayNames[day]} duty member ${index + 1}`}
                        className="w-full"
                      >
                        <SelectValue placeholder="Select member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned">
                          Select member
                        </SelectItem>
                        {data.people
                          .filter(
                            (person) =>
                              person === entry.member ||
                              (data.memberConstraints[person]?.daysOff?.includes(
                                day,
                              ) !== true &&
                                !data.memberConstraints[
                                  person
                                ]?.blockedDuties.includes(entry.task)),
                          )
                          .map((person, personIndex) => (
                            <SelectItem
                              key={`${person}-${personIndex}`}
                              value={person}
                            >
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
                      aria-label={`Remove ${entry.task} duty on ${dayNames[day]}`}
                      onClick={() => removeDuty(day, index)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!data.tasks[day].length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No duties recorded for {dayNames[day]}.
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

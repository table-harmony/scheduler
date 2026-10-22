"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useScheduler } from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberField, SectionCard } from "@/app/(schedule)/_components/ui";
import { DutyTypeRule, WeightEditor } from "./components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function RulesPage() {
  const {
    data,
    addType,
    renameType,
    setTypeWeight,
    removeType,
    setDefaultWeight,
    setChoreRestriction,
  } = useScheduler();
  const [newChore, setNewChore] = useState("");
  const [newDuty, setNewDuty] = useState("");

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Chore and duty types</h2>
        <p className="mt-1 text-muted-foreground">
          Define the types used throughout the schedule, set their workload
          points, and configure each duty&apos;s effect on chore eligibility.
        </p>
      </header>

      <SectionCard>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Chore types</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            These types become available for each day&apos;s chore schedule.
          </p>
        </div>
        <Form
          className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]"
          onFormSubmit={() => {
            addType("chores", newChore);
            setNewChore("");
          }}
        >
          <Input
            aria-label="New chore type"
            placeholder="Type a chore name"
            value={newChore}
            onChange={(event) => setNewChore(event.currentTarget.value)}
          />
          <Button type="submit" variant="outline">
            <Plus data-icon="inline-start" />
            Add chore type
          </Button>
        </Form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chore type</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Daily limit</TableHead>
              <TableHead className="w-16">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {Object.entries(data.weights.chores).map(([name, weight]) => (
            <TableRow key={name}>
              <TableCell>
                <Input
                  aria-label="Chore type name"
                  value={name}
                  onChange={(event) =>
                    renameType("chores", name, event.currentTarget.value)
                  }
                />
              </TableCell>
              <TableCell>
                <WeightEditor
                  name={name}
                  weight={weight}
                  onChange={(value) => setTypeWeight("chores", name, value)}
                />
              </TableCell>
              <TableCell>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={
                      data.rules.chores?.[name]?.onePerMemberPerDay ?? false
                    }
                    onCheckedChange={(checked) =>
                      setChoreRestriction(name, checked === true)
                    }
                  />
                  One per member per day
                </label>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${name} chore type`}
                  onClick={() => removeType("chores", name)}
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!Object.keys(data.weights.chores).length && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No chore types created yet.
              </TableCell>
            </TableRow>
          )}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Duty types and rules</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure eligibility using chore types. No task name has a special
            behavior unless you set one here.
          </p>
        </div>
        <Form
          className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]"
          onFormSubmit={() => {
            addType("tasks", newDuty);
            setNewDuty("");
          }}
        >
          <Input
            aria-label="New duty type"
            placeholder="Type a duty name"
            value={newDuty}
            onChange={(event) => setNewDuty(event.currentTarget.value)}
          />
          <Button type="submit" variant="outline">
            <Plus data-icon="inline-start" />
            Add duty type
          </Button>
        </Form>
        <div className="space-y-4">
          {Object.entries(data.weights.tasks).map(([name, weight]) => {
            const rule = data.rules.tasks[name] ?? {
              restriction: "none" as const,
              allowedChores: [],
            };
            return (
              <DutyTypeRule
                key={name}
                name={name}
                weight={weight}
                restriction={rule.restriction}
                allowedChores={rule.allowedChores}
                choreTypes={Object.keys(data.weights.chores)}
                onRename={(nextName) => renameType("tasks", name, nextName)}
                onWeightChange={(value) => setTypeWeight("tasks", name, value)}
                onRemove={() => removeType("tasks", name)}
              />
            );
          })}
          {!Object.keys(data.weights.tasks).length && (
            <p className="text-sm text-muted-foreground">
              No duty types created yet.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard>
        <h3 className="mb-4 text-lg font-semibold">Default point values</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 text-sm">
            Unlisted chore
            <NumberField
              label="Default chore weight"
              value={data.weights.defaultChoreWeight}
              onChange={(value) =>
                setDefaultWeight("defaultChoreWeight", value)
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Unlisted duty
            <NumberField
              label="Default duty weight"
              value={data.weights.defaultTaskWeight}
              onChange={(value) => setDefaultWeight("defaultTaskWeight", value)}
            />
          </label>
        </div>
      </SectionCard>
    </div>
  );
}

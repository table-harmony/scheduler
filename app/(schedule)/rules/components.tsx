"use client";

import { Trash2 } from "lucide-react";
import { useScheduler } from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskRestriction } from "@/lib/types";
import { NumberField } from "@/app/(schedule)/_components/ui";

const restrictionLabels: Record<TaskRestriction, string> = {
  none: "No chore restriction",
  "unavailable-today": "Cannot do chores that day",
  "unavailable-today-and-previous-day":
    "Cannot do chores that day or the previous day",
  "only-selected-chores": "Can only do selected chore types",
};

function isTaskRestriction(value: string): value is TaskRestriction {
  return Object.hasOwn(restrictionLabels, value);
}

export function WeightEditor({
  name,
  weight,
  onChange,
}: {
  name: string;
  weight: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Points
      <NumberField
        label={`${name} points`}
        value={weight}
        onChange={onChange}
      />
    </label>
  );
}

export function DutyTypeRule({
  name,
  weight,
  restriction,
  allowedChores,
  choreTypes,
  onRename,
  onWeightChange,
  onRemove,
}: {
  name: string;
  weight: number;
  restriction: TaskRestriction;
  allowedChores: readonly string[];
  choreTypes: string[];
  onRename: (name: string) => void;
  onWeightChange: (weight: number) => void;
  onRemove: () => void;
}) {
  const { setTaskRestriction, setAllowedChore } = useScheduler();

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          aria-label="Duty type name"
          value={name}
          onChange={(event) => onRename(event.currentTarget.value)}
        />
        <WeightEditor name={name} weight={weight} onChange={onWeightChange} />
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${name} duty type`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        Assignment rule
        <Select
          value={restriction}
          onValueChange={(value) => {
            if (typeof value === "string" && isTaskRestriction(value)) {
              setTaskRestriction(name, value);
            }
          }}
        >
          <SelectTrigger className="w-full font-normal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(restrictionLabels).map(([value, label]) => (
              <SelectItem value={value} key={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {restriction === "only-selected-chores" && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Chore types allowed on this duty
          </legend>
          {choreTypes.length ? (
            <div className="flex flex-wrap gap-3">
              {choreTypes.map((chore) => (
                <label className="flex items-center gap-2 text-sm" key={chore}>
                  <Checkbox
                    checked={allowedChores.includes(chore)}
                    onCheckedChange={(checked) =>
                      setAllowedChore(name, chore, checked === true)
                    }
                  />
                  {chore}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Create chore types first.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}

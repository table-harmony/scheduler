"use client";

import { Plus, Trash2 } from "lucide-react";
import { useScheduler } from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { weekDays, type Weekday } from "@/lib/types";
import { SectionCard } from "@/app/(schedule)/components/ui";
import { dayNames } from "@/lib/types";

export function MembersSection() {
  const { data, addMember, setMemberName, removeMember } = useScheduler();

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.people.map((person, index) => (
          <div className="flex items-center gap-2" key={`member-${index}`}>
            <Input
              aria-label={`Member ${index + 1}`}
              value={person}
              placeholder="Member name"
              onChange={(event) =>
                setMemberName(index, event.currentTarget.value)
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${person || "member"}`}
              onClick={() => removeMember(index)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {data.people.length === 0 && (
          <p className="text-sm text-muted-foreground">No members added yet.</p>
        )}
      </div>
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
      <div className="grid gap-4 md:grid-cols-2">
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
      <div className="space-y-2">
        {dayChores.map((chore, index) => (
          <div className="flex items-center gap-2" key={`${day}-${index}`}>
            <select
              aria-label={`${dayNames[day]} chore ${index + 1}`}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-[3px]"
              value={chore}
              onChange={(event) =>
                setChore(day, index, event.currentTarget.value)
              }
            >
              {choreTypes.map((name) => (
                <option value={name} key={name}>
                  {name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${chore} from ${dayNames[day]}`}
              onClick={() => removeChore(day, index)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {!dayChores.length && (
          <p className="py-2 text-sm text-muted-foreground">
            No chores scheduled.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

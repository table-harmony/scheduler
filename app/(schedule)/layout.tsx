import {
  CalendarDays,
  ClipboardList,
  RotateCcw,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/app/scheduler-context";
//import { usePathname } from "next/dist/client/components/navigation";

const links = [
  { href: "/", label: "Schedule", icon: CalendarDays },
  { href: "/members", label: "Members & chores", icon: Users },
  { href: "/duties", label: "Weekly duties", icon: ClipboardList },
  { href: "/rules", label: "Types & rules", icon: SlidersHorizontal },
];

export function SchedulerShell({ children }: { children: React.ReactNode }) {
  const { loaded, saving, error, reset } = useScheduler();
  //const currentPage = usePathname().split("/")[-1];
  //const isActiveLink = (href: string): boolean =>
  //(currentPage === "schedule" && href === "/") ||
  //(currentPage === "members" && href === "/members") ||
  //(currentPage === "duties" && href === "/duties") ||
  //(currentPage === "rules" && href === "/rules");
  const isActiveLink = (href: string): boolean => {
    return href === "/";
  };

  return (
    <SchedulerShell>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-primary">
              FAIR WEEKLY PLANNER
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Weekly scheduler
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Build the week together. Chores are assigned around duties and
              balanced by workload points.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {!loaded
                ? "Loading schedule…"
                : saving
                  ? "Saving to Convex…"
                  : "Saved to Convex"}
            </span>
            <Button variant="outline" onClick={reset}>
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
          </div>
        </header>

        {error && (
          <div
            className="mb-5 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <nav
          aria-label="Scheduler pages"
          className="mb-6 flex flex-wrap gap-2 border-b pb-4"
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                buttonVariants({
                  variant: isActiveLink(href) ? "secondary" : "ghost",
                }),
              )}
              aria-current={isActiveLink(href) ? "page" : undefined}
            >
              <Icon data-icon="inline-start" />
              {label}
            </Link>
          ))}
        </nav>

        {children}
      </main>
    </SchedulerShell>
  );
}

"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: CalendarDays,
    title: "A clearer week",
    description:
      "See chores and duties together, with the whole group's plan in one place.",
  },
  {
    icon: ClipboardCheck,
    title: "Balanced assignments",
    description:
      "Build a schedule around availability, exclusions, duties, and workload.",
  },
  {
    icon: ShieldCheck,
    title: "The right access",
    description:
      "Members can see the plan. Managers keep control of schedule changes.",
  },
];

export default function HomePage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const group = useQuery(
    api.scheduler.getMyGroup,
    isAuthenticated ? {} : "skip",
  );
  const scheduleHref = "/schedule";

  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[34rem] bg-gradient-to-br from-primary/10 via-background to-background" />
      <div className="relative mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <CalendarDays className="size-5" />
            </span>
            <span className="text-lg tracking-tight">Weekly Scheduler</span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Account">
            {isAuthenticated ? (
              <>
                <Link
                  href={scheduleHref}
                  className={cn(buttonVariants({ variant: "ghost" }))}
                >
                  {group ? "Open schedule" : "Set up your group"}
                </Link>
                <Link
                  href="/logout"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Log out
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Log in
              </Link>
            )}
          </nav>
        </header>

        <section className="grid min-h-[35rem] items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="relative z-10 max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 text-sm text-muted-foreground shadow-sm">
              <UsersRound className="size-4 text-primary" />
              A fairer way to plan together
            </div>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Make room for a
              <span className="block text-primary">better week.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Keep chores, duties, and time off in sync. Create a group for your
              household or team, then plan a week that works for everyone.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Link
                  href={scheduleHref}
                  className={cn(buttonVariants({ size: "lg" }))}
                >
                  {group ? "Go to your schedule" : "Create or join a group"}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              ) : (
                <Link
                  href="/login"
                  className={cn(buttonVariants({ size: "lg" }))}
                >
                  Create an account
                  <ArrowRight data-icon="inline-end" />
                </Link>
              )}
              <span className="text-sm text-muted-foreground">
                {isAuthenticated
                  ? group?.name
                    ? `Welcome back to ${group.name}`
                    : group === undefined
                      ? "Loading your group…"
                      : "Your group is one step away"
                  : isLoading
                    ? "Sign in whenever you’re ready"
                    : "Free to use with your group"}
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:justify-self-end">
            <div className="absolute -inset-8 rounded-[2rem] bg-primary/5 blur-2xl" />
            <div className="relative rotate-1 rounded-3xl border bg-card p-4 shadow-2xl shadow-primary/10 sm:p-6">
              <div className="flex items-center justify-between border-b pb-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                    Weekly overview
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">The week ahead</h2>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  Group plan
                </span>
              </div>
              <div className="space-y-3 py-5">
                {[
                  { day: "MON", chore: "Kitchen reset", member: "Alex", tone: "bg-chart-1/30" },
                  { day: "TUE", chore: "Take out recycling", member: "Sam", tone: "bg-chart-2/20" },
                  { day: "WED", chore: "Living room", member: "Jordan", tone: "bg-chart-3/15" },
                ].map((item) => (
                  <div
                    className="flex items-center gap-3 rounded-2xl border bg-background p-3 sm:p-4"
                    key={item.day}
                  >
                    <span className="w-11 text-center text-xs font-semibold tracking-wide text-muted-foreground">
                      {item.day}
                    </span>
                    <span className={`size-2.5 rounded-full ${item.tone}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.chore}
                    </span>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      {item.member}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4">
                <div>
                  <p className="text-sm font-medium">Balanced by workload</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Duties and availability are considered
                  </p>
                </div>
                <ShieldCheck className="size-5 text-primary" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t py-10 sm:grid-cols-3 sm:py-14">
          {features.map(({ icon: Icon, title, description }) => (
            <article
              className="rounded-2xl border bg-card/70 p-5 sm:p-6"
              key={title}
            >
              <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </article>
          ))}
        </section>
        <footer className="flex flex-col gap-3 border-t py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Plan the week. Share the load.</p>
          <Link className="hover:text-foreground" href="/login">
            Sign in to your group
          </Link>
        </footer>
      </div>
    </main>
  );
}

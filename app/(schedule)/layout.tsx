"use client";

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
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthenticatedWorkspace } from "@/components/authenticated-workspace";

const links = [
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/members", label: "Members & chores", icon: Users },
  { href: "/duties", label: "Weekly duties", icon: ClipboardList },
  { href: "/rules", label: "Types & rules", icon: SlidersHorizontal },
];

export default function SchedulerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedWorkspace>
      <SchedulerLayoutContent>{children}</SchedulerLayoutContent>
    </AuthenticatedWorkspace>
  );
}

function SchedulerLayoutContent({ children }: { children: React.ReactNode }) {
  const { loaded, saving, error, reset, role } = useScheduler();
  const pathname = usePathname();
  const group = useQuery(api.scheduler.getMyGroup, {});
  const rotateInviteCode = useMutation(api.scheduler.rotateGroupInviteCode);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const isManager = role === "manager";
  const managerOnlyPage =
    !isManager && (pathname === "/duties" || pathname === "/rules");
  const isActiveLink = (href: string): boolean =>
    pathname === href ||
    (href === "/members" && pathname.startsWith("/members/"));

  return (
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
          {isManager && (
            <Button variant="outline" onClick={reset}>
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
          )}
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <div>
          <p className="font-medium">{group?.name ?? "Your group"}</p>
          <p className="text-sm text-muted-foreground">
            Signed in as {group?.memberName ?? "member"} · {role}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isManager && group && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  setGroupError(null);
                  try {
                    await navigator.clipboard.writeText(group.inviteCode);
                    setInviteCopied(true);
                  } catch (caught) {
                    setGroupError(
                      caught instanceof Error
                        ? caught.message
                        : "Could not copy the invite code.",
                    );
                  }
                }}
              >
                {inviteCopied ? "Invite code copied" : "Copy invite code"}
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Rotate the invite code? Existing codes will stop working.",
                    )
                  ) {
                    return;
                  }
                  setGroupError(null);
                  try {
                    await rotateInviteCode({
                      inviteCode: crypto.randomUUID(),
                    });
                    setInviteCopied(false);
                  } catch (caught) {
                    setGroupError(
                      caught instanceof Error
                        ? caught.message
                        : "Could not rotate the invite code.",
                    );
                  }
                }}
              >
                Rotate invite
              </Button>
            </>
          )}
          <Link
            className={cn(buttonVariants({ variant: "ghost" }))}
            href="/logout"
          >
            Log out
          </Link>
        </div>
      </div>

      {groupError && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {groupError}
        </p>
      )}

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
        {links
          .filter(({ href }) => isManager || (href !== "/duties" && href !== "/rules"))
          .map(({ href, label, icon: Icon }) => (
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

      {managerOnlyPage ? (
        <p className="text-sm text-muted-foreground">
          Only the group manager can edit duties and scheduling rules.
        </p>
      ) : (
        children
      )}
    </main>
  );
}

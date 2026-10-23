"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SchedulerProvider } from "@/app/scheduler-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/app/(schedule)/_components/ui";

export function AuthenticatedWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const group = useQuery(
    api.scheduler.getMyGroup,
    isAuthenticated ? {} : "skip",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || (isAuthenticated && group === undefined)) {
    return <div className="m-auto p-8 text-muted-foreground">Loading account…</div>;
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
        <SectionCard className="w-full text-center">
          <h1 className="text-2xl font-semibold">Sign in required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access your group schedule and member workspace.
          </p>
          <Link
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            href="/login"
          >
            Go to login
          </Link>
        </SectionCard>
      </main>
    );
  }

  if (!group) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10">
        <GroupSetup
          error={error}
          busy={busy}
          run={run}
        />
      </main>
    );
  }

  return (
    <SchedulerProvider role={group.role} currentMemberId={group.memberId}>
      {children}
    </SchedulerProvider>
  );
}

function GroupSetup({
  error,
  busy,
  run,
}: {
  error: string | null;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const createGroup = useMutation(api.scheduler.createGroup);
  const joinGroup = useMutation(api.scheduler.joinGroup);
  const [groupName, setGroupName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const preview = useQuery(
    api.scheduler.getGroupInvitePreview,
    inviteCode.trim().length >= 32 ? { inviteCode: inviteCode.trim() } : "skip",
  );
  const [existingMemberId, setExistingMemberId] =
    useState<Id<"members"> | null>(null);

  async function create() {
    await run(() =>
      createGroup({
        name: groupName,
        memberName,
        inviteCode: crypto.randomUUID(),
      }),
    );
  }

  async function join() {
    await run(() =>
      joinGroup({
        inviteCode: inviteCode.trim(),
        memberName:
          preview?.unclaimedMembers.find(
            (member) => member.id === existingMemberId,
          )?.name ?? memberName,
        ...(existingMemberId ? { existingMemberId } : {}),
      }),
    );
  }

  return (
    <div className="w-full space-y-5">
      <SectionCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Set up your group</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a group as its manager, or join one with an invite code.
            </p>
          </div>
          <Link
            className="inline-flex h-9 items-center justify-center rounded-md px-2.5 text-sm font-medium transition-colors hover:bg-muted"
            href="/logout"
          >
            Log out
          </Link>
        </div>
        {error && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </SectionCard>

      <SectionCard>
        <h2 className="text-lg font-semibold">Create a group</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="Group name"
            placeholder="Group name"
            value={groupName}
            onChange={(event) => setGroupName(event.currentTarget.value)}
          />
          <Input
            aria-label="Your member name"
            placeholder="Your name in the group"
            value={memberName}
            onChange={(event) => setMemberName(event.currentTarget.value)}
          />
        </div>
        <Button
          className="mt-4"
          disabled={busy || !groupName.trim() || !memberName.trim()}
          onClick={() => void create()}
        >
          Create group
        </Button>
      </SectionCard>

      <SectionCard>
        <h2 className="text-lg font-semibold">Join a group</h2>
        <Input
          className="mt-4"
          aria-label="Group invite code"
          placeholder="Paste the group invite code"
          value={inviteCode}
          onChange={(event) => {
            setInviteCode(event.currentTarget.value);
            setExistingMemberId(null);
          }}
        />
        {inviteCode.trim().length >= 32 && preview === undefined && (
          <p className="mt-2 text-sm text-muted-foreground">
            Looking up invite…
          </p>
        )}
        {preview && (
          <>
            <p className="mt-3 text-sm">
              Joining <strong>{preview.name}</strong>
            </p>
            {preview.unclaimedMembers.length > 0 && (
              <label className="mt-3 block text-sm">
                Claim an existing member profile (optional)
                <select
                  className="mt-1 block h-10 w-full rounded-md border bg-background px-3"
                  value={existingMemberId ?? ""}
                  onChange={(event) =>
                    setExistingMemberId(
                      event.currentTarget.value
                        ? (event.currentTarget.value as Id<"members">)
                        : null,
                    )
                  }
                >
                  <option value="">Create a new profile</option>
                  {preview.unclaimedMembers.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!existingMemberId && (
              <Input
                className="mt-3"
                aria-label="Your member name"
                placeholder="Your name in the group"
                value={memberName}
                onChange={(event) => setMemberName(event.currentTarget.value)}
              />
            )}
            <Button
              className="mt-4"
              disabled={busy || (!existingMemberId && !memberName.trim())}
              onClick={() => void join()}
            >
              Join group
            </Button>
          </>
        )}
        {inviteCode.trim().length >= 32 && preview === null && (
          <p className="mt-2 text-sm text-destructive">
            No group was found for that invite code.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

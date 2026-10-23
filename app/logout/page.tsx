"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { ArrowLeft, CalendarDays, LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LogoutPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [busy, setBusy] = useState(false);
  const [didSignOut, setDidSignOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedOut = didSignOut || (!isLoading && !isAuthenticated);

  async function logout() {
    setError(null);
    setBusy(true);
    try {
      await signOut();
      setDidSignOut(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not sign out. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40 px-4 py-12">
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
        <section className="rounded-3xl border bg-card p-7 shadow-xl shadow-primary/5 sm:p-9">
          <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            {signedOut ? (
              <CalendarDays className="size-6" />
            ) : (
              <LogOut className="size-6" />
            )}
          </div>
          <p className="text-sm font-medium text-primary">SCHEDULER ACCOUNT</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {signedOut ? "You’re signed out" : "Log out"}
          </h1>
          <p className="mt-3 leading-6 text-muted-foreground">
            {signedOut
              ? "Your account has been signed out on this device. You can sign back in whenever you’re ready."
              : "Are you sure you want to end your session? You’ll need to sign in again to see your group schedule."}
          </p>
          {error && (
            <p
              className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          {isLoading ? (
            <p className="mt-7 text-sm text-muted-foreground" aria-live="polite">
              Checking your session…
            </p>
          ) : signedOut ? (
            <div className="mt-7 grid gap-3">
              <Link
                href="/login"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Sign in again
              </Link>
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
              >
                Return to home
              </Link>
            </div>
          ) : (
            <div className="mt-7 grid gap-3">
              <Button
                size="lg"
                variant="destructive"
                disabled={busy}
                onClick={() => void logout()}
              >
                <LogOut data-icon="inline-start" />
                {busy ? "Signing out…" : "Sign out"}
              </Button>
              <Link
                href="/schedule"
                className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
              >
                Stay signed in
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

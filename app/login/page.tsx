"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, LogIn } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AuthMode = "signIn" | "signUp";

export default function LoginPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (mode === "signUp" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const result = await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        ...(mode === "signUp" ? { name: name.trim() } : {}),
        ...(mode === "signUp" ? { confirmPassword } : {}),
        flow: mode,
      });
      if (result.signingIn) {
        router.replace("/schedule");
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "";
      const normalizedMessage = message.toLowerCase();
      if (normalizedMessage.includes("passwords do not match")) {
        setError("Passwords do not match.");
      } else if (
        mode === "signUp" &&
        (normalizedMessage.includes("already exists") ||
          normalizedMessage.includes("already in use"))
      ) {
        setError("An account with this email already exists. Try signing in.");
      } else if (mode === "signIn") {
        setError("Email or password is incorrect.");
      } else {
        setError(message || "Could not create your account. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setConfirmPassword("");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40 px-4 py-12">
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 size-[30rem] rounded-full bg-chart-2/10 blur-3xl" />
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
            <CalendarDays className="size-6" />
          </div>
          <p className="text-sm font-medium text-primary">WEEKLY SCHEDULER</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {isAuthenticated
              ? "Welcome back"
              : mode === "signIn"
                ? "Sign in to your group"
                : "Create your account"}
          </h1>
          <p className="mt-3 leading-6 text-muted-foreground">
            {isAuthenticated
              ? "You are signed in. Continue to your group's schedule or manage your account."
              : mode === "signIn"
                ? "Sign in with the email and password you chose for your account."
                : "Create an account with your name, email, and password, then join or create a group."}
          </p>

          {isLoading && !isAuthenticated && (
            <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
              Restoring your saved session. You can sign in below.
            </p>
          )}

          {error && (
            <p
              className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          {isAuthenticated ? (
            <div className="mt-7 grid gap-3">
              <Link
                className={cn(buttonVariants({ size: "lg" }))}
                href="/schedule"
              >
                Continue to your schedule
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
                href="/logout"
              >
                Log out
              </Link>
            </div>
          ) : (
            <>
              <div
                className="mt-6 grid grid-cols-2 rounded-lg bg-muted p-1"
                aria-label="Account access"
              >
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    mode === "signIn"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={mode === "signIn"}
                  onClick={() => changeMode("signIn")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    mode === "signUp"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={mode === "signUp"}
                  onClick={() => changeMode("signUp")}
                >
                  Create account
                </button>
              </div>
              <form className="mt-5 space-y-4" onSubmit={submit}>
                {mode === "signUp" && (
                  <label className="block space-y-2 text-sm font-medium">
                    Name
                    <Input
                      autoComplete="name"
                      maxLength={80}
                      required
                      value={name}
                      onChange={(event) => setName(event.currentTarget.value)}
                      placeholder="Your name"
                    />
                  </label>
                )}
                <label className="block space-y-2 text-sm font-medium">
                  Email
                  <Input
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  Password
                  <Input
                    type="password"
                    autoComplete={
                      mode === "signUp" ? "new-password" : "current-password"
                    }
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    placeholder="At least 8 characters"
                  />
                </label>
                {mode === "signUp" && (
                  <label className="block space-y-2 text-sm font-medium">
                    Confirm password
                    <Input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.currentTarget.value)
                      }
                      placeholder="Enter your password again"
                    />
                  </label>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  type="submit"
                  disabled={busy}
                >
                  <LogIn data-icon="inline-start" />
                  {busy
                    ? mode === "signIn"
                      ? "Signing in…"
                      : "Creating account…"
                    : mode === "signIn"
                      ? "Sign in"
                      : "Create account"}
                </Button>
              </form>
            </>
          )}
          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            Passwords are securely hashed by Convex Auth and are never stored
            in plain text.
          </p>
        </section>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Back to the home page
          </Link>
        </p>
      </div>
    </main>
  );
}

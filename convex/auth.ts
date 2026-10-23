import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { Value } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = params.email;
        if (typeof email !== "string") {
          throw new Error("Enter your email address.");
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (
          normalizedEmail.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
          throw new Error("Enter a valid email address.");
        }
        const profile: Record<string, Value> & { email: string } = {
          email: normalizedEmail,
        };
        if (params.flow === "signUp") {
          const name = params.name;
          if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
            throw new Error("Name must be between 1 and 80 characters.");
          }
          if (
            typeof params.password !== "string" ||
            params.password !== params.confirmPassword
          ) {
            throw new Error("Passwords do not match.");
          }
          profile.name = name.trim();
        }
        return profile;
      },
    }),
  ],
});

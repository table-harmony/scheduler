This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Authentication and groups

The app uses Convex Auth email-and-password authentication. Account creation
requires a display name, a valid email address, and matching passwords of at
least 8 characters. Emails are normalized to lowercase. Convex Auth hashes
passwords before storing them; no OAuth provider is required.

Configure Convex Auth's signing values (`JWT_PRIVATE_KEY` and `JWKS`), the
application URL (`SITE_URL`), and `CONVEX_SITE_URL` set to the deployment's
Convex HTTP-actions URL. The client also needs `NEXT_PUBLIC_CONVEX_URL`.
Never commit signing values or keys.

After signing in, a user can create a group as its manager or join one with an
invite code. Managers can copy or rotate that code. Each account can belong to
one group, and all schedule data is isolated by group. Existing ungrouped
scheduler records are claimed by the first group created after this change;
later groups start with their own data. Managers are the only users who can
change scheduling data, even if they bypass the UI. Members can view the
schedule and their own member profile, request next-week days off, and report
sick days. Managers can edit member availability and exclusions, set days-off
balances, and approve or decline requests.

The public home page is at `/`, account creation and sign-in are at `/login`,
and `/logout` provides an explicit sign-out confirmation page. Schedule pages
require an authenticated group account.

Member profiles and group membership use Convex IDs, not display names.
Display names must be unique within a group because schedule assignments are
shown by name.

Accounts created with the earlier username-only login used synthetic
`@scheduler.invalid` account identifiers and are not automatically linked to
an email address. Those accounts need a deliberate migration before their
users switch to email sign-in; do not delete them if their group memberships
must be preserved.

## Convex database

The schema is defined in `convex/schema.ts`; authenticated queries and
mutations are in `convex/scheduler.ts`. Profiles show weekly assignments and a
dated attendance calendar. Next-week day-off requests require manager
approval and consume the configured balance when approved; sick days are
recorded separately.

Run `pnpm exec convex dev` to synchronize the configured deployment while
developing, and `pnpm dev` to start the Next.js app.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

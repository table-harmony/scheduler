"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return (
      <div className="m-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">Convex is not configured</h1>
        <p className="mt-2 text-muted-foreground">
          Set NEXT_PUBLIC_CONVEX_URL to your Convex deployment URL and restart
          the app.
        </p>
      </div>
    );
  }

  return <ConfiguredConvexProvider convexUrl={convexUrl}>{children}</ConfiguredConvexProvider>;
}

function ConfiguredConvexProvider({
  convexUrl,
  children,
}: {
  convexUrl: string;
  children: React.ReactNode;
}) {
  const [client, setClient] = useState<ConvexReactClient | null>(null);

  useEffect(() => {
    let createdClient: ConvexReactClient | undefined;
    const timeout = window.setTimeout(() => {
      createdClient = new ConvexReactClient(convexUrl);
      setClient(createdClient);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
      if (createdClient) {
        void createdClient.close();
      }
    };
  }, [convexUrl]);

  if (!client) {
    return <div className="m-auto p-8 text-muted-foreground">Connecting to Convex…</div>;
  }

  return (
    <ConvexAuthProvider client={client}>
      {children}
    </ConvexAuthProvider>
  );
}

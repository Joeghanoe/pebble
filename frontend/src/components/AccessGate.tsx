import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

import { ApiError } from "@/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, SIGN_OUT_URL } from "@/lib/api";

/**
 * Checks that the signed-in account is allowed to use this deployment.
 *
 * oauth2-proxy hands a session to any Google account (it can only restrict to a list
 * through a file, which a stock image has no way to mount). The API's ALLOWED_EMAILS is
 * the gate that matters, and it answers 401 to everyone else. Without this, such an
 * account would get the full app shell with every panel silently empty; one probe up
 * front turns that into a sentence and a way back out.
 *
 * This is not a security boundary — the API refuses those requests whatever the SPA
 * renders. It only stops the app from looking broken.
 */
export function AccessGate({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { isPending, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.getMe(),
    retry: false,
    staleTime: Infinity,
  });

  if (isPending) {
    // Deliberately blank: the proxy has already shown Google's sign-in by this point,
    // and a spinner for one fast same-origin request only adds a flash.
    return null;
  }

  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
            <h2 className="text-lg font-semibold">
              This account cannot open Pebble
            </h2>
            <p className="text-sm text-muted-foreground">
              You signed in with Google, but this deployment only serves its
              owner. Sign out and try the account it belongs to.
            </p>
            <Button variant="outline" size="lg" asChild>
              <a href={SIGN_OUT_URL}>Sign out</a>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Any other failure (the API still starting, Postgres not up yet) is the app's own
  // problem to report per screen, so it renders and the queries show their errors.
  return <>{children}</>;
}

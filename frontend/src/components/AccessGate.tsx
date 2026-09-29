import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/client";
import { api } from "@/lib/api";

/**
 * Checks that the signed-in account is allowed to use this deployment.
 *
 * oauth2-proxy hands a session to any Google account (it can only restrict to a list
 * through a file, which a stock image has no way to mount). The API's ALLOWED_EMAILS is
 * the gate that matters, and it answers 401 to everyone else. Without this, such an
 * account would get the full app shell with every panel silently empty; one probe up
 * front replaces the shell with a page that says nothing.
 *
 * This is not a security boundary — the API refuses those requests whatever the SPA
 * renders. It decides what a stranger learns, and the answer is: nothing. The page
 * reads as a generic firewall block — no product name, no mention of Google, no
 * sign-out link — so an account that is not the owner's cannot tell what it reached.
 * The owner, signed in with the wrong account, knows to visit /oauth2/sign_out.
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
    return <Blocked />;
  }

  // Any other failure (the API still starting, Postgres not up yet) is the app's own
  // problem to report per screen, so it renders and the queries show their errors.
  return <>{children}</>;
}

/**
 * A deliberately generic "request blocked" page, in the style of a web application
 * firewall: plain, unbranded, and nothing in it names this app or how it
 * authenticates. The reference is random per load, like the incident IDs such pages
 * print; it maps to nothing.
 */
function Blocked() {
  const reference = React.useMemo(() => {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }, []);

  React.useEffect(() => {
    const previous = document.title;
    document.title = "403 Forbidden";
    // The tab icon is the app's own; a block page has none.
    const icons =
      document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
    icons.forEach((icon) => icon.remove());
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{
        background: "#ffffff",
        color: "#1f2328",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      }}
    >
      <div className="w-full max-w-[560px]">
        <h1 className="text-[28px] font-semibold">403 Forbidden</h1>
        <p
          className="mt-3 text-[15px] leading-relaxed"
          style={{ color: "#57606a" }}
        >
          Request blocked. Automated or suspicious traffic was detected from
          your connection, and access to this resource has been denied by the
          security policy.
        </p>
        <hr className="my-6" style={{ borderColor: "#d0d7de" }} />
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]"
          style={{
            color: "#57606a",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          }}
        >
          <dt>Reference</dt>
          <dd>{reference}</dd>
          <dt>Time</dt>
          <dd>{new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</dd>
        </dl>
      </div>
    </div>
  );
}

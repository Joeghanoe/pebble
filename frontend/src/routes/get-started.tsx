import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { EmptyState } from "@/frontend/screens/EmptyState";

/**
 * The first-run screen, reachable from the sidebar at any time — it doubles as
 * the "how does this work" page once the portfolio is no longer empty.
 */
export const getStartedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/get-started",
  component: EmptyState,
});

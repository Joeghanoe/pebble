import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { Settings } from "@/frontend/screens/Settings";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/frontend/screens/Settings/sections";
import { VenuesService } from "@/client";
import type { GetVenuesResponse } from "@/types/api";

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  // The open section is a search param, not a child route: one screen, one
  // loader, and /settings?section=venues still bookmarks and survives Back.
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: SettingsSection } => {
    const section = SETTINGS_SECTIONS.find((s) => s.id === search.section);
    return section ? { section: section.id } : {};
  },
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({
      queryKey: ["venues"],
      queryFn: () =>
        VenuesService.listVenues() as unknown as Promise<GetVenuesResponse>,
    });
  },
  component: Settings,
});

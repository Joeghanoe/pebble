import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { Settings } from "@/frontend/screens/Settings";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/frontend/screens/Settings/sections";
import { ExchangesService } from "@/client";
import type { GetExchangesResponse } from "@/types/api";

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  // The open section is a search param, not a child route: one screen, one
  // loader, and /settings?section=exchanges still bookmarks and survives Back.
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: SettingsSection } => {
    const section = SETTINGS_SECTIONS.find((s) => s.id === search.section);
    return section ? { section: section.id } : {};
  },
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({
      queryKey: ["exchanges"],
      queryFn: () =>
        ExchangesService.listExchangesApiExchangesGet() as unknown as Promise<GetExchangesResponse>,
    });
  },
  component: Settings,
});

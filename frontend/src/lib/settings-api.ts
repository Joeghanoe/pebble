// src/lib/settings-api.ts
import { toast } from "sonner";
import { SettingsService } from "@/client";
import { apiErrorMessage } from "@/lib/errors";

/** The settings documents the API keeps, one row each. */
export type SettingName = "preferences" | "strategy";

export function pushSetting(
  name: SettingName,
  value: object,
): Promise<unknown> {
  return SettingsService.putSettingApiSettingsNamePut({
    name,
    requestBody: value as Record<string, unknown>,
  });
}

export function fetchSettings() {
  return SettingsService.getSettingsApiSettingsGet();
}

export function reportSyncError(error: unknown): void {
  toast.error(
    apiErrorMessage(
      error,
      "Settings could not be saved to the server. They are kept on this device and retried.",
    ),
  );
}

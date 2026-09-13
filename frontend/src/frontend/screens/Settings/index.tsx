import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExchangesService } from "@/client";
import type { GetExchangesResponse } from "@/types/api";
import { api, apiUrl, SIGN_OUT_URL } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PREFERENCES,
  setPreference,
  usePreferences,
  type Preferences,
} from "@/lib/preferences";
import { SiteHeader } from "@/components/site-header";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  PbCard,
  PbGhostButton,
  PbSegmented,
  PbToggle,
} from "@/frontend/components/pebble";

/**
 * Settings.
 *
 * Nothing here has a save button: every control writes on change. The groups run
 * from the harmless to the irreversible, and the danger zone is last for that
 * reason.
 */
export function Settings() {
  const prefs = usePreferences();
  const queryClient = useQueryClient();

  const { data: exchangesData } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () =>
      ExchangesService.listExchangesApiExchangesGet() as unknown as Promise<GetExchangesResponse>,
  });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.getMe(),
  });

  const [exchangeName, setExchangeName] = React.useState("");
  const [exchangeType, setExchangeType] = React.useState<
    "crypto" | "broker" | "manual"
  >("crypto");

  const addExchange = useMutation({
    mutationFn: (body: { name: string; type: string }) =>
      api.createExchange(body),
    onSuccess: () => {
      setExchangeName("");
      void queryClient.invalidateQueries({ queryKey: ["exchanges"] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Could not add that exchange.")),
  });

  const deleteExchange = useMutation({
    mutationFn: (id: number) => api.deleteExchange(id),
    onSuccess: () => {
      toast.success("Exchange deleted.");
      void queryClient.invalidateQueries({ queryKey: ["exchanges"] });
    },
    // A 409 names the positions still pointing at this exchange, which is the
    // whole reason the endpoint returns one instead of a bare 500.
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Could not delete that exchange.")),
  });

  const exchanges = exchangesData?.exchanges ?? [];

  return (
    <>
      <SiteHeader name="Settings" sublabel="local · v2.0.0" />
      <div className="pb-fade flex justify-center p-5">
        <div className="flex w-full max-w-[720px] flex-col gap-3.5">
          <Group title="Portfolio" note="euro, and how numbers are shown">
            <Row
              label="Denominate in BTC"
              description="Show a sats value alongside every position"
            >
              <PbToggle
                label="Denominate in BTC"
                checked={prefs.denominateInBtc}
                onChange={(next) => setPreference("denominateInBtc", next)}
              />
            </Row>
            <Row
              label="Full precision"
              description="Eight decimals on crypto quantities"
            >
              <PbToggle
                label="Full precision"
                checked={prefs.fullPrecision}
                onChange={(next) => setPreference("fullPrecision", next)}
              />
            </Row>
            <Row label="Table density" description="Row height in both tables">
              <PbSegmented
                mono={false}
                options={["Dense", "Comfortable"] as const}
                value={prefs.density === "dense" ? "Dense" : "Comfortable"}
                onChange={(next) =>
                  setPreference(
                    "density",
                    next === "Dense" ? "dense" : "comfortable",
                  )
                }
              />
            </Row>
          </Group>

          <Group title="Data" note="single-tenant, one portfolio">
            <Row
              label="Auto-refresh prices"
              description="Pull quotes while the app is open"
            >
              <PbToggle
                label="Auto-refresh prices"
                checked={prefs.autoRefresh}
                onChange={(next) => setPreference("autoRefresh", next)}
              />
            </Row>
            <Row label="Interval" description="How often quotes are pulled">
              <PbSegmented
                options={["1m", "5m", "15m"] as const}
                value={
                  `${prefs.refreshIntervalMinutes}m` as "1m" | "5m" | "15m"
                }
                onChange={(next) =>
                  setPreference(
                    "refreshIntervalMinutes",
                    Number.parseInt(
                      next,
                      10,
                    ) as Preferences["refreshIntervalMinutes"],
                  )
                }
              />
            </Row>
          </Group>

          <Group title="Appearance" note="purple chrome · orange actions">
            <Row label="Theme" description="Pebble is built dark-first">
              <PbSegmented
                mono={false}
                options={["Dark", "Midnight", "System"] as const}
                value={
                  prefs.theme === "dark"
                    ? "Dark"
                    : prefs.theme === "midnight"
                      ? "Midnight"
                      : "System"
                }
                onChange={(next) =>
                  setPreference(
                    "theme",
                    next.toLowerCase() as Preferences["theme"],
                  )
                }
              />
            </Row>
          </Group>

          <Group title="Account" note="Google, through the auth proxy">
            <Row
              label={me?.email || "Signed in"}
              description="Only this address reaches the API"
            >
              <a href={SIGN_OUT_URL}>
                <PbGhostButton>Sign out</PbGhostButton>
              </a>
            </Row>
          </Group>

          <Group title="Exchanges" note="where each position is held">
            {exchanges.map((exchange) => (
              <Row
                key={exchange.id}
                label={exchange.name}
                description={exchange.type}
              >
                <ConfirmButton
                  title={`Delete ${exchange.name}?`}
                  description="The exchange is removed. Positions held on it have to be deleted or moved first."
                  onConfirm={() => deleteExchange.mutateAsync(exchange.id)}
                >
                  <DangerButton>Delete</DangerButton>
                </ConfirmButton>
              </Row>
            ))}
            <form
              className="flex flex-wrap items-center gap-2 px-[18px] py-[13px]"
              onSubmit={(event) => {
                event.preventDefault();
                addExchange.mutate({ name: exchangeName, type: exchangeType });
              }}
            >
              <input
                value={exchangeName}
                onChange={(event) => setExchangeName(event.target.value)}
                placeholder="e.g. Kraken"
                required
                className="h-[30px] min-w-0 flex-1 rounded-[9px] border border-pb-input bg-pb-raised px-2.5 text-[12px] outline-none focus:border-[rgba(247,147,26,.55)]"
              />
              <PbSegmented
                mono={false}
                options={["crypto", "broker", "manual"] as const}
                value={exchangeType}
                onChange={setExchangeType}
              />
              <PbGhostButton
                type="submit"
                disabled={addExchange.isPending || !exchangeName.trim()}
              >
                Add
              </PbGhostButton>
            </form>
          </Group>

          <Group title="Danger zone" note="cannot be undone">
            <Row
              label="Export portfolio"
              description="Download every exchange, position, transaction and snapshot as JSON"
            >
              {/* A plain link: the response carries its own Content-Disposition,
                  and the browser handles the save without any script. */}
              <a href={apiUrl("/api/export/")}>
                <PbGhostButton>Export</PbGhostButton>
              </a>
            </Row>
            <Row
              label="Reset preferences"
              description="Puts every setting on this page back to its default"
            >
              <DangerButton
                onClick={() => {
                  for (const key of Object.keys(
                    DEFAULT_PREFERENCES,
                  ) as (keyof Preferences)[]) {
                    setPreference(key, DEFAULT_PREFERENCES[key]);
                  }
                  toast.success("Preferences reset.");
                }}
              >
                Reset
              </DangerButton>
            </Row>
          </Group>

          <p className="text-center font-number text-[10.5px] text-pb-faintest">
            Pebble 2.0.0 · single-tenant — one portfolio, one owner
          </p>
        </div>
      </div>
    </>
  );
}

function Group({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note: string;
  readonly children: React.ReactNode;
}) {
  return (
    <PbCard>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-pb-subtle px-[18px] py-[13px]">
        <h2 className="text-[12.5px] font-semibold">{title}</h2>
        <span className="font-number text-[10.5px] text-pb-faint">{note}</span>
      </div>
      {children}
    </PbCard>
  );
}

function Row({
  label,
  description,
  children,
}: {
  readonly label: React.ReactNode;
  readonly description: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-pb-hairline px-[18px] py-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">
          {label}
        </span>
        <span className="block text-[11.5px] text-pb-muted">{description}</span>
      </div>
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  );
}

function DangerButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "h-7 rounded-[8px] border px-3 text-[11.5px] font-medium text-pb-down transition-colors hover:bg-[rgba(248,113,113,.1)]",
        className,
      )}
      style={{ borderColor: "rgba(248,113,113,.3)" }}
      {...props}
    />
  );
}

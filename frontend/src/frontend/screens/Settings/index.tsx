import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { VenuesService } from "@/client";
import type { GetVenuesResponse } from "@/types/api";
import { api, apiUrl, SIGN_OUT_URL } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PREFERENCES,
  setPreference,
  usePreferences,
  type Preferences,
} from "@/lib/preferences";
import {
  resetStrategySettings,
  setProfitRule,
  setRegimeCryptoShare,
  setRule,
  setScenarioRate,
  setStrategySetting,
  TARGET_AGE,
  useStrategySettings,
} from "@/lib/strategy-settings";
import {
  MAX_HISTORY_DAYS,
  SCENARIO_NAMES,
  type Regime,
  type RegimeMode,
} from "@/lib/strategy";
import { formatEurWhole } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
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
  const strategy = useStrategySettings();
  const queryClient = useQueryClient();

  const { data: venuesData } = useQuery({
    queryKey: ["venues"],
    queryFn: () =>
      VenuesService.listVenuesApiVenuesGet() as unknown as Promise<GetVenuesResponse>,
  });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.getMe(),
  });

  const renameVenue = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api.renameVenue(from, to),
    onSuccess: () => {
      toast.success("Venue renamed.");
      void queryClient.invalidateQueries({ queryKey: ["venues"] });
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Could not rename that venue.")),
  });

  const venues = venuesData?.venues ?? [];

  return (
    <>
      <SiteHeader name="Settings" />
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

          <Group title="Strategy" note="target, contribution, scenarios">
            <Row
              label="Target"
              description="What the portfolio should be worth"
            >
              <NumberField
                label="Target amount"
                prefix="€"
                value={strategy.targetAmount}
                min={1}
                onCommit={(next) => setStrategySetting("targetAmount", next)}
              />
            </Row>
            <Row
              label="Birthdate"
              description={`The target is due on your ${TARGET_AGE}th birthday`}
            >
              <input
                type="date"
                aria-label="Birthdate"
                value={strategy.birthdate ?? ""}
                onChange={(event) =>
                  setStrategySetting(
                    "birthdate",
                    /^\d{4}-\d{2}-\d{2}$/.test(event.target.value)
                      ? event.target.value
                      : null,
                  )
                }
                className={FIELD_CLASS}
              />
            </Row>
            <Row
              label="Monthly contribution"
              description="Split between BTC and stocks by the regime"
            >
              <NumberField
                label="Monthly contribution"
                prefix="€"
                value={strategy.monthlyContribution}
                min={0}
                onCommit={(next) =>
                  setStrategySetting("monthlyContribution", next)
                }
              />
            </Row>
            <Row
              label="Count sideline cash"
              description="Include the cash buffer in progress toward the target"
            >
              <PbToggle
                label="Count sideline cash"
                checked={strategy.includeCash}
                onChange={(next) => setStrategySetting("includeCash", next)}
              />
            </Row>
            {SCENARIO_NAMES.map((name) => (
              <Row
                key={name}
                label={`${name[0].toUpperCase()}${name.slice(1)} scenario`}
                description="Annual return · crypto / equity"
              >
                <div className="flex items-center gap-1.5">
                  {(["crypto", "equity"] as const).map((bucket) => (
                    <NumberField
                      key={bucket}
                      label={`${name} ${bucket} annual return`}
                      suffix="%"
                      width="w-[76px]"
                      // Percent on screen, a fraction in storage. Rounded so
                      // 0.15 × 100 does not print as 15.000000000000002.
                      value={
                        Math.round(strategy.scenarios[name][bucket] * 1e6) / 1e4
                      }
                      min={-99.99}
                      onCommit={(next) =>
                        setScenarioRate(name, bucket, next / 100)
                      }
                    />
                  ))}
                </div>
              </Row>
            ))}
          </Group>

          <Group title="DCA rule" note="BTC vs its moving average">
            <Row
              label="Regime"
              description="Follow the rule, or hold a regime by hand"
            >
              <PbSegmented
                mono={false}
                options={["Auto", "Defensive", "Risk-on"] as const}
                value={
                  strategy.regimeMode === "auto"
                    ? "Auto"
                    : strategy.regimeMode === "defensive"
                      ? "Defensive"
                      : "Risk-on"
                }
                onChange={(next) =>
                  setStrategySetting(
                    "regimeMode",
                    (next === "Auto"
                      ? "auto"
                      : next === "Defensive"
                        ? "defensive"
                        : "risk-on") as RegimeMode,
                  )
                }
              />
            </Row>
            <Row
              label="Average"
              description="Which moving average BTC is measured against"
            >
              <PbSegmented
                options={["EMA", "SMA"] as const}
                value={strategy.rule.average === "ema" ? "EMA" : "SMA"}
                onChange={(next) =>
                  setRule("average", next === "EMA" ? "ema" : "sma")
                }
              />
            </Row>
            <Row
              label="Average length"
              description={`Days. With the confirmation, fits in the ${MAX_HISTORY_DAYS} days of BTC history kept`}
            >
              <NumberField
                label="Average length in days"
                suffix="d"
                width="w-[92px]"
                integer
                value={strategy.rule.window}
                min={2}
                max={MAX_HISTORY_DAYS - strategy.rule.confirmDays}
                onCommit={(next) => setRule("window", next)}
              />
            </Row>
            <Row
              label="Confirmation"
              description="Consecutive closes on one side before the regime switches"
            >
              <NumberField
                label="Confirmation in days"
                suffix="d"
                width="w-[92px]"
                integer
                value={strategy.rule.confirmDays}
                min={1}
                max={MAX_HISTORY_DAYS - strategy.rule.window}
                onCommit={(next) => setRule("confirmDays", next)}
              />
            </Row>
            {(["risk-on", "defensive"] as const).map((regime: Regime) => {
              const contribution = strategy.monthlyContribution;
              const btc = strategy.splits[regime].crypto * contribution;
              return (
                <Row
                  key={regime}
                  label={
                    regime === "risk-on"
                      ? "Risk-on: to BTC"
                      : "Defensive: to BTC"
                  }
                  description={`${formatEurWhole(btc)} BTC / ${formatEurWhole(contribution - btc)} stocks of ${formatEurWhole(contribution)}`}
                >
                  <NumberField
                    label={`${regime} amount to BTC`}
                    prefix="€"
                    value={Math.round(btc * 100) / 100}
                    min={0}
                    max={contribution}
                    onCommit={(next) =>
                      contribution > 0 &&
                      setRegimeCryptoShare(regime, next / contribution)
                    }
                  />
                </Row>
              );
            })}
          </Group>

          <Group
            title="Profit taking"
            note="a signal on the Strategy page, never an order"
          >
            <Row
              label="Days above the average"
              description="Consecutive closes above before trimming BTC"
            >
              <NumberField
                label="Days above the average"
                suffix="d"
                width="w-[92px]"
                integer
                value={strategy.profitRule.minDaysAbove}
                min={1}
                max={MAX_HISTORY_DAYS}
                onCommit={(next) => setProfitRule("minDaysAbove", next)}
              />
            </Row>
            <Row
              label="BTC share over"
              description="Of the whole portfolio, cash included"
            >
              <NumberField
                label="BTC share threshold"
                suffix="%"
                width="w-[92px]"
                value={Math.round(strategy.profitRule.maxBtcShare * 1e6) / 1e4}
                min={0}
                max={100}
                onCommit={(next) => setProfitRule("maxBtcShare", next / 100)}
              />
            </Row>
            <Row
              label="Sell"
              description="Share of the BTC held, once per run above"
            >
              <NumberField
                label="Share of BTC to sell"
                suffix="%"
                width="w-[92px]"
                value={Math.round(strategy.profitRule.sellFraction * 1e6) / 1e4}
                min={0}
                max={100}
                onCommit={(next) => setProfitRule("sellFraction", next / 100)}
              />
            </Row>
            <Row
              label="Proceeds to S&P 500"
              description={`The rest, ${Math.round((1 - strategy.profitRule.sp500Share) * 100)}%, to ex-US`}
            >
              <NumberField
                label="Share of proceeds to the S&P 500"
                suffix="%"
                width="w-[92px]"
                value={Math.round(strategy.profitRule.sp500Share * 1e6) / 1e4}
                min={0}
                max={100}
                onCommit={(next) => setProfitRule("sp500Share", next / 100)}
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

          <Group title="Venues" note="where your money sits">
            {venues.length === 0 && (
              <p className="px-[18px] py-[13px] text-[11.5px] text-pb-muted">
                A venue appears here once a transaction names it — type one in
                the Where field when you log a buy, sell or move.
              </p>
            )}
            {venues.map((venue) => (
              <Row
                key={venue.name}
                label={venue.name}
                description={`${venue.transactions} transaction${venue.transactions === 1 ? "" : "s"}`}
              >
                <VenueRename
                  name={venue.name}
                  onRename={(to) =>
                    renameVenue.mutate({ from: venue.name, to })
                  }
                />
              </Row>
            ))}
          </Group>

          <Group title="Danger zone" note="cannot be undone">
            <Row
              label="Export portfolio"
              description="Download every position, transaction and snapshot as JSON"
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
                  resetStrategySettings();
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

const FIELD_CLASS =
  "h-[30px] rounded-[9px] border border-pb-input bg-pb-raised px-2.5 font-number text-[12px] tabular-nums outline-none focus:border-[rgba(247,147,26,.55)]";

/**
 * A number typed as text and committed on blur or Enter.
 *
 * Writing on every keystroke would store the half-typed `1` of `1000` and redraw
 * the Strategy view around it, so this field holds a draft and only writes a
 * value that parses and clears `min`. Anything else snaps back to the stored
 * value. Accepts a decimal comma, since that is how every figure here is printed.
 */
function NumberField({
  label,
  value,
  onCommit,
  min,
  max = Number.POSITIVE_INFINITY,
  integer = false,
  prefix,
  suffix,
  width = "w-[120px]",
}: {
  readonly label: string;
  readonly value: number;
  readonly onCommit: (next: number) => void;
  readonly min: number;
  readonly max?: number;
  /** Whole numbers only, for day counts. */
  readonly integer?: boolean;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly width?: string;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? String(value).replace(".", ",");

  function commit() {
    if (draft === null) {
      return;
    }
    const parsed = Number(draft.replace(/\s/g, "").replace(",", "."));
    if (
      draft.trim() !== "" &&
      Number.isFinite(parsed) &&
      parsed >= min &&
      parsed <= max &&
      (!integer || Number.isInteger(parsed))
    ) {
      onCommit(parsed);
    }
    setDraft(null);
  }

  return (
    <label className={cn(FIELD_CLASS, "flex items-center gap-1", width)}>
      {prefix && <span className="text-pb-faint">{prefix}</span>}
      <input
        aria-label={label}
        inputMode="decimal"
        value={shown}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
          if (event.key === "Escape") {
            setDraft(null);
          }
        }}
        className="w-full min-w-0 bg-transparent text-right outline-none"
      />
      {suffix && <span className="text-pb-faint">{suffix}</span>}
    </label>
  );
}

/**
 * Rename in place: the name becomes an input, Enter or blur saves. Renaming onto
 * a venue that already exists merges the two, which is how a typo is folded
 * into the venue it meant.
 */
function VenueRename({
  name,
  onRename,
}: {
  readonly name: string;
  readonly onRename: (to: string) => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);

  if (draft === null) {
    return <PbGhostButton onClick={() => setDraft(name)}>Rename</PbGhostButton>;
  }

  function commit() {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (next && next !== name) {
      onRename(next);
    }
  }

  return (
    <input
      autoFocus
      aria-label={`Rename ${name}`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
        }
        if (event.key === "Escape") {
          setDraft(null);
        }
      }}
      className={cn(FIELD_CLASS, "w-[160px] text-[12px]")}
    />
  );
}

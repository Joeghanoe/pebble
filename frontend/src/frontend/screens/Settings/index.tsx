import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Building2,
  HandCoins,
  Palette,
  SlidersHorizontal,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ExchangesService } from "@/client";
import type { GetExchangesResponse } from "@/types/api";
import { api, apiUrl, SIGN_OUT_URL } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  resetPreferences,
  setPreference,
  usePreferences,
  type Preferences,
} from "@/lib/preferences";
import { useSettingsSyncStatus } from "@/lib/settings-sync";
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
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  PbCard,
  PbGhostButton,
  PbSegmented,
  PbToggle,
} from "@/frontend/components/pebble";
import { PbDot } from "@/frontend/components/pebble/primitives";
import { SETTINGS_SECTIONS, type SettingsSection } from "./sections";

const SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Palette,
  strategy: Target,
  dca: ArrowLeftRight,
  profit: HandCoins,
  exchanges: Building2,
  account: UserRound,
};

/**
 * Settings.
 *
 * A section nav beside one section at a time, rather than every control on one
 * long page: the strategy inputs alone outgrew a single scroll. The open section
 * lives in the URL (`?section=`), so it bookmarks and survives Back.
 *
 * Nothing here has a save button: every control writes on change, to this
 * device at once and to the API right after, so every device the owner signs
 * in on shows the same settings. See `synced-document`.
 */
export function Settings() {
  const { section = "general" } = useSearch({ from: "/settings" });
  const active =
    SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];

  return (
    <>
      <SiteHeader name="Settings" />
      <div className="pb-fade mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-5 sm:px-6 md:flex-row md:gap-8 md:py-7">
        <SectionNav active={active.id} />

        <div className="flex min-w-0 max-w-[680px] flex-1 flex-col gap-3.5">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1 border-b border-pb-subtle pb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-semibold">{active.label}</h2>
              <p className="mt-0.5 text-[12px] text-pb-muted">
                {active.description}
              </p>
            </div>
            <SyncBadge />
          </div>

          {active.id === "general" && <GeneralSection />}
          {active.id === "appearance" && <AppearanceSection />}
          {active.id === "strategy" && <StrategySection />}
          {active.id === "dca" && <DcaSection />}
          {active.id === "profit" && <ProfitSection />}
          {active.id === "exchanges" && <ExchangesSection />}
          {active.id === "account" && <AccountSection />}

          <p className="pt-2 text-center font-number text-[10.5px] text-pb-faintest">
            Pebble 2.0.0 · single-tenant — one portfolio, one owner
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * A vertical list beside the content on desktop; a row of pills that scrolls
 * sideways on a phone, where a 196px column would leave nothing for the rows.
 */
function SectionNav({ active }: { readonly active: SettingsSection }) {
  return (
    <nav
      aria-label="Settings sections"
      className="-mx-4 shrink-0 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:sticky md:top-[82px] md:mx-0 md:w-[196px] md:self-start md:overflow-visible md:px-0"
    >
      <ul className="flex gap-1 md:flex-col">
        {SETTINGS_SECTIONS.map(({ id, label }) => {
          const Icon = SECTION_ICONS[id];
          const isActive = id === active;
          return (
            <li key={id} className="shrink-0">
              <Link
                to="/settings"
                search={{ section: id }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-[12.5px] font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-pb-nav-active text-pb-text"
                    : "text-[#9E97B4] hover:bg-pb-nav-hover hover:text-pb-text",
                )}
              >
                <Icon size={14} strokeWidth={1.8} className="shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SyncBadge() {
  const status = useSettingsSyncStatus();
  const { color, text } =
    status === "error"
      ? { color: "#F87171", text: "Not saved to server · retrying" }
      : status === "saving"
        ? { color: "#F7931A", text: "Saving…" }
        : { color: "#34D399", text: "Synced across devices" };
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 font-number text-[10.5px] text-pb-faint"
    >
      <PbDot color={color} size={5} />
      {text}
    </span>
  );
}

/* ── Sections ────────────────────────────────────────────────────────────── */

function GeneralSection() {
  const prefs = usePreferences();
  return (
    <>
      <Group title="Numbers" note="euro, and how they are shown">
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

      <Group title="Quotes" note="pulled while the app is open">
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
            value={`${prefs.refreshIntervalMinutes}m` as "1m" | "5m" | "15m"}
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
    </>
  );
}

function AppearanceSection() {
  const prefs = usePreferences();
  return (
    <Group>
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
            setPreference("theme", next.toLowerCase() as Preferences["theme"])
          }
        />
      </Row>
    </Group>
  );
}

function StrategySection() {
  const strategy = useStrategySettings();
  return (
    <>
      <Group title="Target" note="what the plan works toward">
        <Row label="Target" description="What the portfolio should be worth">
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
            onCommit={(next) => setStrategySetting("monthlyContribution", next)}
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
      </Group>

      <Group title="Scenarios" note="annual return, per scenario">
        {SCENARIO_NAMES.map((name) => (
          <Row
            key={name}
            label={`${name[0].toUpperCase()}${name.slice(1)}`}
            description="Crypto / equity"
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
                  onCommit={(next) => setScenarioRate(name, bucket, next / 100)}
                />
              ))}
            </div>
          </Row>
        ))}
      </Group>
    </>
  );
}

function DcaSection() {
  const strategy = useStrategySettings();
  const contribution = strategy.monthlyContribution;
  return (
    <>
      <Group title="Regime" note="BTC vs its moving average">
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
      </Group>

      <Group
        title="Split"
        note={`of the ${formatEurWhole(contribution)} monthly contribution`}
      >
        {(["risk-on", "defensive"] as const).map((regime: Regime) => {
          const btc = strategy.splits[regime].crypto * contribution;
          return (
            <Row
              key={regime}
              label={
                regime === "risk-on" ? "Risk-on: to BTC" : "Defensive: to BTC"
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
    </>
  );
}

function ProfitSection() {
  const strategy = useStrategySettings();
  return (
    <Group>
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
      <Row label="Sell" description="Share of the BTC held, once per run above">
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
  );
}

function ExchangesSection() {
  const queryClient = useQueryClient();
  const { data: exchangesData } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () =>
      ExchangesService.listExchangesApiExchangesGet() as unknown as Promise<GetExchangesResponse>,
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
    <Group>
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
          aria-label="Exchange name"
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
  );
}

function AccountSection() {
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.getMe(),
  });
  return (
    <>
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

      <Group title="Data" note="a backup, not a sync">
        <Row
          label="Export portfolio"
          description="Every exchange, position, transaction, snapshot and setting as JSON"
        >
          {/* A plain link: the response carries its own Content-Disposition,
              and the browser handles the save without any script. */}
          <a href={apiUrl("/api/export/")}>
            <PbGhostButton>Export</PbGhostButton>
          </a>
        </Row>
      </Group>

      <Group title="Danger zone" note="cannot be undone">
        <Row
          label="Reset settings"
          description="Puts every setting back to its default, on every device"
        >
          <ConfirmButton
            title="Reset every setting?"
            description="Display preferences, the strategy target, scenarios and rules all go back to their defaults, on every device. The portfolio itself is untouched."
            onConfirm={() => {
              resetPreferences();
              resetStrategySettings();
              toast.success("Settings reset.");
            }}
          >
            <DangerButton>Reset</DangerButton>
          </ConfirmButton>
        </Row>
      </Group>
    </>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

/** A card of rows. The title is optional: a one-card section's heading already names it. */
function Group({
  title,
  note,
  children,
}: {
  readonly title?: string;
  readonly note?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <PbCard>
      {title && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-pb-subtle px-[18px] py-[13px]">
          <h3 className="text-[12.5px] font-semibold">{title}</h3>
          {note && (
            <span className="font-number text-[10.5px] text-pb-faint">
              {note}
            </span>
          )}
        </div>
      )}
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

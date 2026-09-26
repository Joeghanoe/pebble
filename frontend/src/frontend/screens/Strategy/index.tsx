import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PricesService } from "@/client";
import type { GetBtcDailyResponse } from "@/types/api";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";
import { usePortfolio } from "@/lib/portfolio";
import { TARGET_AGE, useStrategySettings } from "@/lib/strategy-settings";
import {
  addMonths,
  birthdayAt,
  bucketHoldings,
  CONFIRM_DAYS,
  contiguousDailyCloses,
  detectRegime,
  evaluateScenarios,
  monthsBetween,
  progressTowardTarget,
  REGIME_SPLIT,
  SMA_WINDOW,
  splitContribution,
  type Regime,
  type RegimeState,
  type ScenarioName,
  type ScenarioOutcome,
  type Split,
} from "@/lib/strategy";
import {
  formatEurDelta,
  formatEurPrice,
  formatEurWhole,
  formatPct,
} from "@/lib/format";
import {
  PbBar,
  PbCard,
  PbCardHeader,
  PbEyebrow,
  PbProjectionChart,
} from "@/frontend/components/pebble";

const REGIME_LABEL: Record<Regime, string> = {
  defensive: "Defensive",
  "risk-on": "Risk-on",
};

const SCENARIO_LABEL: Record<ScenarioName, string> = {
  bear: "Bear",
  base: "Base",
  bull: "Bull",
};

const SCENARIO_COLOR: Record<ScenarioName, string> = {
  bear: "#6F6885",
  base: "#8B5CF6",
  bull: "#C084FC",
};

/** Today in the viewer's calendar, not UTC's. */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Strategy: the DCA rule's regime, progress toward the target, and what it
 * takes to get there under three sets of assumptions.
 *
 * Everything shown is derived here from three inputs — the BTC closes, the
 * positions, and the settings — through the pure functions in `lib/strategy`.
 * A price refresh invalidates the closes, so the regime follows new prices
 * without anything on this screen having to ask.
 */
export function Strategy() {
  const portfolio = usePortfolio();
  const settings = useStrategySettings();
  const { data: btc, isLoading: btcLoading } = useQuery({
    queryKey: ["btc-daily"],
    queryFn: () =>
      PricesService.getBtcDailyApiPricesBtcDailyGet() as unknown as Promise<GetBtcDailyResponse>,
  });

  const regime = React.useMemo<RegimeState | null>(() => {
    if (!btc) {
      return null;
    }
    return detectRegime(
      contiguousDailyCloses(
        btc.closes.map((c) => ({ date: c.date, price: c.price_eur })),
      ),
    );
  }, [btc]);

  const today = localToday();
  const holdings = bucketHoldings(portfolio.positions);
  const progress = progressTowardTarget(
    holdings,
    settings.targetAmount,
    settings.includeCash,
  );
  const targetDate = settings.birthdate
    ? birthdayAt(settings.birthdate, TARGET_AGE)
    : null;
  const months = targetDate ? monthsBetween(today, targetDate) : null;

  // The projection needs a split even when the rule cannot name a regime yet.
  // Defensive is the even split, so it is the one that favours neither side.
  const activeRegime: Regime | null =
    regime?.status === "established" ? regime.regime : null;
  const split: Split = REGIME_SPLIT[activeRegime ?? "defensive"];

  const loading = portfolio.isLoading || btcLoading;

  return (
    <>
      <SiteHeader name="Strategy" />
      <div
        className={cn(
          "pb-fade flex flex-col gap-3.5 p-5 transition-opacity duration-500",
          loading ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="grid grid-cols-1 gap-3.5 min-[980px]:grid-cols-2">
          <RegimeCard
            state={regime}
            hasCloses={(btc?.closes.length ?? 0) > 0}
            contribution={settings.monthlyContribution}
          />
          <TargetCard
            progress={progress}
            target={settings.targetAmount}
            targetDate={targetDate}
            months={months}
            includeCash={settings.includeCash}
          />
        </div>

        {targetDate !== null && months !== null ? (
          <ScenariosCard
            outcomes={evaluateScenarios({
              start: progress.start,
              split,
              monthlyContribution: settings.monthlyContribution,
              months,
              target: settings.targetAmount,
              scenarios: settings.scenarios,
              extraMonths: Math.max(6, Math.round(months * 0.15)),
            })}
            today={today}
            months={months}
            target={settings.targetAmount}
            contribution={settings.monthlyContribution}
            split={split}
            splitFrom={activeRegime}
          />
        ) : (
          <PbCard className="p-[18px]">
            <PbCardHeader className="p-0" title="Projection" />
            <SetBirthdate />
          </PbCard>
        )}
      </div>
    </>
  );
}

/* ── Regime ──────────────────────────────────────────────────────────────── */

function RegimeCard({
  state,
  hasCloses,
  contribution,
}: {
  readonly state: RegimeState | null;
  readonly hasCloses: boolean;
  readonly contribution: number;
}) {
  return (
    <PbCard wash="orange" className="p-[18px]">
      <PbCardHeader
        className="mb-3 p-0"
        title="Regime"
        note={`BTC vs ${SMA_WINDOW}-day average · ${CONFIRM_DAYS}-day confirmation`}
      />
      <RegimeBody
        state={state}
        hasCloses={hasCloses}
        contribution={contribution}
      />
    </PbCard>
  );
}

function RegimeBody({
  state,
  hasCloses,
  contribution,
}: {
  readonly state: RegimeState | null;
  readonly hasCloses: boolean;
  readonly contribution: number;
}) {
  if (state === null) {
    return null;
  }

  if (state.status === "insufficient") {
    return (
      <Notice title="Insufficient data">
        {hasCloses
          ? `${state.availableDays} of ${state.requiredDays} consecutive daily BTC closes. `
          : "No BTC price history yet. "}
        The rule needs a {SMA_WINDOW}-day average plus {CONFIRM_DAYS} days on
        one side of it before it can name a regime. A price refresh backfills
        the last year of BTC closes when the portfolio holds BTC.
      </Notice>
    );
  }

  const { reading } = state;
  const sideLabel =
    reading.side === "above"
      ? "above"
      : reading.side === "below"
        ? "below"
        : "on";

  let counterLabel: string;
  let counterDays: number;
  if (state.status === "established") {
    const opposite = state.regime === "risk-on" ? "below" : "above";
    const next = state.regime === "risk-on" ? "Defensive" : "Risk-on";
    counterDays = state.daysTowardSwitch;
    counterLabel = `${counterDays} / ${CONFIRM_DAYS} days ${opposite} · switches to ${next} at ${CONFIRM_DAYS}`;
  } else {
    counterDays = reading.streakDays;
    counterLabel =
      reading.side === "on"
        ? "On the average · no streak"
        : `${counterDays} / ${CONFIRM_DAYS} days ${sideLabel} · sets the first regime at ${CONFIRM_DAYS}`;
  }

  return (
    <>
      {state.status === "established" ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[26px] font-semibold tracking-[-0.02em]">
            {REGIME_LABEL[state.regime]}
          </span>
          <span className="font-number text-[11px] text-pb-muted">
            since {state.since}
          </span>
        </div>
      ) : (
        <Notice title="No regime yet">
          There has been no run of {CONFIRM_DAYS} consecutive closes on one side
          of the average in the history available, so the rule has nothing to
          hold. The projection below assumes the even split until it does.
        </Notice>
      )}

      <div className="mt-3.5 grid grid-cols-3 gap-2">
        <Stat
          eyebrow="BTC close"
          value={formatEurPrice(reading.close)}
          caption={reading.date}
        />
        <Stat
          eyebrow={`${SMA_WINDOW}d SMA`}
          value={formatEurPrice(reading.sma)}
          caption={`BTC ${sideLabel} it`}
        />
        <Stat
          eyebrow="Distance"
          value={formatPct(reading.distancePct)}
          caption="close vs average"
        />
      </div>

      <div className="mt-3.5">
        <PbEyebrow>Toward a switch</PbEyebrow>
        <PbBar percent={(counterDays / CONFIRM_DAYS) * 100} color="#F7931A" />
        <span className="mt-1 block font-number text-[10.5px] text-pb-faint">
          {counterLabel}
        </span>
      </div>

      {state.status === "established" && (
        <MonthSplit regime={state.regime} contribution={contribution} />
      )}
    </>
  );
}

function MonthSplit({
  regime,
  contribution,
}: {
  readonly regime: Regime;
  readonly contribution: number;
}) {
  const split = REGIME_SPLIT[regime];
  const amounts = splitContribution(contribution, split);
  return (
    <div className="mt-3.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-pb-hairline pt-3">
      <PbEyebrow>This month</PbEyebrow>
      <span className="font-number text-[15px] font-medium tabular-nums">
        {formatEurWhole(amounts.crypto)} crypto
        <span className="px-1.5 text-pb-faint">/</span>
        {formatEurWhole(amounts.equity)} equity
      </span>
      <span className="font-number text-[10.5px] text-pb-faint">
        {Math.round(split.crypto * 100)}/{Math.round(split.equity * 100)} of{" "}
        {formatEurWhole(contribution)}
      </span>
    </div>
  );
}

/* ── Target ──────────────────────────────────────────────────────────────── */

function TargetCard({
  progress,
  target,
  targetDate,
  months,
  includeCash,
}: {
  readonly progress: ReturnType<typeof progressTowardTarget>;
  readonly target: number;
  readonly targetDate: string | null;
  readonly months: number | null;
  readonly includeCash: boolean;
}) {
  const { current, contributed, gains, pctOfTarget } = progress;
  // The bar is scaled to whichever is larger, so a loss shows as the part of
  // what went in that is no longer there rather than as a negative width.
  const scale = Math.max(current, contributed);
  const paidInPct =
    scale > 0 ? (Math.min(current, contributed) / scale) * 100 : 0;
  const marketPct = scale > 0 ? (Math.abs(gains) / scale) * 100 : 0;

  return (
    <PbCard className="p-[18px]">
      <PbCardHeader
        className="mb-3 p-0"
        title="Target"
        note={
          includeCash
            ? "crypto + equity + cash"
            : "crypto + equity · cash aside"
        }
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-number text-[26px] font-medium tracking-[-0.02em] tabular-nums">
          {formatEurWhole(current)}
        </span>
        <span className="font-number text-[11px] text-pb-muted">
          of {formatEurWhole(target)} ·{" "}
          {pctOfTarget.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%
        </span>
      </div>
      <PbBar percent={pctOfTarget} color="#8B5CF6" />

      <div className="mt-3.5 grid grid-cols-3 gap-2">
        <Stat
          eyebrow="Months left"
          value={months === null ? "—" : String(months)}
          caption={
            targetDate === null ? "set a birthdate" : `due ${targetDate}`
          }
        />
        <Stat
          eyebrow="Contributed"
          value={formatEurWhole(contributed)}
          caption="cost basis held"
        />
        <Stat
          eyebrow="Market"
          value={formatEurDelta(gains)}
          valueClassName={gains >= 0 ? "text-pb-up" : "text-pb-down"}
          caption={
            contributed > 0
              ? `${formatPct((gains / contributed) * 100, 1)} on what went in`
              : "nothing held yet"
          }
        />
      </div>

      <div className="mt-3.5">
        <PbEyebrow>Contributions vs market</PbEyebrow>
        <span className="mt-1.5 flex h-[6px] w-full overflow-hidden rounded-full bg-pb-track">
          <span
            className="block h-full"
            style={{ width: `${paidInPct}%`, background: "#8B5CF6" }}
          />
          <span
            className="block h-full"
            style={{
              width: `${marketPct}%`,
              background: gains >= 0 ? "#34D399" : "#F87171",
            }}
          />
        </span>
        <span className="mt-1 block font-number text-[10.5px] text-pb-faint">
          {formatEurWhole(contributed)} paid in · {formatEurDelta(gains)}{" "}
          {gains >= 0 ? "from" : "lost to"} the market
        </span>
      </div>
    </PbCard>
  );
}

/* ── Scenarios ───────────────────────────────────────────────────────────── */

function ScenariosCard({
  outcomes,
  today,
  months,
  target,
  contribution,
  split,
  splitFrom,
}: {
  readonly outcomes: readonly ScenarioOutcome[];
  readonly today: string;
  readonly months: number;
  readonly target: number;
  readonly contribution: number;
  readonly split: Split;
  readonly splitFrom: Regime | null;
}) {
  const length = outcomes[0]?.path.length ?? 0;
  const dates = Array.from({ length }, (_, i) => addMonths(today, i));

  return (
    <PbCard className="p-[18px]">
      <PbCardHeader
        className="mb-1 p-0"
        title="Projection"
        note={`${formatEurWhole(contribution)}/mo at ${Math.round(split.crypto * 100)}/${Math.round(split.equity * 100)} · ${
          splitFrom
            ? `${REGIME_LABEL[splitFrom]} split`
            : "no regime, even split"
        }`}
      />

      {months === 0 ? (
        <p className="py-6 text-center text-[11.5px] text-pb-faint">
          The target date has arrived — there are no contributions left to
          project.
        </p>
      ) : (
        <PbProjectionChart
          series={outcomes.map((o) => ({
            label: SCENARIO_LABEL[o.name],
            color: SCENARIO_COLOR[o.name],
            values: o.path,
            dashed: o.name !== "base",
          }))}
          dates={dates}
          target={target}
          targetIndex={months}
          targetLabel={`${TARGET_AGE}th birthday`}
          formatValue={formatEurWhole}
        />
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr className="font-number text-[9.5px] tracking-[0.11em] text-pb-muted uppercase">
              <th className="py-2 pr-3 font-normal">Scenario</th>
              <th className="py-2 pr-3 font-normal">Crypto / equity</th>
              <th className="py-2 pr-3 text-right font-normal">
                At target date
              </th>
              <th className="py-2 pr-3 text-right font-normal">Needed / mo</th>
              <th className="py-2 text-right font-normal">Gap / mo</th>
            </tr>
          </thead>
          <tbody className="font-number text-[12px] tabular-nums">
            {outcomes.map((o) => (
              <tr key={o.name} className="border-t border-pb-hairline">
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2 font-sans font-medium">
                    <span
                      className="block size-2 rounded-full"
                      style={{ background: SCENARIO_COLOR[o.name] }}
                    />
                    {SCENARIO_LABEL[o.name]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-pb-text-3">
                  {formatPct(o.rates.crypto * 100, 0)} /{" "}
                  {formatPct(o.rates.equity * 100, 0)}
                </td>
                <td
                  className={cn(
                    "py-2.5 pr-3 text-right",
                    o.projected >= target ? "text-pb-up" : "text-pb-text",
                  )}
                >
                  {formatEurWhole(o.projected)}
                </td>
                <td className="py-2.5 pr-3 text-right">
                  {o.required === null ? "—" : formatEurWhole(o.required)}
                </td>
                <td
                  className={cn(
                    "py-2.5 text-right",
                    o.gap === null
                      ? "text-pb-faint"
                      : o.gap > 0.5
                        ? "text-pb-down"
                        : "text-pb-up",
                  )}
                >
                  {o.gap === null ? "—" : formatEurDelta(o.gap)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10.5px] text-pb-faint">
        Returns compound monthly at (1 + r)^(1/12) − 1 per bucket; contributions
        land at month end and keep today&apos;s split throughout. Gap is what
        each month would need on top of (+) or could drop from (−) the current
        contribution. Assumptions are edited in{" "}
        <Link to="/settings" className="underline hover:text-pb-text">
          Settings
        </Link>
        .
      </p>
    </PbCard>
  );
}

/* ── Shared ──────────────────────────────────────────────────────────────── */

/** `PbStatTile`'s look without its title-casing, which mangles a sentence caption. */
function Stat({
  eyebrow,
  value,
  caption,
  valueClassName,
}: {
  readonly eyebrow: string;
  readonly value: React.ReactNode;
  readonly caption: React.ReactNode;
  readonly valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px] rounded-[13px] border border-pb-line bg-pb-surface px-3.5 py-[13px]">
      <span className="font-number text-[9.5px] tracking-[0.11em] text-pb-muted uppercase">
        {eyebrow}
      </span>
      <span
        className={cn(
          "truncate font-number font-medium tracking-[-0.02em] tabular-nums",
          valueClassName,
        )}
        style={{ fontSize: "clamp(13px, 1.5vw, 16px)" }}
      >
        {value}
      </span>
      <span className="text-[10.5px] text-pb-faint">{caption}</span>
    </div>
  );
}

function Notice({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="rounded-[11px] border border-pb-line bg-pb-raised px-3.5 py-3">
      <span className="block text-[12.5px] font-semibold">{title}</span>
      <span className="mt-1 block text-[11.5px] text-pb-muted">{children}</span>
    </div>
  );
}

function SetBirthdate() {
  return (
    <p className="mt-3 text-[11.5px] text-pb-muted">
      The target is due on your {TARGET_AGE}th birthday.{" "}
      <Link to="/settings" className="text-pb-text underline">
        Set your birthdate in Settings
      </Link>{" "}
      to see months remaining and the projection.
    </p>
  );
}

# ADR 0001: Hold sideline cash for BTC crashes

- Status: accepted, defaults provisional
- Date: 2026-10-27
- Code: `frontend/src/lib/deployment.ts`, the "Crash cash" card on the Strategy page, the "Crash cash" section in Settings
- Evidence: `scripts/ladder-backtest/` (`portfolio.py` is the one behind the decision)

## Context

The Strategy page says how the monthly contribution splits between BTC and stocks (the regime rule). The owner now holds sideline cash and expects a drawdown. The question was how to put that cash to work: dynamically sized monthly buys (value averaging and variants), or something simpler.

Pebble places no orders and the owner does not want to sell, so pure value averaging (unbounded cash need, forced sales) is out.

## Decision

Leave the monthly contribution and its split exactly as they are. Add one rule for the cash:

- Read BTC's distance from its 200-day EMA, the same signal the regime rule uses.
- A tranche is the monthly contribution divided by 4 (€250 on €1,000).
- BTC 10% or more below its average: invest 1 tranche from the cash into BTC. 25% or more below: 2 tranches.
- Otherwise the cash waits. Nothing is skipped in a rally and nothing is sold.
- Tranches are whole; when the cash cannot pay them the month invests fewer, down to none.
- The owner marks the month as invested; the card then updates the cash left, once per month.

The sideline cash, tranches per month, thresholds and tranche counts are editable in Settings. Tranches go to BTC only.

## Evidence

Backtested on daily BTC/USD and VT (a global equity ETF, USD) closes, Sept 2014 to Oct 2026 (Yahoo Finance): a purchase every 30 days, plain 50/50 monthly DCA underneath, windows starting every week. Every strategy commits the same capital, including a cash buffer of N months of contribution. The baseline, plain DCA, leaves the buffer idle.

Idle cash flatters any strategy that deploys it, since BTC rose about 100x over the sample. So the table also compares against **a drip**: plain DCA with the buffer invested evenly over the horizon. A strategy that beats the drip has an edge from timing, not just from being invested.

Crash cash, 6-month buffer:

| Horizon | Beats plain DCA | Median vs plain DCA | Worst 10% vs plain DCA | Beats the drip | Median vs drip | Worst 10% vs drip |
|---|---|---|---|---|---|---|
| 36 months | 86% | +5.4% | −0.1% | 57% | +1.3% | −7.3% |
| 48 months | 100% | +9.4% | +2.3% | 77% | +4.2% | −4.8% |
| 60 months | 100% | +10.7% | +5.1% | 79% | +5.5% | −3.5% |

By start year (36 months, vs the drip): 2015 −8.3%, 2016 −7.0%, 2017 +3.4%, 2018 +10.0%, 2019 −0.2%, 2020 +1.4%, 2021 +6.0%, 2022 +6.7%, 2023 −3.2%. It pays when a crash follows the start and trails an even drip when BTC just climbs.

With a 3-month buffer the result is similar (beats plain DCA in 84% to 100% of windows) but the cash ran out in 56% to 99% of them.

### Why not the alternatives

All with the same data and buffer, 48 months, median vs the drip:

| Strategy | Beats the drip | Median vs drip | Worst 10% vs drip |
|---|---|---|---|
| Crash cash (chosen) | 77% | +4.2% | −4.8% |
| A component ladder per asset (invest more on dips, less on rallies, for BTC and for stocks) | 36% | −1.4% | −13.2% |
| Crypto ladder only | 30% | −1.7% | −13.2% |
| Shift components between BTC and stocks, no cash | 54% | +0.5% | −17.8% |
| Shift, plus a tranche from cash on a deep dip | 67% | +3.1% | −16.5% |

- **Ladders that also skip or cut in rallies** lost to the drip: BTC sits 10% or more above its average on 47% of days, so a cut is in force for most of a bull run, and it trailed plain DCA by about 24% for 2015 and 2016 starts.
- **A stocks ladder** added about 0.2% over a crypto-only one. A global equity ETF is rarely 10% from its 200-day average (0% to 4% of days across S&P 500, VT, VWCE and VUAA), and rescaled to equity volatility the edge was under 1%. See `equity.py`.
- **Shifting components between assets** has the fattest tail of the group. Its worst decile trails the drip by 16% to 20%.
- **Splitting each crash tranche 50/50 between BTC and stocks** (`crash-split`) keeps most of the downside protection but halves the edge: +0.6% to +1.5% vs the drip at 48 to 60 months.

## Consequences

- The Strategy page gains a card that says whether the cash should move this month, how much, and how much cash is left.
- Tranches go entirely to BTC. A portfolio already over 60% crypto becomes more concentrated in a crash, the exact moment BTC is falling. This is the owner's choice and the split variant above is the lower-risk alternative.
- A long crash drains the cash; the buffer size is the control. Beyond that the rule invests nothing more.
- Cash held while BTC rises is a cost relative to investing it at once: plain DCA with the cash invested evenly beat every strategy here in 2015 and 2016 starts.

## Limits of the evidence

- One asset, about three cycles, windows that overlap and so are not independent.
- Thresholds and tranche sizes were not tuned on this data beyond picking among a handful of candidates, so the edge is optimistic out of sample.
- Fixed 50/50 split underneath; no regime switching, fees or tax. BTC and stocks are USD series, the portfolio is in EUR.
- None of this predicts a crash. The rule spends cash when one arrives, and costs a little if none does.

## Reproducing

```bash
cd scripts/ladder-backtest
# data: daily closes as JSON [[unix_ts, close], ...] from Yahoo's chart endpoint, e.g.
curl -s -A "Mozilla/5.0" "https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?period1=1410000000&period2=$(date +%s)&interval=1d"
python3 portfolio.py btcusd.json vt.json   # every strategy above, buffers 3 and 6, by start year
python3 btc.py btceur.json                 # BTC-only ladder variants
python3 equity.py series.json 21           # equity ladder, 21 trading days per month
```

The curl output needs converting to `[[timestamp, close], ...]` (use `adjclose` for ETFs).

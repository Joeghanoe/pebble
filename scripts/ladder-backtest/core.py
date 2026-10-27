"""Shared simulation: component-ladder DCA vs plain DCA on a daily close series.

Imported by btc.py and equity.py; not run on its own. argv[1] is the series file
(JSON [[unix_ts, close], ...]); argv[2] is the days (or trading days) per month.

Both strategies commit the same capital: N monthly contributions of 1.0 plus a
cash buffer of B contributions. Plain DCA invests the base every month and leaves
the buffer idle (0% interest). The ladder invests more or fewer components by
BTC's distance from its 200-day average, drawing on / refilling the buffer.
Final wealth = BTC held at the last close + cash left. Nothing is ever sold.
"""
import json
import statistics
import sys
from datetime import date

closes_raw = json.load(open(sys.argv[1]))
days = [date.fromtimestamp(t) for t, _ in closes_raw]
px = [c for _, c in closes_raw]
STEP = int(sys.argv[2]) if len(sys.argv) > 2 else 30  # days between purchases
WARM = 200


def ema(values, n):
    a = 2 / (n + 1)
    out = [None] * len(values)
    prev = sum(values[:n]) / n
    out[n - 1] = prev
    for i in range(n, len(values)):
        prev = a * values[i] + (1 - a) * prev
        out[i] = prev
    return out


def sma(values, n):
    out = [None] * len(values)
    s = sum(values[:n])
    out[n - 1] = s / n
    for i in range(n, len(values)):
        s += values[i] - values[i - n]
        out[i] = s / n
    return out


def dist(avg):
    return [None if a is None else (p / a - 1) * 100 for p, a in zip(px, avg)]


DIST = {"ema": dist(ema(px, 200)), "sma": dist(sma(px, 200))}


def comps_wanted(d, base, steps):
    """steps: list of (atPct, components); furthest reached step wins."""
    best = None
    for at, c in steps:
        reached = d <= at if at < 0 else d >= at
        if reached and (best is None or abs(at) > abs(best[0])):
            best = (at, c)
    return best[1] if best else base


def run(start, months, base, steps, buffer_months, avg, decel):
    comp = 1.0 / base
    cash = float(buffer_months)
    btc = 0.0
    limited = False
    path = []
    plain_btc = 0.0
    plain_path = []
    for k in range(months):
        i = start + k * STEP
        d = DIST[avg][i]
        wanted = comps_wanted(d, base, steps)
        if wanted > base:
            extra = wanted - base
            if decel and buffer_months > 0 and cash < 0.5 * buffer_months:
                extra *= max(0.0, cash) / buffer_months  # paste's decelerator
            fit = max(0.0, cash) / comp
            if extra > fit:
                extra = fit
                limited = True
            if not decel:
                extra = int(extra + 1e-9)  # whole components
            n = base + extra
        else:
            n = wanted
        spend = n * comp
        cash -= spend - 1.0
        btc += spend / px[i]
        plain_btc += 1.0 / px[i]
        path.append((i, btc, cash, plain_btc))
    end = start + months * STEP
    last = px[end]
    final = btc * last + cash
    plain_final = plain_btc * last + buffer_months
    # worst peak-to-trough of total wealth, marked at each purchase date
    def mdd(series):
        peak, worst = 0.0, 0.0
        for v in series:
            peak = max(peak, v)
            if peak > 0:
                worst = min(worst, v / peak - 1)
        return worst
    w = [b * px[i] + c for i, b, c, _ in path]
    pw = [pb * px[i] + buffer_months for i, _, _, pb in path]
    return final, plain_final, limited, mdd(w), mdd(pw), cash


def evaluate(name, base, steps, buffer_months, avg="ema", decel=False, horizons=(36, 48, 60)):
    print(f"\n{name}  [buffer {buffer_months}m, {avg.upper()}200{', decelerator' if decel else ''}]")
    print(f"  {'horizon':>7} {'windows':>7} {'win%':>5} {'median':>7} {'p10':>7} {'p90':>7} {'cash-out%':>9} {'MDD ladder/plain':>17}")
    for h in horizons:
        diffs, lim, m1, m2 = [], 0, [], []
        starts = range(WARM, len(px) - h * STEP - 1, 7)
        for s in starts:
            f, pf, l, d1, d2, _ = run(s, h, base, steps, buffer_months, avg, decel)
            diffs.append((f / pf - 1) * 100)
            lim += l
            m1.append(d1)
            m2.append(d2)
        diffs_sorted = sorted(diffs)
        q = lambda p: diffs_sorted[int(p * (len(diffs_sorted) - 1))]
        win = 100 * sum(d > 0 for d in diffs) / len(diffs)
        print(
            f"  {h:>5}mo {len(diffs):>7} {win:>5.0f} {statistics.median(diffs):>+6.1f}% {q(.1):>+6.1f}% {q(.9):>+6.1f}% "
            f"{100 * lim / len(diffs):>8.0f}% {statistics.median(m1) * 100:>7.0f}% / {statistics.median(m2) * 100:.0f}%"
        )


def by_start_year(base, steps, buffer_months, avg="ema", decel=False, h=36):
    print(f"  by start year ({h}mo, diff vs plain, median):", end=" ")
    buckets = {}
    for s in range(WARM, len(px) - h * STEP - 1, 7):
        f, pf, *_ = run(s, h, base, steps, buffer_months, avg, decel)
        buckets.setdefault(days[s].year, []).append((f / pf - 1) * 100)
    print(", ".join(f"{y}:{statistics.median(v):+.0f}%" for y, v in sorted(buckets.items())))



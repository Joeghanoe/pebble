"""Whole-portfolio backtest: crypto + stocks strategies against plain DCA.

usage: python3 portfolio.py btc.json equity.json   (run from this directory)

Both files are JSON [[unix_ts, close], ...] in the same currency. Every strategy
commits the same capital: N monthly contributions of 1.0 (half to each side) plus a
cash buffer of B contributions. Plain DCA leaves the buffer idle. Final wealth is
the holdings at the last close plus any cash left. Nothing is ever sold.

Strategies
  dca         50/50 every month, buffer idle (the baseline)
  drip        50/50 every month, the buffer dripped in evenly (the same capital fully
              invested: separates "more exposure" from "better timing")
  both        a ladder per side, 4 components each (budget / 4), shared cash
  crypto      the crypto ladder only; stocks plain
  shift       4 components of 0.25 in total; the crypto signal moves them between the
              sides; no cash used
  shift+cash  shift, plus one extra component from cash into crypto on a deep dip
  crash       plain 50/50 DCA, plus cash tranches of 0.25 (a quarter of the monthly
              contribution) into BTC when BTC is 10% (1 tranche) or 25% (2) below its
              200-day EMA; cash is touched only then
  crash-split the same, with each tranche split 50/50 between BTC and stocks
"""
import bisect
import json
import statistics
import sys
from datetime import date

STEP = 30  # calendar days between purchases
WARM = 200
EQ_WINDOW = 200

btc_rows = json.load(open(sys.argv[1]))
eq_rows = json.load(open(sys.argv[2]))
BTC_DAYS = [date.fromtimestamp(t) for t, _ in btc_rows]
BTC = [c for _, c in btc_rows]
EQ_DAYS = [date.fromtimestamp(t) for t, _ in eq_rows]
EQ = [c for _, c in eq_rows]


def ema(values, n):
    a = 2 / (n + 1)
    out = [None] * len(values)
    prev = sum(values[:n]) / n
    out[n - 1] = prev
    for i in range(n, len(values)):
        prev = a * values[i] + (1 - a) * prev
        out[i] = prev
    return out


BTC_EMA = ema(BTC, 200)
EQ_EMA = ema(EQ, EQ_WINDOW)


def eq_index(day):
    """Last equity trading day on or before `day`."""
    return bisect.bisect_right(EQ_DAYS, day) - 1


CRYPTO_STEPS = [(-25, 6), (-10, 5), (25, 3), (50, 2)]
EQUITY_STEPS = [(-10, 6), (-5, 5), (10, 3), (15, 2)]


def wanted(d, base, steps):
    best = None
    for at, c in steps:
        reached = d <= at if at < 0 else d >= at
        if reached and (best is None or abs(at) > abs(best[0])):
            best = (at, c)
    return best[1] if best else base


def signals(i):
    d_btc = (BTC[i] / BTC_EMA[i] - 1) * 100
    j = eq_index(BTC_DAYS[i])
    d_eq = (EQ[j] / EQ_EMA[j] - 1) * 100 if EQ_EMA[j] else 0.0
    return d_btc, d_eq, EQ[j]


def simulate(strategy, start, months, buffer_months):
    cash = float(buffer_months)
    btc = eq = 0.0
    limited = False
    marks = []
    for k in range(months):
        i = start + k * STEP
        d_btc, d_eq, eq_px = signals(i)
        c_btc, c_eq = 0.5, 0.5  # what each side is paid this month
        if strategy == "dca":
            pass
        elif strategy == "drip":
            extra = buffer_months / months
            c_btc += extra / 2
            c_eq += extra / 2
            cash -= extra
        elif strategy in ("both", "crypto"):
            comp = 0.125
            n_btc = wanted(d_btc, 4, CRYPTO_STEPS)
            n_eq = wanted(d_eq, 4, EQUITY_STEPS) if strategy == "both" else 4
            for side, n in (("btc", n_btc), ("eq", n_eq)):
                if n > 4:
                    fit = int(max(0.0, cash) / comp + 1e-9)
                    take = min(n - 4, fit)
                    limited |= take < n - 4
                    n = 4 + take
                spend = n * comp
                cash -= spend - 0.5
                if side == "btc":
                    c_btc = spend
                else:
                    c_eq = spend
        elif strategy in ("crash", "crash-split"):
            tranches = 2 if d_btc <= -25 else 1 if d_btc <= -10 else 0
            tranches = min(tranches, int(max(0.0, cash) / 0.25 + 1e-9))
            limited |= tranches < (2 if d_btc <= -25 else 1 if d_btc <= -10 else 0)
            put = tranches * 0.25
            cash -= put
            if strategy == "crash":
                c_btc += put
            else:
                c_btc += put / 2
                c_eq += put / 2
        elif strategy in ("shift", "shift+cash"):
            comp = 0.25
            n_btc = 2
            if d_btc <= -25:
                n_btc = 4
            elif d_btc <= -10:
                n_btc = 3
            elif d_btc >= 50:
                n_btc = 0
            elif d_btc >= 25:
                n_btc = 1
            c_btc, c_eq = n_btc * comp, (4 - n_btc) * comp
            if strategy == "shift+cash" and d_btc <= -25:
                if cash >= comp:
                    c_btc += comp
                    cash -= comp
                else:
                    limited = True
        btc += c_btc / BTC[i]
        eq += c_eq / eq_px
        marks.append((i, btc, eq, cash))
    end = start + months * STEP
    _, _, eq_end = signals(end)
    final = btc * BTC[end] + eq * eq_end + cash
    peak = worst = 0.0
    for i, b, e, c in marks:
        w = b * BTC[i] + e * signals(i)[2] + c
        peak = max(peak, w)
        worst = min(worst, w / peak - 1)
    return final, worst, limited


def report(buffer_months, horizons=(36, 48, 60)):
    print(f"\n=== buffer {buffer_months} months of contribution ===")
    head = f"  {'strategy':<11}{'win vs dca':>11}{'median':>8}{'p10':>8}{'p90':>8}{'win vs drip':>12}{'median':>8}{'p10':>8}{'MDD':>6}{'cash-out':>9}"
    for h in horizons:
        windows = list(range(WARM, len(BTC) - h * STEP - 1, 7))
        base = {}
        res = {n: [] for n in ("dca", "drip", "crash", "crash-split", "both", "shift+cash")}
        for s in windows:
            for name in res:
                res[name].append(simulate(name, s, h, buffer_months))
        print(f"\n {h} months, {len(windows)} overlapping windows")
        print(head)
        for name, runs in res.items():
            vs_dca = [(r[0] / b[0] - 1) * 100 for r, b in zip(runs, res["dca"])]
            vs_drip = [(r[0] / b[0] - 1) * 100 for r, b in zip(runs, res["drip"])]
            sd, sp = sorted(vs_dca), sorted(vs_drip)
            q = lambda arr, p: arr[int(p * (len(arr) - 1))]
            lim = 100 * sum(r[2] for r in runs) / len(runs)
            mdd = statistics.median(r[1] for r in runs) * 100
            print(
                f"  {name:<11}{100 * sum(x > 0 for x in vs_dca) / len(vs_dca):>10.0f}%"
                f"{statistics.median(vs_dca):>+7.1f}%{q(sd, .1):>+7.1f}%{q(sd, .9):>+7.1f}%"
                f"{100 * sum(x > 0 for x in vs_drip) / len(vs_drip):>11.0f}%"
                f"{statistics.median(vs_drip):>+7.1f}%{q(sp, .1):>+7.1f}%{mdd:>5.0f}%{lim:>8.0f}%"
            )


def by_start_year(buffer_months, h=36):
    """Median result by the year the window starts, against plain DCA and the drip."""
    names = ("drip", "crash", "crash-split", "shift+cash")
    years = {}
    for s in range(WARM, len(BTC) - h * STEP - 1, 7):
        runs = {n: simulate(n, s, h, buffer_months)[0] for n in ("dca",) + names}
        for n in names:
            years.setdefault(BTC_DAYS[s].year, {}).setdefault(n, []).append(
                ((runs[n] / runs["dca"] - 1) * 100, (runs[n] / runs["drip"] - 1) * 100)
            )
    print(f"\n=== by start year, {h} months, buffer {buffer_months}: median vs dca / vs drip ===")
    print("  year  " + "".join(f"{n:>22}" for n in names))
    for y, by in sorted(years.items()):
        row = "".join(
            f"{statistics.median(a for a, _ in by[n]):>+10.1f}% /{statistics.median(b for _, b in by[n]):>+6.1f}%"
            for n in names
        )
        print(f"  {y}  {row}")


print(
    f"BTC {BTC_DAYS[0]}..{BTC_DAYS[-1]}  equity {EQ_DAYS[0]}..{EQ_DAYS[-1]}  "
    f"(first window starts {BTC_DAYS[WARM]})"
)
for b in (3, 6):
    report(b)
by_start_year(6)

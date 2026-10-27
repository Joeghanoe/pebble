"""BTC/EUR ladder backtest: python3 btc.py btceur.json (run from this directory)."""
import statistics

from core import *  # noqa: F403
from core import DIST, WARM, days, px, run, STEP

def distribution():
    d = [x for x in DIST["ema"] if x is not None]
    s = sorted(d)
    q = lambda p: s[int(p * (len(s) - 1))]
    print("BTC/EUR distance from 200d EMA, %d days from %s" % (len(d), days[WARM]))
    print("  percentiles 10/25/50/75/90: " + " / ".join(f"{q(p):+.0f}%" for p in (.1, .25, .5, .75, .9)))
    for t in (10, 25, 35, 50):
        print(f"  above +{t}%: {100 * sum(x >= t for x in d) / len(d):.0f}% of days   below -{t}%: {100 * sum(x <= -t for x in d) / len(d):.0f}%")
    runs, cur = [], 0
    for x in d:
        if x < 0:
            cur += 1
        elif cur:
            runs.append(cur)
            cur = 0
    print("  longest streaks below the average (days):", sorted(runs)[-5:])


distribution()

MINE = (4, [(-25, 8), (-10, 6), (10, 2)])
PASTE = (4, [(35, 1), (-10, 5), (-25, 6)])
DIPONLY = (4, [(-25, 6), (-10, 5)])
SOFT = (4, [(-25, 6), (-10, 5), (25, 3), (50, 2)])

for B in (3, 6, 12):
    evaluate("A. my defaults (8/6/4/2)", *MINE, B)
    evaluate("B. paste blueprint (+35:1, -10:5, -25:6) + decelerator", *PASTE, B, decel=True)
    evaluate("C. dips only (-10:5, -25:6), never skip", *DIPONLY, B)
    evaluate("D. soft ladder (-25:6, -10:5, +25:3, +50:2)", *SOFT, B)

print("\nRobustness, 6-month buffer")
for name, v in (("A", MINE), ("B", PASTE), ("C", DIPONLY), ("D", SOFT)):
    print(name)
    by_start_year(*v, 6, decel=(name == "B"))
print("\nSMA instead of EMA, 6-month buffer")
evaluate("A. my defaults", *MINE, 6, avg="sma")
evaluate("C. dips only", *DIPONLY, 6, avg="sma")


def drip_final(start, months, base, buffer_months):
    """Control: same capital, the buffer invested evenly across the horizon."""
    per = 1.0 + buffer_months / months
    btc = sum(per / px[start + k * STEP] for k in range(months))
    return btc * px[start + months * STEP]


def vs_drip(name, base, steps, buffer_months, avg="ema", decel=False):
    print(f"\nControl: {name} vs the same buffer dripped evenly [buffer {buffer_months}m]")
    for h in (36, 48, 60):
        diffs, spent = [], []
        for s in range(WARM, len(px) - h * STEP - 1, 7):
            f, _, _, _, _, cash = run(s, h, base, steps, buffer_months, avg, decel)
            used = buffer_months - cash  # buffer actually deployed
            # drip the same euros the ladder actually deployed, so capital in BTC matches
            per = 1.0 + used / h
            btc = sum(per / px[s + k * STEP] for k in range(h))
            ref = btc * px[s + h * STEP] + (buffer_months - used) + 0.0
            diffs.append((f / ref - 1) * 100)
            spent.append(used / buffer_months * 100)
        ds = sorted(diffs)
        win = 100 * sum(d > 0 for d in diffs) / len(diffs)
        print(f"  {h}mo: win {win:.0f}%  median {statistics.median(diffs):+.1f}%  p10 {ds[int(.1*(len(ds)-1))]:+.1f}%  p90 {ds[int(.9*(len(ds)-1))]:+.1f}%  buffer deployed (median) {statistics.median(spent):.0f}%")


for B in (3, 6):
    vs_drip("C dips only", *DIPONLY, B)
    vs_drip("D soft ladder", *SOFT, B)
vs_drip("A my defaults", *MINE, 6)

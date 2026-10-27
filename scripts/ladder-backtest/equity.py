"""usage: python3 equity.py <series.json> 21 (run from this directory)   (trading-day series: one purchase per 21 days)"""
import statistics
import core
from core import px, days, DIST, run, WARM, STEP

d = sorted(x for x in DIST["ema"] if x is not None)
q = lambda p: d[int(p * (len(d) - 1))]
print(f"{len(px)} closes {days[0]} -> {days[-1]}; distance from 200d EMA percentiles 3/10/25/50/75/90/97: "
      + " / ".join(f"{q(p):+.1f}%" for p in (.03, .1, .25, .5, .75, .9, .97)))
for t in (5, 10, 20):
    print(f"  days <= -{t}%: {100*sum(x<=-t for x in d)/len(d):.0f}%   >= +{t}%: {100*sum(x>=t for x in d)/len(d):.0f}%")

VARIANTS = {
    "BTC defaults (-25:6 -10:5 +25:3 +50:2)": [(-25, 6), (-10, 5), (25, 3), (50, 2)],
    "scaled   (-10:6 -5:5 +10:3 +15:2)": [(-10, 6), (-5, 5), (10, 3), (15, 2)],
    "dips only (-10:6 -5:5)": [(-10, 6), (-5, 5)],
}
B = 6
for name, steps in VARIANTS.items():
    print(f"\n{name} [buffer {B}m]")
    for h in (36, 48, 60):
        diffs, plain, lim = [], [], 0
        for s in range(WARM, len(px) - h * STEP - 1, 5):
            f, pf, l, _, _, cash = run(s, h, 4, steps, B, "ema", False)
            used = B - cash
            per = 1.0 + used / h
            btc = sum(per / px[s + k * STEP] for k in range(h))
            ref = btc * px[s + h * STEP] + (B - used)
            diffs.append((f / ref - 1) * 100)
            plain.append((f / pf - 1) * 100)
            lim += l
        if not diffs:
            print(f"  {h}mo: no full window")
            continue
        ds = sorted(diffs)
        win = 100 * sum(x > 0 for x in diffs) / len(diffs)
        print(f"  {h}mo: {len(diffs):>4} windows | vs even drip: win {win:.0f}% median {statistics.median(diffs):+.1f}% p10 {ds[int(.1*(len(ds)-1))]:+.1f}% | vs idle-cash plain: median {statistics.median(plain):+.1f}% | cash-out {100*lim/len(diffs):.0f}%")

// src/lib/format.ts

export function formatEur(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

/** For unit prices: up to 8 significant decimal places when < €0.01 */
export function formatEurPrice(amount: number): string {
  if (Math.abs(amount) < 0.01 && amount !== 0) {
    const decimals = Math.max(2, -Math.floor(Math.log10(Math.abs(amount))) + 3)
    return "€\u202F" + amount.toFixed(Math.min(decimals, 8)).replace(".", ",")
  }
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

export function formatUsdPrice(amount: number): string {
  if (Math.abs(amount) < 0.01 && amount !== 0) {
    const decimals = Math.max(2, -Math.floor(Math.log10(Math.abs(amount))) + 3)
    return "$" + amount.toFixed(Math.min(decimals, 8))
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

export function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}

export function formatUnits(n: number): string {
  return n.toFixed(8).replace(/\.?0+$/, "")
}

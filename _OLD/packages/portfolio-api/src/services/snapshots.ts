import { addDays, format, isAfter, parseISO } from "date-fns";
import {
  getEarliestTransactionDate,
  upsertSnapshot,
  getSnapshot,
  upsertPositionSnapshot,
} from "../db/queries/snapshots";
import { getInvestedEurOnDate, getInvestedEurForAssetOnDate } from "../db/queries/transactions";
import { listAssets } from "../db/queries/assets";
import { getPriceOnOrBefore } from "../db/queries/prices";
import { getPriceService } from "./price-service-factory";
import { db } from "../db/runner";

function getUnitsHeldOnDate(assetId: number, date: string): number {
  const result = db
    .query<{ total: number }, [number, string]>(
      `SELECT COALESCE(
         SUM(CASE WHEN type = 'buy' THEN units ELSE -units END),
         0
       ) as total
       FROM transactions
       WHERE asset_id = ? AND date <= ? AND deleted_at IS NULL`
    )
    .get(assetId, date);
  return result?.total ?? 0;
}

async function runSnapshotForDate(
  dateStr: string,
  assets: ReturnType<typeof listAssets>,
  fetchMissing: boolean
): Promise<boolean> {
  const priceService = fetchMissing ? getPriceService() : null;
  let totalEur = 0;
  let anyPosition = false;

  for (const asset of assets) {
    const units = getUnitsHeldOnDate(asset.id, dateStr);
    if (units <= 0) continue;
    anyPosition = true;

    let priceRow = getPriceOnOrBefore(asset.id, dateStr);
    if (!priceRow && priceService) {
      await priceService.fetchHistoricalPrice(asset, dateStr);
      priceRow = getPriceOnOrBefore(asset.id, dateStr);
    }
    if (!priceRow) return false;

    const value = units * priceRow.price_eur;
    const invested = getInvestedEurForAssetOnDate(asset.id, dateStr);
    totalEur += value;
    upsertPositionSnapshot(dateStr, asset.id, units, priceRow.price_eur, value, invested);
  }

  if (!anyPosition) return false;

  upsertSnapshot(dateStr, totalEur, getInvestedEurOnDate(dateStr));
  return true;
}

/**
 * Creates position and net worth snapshots for today using cached prices only.
 * Called after a price refresh so the current day is always up to date.
 */
export async function runTodaySnapshot(): Promise<void> {
  const today = format(new Date(), "yyyy-MM-dd");
  const assets = listAssets().filter((a) => a.type !== "cash");
  await runSnapshotForDate(today, assets, false);
}

/**
 * Backfills daily snapshots from the earliest transaction date to today.
 * Fetches missing historical prices on demand. Skips dates already snapshotted.
 */
export async function runSnapshotBackfill(): Promise<void> {
  const earliestDate = getEarliestTransactionDate();
  if (!earliestDate) return;

  const assets = listAssets().filter((a) => a.type !== "cash");
  if (assets.length === 0) return;

  const today = new Date();
  let cursor = parseISO(earliestDate);

  while (!isAfter(cursor, today)) {
    const dateStr = format(cursor, "yyyy-MM-dd");
    if (!getSnapshot(dateStr)) {
      await runSnapshotForDate(dateStr, assets, true);
    }
    cursor = addDays(cursor, 1);
  }
}

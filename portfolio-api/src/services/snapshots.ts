import { endOfMonth, addMonths, parseISO, format, isBefore, isAfter } from "date-fns";
import { getEarliestTransactionDate, upsertSnapshot, getSnapshot } from "../db/queries/snapshots";
import { listAssets } from "../db/queries/assets";
import { getPriceOnOrBefore } from "../db/queries/prices";
import { getPriceService } from "./price-service-factory";
import { db } from "../db/runner";

interface UnitsRow {
  asset_id: number;
  units: number;
}

/**
 * Calculate units held for an asset as of a specific date (end of day).
 */
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

/**
 * Run month-end snapshot backfill.
 * For each month-end since the earliest transaction, try to write a snapshot.
 * Fetches historical prices on demand for any month-end date missing from the cache.
 */
export async function runSnapshotBackfill(): Promise<void> {
  const earliestDate = getEarliestTransactionDate();
  if (!earliestDate) return;

  const assets = listAssets().filter(a => a.type !== "cash");
  if (assets.length === 0) return;

  const priceService = getPriceService();
  const today = new Date();
  let cursor = endOfMonth(parseISO(earliestDate));

  while (isBefore(cursor, today) || format(cursor, "yyyy-MM-dd") === format(endOfMonth(today), "yyyy-MM-dd")) {
    const dateStr = format(cursor, "yyyy-MM-dd");

    // Skip if snapshot already exists
    if (!getSnapshot(dateStr)) {
      let totalEur = 0;
      let allPricesAvailable = true;

      for (const asset of assets) {
        const units = getUnitsHeldOnDate(asset.id, dateStr);
        if (units <= 0) continue;

        // Try cache first
        let priceRow = getPriceOnOrBefore(asset.id, dateStr);

        // If no cached price, fetch it now
        if (!priceRow) {
          await priceService.fetchHistoricalPrice(asset, dateStr);
          priceRow = getPriceOnOrBefore(asset.id, dateStr);
        }

        if (!priceRow) {
          allPricesAvailable = false;
          break;
        }
        totalEur += units * priceRow.price_eur;
      }

      if (allPricesAvailable) {
        upsertSnapshot(dateStr, totalEur);
      }
    }

    // Move to next month-end
    cursor = endOfMonth(addMonths(cursor, 1));

    // Safety: don't go past today
    if (isAfter(cursor, today)) break;
  }
}

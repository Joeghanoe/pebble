/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ExchangesService } from "@/client";
import type { GetExchangesResponse } from "@/types/api";
import { AddTransactionModal } from "./AddTransactionModal";
import { AddPositionModal, type PositionPrefill } from "./AddPositionModal";

interface TransactionModalContext {
  /** Logs a buy or sell against an existing asset. */
  openTransaction: (assetId?: number) => void;
  /** Creates the asset itself, optionally prefilled from a quick pick. */
  openPosition: (prefill?: PositionPrefill) => void;
}

const Context = React.createContext<TransactionModalContext | undefined>(
  undefined,
);

/**
 * The app's two dialogs, mounted once.
 *
 * They open from six places between them — the topbar, the sidebar, the ledger,
 * and three controls on the empty state — and a copy at each would give every
 * caller its own form state and its own asset picker to keep in step.
 *
 * The design treats "add a position" and "log a transaction" as one dialog.
 * Pebble does not: an asset carries a price-feed identity (a CoinGecko slug, a
 * Yahoo ticker) that a transaction has no way to supply, so creating one is its
 * own step. The split is invisible in the common case — every entry point on a
 * portfolio that already has positions lands on the transaction dialog.
 */
export function TransactionModalProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [assetId, setAssetId] = React.useState<number | undefined>(undefined);
  const [txOpen, setTxOpen] = React.useState(false);
  const [positionOpen, setPositionOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<PositionPrefill | undefined>();

  // The position dialog needs somewhere to file the asset, and the list is tiny
  // and rarely changes, so it is fetched once here rather than at each caller.
  const { data } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () =>
      ExchangesService.listExchangesApiExchangesGet() as unknown as Promise<GetExchangesResponse>,
  });

  const value = React.useMemo<TransactionModalContext>(
    () => ({
      openTransaction: (next?: number) => {
        setAssetId(next);
        setTxOpen(true);
      },
      openPosition: (next?: PositionPrefill) => {
        setPrefill(next);
        setPositionOpen(true);
      },
    }),
    [],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <AddTransactionModal
        open={txOpen}
        onOpenChange={setTxOpen}
        assetId={assetId}
      />
      <AddPositionModal
        open={positionOpen}
        onOpenChange={setPositionOpen}
        exchanges={data?.exchanges ?? []}
        prefill={prefill}
      />
    </Context.Provider>
  );
}

export function useTransactionModal(): TransactionModalContext {
  const context = React.useContext(Context);
  if (!context) {
    throw new Error(
      "useTransactionModal must be used inside a TransactionModalProvider",
    );
  }
  return context;
}

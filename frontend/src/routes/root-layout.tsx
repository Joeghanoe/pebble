import { Outlet } from "@tanstack/react-router";
import { SidebarBody } from "@/frontend/components/pebble/Sidebar";
import { TransactionModalProvider } from "@/frontend/components/TransactionModalProvider";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

/**
 * The persistent frame: a 244px position sidebar beside a fluid main column.
 *
 * The sidebar is the app's index — every position is one click away from every
 * screen — so it is never collapsed on desktop. Below `lg` it drops out of the
 * layout and the topbar's menu button opens the same body in a sheet; a 244px
 * rail on a phone leaves nothing for the tables.
 *
 * It also owns the quote pulling, because it is the one component that survives
 * navigation — see `useAutoRefresh`.
 */
export function RootLayout() {
  useAutoRefresh();

  return (
    <TransactionModalProvider>
      <div className="flex min-h-screen">
        <aside
          className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col overflow-y-auto border-r border-pb-subtle px-3 pt-3.5 pb-3 lg:flex"
          style={{
            background: "linear-gradient(180deg,#0D0B12 0%,#0A0910 100%)",
          }}
        >
          <SidebarBody />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </TransactionModalProvider>
  );
}

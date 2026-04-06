import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronRight, TrendingUp, Plus } from "lucide-react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar"
import { AddPositionModal } from "./AddPositionModal"
import { fetchJson } from "@/lib/queryClient"
import type { GetPositionsResponse, GetExchangesResponse } from "@/types/api"

interface Props {
  isPositionActive: boolean
}

export function PositionsMenu({ isPositionActive }: Props) {
  const [open, setOpen] = useState(true)
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const positionMatch = /^\/position\/(\d+)$/.exec(pathname)
  const currentAssetId = positionMatch ? Number(positionMatch[1]) : null

  const { data: positionsData, isLoading: positionsLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: () => fetchJson<GetPositionsResponse>("/api/positions"),
  })

  const { data: exchangesData } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () => fetchJson<GetExchangesResponse>("/api/exchanges"),
  })

  const positions = positionsData?.positions ?? []
  const exchanges = exchangesData?.exchanges ?? []

  return (
    <Collapsible
      asChild
      className="group/collapsible"
      open={open}
      onOpenChange={setOpen}
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={isPositionActive}
            tooltip="Positions"
          >
            <TrendingUp size={16} />
            <span>Positions</span>
            <ChevronRight
              size={14}
              className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <SidebarMenuSub>
            {positionsLoading && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton>
                  <span className="text-muted-foreground">Loading…</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}

            {!positionsLoading && positions.length === 0 && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton>
                  <span className="text-muted-foreground italic">
                    No positions yet
                  </span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}

            {positions.map((pos) => (
              <SidebarMenuSubItem key={pos.asset.id}>
                <SidebarMenuSubButton
                  isActive={currentAssetId === pos.asset.id}
                  onClick={() => void navigate({ to: "/position/$assetId", params: { assetId: String(pos.asset.id) } })}
                >
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                  <span className="flex-1 truncate">{pos.asset.symbol}</span>
                  <span
                    className={cn(
                      "text-[10px] font-medium tabular-nums",
                      pos.pnlPct > 0
                        ? "text-green-600"
                        : pos.pnlPct < 0
                          ? "text-red-500"
                          : "text-muted-foreground"
                    )}
                  >
                    {pos.pnlPct > 0 ? "+" : ""}
                    {pos.pnlPct.toFixed(1)}%
                  </span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}

            {/* Add position as the last sub-item */}
            {exchanges.length > 0 && (
              <SidebarMenuSubItem>
                <AddPositionModal exchanges={exchanges}>
                  <button className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                    <Plus size={12} />
                    Add position
                  </button>
                </AddPositionModal>
              </SidebarMenuSubItem>
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

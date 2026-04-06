import type { PriceResult } from "@/types/price"
import { Badge } from "@/components/ui/badge"

interface Props {
  result: PriceResult
}

export function PriceStatusBadge({ result }: Props) {
  if (result.status === "ok") {
    return <Badge variant="success">Live</Badge>
  }
  if (result.status === "stale") {
    return (
      <Badge variant="warning" title={`Last known: ${result.lastKnownDate}`}>
        Stale
      </Badge>
    )
  }
  return <Badge variant="outline">N/A</Badge>
}

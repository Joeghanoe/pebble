import { QueryClient } from "@tanstack/react-query"
import { apiUrl } from "./api"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
})

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(apiUrl(url))
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as T
}

import { useState, useEffect } from "react"

type Route =
  | { name: "dashboard" }
  | { name: "position"; id: number }
  | { name: "settings" }

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "")
  if (path.startsWith("/position/")) {
    const id = Number.parseInt(path.slice("/position/".length))
    if (!Number.isNaN(id)) return { name: "position", id }
  }
  if (path === "/settings") return { name: "settings" }
  return { name: "dashboard" }
}

function routeToHash(route: Route): string {
  if (route.name === "position") return `#/position/${route.id}`
  if (route.name === "settings") return "#/settings"
  return "#/"
}

export const useRoute = () => {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(globalThis.location.hash)
  )

  useEffect(() => {
    function onHashChange() {
      setRoute(parseRoute(globalThis.location.hash))
    }
    globalThis.addEventListener("hashchange", onHashChange)
    return () => globalThis.removeEventListener("hashchange", onHashChange)
  }, [])

  function navigate(path: string) {
    const newRoute = parseRoute(path)
    globalThis.location.hash = routeToHash(newRoute)
    setRoute(newRoute)
  }

  return { route, navigate }
}

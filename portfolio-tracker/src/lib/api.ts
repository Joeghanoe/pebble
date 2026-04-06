declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
      getApiPort: () => Promise<number>
      getApiKey: (name: string) => Promise<string | null>
      setApiKey: (name: string, value: string) => Promise<void>
      deleteApiKey: (name: string) => Promise<void>
    }
  }
}

let _base = ""

export async function initApiBase(): Promise<void> {
  if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
    const port = await window.electronAPI.getApiPort()
    _base = `http://127.0.0.1:${port}`
  }
}

export function apiUrl(path: string): string {
  return `${_base}${path}`
}

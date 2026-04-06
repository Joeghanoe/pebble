import { contextBridge, ipcRenderer } from "electron";

/**
 * Exposes a minimal set of IPC channels to the renderer.
 * The renderer can call window.electronAPI.* from React.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  /** Check if the app is running inside Electron */
  isElectron: true,

  /** Get a stored API key (proxied through main process → keytar) */
  getApiKey: (name: string): Promise<string | null> =>
    ipcRenderer.invoke("keychain:getApiKey", name),

  /** Store an API key */
  setApiKey: (name: string, value: string): Promise<void> =>
    ipcRenderer.invoke("keychain:setApiKey", name, value),

  /** Delete an API key */
  deleteApiKey: (name: string): Promise<void> =>
    ipcRenderer.invoke("keychain:deleteApiKey", name),

  /** The port the local API server is listening on */
  getApiPort: (): Promise<number> =>
    ipcRenderer.invoke("server:getPort"),
});

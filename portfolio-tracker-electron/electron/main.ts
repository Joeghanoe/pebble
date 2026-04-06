import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { authenticateWithTouchID, getDbEncryptionKey, getApiKey, setApiKey, deleteApiKey } from "./touchid";
import { startServer } from "../../portfolio-api/src/server.node";

let mainWindow: BrowserWindow | null = null;
let serverPort = 3131;

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on("ready", async () => {
  // 1. Touch ID — requires code signing + hardened runtime entitlements to work.
  //    If it fails (e.g. unsigned build or user cancels), offer a fallback so the
  //    app can still be used. The DB encryption key in Keychain still protects data.
  const authed = await authenticateWithTouchID("unlock Portfolio Tracker");
  if (!authed) {
    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "Authentication",
      message: "Touch ID failed or was cancelled.",
      detail: "You can continue without Touch ID (your data is still encrypted), or quit.",
      buttons: ["Continue Anyway", "Quit"],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 1) {
      app.quit();
      return;
    }
  }

  // 2. Fetch (or generate) the DB encryption key and inject it into the server env
  const dbKey = await getDbEncryptionKey();
  process.env["DB_ENCRYPTION_KEY"] = dbKey;

  // 3. Load any saved API keys back into env so the price service can read them
  const coingeckoKey = await getApiKey("coingecko-api-key");
  if (coingeckoKey) process.env["COINGECKO_API_KEY"] = coingeckoKey;

  // 4. Set DB path to userData so it persists across app versions
  process.env["DB_PATH"] = path.join(app.getPath("userData"), "portfolio.db");

  // 5. Start the embedded Node HTTP server (migrations run inside startServer)
  const { port } = await startServer(serverPort);
  serverPort = port;

  // 5. Open the main window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    // Development: point at the Bun dev server (run `bun dev` in parallel)
    await mainWindow.loadURL(`http://localhost:5173`);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: serve the pre-built React app as a static file
    await mainWindow.loadFile(path.join(__dirname, "../../portfolio-tracker/dist/index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) app.emit("ready");
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle("server:getPort", () => serverPort);

ipcMain.handle("keychain:getApiKey", (_event, name: string) => getApiKey(name));

ipcMain.handle("keychain:setApiKey", async (_event, name: string, value: string) => {
  await setApiKey(name, value);
  // Also update the live env so the running service sees the new key immediately
  if (name === "coingecko-api-key") process.env["COINGECKO_API_KEY"] = value;
});

ipcMain.handle("keychain:deleteApiKey", async (_event, name: string) => {
  await deleteApiKey(name);
  if (name === "coingecko-api-key") delete process.env["COINGECKO_API_KEY"];
});

//! Pebble desktop shell — a thin client.
//!
//! This used to be the whole application: it spawned a PyInstaller FastAPI sidecar on
//! 127.0.0.1:1430, pointed the webview at a bundled SPA, and ran a Unix socket server so
//! Python could call back into Rust for window control. The data lived in a SQLite file
//! under the app data directory.
//!
//! None of that is here any more. Pebble is deployed — API, SPA and Postgres behind
//! oauth2-proxy — and this window just loads it. One deployment, one database, one copy
//! of the ledger, reachable from a phone as well as the mac. The cost is that the desktop
//! app no longer works offline.
//!
//! The window's URL is `app.windows[0].url` in `tauri.conf.json`.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

/// Toggle window maximize/restore. Kept because it is the one native affordance the
/// hosted app cannot do for itself; the FastAPI `/api/window` route that used to drive
/// it over a Unix socket is gone, so nothing calls this today except a user-added
/// `invoke("toggle_window_maximize")`.
#[tauri::command]
fn toggle_window_maximize(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

fn create_system_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Pebble")
        .icon(app.default_window_icon().unwrap().clone())
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Opener stays: it is how a link in the hosted app reaches the real browser,
        // which matters because Google refuses to run its OAuth flow inside an
        // embedded webview (see README.md → Desktop shell).
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Err(e) = create_system_tray(app.handle()) {
                log::error!("Failed to create system tray: {}", e);
            }
            Ok(())
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![toggle_window_maximize])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

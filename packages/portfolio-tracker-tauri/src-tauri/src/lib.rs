use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;

pub struct ApiProcess(pub Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_biometry::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("could not resolve app data dir");
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("portfolio.db");

            match app.shell().sidecar("portfolio-api")
                .and_then(|s| s
                    .env("DB_PATH", db_path.to_string_lossy().as_ref())
                    .env("PORT", "39131")
                    .spawn())
            {
                Ok((mut rx, child)) => {
                    tauri::async_runtime::spawn(async move {
                        use tauri_plugin_shell::process::CommandEvent;
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => {
                                    println!("[api] {}", String::from_utf8_lossy(&line));
                                }
                                CommandEvent::Stderr(line) => {
                                    eprintln!("[api] {}", String::from_utf8_lossy(&line));
                                }
                                _ => {}
                            }
                        }
                    });
                    app.manage(ApiProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("[api] Failed to start sidecar: {e}");
                    app.manage(ApiProcess(Mutex::new(None)));
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(child) = app_handle
                    .state::<ApiProcess>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    let _ = child.kill();
                }
            }
        });
}

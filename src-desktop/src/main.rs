// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    WebviewUrl, WebviewWindowBuilder, Manager,
};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_autostart::MacosLauncher;

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Backend status response from /api/monitoring/stats
#[derive(serde::Deserialize, Clone, Debug)]
struct StatsResponse {
    success: bool,
    data: Option<StatsData>,
}

#[derive(serde::Deserialize, Clone, Debug)]
struct StatsData {
    agents: Vec<AgentStat>,
    summary: StatsSummary,
}

#[derive(serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct AgentStat {
    slug: String,
    name: String,
    status: String,
    healthy: bool,
}

#[derive(serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct StatsSummary {
    total_agents: usize,
}

/// Upcoming job response from /api/scheduler/upcoming
#[derive(serde::Deserialize, Clone, Debug)]
struct UpcomingResponse {
    success: bool,
    data: Option<Vec<UpcomingJob>>,
}

#[derive(serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct UpcomingJob {
    job_id: String,
    job_name: String,
    next_run_at: String,
}

// Command to open a URL in a new WebView window
#[tauri::command]
fn open_research_url(app: tauri::AppHandle, url: String, title: String) -> Result<(), String> {
    let counter = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("research-{}", counter);

    WebviewWindowBuilder::new(&app, window_label, WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?))
        .title(format!("Research: {}", title))
        .inner_size(1200.0, 800.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn authenticate_aws(app: tauri::AppHandle, pin: String) -> Result<String, String> {
    let shell = app.shell();

    let output = shell
        .command("sh")
        .args(["-c", &format!("echo '{}' | mwinit -f 2>&1", pin)])
        .output()
        .await
        .map_err(|e| format!("Failed to execute mwinit: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() || stdout.contains("successfully") || stdout.contains("authenticated") {
        Ok(stdout.to_string())
    } else {
        Err(format!("{}\n{}", stdout, stderr))
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![open_research_url, authenticate_aws])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Check if started with --minimized flag
            let start_minimized = std::env::args().any(|arg| arg == "--minimized");

            // --- Build system tray menu ---
            let show_hide = MenuItemBuilder::with_id("show_hide", "Show Window")
                .build(app)?;
            let separator1 = PredefinedMenuItem::separator(app)?;
            let scheduler_item = MenuItemBuilder::with_id("manage_jobs", "Scheduled Jobs...")
                .build(app)?;
            let monitoring_item = MenuItemBuilder::with_id("monitoring", "Monitoring...")
                .build(app)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings...")
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Project Stallion")
                .build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .items(&[
                    &show_hide,
                    &separator1,
                    &scheduler_item,
                    &monitoring_item,
                    &separator2,
                    &settings_item,
                    &quit_item,
                ])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Project Stallion")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show_hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "manage_jobs" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate", serde_json::json!({ "type": "scheduler" }));
                            }
                        }
                        "monitoring" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate", serde_json::json!({ "type": "monitoring" }));
                            }
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate", serde_json::json!({ "type": "settings" }));
                            }
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // --- Override window close to hide instead of quit ---
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });

                // If started minimized, hide the window
                if start_minimized {
                    let _ = window.hide();
                }
            }

            // --- Start Node.js server ---
            let app_handle_server = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let shell = app_handle_server.shell();
                let resource_path = app_handle_server.path().resource_dir().expect("failed to get resource dir");
                let server_path = resource_path.join("dist-server").join("index.js");

                println!("Starting server from: {:?}", server_path);
                println!("Working directory: {:?}", resource_path);

                match shell
                    .command("node")
                    .args([server_path.to_str().unwrap()])
                    .current_dir(&resource_path)
                    .spawn()
                {
                    Ok(_child) => {
                        println!("Server started successfully");
                        // Wait a moment for server to initialize
                        std::thread::sleep(Duration::from_secs(2));
                    }
                    Err(e) => {
                        eprintln!("Failed to start server: {}", e);
                        eprintln!("Make sure Node.js is installed and in your PATH");
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

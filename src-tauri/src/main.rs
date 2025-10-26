// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};
use std::sync::atomic::{AtomicU64, Ordering};

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(0);

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_research_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

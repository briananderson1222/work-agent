// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder, Manager};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri_plugin_shell::ShellExt;

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
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Start Node.js server
            tauri::async_runtime::spawn(async move {
                let resource_path = app_handle.path().resource_dir().expect("failed to get resource dir");
                let server_path = resource_path.join("dist").join("index.js");
                
                println!("Starting server from: {:?}", server_path);
                println!("Working directory: {:?}", resource_path);
                
                let shell = app_handle.shell();
                match shell
                    .command("node")
                    .args([server_path.to_str().unwrap()])
                    .current_dir(&resource_path)
                    .spawn()
                {
                    Ok(child) => {
                        println!("Server started successfully");
                        // Wait a moment for server to initialize
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
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

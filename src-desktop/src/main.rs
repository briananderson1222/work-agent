// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder, Manager};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
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

#[tauri::command]
async fn authenticate_aws(app: tauri::AppHandle, pin: String) -> Result<String, String> {
    let shell = app.shell();
    
    // Run mwinit in background with PIN piped via stdin
    // The -f flag forces it to run even if already authenticated
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
        .invoke_handler(tauri::generate_handler![open_research_url, authenticate_aws])
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Start Node.js server
            tauri::async_runtime::spawn(async move {
                let shell = app_handle.shell();
                let resource_path = app_handle.path().resource_dir().expect("failed to get resource dir");
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

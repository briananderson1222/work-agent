// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder, Manager};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use std::net::TcpStream;
use tauri_plugin_shell::ShellExt;

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(0);
const PORT: u16 = 3141;

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
async fn authenticate_external(app: tauri::AppHandle, pin: String) -> Result<String, String> {
    let auth_cmd = std::env::var("AUTH_COMMAND").map_err(|_| 
        "No AUTH_COMMAND environment variable configured. Set AUTH_COMMAND to your authentication command.".to_string()
    )?;

    let shell = app.shell();
    let output = shell
        .command("sh")
        .args(["-c", &format!("echo '{}' | {} 2>&1", pin, auth_cmd)])
        .output()
        .await
        .map_err(|e| format!("Failed to execute auth command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() || stdout.contains("successfully") || stdout.contains("authenticated") {
        Ok(stdout.to_string())
    } else {
        Err(format!("{}\n{}", stdout, stderr))
    }
}

/// Resolve the user's login shell PATH. macOS GUI apps only see /usr/bin:/bin:/usr/sbin:/sbin.
fn resolve_shell_path() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    if let Ok(output) = Command::new(&shell)
        .args(["-ilc", "echo $PATH"])
        .stderr(Stdio::null())
        .output()
    {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() { return path; }
    }
    std::env::var("PATH").unwrap_or_default()
}

/// Find the node binary. macOS GUI apps don't inherit shell PATH.
fn find_node() -> String {
    let home = std::env::var("HOME").unwrap_or_default();

    let mise_dir = format!("{home}/.local/share/mise/installs/node");
    if let Ok(entries) = std::fs::read_dir(&mise_dir) {
        let mut versions: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
        if let Some(entry) = versions.first() {
            let bin = entry.path().join("bin/node");
            if bin.exists() { return bin.to_string_lossy().into(); }
        }
    }

    for c in [
        format!("{home}/.nvm/current/bin/node"),
        format!("{home}/.volta/bin/node"),
        "/opt/homebrew/bin/node".into(),
        "/usr/local/bin/node".into(),
    ] {
        if std::path::Path::new(&c).exists() { return c; }
    }
    "node".into()
}

/// Kill any existing process listening on the given port.
fn kill_port(port: u16) {
    if let Ok(output) = Command::new("lsof")
        .args(["-ti", &format!(":{port}")])
        .output()
    {
        let pids = String::from_utf8_lossy(&output.stdout);
        for pid in pids.split_whitespace() {
            let _ = Command::new("kill").arg(pid.trim()).output();
        }
        if !pids.trim().is_empty() {
            std::thread::sleep(Duration::from_millis(500));
        }
    }
}

/// Wait for the server to accept TCP connections.
fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn main() {
    let node = find_node();
    let server_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_setup = server_child.clone();
    let child_for_exit = server_child.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_research_url, authenticate_external])
        .setup(move |app| {
            let resource_path = app.path().resource_dir().expect("failed to get resource dir");
            let server_path = resource_path.join("dist-server").join("index.js");
            let log_dir = std::env::temp_dir();
            let home = std::env::var("HOME").unwrap_or_default();
            let data_dir = std::path::PathBuf::from(&home).join(".work-agent");

            // Seed ~/.work-agent from bundled resources on first launch
            let bundled_seed = resource_path.join("seed");
            if bundled_seed.exists() && !data_dir.exists() {
                eprintln!("First launch: seeding ~/.work-agent from bundled resources");
                let _ = std::fs::create_dir_all(&data_dir);
                let _ = Command::new("cp").args(["-R",
                    bundled_seed.join("config").to_str().unwrap_or(""),
                    data_dir.join("config").to_str().unwrap_or("")
                ]).output();
            }

            // Kill any stale server from a previous run
            kill_port(PORT);

            // Resolve the user's real shell PATH so the server can find kiro-cli, boo, aws, etc.
            let shell_path = resolve_shell_path();

            let child = Command::new(&node)
                .arg(&server_path)
                .current_dir(&resource_path)
                .env("WORK_AGENT_DIR", &data_dir)
                .env("PATH", &shell_path)
                .env("HOME", &home)
                .stdout(std::fs::File::create(log_dir.join("stallion-server.log")).map_or(
                    Stdio::null(), Stdio::from))
                .stderr(std::fs::File::create(log_dir.join("stallion-server-err.log")).map_or(
                    Stdio::null(), Stdio::from))
                .spawn();

            match child {
                Ok(c) => {
                    *child_for_setup.lock().unwrap() = Some(c);
                    if !wait_for_port(PORT, Duration::from_secs(10)) {
                        eprintln!("Server did not become ready within 10s");
                    }
                    
                }
                Err(e) => eprintln!("Failed to spawn server: {e}"),
            }

            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Ok(mut guard) = child_for_exit.lock() {
                    if let Some(ref mut child) = *guard {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

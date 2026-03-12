use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg(not(mobile))]
use std::process::{Child, Command, Stdio};
#[cfg(not(mobile))]
use std::sync::atomic::Ordering;
#[cfg(not(mobile))]
use std::time::{Duration, Instant};
#[cfg(not(mobile))]
use std::net::TcpStream;
#[cfg(not(mobile))]
use tauri::WebviewUrl;
#[cfg(not(mobile))]
use tauri::WebviewWindowBuilder;
#[cfg(not(mobile))]
use tauri_plugin_shell::ShellExt;

#[cfg(not(mobile))]
static WINDOW_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(not(mobile))]
const PORT: u16 = 3141;

#[cfg(not(mobile))]
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

#[cfg(not(mobile))]
#[tauri::command]
async fn authenticate_external(app: tauri::AppHandle, pin: String) -> Result<String, String> {
    let auth_cmd = std::env::var("AUTH_COMMAND").map_err(|_|
        "No AUTH_COMMAND environment variable configured.".to_string()
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

#[cfg(not(mobile))]
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

#[cfg(not(mobile))]
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

#[cfg(not(mobile))]
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

#[cfg(not(mobile))]
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(not(mobile))]
    let server_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    #[cfg(not(mobile))]
    let child_for_setup = server_child.clone();
    #[cfg(not(mobile))]
    let child_for_exit = server_child.clone();
    #[cfg(not(mobile))]
    let node = find_node();

    let mut builder = tauri::Builder::default();

    #[cfg(not(mobile))]
    {
        builder = builder.plugin(tauri_plugin_shell::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            #[cfg(not(mobile))]
            open_research_url,
            #[cfg(not(mobile))]
            authenticate_external,
        ])
        .setup(move |app| {
            #[cfg(not(mobile))]
            {
                let resource_path = app.path().resource_dir().expect("failed to get resource dir");
                let server_path = resource_path.join("dist-server").join("index.js");
                let log_dir = std::env::temp_dir();
                let home = std::env::var("HOME").unwrap_or_default();
                let data_dir = std::path::PathBuf::from(&home).join(".stallion-ai");

                let bundled_seed = resource_path.join("seed");
                if bundled_seed.exists() && !data_dir.exists() {
                    let _ = std::fs::create_dir_all(&data_dir);
                    let _ = Command::new("cp").args(["-R",
                        bundled_seed.join("config").to_str().unwrap_or(""),
                        data_dir.join("config").to_str().unwrap_or("")
                    ]).output();
                }

                kill_port(PORT);
                let shell_path = resolve_shell_path();

                let child = Command::new(&node)
                    .arg(&server_path)
                    .current_dir(&resource_path)
                    .env("STALLION_AI_DIR", &data_dir)
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
            }

            let _ = app;
            Ok(())
        })
        .on_window_event(move |_window, event| {
            #[cfg(not(mobile))]
            if let tauri::WindowEvent::Destroyed = event {
                if let Ok(mut guard) = child_for_exit.lock() {
                    if let Some(ref mut child) = *guard {
                        let _ = child.kill();
                    }
                }
            }
            #[cfg(mobile)]
            let _ = event;
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

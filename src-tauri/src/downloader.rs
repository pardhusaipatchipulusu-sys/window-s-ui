use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    pub id: String,
    pub url: String,
    pub kind: String,
    pub title: String,
    pub status: String,
    pub progress: f32,
    pub speed: String,
    pub eta: String,
    pub error: String,
    pub created_at: u64,
}

static JOBS: OnceLock<Mutex<VecDeque<DownloadJob>>> = OnceLock::new();
static WORKER: OnceLock<Mutex<()>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn jobs() -> &'static Mutex<VecDeque<DownloadJob>> {
    JOBS.get_or_init(|| Mutex::new(VecDeque::new()))
}

fn persist(app: &AppHandle) {
    let Ok(items) = jobs().lock() else { return };
    if let (Ok(dir), Ok(json)) = (app.path().app_data_dir(), serde_json::to_vec(&*items)) {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("downloader-history.json"), json);
    }
}

fn emit_update(app: &AppHandle, id: &str, update: impl FnOnce(&mut DownloadJob)) {
    if let Ok(mut items) = jobs().lock() {
        if let Some(item) = items.iter_mut().find(|job| job.id == id) {
            update(item);
        }
    }
    persist(app);
    if let Some(job) = jobs().lock().ok().and_then(|items| items.iter().find(|job| job.id == id).cloned()) {
        let _ = app.emit("download-update", job);
    }
}

#[tauri::command]
pub fn get_download_jobs(app: AppHandle) -> Result<Vec<DownloadJob>, String> {
    let mut items = jobs().lock().map_err(|e| e.to_string())?;
    let mut restored = false;
    if items.is_empty() {
        let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("downloader-history.json");
        if let Ok(bytes) = std::fs::read(path) {
            if let Ok(saved) = serde_json::from_slice::<VecDeque<DownloadJob>>(&bytes) {
                *items = saved;
                restored = true;
            }
        }
    }
    if restored {
        for item in items.iter_mut() {
            if item.status == "queued" || item.status == "downloading" {
                item.status = "failed".into();
                item.error = "Orbix closed before this download finished.".into();
            }
        }
    }
    let snapshot = items.iter().cloned().collect::<Vec<_>>();
    drop(items);
    persist(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn queue_download(app: AppHandle, url: String, kind: String) -> Result<DownloadJob, String> {
    let url = url.trim().to_string();
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) || url.chars().any(char::is_control) {
        return Err("Enter a valid http or https link.".into());
    }
    if !matches!(kind.as_str(), "video" | "audio") {
        return Err("Choose video or audio.".into());
    }
    let created_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let id = format!("{}-{}", created_at, NEXT_ID.fetch_add(1, Ordering::Relaxed));
    let job = DownloadJob { id: id.clone(), url, kind, title: "Waiting in queue".into(), status: "queued".into(), progress: 0.0, speed: String::new(), eta: String::new(), error: String::new(), created_at };
    {
        let mut items = jobs().lock().map_err(|e| e.to_string())?;
        items.push_front(job.clone());
        items.truncate(100);
    }
    persist(&app);
    let _ = app.emit("download-update", job.clone());
    let worker_app = app.clone();
    let worker_job = job.clone();
    std::thread::spawn(move || run_download(worker_app, worker_job));
    Ok(job)
}

#[tauri::command]
pub fn open_download_folder(app: AppHandle) -> Result<(), String> {
    let path = app.path().download_dir().map_err(|e| e.to_string())?.join("Orbix Downloads");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(path.to_string_lossy().as_ref(), None::<&str>).map_err(|e| e.to_string())
}

fn run_download(app: AppHandle, job: DownloadJob) {
    let _turn = match WORKER.get_or_init(|| Mutex::new(())).lock() {
        Ok(lock) => lock,
        Err(_) => {
            emit_update(&app, &job.id, |item| { item.status = "failed".into(); item.error = "Download queue could not start.".into(); });
            return;
        }
    };
    emit_update(&app, &job.id, |item| { item.status = "downloading".into(); item.title = "Preparing download".into(); });
    let tool = app.path().resolve("tools/yt-dlp/yt-dlp.exe", tauri::path::BaseDirectory::Resource);
    let deno = app.path().resolve("tools/deno/deno.exe", tauri::path::BaseDirectory::Resource);
    let ffmpeg = app.path().resolve("tools/ffmpeg/ffmpeg.exe", tauri::path::BaseDirectory::Resource);
    let output_dir = app.path().download_dir().map(|p| p.join("Orbix Downloads"));
    let (tool, deno, ffmpeg, output_dir) = match (tool, deno, ffmpeg, output_dir) {
        (Ok(tool), Ok(deno), Ok(ffmpeg), Ok(dir)) => (tool, deno, ffmpeg, dir),
        _ => { emit_update(&app, &job.id, |item| { item.status = "failed".into(); item.error = "Could not find the downloader or Downloads folder.".into(); }); return; }
    };
    if let Err(error) = std::fs::create_dir_all(&output_dir) {
        emit_update(&app, &job.id, |item| { item.status = "failed".into(); item.error = error.to_string(); });
        return;
    }
    let mut command = Command::new(tool);
    command.args(["--newline", "--no-playlist", "--remote-components", "ejs:github", "--progress-template", "download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s", "--print", "before_dl:title:%(title)s", "--js-runtimes"])
        .arg(format!("deno:{}", deno.to_string_lossy()))
        .arg("--ffmpeg-location")
        .arg(ffmpeg)
        .arg("-P")
        .arg(&output_dir).arg("-o").arg("%(title).200B [%(id)s].%(ext)s");
    if job.kind == "audio" {
        command.args(["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "0"]);
    } else {
        command.args(["-f", "bv*[height<=2160]+ba/b[height<=2160]", "--merge-output-format", "mp4"]);
    }
    let spawn = command.arg("--").arg(&job.url).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn();
    let mut child = match spawn {
        Ok(child) => child,
        Err(error) => { emit_update(&app, &job.id, |item| { item.status = "failed".into(); item.error = format!("Could not start yt-dlp: {error}"); }); return; }
    };
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    if let Some(stdout) = child.stdout.take() {
        let tx = tx.clone();
        std::thread::spawn(move || for line in BufReader::new(stdout).lines().flatten() { let _ = tx.send(line); });
    }
    if let Some(stderr) = child.stderr.take() {
        let tx = tx.clone();
        std::thread::spawn(move || for line in BufReader::new(stderr).lines().flatten() { let _ = tx.send(line); });
    }
    drop(tx);
    let mut diagnostic = String::new();
    for line in rx {
        if let Some(title) = line.strip_prefix("before_dl:title:") {
            let title = title.to_string();
            emit_update(&app, &job.id, |item| item.title = title);
        } else if let Some(values) = line.strip_prefix("download:") {
            let values: Vec<&str> = values.split('|').collect();
            if values.len() == 3 {
                let progress = values[0].trim().trim_end_matches('%').parse::<f32>().unwrap_or(0.0).clamp(0.0, 100.0);
                let speed = values[1].trim().to_string();
                let eta = values[2].trim().to_string();
                emit_update(&app, &job.id, |item| { item.progress = progress; item.speed = speed; item.eta = eta; });
            }
        } else if line.contains("ERROR:") || line.contains("No supported JavaScript runtime") {
            diagnostic = line.trim().to_string();
        }
    }
    match child.wait() {
        Ok(status) if status.success() => emit_update(&app, &job.id, |item| { item.status = "completed".into(); item.progress = 100.0; item.speed.clear(); item.eta.clear(); }),
        Ok(status) => emit_update(&app, &job.id, |item| {
            item.status = "failed".into();
            item.error = if diagnostic.contains("No supported JavaScript runtime") {
                "YouTube now requires a supported JavaScript runtime such as Deno. Install Deno and restart Orbix.".into()
            } else if diagnostic.is_empty() { format!("yt-dlp exited with {status}.") } else { diagnostic };
            item.speed.clear(); item.eta.clear();
        }),
        Err(error) => emit_update(&app, &job.id, |item| { item.status = "failed".into(); item.error = error.to_string(); }),
    }
}

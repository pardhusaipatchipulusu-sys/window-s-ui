use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize)]
pub struct ConversionFormat {
    extension: String,
    label: String,
}

const IMAGE_FORMATS: [(&str, &str, image::ImageFormat); 6] = [
    ("png", "PNG", image::ImageFormat::Png),
    ("jpg", "JPEG", image::ImageFormat::Jpeg),
    ("webp", "WebP", image::ImageFormat::WebP),
    ("bmp", "BMP", image::ImageFormat::Bmp),
    ("gif", "GIF", image::ImageFormat::Gif),
    ("tiff", "TIFF", image::ImageFormat::Tiff),
];

const AUDIO_INPUTS: &[&str] = &[
	"aac", "aiff", "alac", "amr", "ape", "flac", "m4a", "m4b", "mp3", "ogg", "opus",
	"wav", "wma",
];
const VIDEO_INPUTS: &[&str] = &[
	"3gp", "avi", "flv", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "mts", "m2ts", "ogv",
	"ts", "webm", "wmv",
];
const DOCUMENT_INPUTS: &[&str] = &[
	"docx", "odt", "rtf", "html", "htm", "md", "markdown", "txt", "rst", "epub", "pptx",
	"xlsx", "csv", "tex",
];
const DOCUMENT_OUTPUTS: &[(&str, &str)] = &[
	("docx", "Word document"),
	("odt", "OpenDocument text"),
	("rtf", "Rich Text"),
	("html", "HTML"),
	("md", "Markdown"),
	("txt", "Plain text"),
	("epub", "EPUB"),
	("pptx", "PowerPoint"),
	("tex", "LaTeX"),
];
const AUDIO_OUTPUTS: &[(&str, &str)] = &[
	("mp3", "MP3 audio"),
	("wav", "WAV audio"),
	("flac", "FLAC audio"),
	("ogg", "OGG audio"),
	("opus", "Opus audio"),
	("m4a", "M4A audio"),
];
const VIDEO_OUTPUTS: &[(&str, &str)] = &[
	("mp4", "MP4 video"),
	("mkv", "MKV video"),
	("webm", "WebM video"),
	("mov", "MOV video"),
	("gif", "GIF animation"),
];
const ARCHIVE_OUTPUTS: &[(&str, &str)] = &[
	("zip", "ZIP archive"),
	("7z", "7-Zip archive"),
	("tar", "TAR archive"),
	("gz", "GZIP archive"),
];

pub fn available_formats(app: &AppHandle, path: &str) -> Result<Vec<ConversionFormat>, String> {
    let source = Path::new(path);
    if !source.is_file() {
        return Err("Choose an existing file to convert.".into());
    }

    let image_is_decodable = image::ImageReader::open(source)
        .ok()
        .and_then(|reader| reader.with_guessed_format().ok())
        .is_some_and(|mut reader| {
            let mut limits = image::Limits::default();
            limits.max_image_width = Some(16_384);
            limits.max_image_height = Some(16_384);
            limits.max_alloc = Some(256 * 1024 * 1024);
            reader.limits(limits);
            reader.decode().is_ok()
        });

    let mut formats = Vec::new();
    if image_is_decodable {
        formats.extend(IMAGE_FORMATS
            .iter()
            .filter(|(extension, _, _)| {
                source
                    .extension()
                    .and_then(|value| value.to_str())
                    .map_or(true, |current| !current.eq_ignore_ascii_case(extension))
            })
            .map(|(extension, label, _)| ConversionFormat {
                extension: (*extension).into(),
                label: (*label).into(),
            })
            .collect::<Vec<_>>());
    }

    let source_extension = source.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if find_tool(app, "ffmpeg/ffmpeg.exe").is_some() {
        if AUDIO_INPUTS.contains(&source_extension.as_str()) {
            formats.extend(AUDIO_OUTPUTS.iter().filter(|(extension, _)| !extension.eq_ignore_ascii_case(&source_extension)).map(|(extension, label)| ConversionFormat { extension: (*extension).into(), label: (*label).into() }));
        } else if VIDEO_INPUTS.contains(&source_extension.as_str()) {
            formats.extend(VIDEO_OUTPUTS.iter().filter(|(extension, _)| !extension.eq_ignore_ascii_case(&source_extension)).map(|(extension, label)| ConversionFormat { extension: (*extension).into(), label: (*label).into() }));
            formats.extend(AUDIO_OUTPUTS.iter().map(|(extension, label)| ConversionFormat { extension: (*extension).into(), label: (*label).into() }));
        }
    }

    if DOCUMENT_INPUTS.contains(&source_extension.as_str()) && ensure_pandoc(app).is_some() {
        formats.extend(DOCUMENT_OUTPUTS.iter().filter(|(extension, _)| !extension.eq_ignore_ascii_case(&source_extension)).map(|(extension, label)| ConversionFormat { extension: (*extension).into(), label: (*label).into() }));
    }

    if find_tool(app, "7zip/7za.exe").is_some() {
        formats.extend(ARCHIVE_OUTPUTS.iter().filter(|(extension, _)| !extension.eq_ignore_ascii_case(&source_extension)).map(|(extension, label)| ConversionFormat { extension: (*extension).into(), label: (*label).into() }));
    }
    Ok(formats)
}

pub fn convert(app: &AppHandle, path: &str, target_format: &str) -> Result<String, String> {
    let format = IMAGE_FORMATS
        .iter()
        .find(|(extension, _, _)| extension.eq_ignore_ascii_case(target_format))
        .copied();
    let source = Path::new(path);
    if !source.is_file() {
        return Err("The source file is no longer available.".into());
    }

    if let Some((extension, _, image_format)) = format {
        let image = read_image(source)?;
        let output = unique_output_path(source, extension)?;
        image.save_with_format(&output, image_format).map_err(|e| format!("Could not save the converted image: {e}"))?;
        return Ok(output.to_string_lossy().to_string());
    }

    let source_extension = source.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let target = target_format.trim_start_matches('.').to_ascii_lowercase();
    let output = unique_output_path(source, &target)?;

    if let Some(ffmpeg) = find_tool(app, "ffmpeg/ffmpeg.exe") {
        if AUDIO_INPUTS.contains(&source_extension.as_str()) && AUDIO_OUTPUTS.iter().any(|(ext, _)| *ext == target) {
            run_media_conversion(&ffmpeg, source, &output)?;
            return Ok(output.to_string_lossy().to_string());
        }
        if VIDEO_INPUTS.contains(&source_extension.as_str())
            && (VIDEO_OUTPUTS.iter().any(|(ext, _)| *ext == target) || AUDIO_OUTPUTS.iter().any(|(ext, _)| *ext == target))
        {
            run_media_conversion(&ffmpeg, source, &output)?;
            return Ok(output.to_string_lossy().to_string());
        }
    }

    if DOCUMENT_INPUTS.contains(&source_extension.as_str())
        && DOCUMENT_OUTPUTS.iter().any(|(ext, _)| *ext == target)
    {
        if let Some(pandoc) = ensure_pandoc(app) {
            run_document_conversion(&pandoc, source, &output)?;
            return Ok(output.to_string_lossy().to_string());
        }
    }

    if ARCHIVE_OUTPUTS.iter().any(|(ext, _)| *ext == target) {
        if let Some(seven_zip) = find_tool(app, "7zip/7za.exe") {
            run_archive_creation(&seven_zip, source, &output)?;
            return Ok(output.to_string_lossy().to_string());
        }
    }
    Err("No bundled local converter supports this input and output format.".into())
}

fn read_image(source: &Path) -> Result<image::DynamicImage, String> {
    let mut reader = image::ImageReader::open(source)
        .map_err(|e| format!("Could not read this image: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("Could not identify this image: {e}"))?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16_384);
    limits.max_image_height = Some(16_384);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|e| format!("Could not read this image: {e}"))
}

fn find_tool(app: &AppHandle, relative_path: &str) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource_path = resource_dir.join("tools").join(relative_path);
        if resource_path.is_file() {
            return Some(resource_path);
        }
    }
    let development_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tools")
        .join(relative_path);
    development_path.is_file().then_some(development_path)
}

fn ensure_pandoc(app: &AppHandle) -> Option<PathBuf> {
    if let Some(path) = find_tool(app, "pandoc/pandoc.exe") {
        return Some(path);
    }

    let installer = find_tool(app, "pandoc/pandoc.msi")?;
    let install_dir = app.path().app_local_data_dir().ok()?.join("converter-tools").join("pandoc");
    let executable = find_named_file(&install_dir, "pandoc.exe");
    if executable.is_some() {
        return executable;
    }
    fs::create_dir_all(&install_dir).ok()?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let target = format!("TARGETDIR={}", install_dir.display());
        let status = Command::new("msiexec.exe")
            .args(["/a", installer.to_str()?, "/qn", &target])
            .creation_flags(0x08000000)
            .status()
            .ok()?;
        if !status.success() {
            return None;
        }
        find_named_file(&install_dir, "pandoc.exe")
    }
    #[cfg(not(windows))]
    {
        let _ = installer;
        None
    }
}

fn find_named_file(root: &Path, file_name: &str) -> Option<PathBuf> {
    if !root.is_dir() {
        return None;
    }
    for entry in fs::read_dir(root).ok()? {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.is_file() && path.file_name().is_some_and(|name| name.eq_ignore_ascii_case(file_name)) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_named_file(&path, file_name) {
                return Some(found);
            }
        }
    }
    None
}

fn run_media_conversion(tool: &Path, source: &Path, output: &Path) -> Result<(), String> {
    let result = hidden_command(tool)
        .args(["-nostdin", "-hide_banner", "-y", "-i"])
        .arg(source)
        .arg(output)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Could not start the media converter: {e}"))?;
    if result.status.success() { Ok(()) } else { Err(command_error("Media conversion failed", &result.stderr)) }
}

fn run_document_conversion(tool: &Path, source: &Path, output: &Path) -> Result<(), String> {
    let result = hidden_command(tool)
        .arg(source)
        .arg("-o")
        .arg(output)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Could not start the document converter: {e}"))?;
    if result.status.success() { Ok(()) } else { Err(command_error("Document conversion failed", &result.stderr)) }
}

fn run_archive_creation(tool: &Path, source: &Path, output: &Path) -> Result<(), String> {
    let result = hidden_command(tool)
        .arg("a")
        .arg("-y")
        .arg(output)
        .arg(source)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Could not start the archive converter: {e}"))?;
    if result.status.success() { Ok(()) } else { Err(command_error("Archive creation failed", &result.stderr)) }
}

fn hidden_command(path: &Path) -> Command {
    let mut command = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

fn command_error(prefix: &str, stderr: &[u8]) -> String {
    let message = String::from_utf8_lossy(stderr);
    let detail = message.trim();
    if detail.is_empty() { prefix.into() } else { format!("{prefix}: {}", detail.chars().take(300).collect::<String>()) }
}

fn unique_output_path(source: &Path, extension: &str) -> Result<PathBuf, String> {
    let parent = source
        .parent()
        .ok_or_else(|| "The source file has no parent folder.".to_string())?;
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("converted-file");
    let base = parent.join(format!("{stem}-converted.{extension}"));
    if !base.exists() {
        return Ok(base);
    }
    for index in 2..=9999 {
        let candidate = parent.join(format!("{stem}-converted-{index}.{extension}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("Could not choose a new output filename.".into())
}

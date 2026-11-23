$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root "src-tauri/tools"
$temp = Join-Path $env:TEMP "orbix-windows-tools-$PID"
New-Item -ItemType Directory -Force -Path $temp | Out-Null

function Get-LatestReleaseAsset([string]$Repository, [string]$Pattern) {
	$headers = @{ "User-Agent" = "Orbix-Windows-Build"; "Accept" = "application/vnd.github+json" }
	$release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Repository/releases/latest"
	$asset = $release.assets | Where-Object { $_.name -match $Pattern } | Select-Object -First 1
	if (-not $asset) { throw "No release asset matching '$Pattern' in $Repository." }
	return $asset
}

function Download-Asset($Asset, [string]$Destination) {
	Write-Host "Downloading $($Asset.name)"
	Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $Destination
	if ($Asset.digest -match '^sha256:(?<hash>[0-9a-fA-F]{64})$') {
		$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash.ToLowerInvariant()
		if ($actual -ne $Matches.hash.ToLowerInvariant()) { throw "SHA-256 check failed for $($Asset.name)." }
	}
}

function Get-ToolDirectory([string]$Name) {
	$directory = Join-Path $tools $Name
	New-Item -ItemType Directory -Force -Path $directory | Out-Null
	return $directory
}

# yt-dlp is the standalone Windows release executable.
$ytDlp = Get-LatestReleaseAsset "yt-dlp/yt-dlp" '^yt-dlp\.exe$'
Download-Asset $ytDlp (Join-Path (Get-ToolDirectory "yt-dlp") "yt-dlp.exe")

# Deno is used by yt-dlp for JavaScript challenge solving.
$deno = Get-LatestReleaseAsset "denoland/deno" '^deno-x86_64-pc-windows-msvc\.zip$'
$denoZip = Join-Path $temp $deno.name
Download-Asset $deno $denoZip
$denoExtract = Join-Path $temp "deno"
if (Test-Path $denoExtract) { Remove-Item -LiteralPath $denoExtract -Recurse -Force }
Expand-Archive -LiteralPath $denoZip -DestinationPath $denoExtract -Force
Copy-Item -LiteralPath (Join-Path $denoExtract "deno.exe") -Destination (Join-Path (Get-ToolDirectory "deno") "deno.exe") -Force

# FFmpeg's essentials static build supports the app's local media conversion and downloader.
$ffmpegDirectory = Get-ToolDirectory "ffmpeg"
$ffmpegZip = Join-Path $temp "ffmpeg-release-essentials.zip"
$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
Write-Host "Downloading FFmpeg essentials"
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip
$checksumText = (Invoke-WebRequest -Uri "$ffmpegUrl.sha256").Content
if ($checksumText -match '(?<hash>[0-9a-fA-F]{64})') {
	$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $ffmpegZip).Hash.ToLowerInvariant()
	if ($actual -ne $Matches.hash.ToLowerInvariant()) { throw "SHA-256 check failed for FFmpeg." }
}
$ffmpegExtract = Join-Path $temp "ffmpeg"
if (Test-Path $ffmpegExtract) { Remove-Item -LiteralPath $ffmpegExtract -Recurse -Force }
Expand-Archive -LiteralPath $ffmpegZip -DestinationPath $ffmpegExtract -Force
$ffmpegExe = Get-ChildItem -LiteralPath $ffmpegExtract -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
if (-not $ffmpegExe) { throw "The FFmpeg archive did not contain ffmpeg.exe." }
Copy-Item -LiteralPath $ffmpegExe.FullName -Destination (Join-Path $ffmpegDirectory "ffmpeg.exe") -Force

# The app expands the Pandoc MSI into its per-user data directory on first use.
$pandoc = Get-LatestReleaseAsset "jgm/pandoc" '^pandoc-[0-9.]+-windows-x86_64\.msi$'
Download-Asset $pandoc (Join-Path (Get-ToolDirectory "pandoc") "pandoc.msi")

# The 7-Zip Extra package provides the standalone command-line executable used by the converter.
$sevenZip = Get-LatestReleaseAsset "ip7z/7zip" '^7z[0-9]+-extra\.7z$'
$sevenZipArchive = Join-Path $temp $sevenZip.name
Download-Asset $sevenZip $sevenZipArchive
$extractor = (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
if (-not $extractor) {
	$extractor = Join-Path $env:ProgramFiles "7-Zip/7z.exe"
}
if (-not (Test-Path -LiteralPath $extractor)) { throw "7-Zip is required to extract its Extra package." }
$sevenZipExtract = Join-Path $temp "7zip"
if (Test-Path $sevenZipExtract) { Remove-Item -LiteralPath $sevenZipExtract -Recurse -Force }
New-Item -ItemType Directory -Force -Path $sevenZipExtract | Out-Null
& $extractor x $sevenZipArchive "-o$sevenZipExtract" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not extract the 7-Zip Extra package." }
$sevenZipExe = Get-ChildItem -LiteralPath $sevenZipExtract -Filter "7za.exe" -Recurse | Select-Object -First 1
if (-not $sevenZipExe) { throw "The 7-Zip Extra package did not contain 7za.exe." }
Copy-Item -LiteralPath $sevenZipExe.FullName -Destination (Join-Path (Get-ToolDirectory "7zip") "7za.exe") -Force

Write-Host "Bundled Windows tools are ready."
Remove-Item -LiteralPath $temp -Recurse -Force

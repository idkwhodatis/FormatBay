# FFmpeg supplies source, not Windows executables. Its official download page
# https://ffmpeg.org/download.html links Gyan's builds:
# https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2
# FFmpeg SHA256 is published both by the release asset and Gyan's checksum URL.
# Opus distribution is the official Xiph-linked Mozilla archive:
# https://opus-codec.org/downloads/ and https://archive.mozilla.org/pub/opus/win64/
# Its SHA256 was independently computed from the HTTPS archive on 2026-11-18.
# No binaries are added to the repository or installed system-wide.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'This tool installer is for Windows runners only' }
if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP) -or [string]::IsNullOrWhiteSpace($env:GITHUB_PATH)) {
    throw 'RUNNER_TEMP and GITHUB_PATH must be set by GitHub Actions'
}
$root = Join-Path $env:RUNNER_TEMP 'formatbay-media-tools'
New-Item -ItemType Directory -Path $root -Force | Out-Null

function Expand-PinnedArchive {
    param(
        [Parameter(Mandatory)][string] $Uri,
        [Parameter(Mandatory)][string] $Sha256,
        [Parameter(Mandatory)][string] $ArchiveName,
        [Parameter(Mandatory)][string] $Destination
    )
    $archive = Join-Path $root $ArchiveName
    Invoke-WebRequest -Uri $Uri -OutFile $archive -MaximumRedirection 5
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    if (-not $actual.Equals($Sha256, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $archive -Force
        throw "SHA256 mismatch for $ArchiveName; refusing extraction"
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $Destination -Force
}

$ffmpegRoot = Join-Path $root 'ffmpeg'
Expand-PinnedArchive `
    -Uri 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip' `
    -Sha256 '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba' `
    -ArchiveName 'ffmpeg-9.0.2-essentials_build.zip' `
    -Destination $ffmpegRoot
$ffmpegBin = Join-Path $ffmpegRoot 'ffmpeg-9.0.2-essentials_build/bin'

$opusBin = Join-Path $root 'opus-tools'
Expand-PinnedArchive `
    -Uri 'https://archive.mozilla.org/pub/opus/win64/opus-tools-0.2-opus-1.3-win64.zip' `
    -Sha256 'a892bd29358e142fa756da6bfcaea2faadc0f82ee1947d9eb2cecd208f1b873f' `
    -ArchiveName 'opus-tools-0.2-opus-1.3-win64.zip' `
    -Destination $opusBin

$executables = @(
    (Join-Path $ffmpegBin 'ffmpeg.exe'),
    (Join-Path $ffmpegBin 'ffprobe.exe'),
    (Join-Path $opusBin 'opusenc.exe')
)
foreach ($executable in $executables) {
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw "Pinned archive did not contain expected executable: $executable"
    }
}
# Add only verified extraction directories, ahead of any preinstalled media tools.
Add-Content -LiteralPath $env:GITHUB_PATH -Value $ffmpegBin -Encoding utf8
Add-Content -LiteralPath $env:GITHUB_PATH -Value $opusBin -Encoding utf8
$env:PATH = "$ffmpegBin;$opusBin;$env:PATH"

& ($executables[0]) -version
if ($LASTEXITCODE -ne 0) { throw 'Pinned FFmpeg failed to start' }
& ($executables[1]) -version
if ($LASTEXITCODE -ne 0) { throw 'Pinned ffprobe failed to start' }
& ($executables[2]) --version
if ($LASTEXITCODE -ne 0) { throw 'Pinned opusenc failed to start' }

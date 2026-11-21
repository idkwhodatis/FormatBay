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

$opusBin = Join-Path $root 'opus-tools'
Expand-PinnedArchive `
    -Uri 'https://archive.mozilla.org/pub/opus/win64/opus-tools-0.2-opus-1.3-win64.zip' `
    -Sha256 'a892bd29358e142fa756da6bfcaea2faadc0f82ee1947d9eb2cecd208f1b873f' `
    -ArchiveName 'opus-tools-0.2-opus-1.3-win64.zip' `
    -Destination $opusBin

$executable = Join-Path $opusBin 'opusenc.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Pinned archive did not contain expected executable: $executable"
}
Add-Content -LiteralPath $env:GITHUB_PATH -Value $opusBin -Encoding utf8
& $executable --version
if ($LASTEXITCODE -ne 0) { throw 'Pinned opusenc failed to start' }

<#
.SYNOPSIS
    Install the Beszel agent as a Windows service.

.DESCRIPTION
    Downloads the pinned Beszel agent release for Windows, installs the binary to
    C:\Program Files\Beszel\beszel-agent.exe, registers a Windows service named
    'beszel-agent' via sc.exe with HUB_URL and KEY exposed as service environment
    variables, and starts the service.

    Must be run from an elevated PowerShell (Administrator) session. Uses the
    built-in Expand-Archive cmdlet (PowerShell 5.0+) to unpack the release zip.

.PARAMETER Hub
    URL of the Beszel hub. For universal-token mode use http://host:8090; for
    legacy per-system-key mode use tcp://host:45876. Passed as HUB_URL.

.PARAMETER Token
    Universal token from the hub UI (Settings -> Tokens & Fingerprints ->
    Universal token). The same token works for every host; the agent
    self-registers on first connect. Passed as TOKEN. Either -Token or -Key
    is required.

.PARAMETER Key
    Per-system public key from the hub UI (Settings -> Systems -> Add System),
    bound to this one host. Passed as KEY. Either -Token or -Key is required.

.PARAMETER Help
    Show usage and exit 0.

.EXAMPLE
    # Universal-token mode (recommended):
    .\windows-install.ps1 -Hub http://hub.example:8090 -Token <universal-token>

.EXAMPLE
    # Legacy per-system-key mode:
    .\windows-install.ps1 -Hub tcp://hub.example:45876 -Key <agent-public-key>

.EXAMPLE
    # UNIX-style long args are NOT accepted natively by PowerShell. The Linux
    # equivalent --hub=<url> --token=<token> must be translated to -Hub / -Token
    # when running the Windows installer.
#>

# -----------------------------------------------------------------------------
# Pinned Beszel version. To bump:
#   1. Check https://github.com/henrygd/beszel/releases for the latest non-prerelease tag.
#   2. Update $BeszelVersion below (without the leading 'v').
#   3. Update deploy/.env.example to match.
#   4. Update deploy/agent-install/linux-systemd.sh to match.
#   5. Re-run this script on each agent host (from an elevated PowerShell).
# -----------------------------------------------------------------------------

[CmdletBinding()]
param(
    [string]$Hub,
    [string]$Key,
    [string]$Token,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$BeszelVersion = "0.18.7"

# NSSM wraps the non-service-aware beszel-agent.exe as a Windows service.
# Pinned to NSSM 2.24, the latest stable release on https://nssm.cc/download.
# Bundled into the install dir so the service can self-restart without external
# tooling (no scoop / winget dependency).
$NssmVersion = "2.24"

function Write-Usage {
    $msg = @'
Usage: windows-install.ps1 -Hub <HUB_URL> (-Token <TOKEN> | -Key <PUBLIC_KEY>) [-Help]

Installs the Beszel agent to 'C:\Program Files\Beszel\beszel-agent.exe' and
registers a Windows service named 'beszel-agent' (display name "Beszel Agent",
start=auto), then starts it.

Required parameters:
  -Hub <HUB_URL>       URL of the Beszel hub.
                       For universal-token mode, use http://host:8090.
                       For legacy per-system-key mode, use tcp://host:45876.
                       Passed to the agent as the HUB_URL environment variable.

  At least one of:
  -Token <TOKEN>       Universal token from the hub UI (Settings -> Tokens &
                       Fingerprints -> Universal token). Same token works for
                       every host; the agent self-registers on first connect.
                       Passed as TOKEN.
  -Key <PUBLIC_KEY>    Per-system public key from the hub UI (Settings ->
                       Systems -> Add System), bound to this one host.
                       Passed as KEY.

Options:
  -Help                Show this message and exit.

Run from an elevated PowerShell (Administrator). Uses Expand-Archive
(built into PowerShell 5.0+).
'@
    Write-Host $msg
}

function Die {
    param([string]$Message)
    Write-Error "error: $Message"
    exit 1
}

if ($Help) {
    Write-Usage
    exit 0
}

# ------------------------------- arg validation -----------------------------
if ([string]::IsNullOrEmpty($Hub) -and [string]::IsNullOrEmpty($Key) -and [string]::IsNullOrEmpty($Token)) {
    Write-Usage
    exit 2
}

if ([string]::IsNullOrEmpty($Hub)) {
    Write-Usage
    Die "-Hub is required"
}
if ([string]::IsNullOrEmpty($Key) -and [string]::IsNullOrEmpty($Token)) {
    Write-Usage
    Die "either -Token or -Key is required"
}

# Mirror the Linux script's sanity check: reject newlines, quotes, and
# backslashes that could break the service registration or registry writes.
if ($Hub -match '[\r\n"\\]') {
    Die "-Hub contains disallowed characters (newline, quote, backslash)"
}
if ($Key -match '[\r\n"\\]') {
    Die "-Key contains disallowed characters (newline, quote, backslash)"
}
if ($Token -match '[\r\n"\\]') {
    Die "-Token contains disallowed characters (newline, quote, backslash)"
}

# ----------------------------- pre-flight checks ----------------------------
$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Die "must be run as Administrator (right-click PowerShell -> 'Run as Administrator')"
}

if (-not (Get-Command Expand-Archive -ErrorAction SilentlyContinue)) {
    Die "Expand-Archive is required but was not found (ships with PowerShell 5.0+)"
}

# ---------------------------- arch detection --------------------------------
$rawArch = $env:PROCESSOR_ARCHITECTURE
switch ($rawArch) {
    'AMD64' { $arch = 'amd64' }
    'ARM64' { $arch = 'arm64' }
    default { Die "unsupported CPU architecture: $rawArch (expected AMD64 or ARM64)" }
}

# ---------------------------- download & install ----------------------------
# Beszel ships the Windows agent as a .zip (verified against the v0.18.7
# release: beszel-agent_windows_amd64.zip exists, the .tar.gz does not).
$asset = "beszel-agent_windows_${arch}.zip"
$url   = "https://github.com/henrygd/beszel/releases/download/v${BeszelVersion}/${asset}"

$tmpDir = New-Item -ItemType Directory -Force -Path (Join-Path ([System.IO.Path]::GetTempPath()) ("beszel-install-" + [guid]::NewGuid()))
$cleanup = {
    if ($script:tmpDir -and (Test-Path $script:tmpDir)) {
        Remove-Item -Recurse -Force $script:tmpDir -ErrorAction SilentlyContinue
    }
}

try {
    $archivePath = Join-Path $tmpDir $asset
    Write-Host "Downloading $url"
    # Invoke-WebRequest on PS 5.1 is slow without this; harmless on 7+.
    $oldProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri $url -OutFile $archivePath -UseBasicParsing
    } finally {
        $ProgressPreference = $oldProgress
    }
    if (-not (Test-Path $archivePath)) {
        Die "failed to download $url"
    }

    Write-Host "Extracting $asset"
    Expand-Archive -Path $archivePath -DestinationPath $tmpDir -Force

    $extractedExe = Join-Path $tmpDir 'beszel-agent.exe'
    if (-not (Test-Path $extractedExe)) {
        Die "archive did not contain a beszel-agent.exe binary"
    }

    $installDir = 'C:\Program Files\Beszel'
    $installExe = Join-Path $installDir 'beszel-agent.exe'
    $nssmExe    = Join-Path $installDir 'nssm.exe'
    if (-not (Test-Path $installDir)) {
        New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    }

    # ---------------------------- NSSM download -----------------------------
    # beszel-agent.exe is a plain CLI, not a Windows-service-aware binary.
    # Calling sc.exe create on it directly leads to ERROR_SERVICE_REQUEST_TIMEOUT
    # (1053) on start because the binary never replies to the Service Control
    # Protocol. NSSM is a tiny (~300KB) wrapper that hosts any CLI as a service.
    # Beszel's own installer does the same thing, just installs NSSM via
    # scoop/winget; we bundle it into the install dir so there's no package
    # manager dependency.
    $nssmZip = Join-Path $tmpDir 'nssm.zip'
    $nssmUrl = "https://nssm.cc/release/nssm-${NssmVersion}.zip"
    Write-Host "Downloading $nssmUrl"
    $oldProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip -UseBasicParsing
    } finally {
        $ProgressPreference = $oldProgress
    }
    if (-not (Test-Path $nssmZip)) { Die "failed to download $nssmUrl" }

    Write-Host "Extracting nssm.exe"
    Expand-Archive -Path $nssmZip -DestinationPath $tmpDir -Force
    $nssmArch = if ($arch -eq 'amd64') { 'win64' } else { 'win64' }  # NSSM 2.24 ships only win32/win64; arm64 runs win64 under emulation
    $nssmSrc  = Join-Path $tmpDir "nssm-${NssmVersion}\${nssmArch}\nssm.exe"
    if (-not (Test-Path $nssmSrc)) {
        Die "expected nssm.exe at $nssmSrc after extracting $nssmUrl"
    }

    # --------------------- existing service cleanup -------------------------
    # Beszel-agent may already be registered — either from a prior NSSM install
    # (idempotent re-run) or from the broken sc.exe-based installer that
    # shipped before this PR (will be in error/can't-start state). Either way,
    # stop and remove it cleanly via sc.exe (works for both registration paths).
    $existing = Get-Service -Name 'beszel-agent' -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Removing existing beszel-agent service (clean re-install)"
        if ($existing.Status -eq 'Running') {
            Stop-Service -Name 'beszel-agent' -Force -ErrorAction SilentlyContinue
        }
        & sc.exe delete beszel-agent | Out-Null
        # sc.exe delete is async; wait briefly for the SCM to drop the entry.
        $deadline = (Get-Date).AddSeconds(10)
        while ((Get-Service -Name 'beszel-agent' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 200
        }
    }

    # ------------------------- install binaries -----------------------------
    Write-Host "Installing to $installExe"
    Copy-Item -Path $extractedExe -Destination $installExe -Force
    Copy-Item -Path $nssmSrc      -Destination $nssmExe    -Force

    # ---------------------- service registration via NSSM -------------------
    Write-Host "Registering beszel-agent service via NSSM"
    & $nssmExe install beszel-agent $installExe | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "nssm install failed (exit $LASTEXITCODE)" }

    & $nssmExe set beszel-agent DisplayName "Beszel Agent" | Out-Null
    & $nssmExe set beszel-agent Description "Beszel monitoring agent (https://github.com/henrygd/beszel)" | Out-Null
    & $nssmExe set beszel-agent Start SERVICE_AUTO_START | Out-Null

    # NSSM env handling: AppEnvironmentExtra accepts +NAME=VALUE to add or
    # replace single entries without nuking the whole environment block.
    & $nssmExe set beszel-agent AppEnvironmentExtra "+HUB_URL=$Hub" | Out-Null
    if (-not [string]::IsNullOrEmpty($Key))   { & $nssmExe set beszel-agent AppEnvironmentExtra "+KEY=$Key"     | Out-Null }
    if (-not [string]::IsNullOrEmpty($Token)) { & $nssmExe set beszel-agent AppEnvironmentExtra "+TOKEN=$Token" | Out-Null }

    # Capture stdout+stderr to a rolling log so post-install diagnosis is easy.
    $logDir = Join-Path $installDir 'logs'
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
    $logFile = Join-Path $logDir 'beszel-agent.log'
    & $nssmExe set beszel-agent AppStdout $logFile | Out-Null
    & $nssmExe set beszel-agent AppStderr $logFile | Out-Null
    & $nssmExe set beszel-agent AppRotateFiles 1 | Out-Null
    & $nssmExe set beszel-agent AppRotateBytes 1048576 | Out-Null

    Write-Host "Starting beszel-agent service"
    & $nssmExe start beszel-agent | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "nssm start failed (exit $LASTEXITCODE)" }

    Write-Host ""
    Write-Host "Beszel agent v$BeszelVersion installed and started (NSSM v$NssmVersion)."
    Write-Host "Check status with: Get-Service beszel-agent"
    Write-Host "Logs at:           $logFile"
} finally {
    & $cleanup
}

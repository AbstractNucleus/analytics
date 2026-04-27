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

.PARAMETER Key
    REQUIRED in both modes. The agent always starts an SSH listener (so the
    hub can connect in for command channels) and needs an SSH public key to
    authenticate the hub against.

    - Universal-token mode: paste the hub's UNIVERSAL SSH public key from the
      bundled UI (Settings -> Tokens & Fingerprints displays the install
      command with the right value, or hit GET /api/beszel/getkey while
      logged in). The same key value is used by every agent.
    - Per-system-key mode: paste the per-system public key shown after
      clicking Add System for this host.

    Passed as KEY.

.PARAMETER Token
    Optional. Universal token from the hub UI (Settings -> Tokens &
    Fingerprints -> Universal token). When set, the agent connects out via
    WebSocket to HUB_URL on first start and self-registers, so there is no
    Add-System click required for new hosts. Passed as TOKEN.

.PARAMETER Help
    Show usage and exit 0.

.EXAMPLE
    # Universal-token mode (recommended for fleets that grow over time):
    .\windows-install.ps1 -Hub http://hub.example:8090 `
                          -Key  "ssh-ed25519 AAAA..." `
                          -Token <universal-token>

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
Usage: windows-install.ps1 -Hub <HUB_URL> -Key <SSH_PUBLIC_KEY> [-Token <TOKEN>] [-Help]

Installs the Beszel agent to 'C:\Program Files\Beszel\beszel-agent.exe', wraps
it as a Windows service named 'beszel-agent' via a bundled NSSM 2.24, and
starts it.

Required parameters:
  -Hub <HUB_URL>       URL of the Beszel hub. Use http://host:8090 in token
                       mode, tcp://host:45876 in per-system-key mode. Passed
                       as HUB_URL.
  -Key <PUBLIC_KEY>    SSH public key the agent uses to authenticate the hub.
                       In universal-token mode, this is the hub's universal
                       key (same value for every agent; see the bundled UI's
                       Tokens & Fingerprints page). In per-system-key mode,
                       this is the per-host key shown after Add System.
                       Passed as KEY.

Optional:
  -Token <TOKEN>       Universal token from the hub UI (Settings -> Tokens
                       & Fingerprints -> Universal token). When set, the
                       agent self-registers via WebSocket on first start, so
                       you don't need an Add-System click for this host.
                       Passed as TOKEN.

Other:
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
# -Key is required even in universal-token mode: the agent always starts an
# SSH listener and needs a public key to authenticate the hub against. Beszel
# 0.18 has no flag to disable the listener.
if ([string]::IsNullOrEmpty($Key)) {
    Write-Usage
    Die "-Key is required (the hub's SSH public key, used by the agent's listener to authenticate the hub)"
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

    # ---------------------------- NSSM download or reuse --------------------
    # beszel-agent.exe is a plain CLI, not a Windows-service-aware binary.
    # Calling sc.exe create on it directly leads to ERROR_SERVICE_REQUEST_TIMEOUT
    # (1053) on start because the binary never replies to the Service Control
    # Protocol. NSSM is a tiny (~300KB) wrapper that hosts any CLI as a service.
    # Beszel's own installer does the same thing, just installs NSSM via
    # scoop/winget; we bundle it into the install dir so there's no package
    # manager dependency.
    #
    # If nssm.exe is already at the install path from a prior run, reuse it
    # — nssm.cc is occasionally 503 (a re-install hit it the first time this
    # block was tested) and we don't want a transient upstream outage to
    # break otherwise-fine re-runs.
    if (Test-Path $nssmExe) {
        Write-Host "Reusing existing $nssmExe (skipping nssm.cc download)"
        $nssmSrc = $nssmExe
    } else {
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
    if ($nssmSrc -ne $nssmExe) {
        Copy-Item -Path $nssmSrc -Destination $nssmExe -Force
    }

    # ---------------------- service registration via NSSM -------------------
    Write-Host "Registering beszel-agent service via NSSM"
    & $nssmExe install beszel-agent $installExe | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "nssm install failed (exit $LASTEXITCODE)" }

    & $nssmExe set beszel-agent DisplayName "Beszel Agent" | Out-Null
    & $nssmExe set beszel-agent Description "Beszel monitoring agent (https://github.com/henrygd/beszel)" | Out-Null
    & $nssmExe set beszel-agent Start SERVICE_AUTO_START | Out-Null

    # NSSM 2.24's `set AppEnvironmentExtra` REPLACES the whole REG_MULTI_SZ
    # value on each invocation and does NOT interpret a leading `+` (verified
    # against a live install: the literal `+TOKEN=...` string ended up in
    # HKLM\...\beszel-agent\Parameters\AppEnvironmentExtra). Pass every entry
    # as a separate positional arg in a single call so all three vars land in
    # the registry without a magic prefix.
    $envArgs = @("HUB_URL=$Hub")
    if (-not [string]::IsNullOrEmpty($Key))   { $envArgs += "KEY=$Key" }
    if (-not [string]::IsNullOrEmpty($Token)) { $envArgs += "TOKEN=$Token" }
    & $nssmExe set beszel-agent AppEnvironmentExtra @envArgs | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "nssm set AppEnvironmentExtra failed (exit $LASTEXITCODE)" }

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

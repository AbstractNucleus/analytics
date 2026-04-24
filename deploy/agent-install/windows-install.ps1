<#
.SYNOPSIS
    Install the Beszel agent as a Windows service.

.DESCRIPTION
    Downloads the pinned Beszel agent release for Windows, installs the binary to
    C:\Program Files\Beszel\beszel-agent.exe, registers a Windows service named
    'beszel-agent' via sc.exe with HUB_URL and KEY exposed as service environment
    variables, and starts the service.

    Must be run from an elevated PowerShell (Administrator) session. Requires tar
    (bundled with Windows 10 1803+) to unpack the release archive.

.PARAMETER Hub
    URL or tcp://host:port of the Beszel hub. Passed to the agent as the HUB_URL
    environment variable.

.PARAMETER Key
    Public key the hub will use to authenticate this agent. Obtained from the
    Beszel hub admin UI. Passed as KEY.

.PARAMETER Help
    Show usage and exit 0.

.EXAMPLE
    # PowerShell-native invocation (recommended on Windows):
    .\windows-install.ps1 -Hub tcp://hub.example:45876 -Key <agent-public-key>

.EXAMPLE
    # UNIX-style long args are NOT accepted natively by PowerShell. The Linux
    # equivalent --hub=<url> --key=<key> must be translated to -Hub / -Key when
    # running the Windows installer.
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
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$BeszelVersion = "0.18.7"

function Write-Usage {
    $msg = @'
Usage: windows-install.ps1 -Hub <HUB_URL> -Key <AGENT_PUBLIC_KEY> [-Help]

Installs the Beszel agent to 'C:\Program Files\Beszel\beszel-agent.exe' and
registers a Windows service named 'beszel-agent' (display name "Beszel Agent",
start=auto), then starts it.

Required parameters:
  -Hub <HUB_URL>       URL or tcp://host:port of the Beszel hub. Passed to the
                       agent as the HUB_URL environment variable.
  -Key <PUBLIC_KEY>    Public key the hub will use to authenticate this agent.
                       Obtained from the Beszel hub admin UI. Passed as KEY.

Options:
  -Help                Show this message and exit.

Run from an elevated PowerShell (Administrator). Requires tar (ships with
Windows 10 1803+).
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
if ([string]::IsNullOrEmpty($Hub) -and [string]::IsNullOrEmpty($Key)) {
    Write-Usage
    exit 2
}

if ([string]::IsNullOrEmpty($Hub)) {
    Write-Usage
    Die "-Hub is required"
}
if ([string]::IsNullOrEmpty($Key)) {
    Write-Usage
    Die "-Key is required"
}

# Mirror the Linux script's sanity check: reject newlines, quotes, and
# backslashes that could break the service registration or registry writes.
if ($Hub -match '[\r\n"\\]') {
    Die "-Hub contains disallowed characters (newline, quote, backslash)"
}
if ($Key -match '[\r\n"\\]') {
    Die "-Key contains disallowed characters (newline, quote, backslash)"
}

# ----------------------------- pre-flight checks ----------------------------
$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Die "must be run as Administrator (right-click PowerShell -> 'Run as Administrator')"
}

if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    Die "tar is required but was not found in PATH (ships with Windows 10 1803+)"
}

# ---------------------------- arch detection --------------------------------
$rawArch = $env:PROCESSOR_ARCHITECTURE
switch ($rawArch) {
    'AMD64' { $arch = 'amd64' }
    'ARM64' { $arch = 'arm64' }
    default { Die "unsupported CPU architecture: $rawArch (expected AMD64 or ARM64)" }
}

# ---------------------------- download & install ----------------------------
# Beszel ships the Windows agent as a .tar.gz (same naming convention as linux,
# just s/linux/windows/). tar ships with Windows 10 1803+ so no extra deps.
$asset = "beszel-agent_windows_${arch}.tar.gz"
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
    & tar.exe -xzf $archivePath -C $tmpDir
    if ($LASTEXITCODE -ne 0) {
        Die "failed to extract $asset (tar exit code $LASTEXITCODE)"
    }

    $extractedExe = Join-Path $tmpDir 'beszel-agent.exe'
    if (-not (Test-Path $extractedExe)) {
        Die "archive did not contain a beszel-agent.exe binary"
    }

    $installDir = 'C:\Program Files\Beszel'
    $installExe = Join-Path $installDir 'beszel-agent.exe'
    if (-not (Test-Path $installDir)) {
        New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    }

    # Stop the service if it exists so we can overwrite the binary cleanly.
    $existing = Get-Service -Name 'beszel-agent' -ErrorAction SilentlyContinue
    if ($existing -and $existing.Status -eq 'Running') {
        Write-Host "Stopping existing beszel-agent service"
        Stop-Service -Name 'beszel-agent' -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Installing to $installExe"
    Copy-Item -Path $extractedExe -Destination $installExe -Force

    # ---------------------------- service registration ----------------------
    # sc.exe quoting: binPath value must be double-quoted because of the space
    # in 'Program Files'. The outer = requires a space after it.
    $binPath = "`"$installExe`""

    if ($existing) {
        Write-Host "Updating existing beszel-agent service"
        & sc.exe config beszel-agent binPath= $binPath start= auto DisplayName= "Beszel Agent" | Out-Null
        if ($LASTEXITCODE -ne 0) { Die "sc.exe config failed (exit $LASTEXITCODE)" }
    } else {
        Write-Host "Registering beszel-agent service"
        & sc.exe create beszel-agent binPath= $binPath start= auto DisplayName= "Beszel Agent" | Out-Null
        if ($LASTEXITCODE -ne 0) { Die "sc.exe create failed (exit $LASTEXITCODE)" }
    }

    # Environment vars for the service live in the service's registry key as a
    # REG_MULTI_SZ 'Environment' value. sc.exe has no flag for this, so we
    # write it directly. Each entry is a "NAME=VALUE" string.
    $svcKey = 'HKLM:\SYSTEM\CurrentControlSet\Services\beszel-agent'
    if (-not (Test-Path $svcKey)) {
        Die "service registry key not found at $svcKey after sc.exe create"
    }
    $envEntries = @("HUB_URL=$Hub", "KEY=$Key")
    New-ItemProperty -Path $svcKey -Name 'Environment' -PropertyType MultiString -Value $envEntries -Force | Out-Null

    Write-Host "Starting beszel-agent service"
    & sc.exe start beszel-agent | Out-Null
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1056) {
        # 1056 = ERROR_SERVICE_ALREADY_RUNNING; treat as success.
        Die "sc.exe start failed (exit $LASTEXITCODE)"
    }

    Write-Host ""
    Write-Host "Beszel agent v$BeszelVersion installed and started."
    Write-Host "Check status with: Get-Service beszel-agent"
    Write-Host "Or:                sc.exe query beszel-agent"
} finally {
    & $cleanup
}

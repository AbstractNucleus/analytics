#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# linux-systemd.sh - install Beszel agent as a systemd service on Linux.
#
# Designed to be fetched directly from GitHub and piped to a shell:
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/analytics/main/\
#     deploy/agent-install/linux-systemd.sh \
#     | sudo bash -s -- --hub=tcp://hub.example:45876 --key=<agent-public-key>
#
# Works on Ubuntu, Arch Linux, and Raspberry Pi OS without apt/pacman deps.
# Requires: curl, tar, systemd, root (uid 0) to write /etc/systemd and /usr/local/bin.
#
# -----------------------------------------------------------------------------
# Pinned Beszel version. To bump:
#   1. Check https://github.com/henrygd/beszel/releases for the latest non-prerelease tag.
#   2. Update BESZEL_VERSION below (without the leading 'v').
#   3. Update deploy/.env.example to match.
#   4. Update deploy/agent-install/windows-install.ps1 to match.
#   5. Re-run this script on each agent host.
# -----------------------------------------------------------------------------

set -euo pipefail

BESZEL_VERSION="0.18.7"

usage() {
    cat <<'EOF'
Usage: linux-systemd.sh --hub=<HUB_URL> --key=<AGENT_PUBLIC_KEY> [--help]

Installs the Beszel agent binary to /usr/local/bin/beszel-agent and registers
a systemd unit at /etc/systemd/system/beszel-agent.service, then starts it.

Required arguments:
  --hub=<HUB_URL>      URL or tcp://host:port of the Beszel hub. Passed to the
                       agent as the HUB_URL environment variable.
  --key=<PUBLIC_KEY>   Public key the hub will use to authenticate this agent.
                       Obtained from the Beszel hub admin UI. Passed as KEY.

Options:
  -h, --help           Show this message and exit.

Run as root (or via sudo). Requires curl, tar, and systemd.
EOF
}

die() {
    printf 'error: %s\n' "$1" >&2
    exit 1
}

# ------------------------------- arg parsing --------------------------------
HUB=""
KEY=""

if [ "$#" -eq 0 ]; then
    usage >&2
    exit 2
fi

for arg in "$@"; do
    case "$arg" in
        --hub=*)    HUB="${arg#--hub=}" ;;
        --key=*)    KEY="${arg#--key=}" ;;
        --hub|--key)
            die "argument '$arg' requires =VALUE (e.g. --hub=tcp://host:port)"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'error: unknown argument: %s\n\n' "$arg" >&2
            usage >&2
            exit 2
            ;;
    esac
done

[ -n "$HUB" ] || { usage >&2; die "--hub is required"; }
[ -n "$KEY" ] || { usage >&2; die "--key is required"; }

# Basic sanity check: reject characters that would break the service unit or
# enable injection into the systemd Environment= lines. Keep permissive for
# URLs and base64/hex keys but refuse newlines, quotes, and backslashes.
case "$HUB" in
    *[$'\n\r"\\']*) die "--hub contains disallowed characters (newline, quote, backslash)" ;;
esac
case "$KEY" in
    *[$'\n\r"\\']*) die "--key contains disallowed characters (newline, quote, backslash)" ;;
esac

# ----------------------------- pre-flight checks ----------------------------
if [ "$(id -u)" -ne 0 ]; then
    die "must be run as root (try: sudo $0 ...)"
fi

command -v curl >/dev/null 2>&1 || die "curl is required but not installed"
command -v tar  >/dev/null 2>&1 || die "tar is required but not installed"
command -v systemctl >/dev/null 2>&1 || die "systemctl is required (this script is systemd-only)"

# ---------------------------- arch detection --------------------------------
raw_arch="$(uname -m)"
case "$raw_arch" in
    x86_64|amd64)   ARCH="amd64" ;;
    aarch64|arm64)  ARCH="arm64" ;;
    *)
        die "unsupported CPU architecture: $raw_arch (expected x86_64 or aarch64)"
        ;;
esac

# ---------------------------- download & install ----------------------------
OS="linux"
ASSET="beszel-agent_${OS}_${ARCH}.tar.gz"
URL="https://github.com/henrygd/beszel/releases/download/v${BESZEL_VERSION}/${ASSET}"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

printf 'Downloading %s\n' "$URL"
curl -fsSL --retry 3 --retry-delay 2 -o "$TMPDIR/$ASSET" "$URL" \
    || die "failed to download $URL"

printf 'Extracting %s\n' "$ASSET"
tar -xzf "$TMPDIR/$ASSET" -C "$TMPDIR" \
    || die "failed to extract $ASSET"

[ -f "$TMPDIR/beszel-agent" ] || die "archive did not contain a beszel-agent binary"

printf 'Installing to /usr/local/bin/beszel-agent\n'
install -m 0755 "$TMPDIR/beszel-agent" /usr/local/bin/beszel-agent

# ---------------------------- systemd unit file -----------------------------
UNIT_PATH="/etc/systemd/system/beszel-agent.service"
printf 'Writing %s\n' "$UNIT_PATH"

umask 022
cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Beszel Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Environment="HUB_URL=${HUB}"
Environment="KEY=${KEY}"
ExecStart=/usr/local/bin/beszel-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$UNIT_PATH"

# ---------------------------- enable & start --------------------------------
systemctl daemon-reload
systemctl enable --now beszel-agent.service

printf '\nBeszel agent v%s installed and started.\n' "$BESZEL_VERSION"
printf 'Check status with: systemctl status beszel-agent\n'
printf 'Follow logs with:  journalctl -u beszel-agent -f\n'

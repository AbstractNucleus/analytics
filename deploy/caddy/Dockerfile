# Caddy + caddy-dns/cloudflare, built in-repo via xcaddy so we don't depend
# on a third-party image for TLS termination. Pin Caddy + xcaddy to a minor
# so the binary doesn't shift under a rebuild.
#
# To bump Caddy: change CADDY_VERSION below and verify `docker build` still
# produces a working binary. The plugin repo (caddy-dns/cloudflare) tracks
# Caddy major versions, so Caddy 2.x → plugin main is the normal path.

ARG CADDY_VERSION=2.8.4

FROM caddy:${CADDY_VERSION}-builder AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:${CADDY_VERSION}
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

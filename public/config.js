// Runtime configuration placeholder.
//
// This file is served at /config.js and loaded by index.html BEFORE the app
// bundle, so `window.ENV` is available when src/config.ts evaluates.
//
// By default it sets no API_URL, which makes the dashboard derive the backend
// URL from the host that served it (same-host detection in src/config.ts) — the
// correct behaviour for the common self-hosted case (dashboard + API on one box,
// reached over localhost or a LAN IP such as 192.168.0.200).
//
// In the Docker image this file is OVERWRITTEN at container startup by
// inject-config.sh, which only sets API_URL when VITE_API_URL is explicitly
// provided (e.g. a split-host deployment where the API lives on another host).
window.ENV = {};

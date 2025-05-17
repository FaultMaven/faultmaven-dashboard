// /Users/sterlanyu/Projects/faultmaven-copilot/wxt.config.ts
import { defineConfig } from 'wxt';
import path from 'node:path';

export default defineConfig({
  srcDir: 'src',
  modules: [
    '@wxt-dev/module-react' // Add WXT's React module here
  ],
  vite: () => ({
    // plugins: [react()], // This line can usually be removed now
    resolve: {
      alias: {
        '~': path.resolve(__dirname, 'src'),
        '~lib': path.resolve(__dirname, 'src/lib'),
      },
    },
  }),
  entrypoints: {
    background: 'entrypoints/background.ts',
    'page-content.content': 'entrypoints/page-content.content.ts',
    // WXT should automatically pick up src/entrypoints/sidepanel_manual/index.html
    // and bundle its linked main.tsx. No explicit listing needed here for it to be
    // copied to the output, but the manifest.side_panel.default_path is key.
  },
  manifest: {
    name: "FaultMaven Copilot",
    version: "0.0.1",
    description: "AI-powered troubleshooting assistant embedded in your browser",
    // === Updated icon paths ===
    icons: {
      // These paths are relative to the root of the built extension.
      // Files from `public/icon/favicon-pack-dark/` will be at `icon/favicon-pack-dark/` in the build.
      "16": "icon/favicon16.png",
      "32": "icon/favicon32.png",
      "48": "icon/favicon48.png",
      "96": "icon/favicon96.png",
      "128": "icon/favicon128.png"
    },
    permissions: [
      "storage", "sidePanel", "activeTab", "tabs", "scripting"
    ],
    host_permissions: ["https://www.example.com/*"], // Keep restricted for dev for now
    action: {
      "default_title": "Open FaultMaven Copilot",
      // For the sharpest toolbar icon, you can point default_icon to your SVG.
      // Choose the one that looks best on most browser toolbars (often the light version).
      "default_icon": "icon/favicon-light.svg"
    },
    side_panel: {
      // This path points to the HTML file for your side panel
      // in the root of your built extension.
      // If src/entrypoints/sidepanel_manual/index.html is output by WXT as
      // sidepanel_manual.html at the build root, this is correct.
      default_path: "sidepanel_manual.html"
    },
    // WXT will auto-generate other necessary fields like:
    // background: { "service_worker": "background.js", "type": "module" }
    // content_scripts: [ { "matches": ["https://www.example.com/*"], ... } ]
    // commands: { "wxt:reload-extension": { ... } }
    // content_security_policy: { ... } (WXT's default CSP for dev)
  },
});

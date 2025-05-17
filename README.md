# FaultMaven Copilot – WXT Browser Extension

**FaultMaven Copilot** is an AI-powered troubleshooting assistant embedded directly in your browser as a side panel. It provides in-context help, analyzes web content, and enables users to interact with the FaultMaven AI to diagnose and resolve issues efficiently.

This extension is built using the modern **WXT framework**, with **React 19+**, **Tailwind CSS**, and **TypeScript**.

---

##  Features

- **Side Panel Interface:** Dedicated UI embedded in the browser's side panel.
- **AI-Powered Assistance:** Connects with the FaultMaven backend to deliver intelligent troubleshooting insights.
- **Contextual Data Analysis:**
  - Analyze current page content.
  - Accept pasted logs, metrics, or diagnostic data.
  - Upload text-based files (e.g., `.log`, `.json`, `.csv`).
- **Conversational UI:** Interactive chatbot-style experience with FaultMaven AI.
- **Session Management:** Maintains a persistent session for multi-step conversations.
- **Responsive Design:** Adapts to resizable side panel dimensions.

---

##  Tech Stack

| Component          | Details |
|-------------------|---------|
| **Framework**     | [WXT](https://wxt.dev/) v0.20.6 (Vite-based Web Extension Toolkit) |
| **UI**            | React 19+ |
| **Styling**       | Tailwind CSS v3 |
| **Language**      | TypeScript |
| **Package Manager** | pnpm |
| **Browser APIs**  | Manifest V3, Side Panel API, `chrome.storage`, `chrome.runtime.messaging`, `chrome.tabs` |

---

##  Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [pnpm](https://pnpm.io/installation) (v8+ recommended)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/faultmaven-copilot.git
   cd faultmaven-copilot
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

   This will also run `wxt prepare` via the `postinstall` script.

---

### Development Workflow

Start the dev server and build the extension in development mode:

```bash
pnpm dev
```

This command will:
- Build the extension in dev mode
- Enable hot module replacement (HMR)
- Output to `.output/chrome-mv3-dev/`

### Load the Extension in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3-dev/` folder

You should now see the **FaultMaven Copilot** icon in your browser toolbar.

---

### Production Build

Create an optimized build:

```bash
pnpm wxt build
```

This will output files to `.output/chrome-mv3/`.

### Package for Store Submission

To create a `.zip` file for Chrome Web Store upload:

```bash
pnpm wxt zip
```

The resulting `.zip` (e.g., `faultmaven-copilot-0.1.0.zip`) will be located in the `.output/` directory.

---

##  Project Structure

```
faultmaven-copilot/
├── .output/                      # Build output (WXT managed, gitignored)
├── .wxt/                         # WXT-generated cache (gitignored)
├── public/                       # Static assets (icons, etc.)
│   └── icon/
├── src/                          # Main application source
│   ├── assets/
│   │   └── styles/
│   │       └── globals.css       # Tailwind base styles
│   ├── entrypoints/
│   │   ├── background.ts
│   │   ├── page-content.content.ts
│   │   └── sidepanel_manual/
│   │       ├── index.html
│   │       └── main.tsx
│   ├── lib/
│   │   └── utils/
│   ├── shared/
│   │   └── ui/
│   │       └── SidePanelApp.tsx
├── package.json
├── pnpm-lock.yaml
├── tailwind.config.cjs
├── postcss.config.cjs
├── tsconfig.json
├── wxt.config.ts
└── README.md
```

---

##  Contact & Support

For questions, bug reports, or feature requests, contact us at:

 **support@faultmaven.ai**

---

##  License

This project is licensed under the **[Apache-2.0 license](./LICENSE.md)**.  
See the `LICENSE.md` file for full terms.

---

##  Contributing *(Optional)*

Contributions are welcome!  


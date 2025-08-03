# FaultMaven Copilot – WXT Browser Extension

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](./LICENSE.md)
[![Framework](https://img.shields.io/badge/framework-WXT-orange.svg)](https://wxt.dev/)
[![React](https://img.shields.io/badge/React-19+-61DAFB.svg?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4+-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**FaultMaven Copilot** is an AI-powered troubleshooting assistant embedded directly in your browser as a side panel. It provides **engineers—especially in SRE and DevOps roles**—with in-context help, analyzes web content, and enables users to interact with the FaultMaven AI to diagnose and resolve issues efficiently.

This extension is built using the modern **WXT framework**, with **React 19+**, **Tailwind CSS**, and **TypeScript**.

-----

## ✨ Key Features

  * 💬 **Conversational Troubleshooting**: Engage in a stateful, interactive dialogue with the FaultMaven AI. Submit logs, ask questions, and receive guided insights with findings, recommendations, and confidence scores to pinpoint the root cause of issues.
  * 🌐 **Contextual Data Analysis**: Provide evidence to the AI directly from your workflow.
      * Analyze the content of your current browser page.
      * Paste logs, metrics, or error messages directly into the chat.
      * Upload files for immediate analysis with insights.
  * 🔄 **Session Management**: Maintain conversation context across browser sessions with automatic session persistence and heartbeat management.
  * 🗂️ **Centralized Knowledge Base**: The Copilot features a dedicated tab to build and manage your team's knowledge base.
      * **Upload Documents**: Easily upload runbooks, post-mortems, and other documentation (PDF, DOCX, MD, TXT, and more) via drag-and-drop.
      * **Monitor Ingestion Status**: Track the real-time status of your uploads with clear visual indicators for "Processing," "Indexed," or "Error".
      * **Manage Knowledge**: View and delete documents to ensure your knowledge base remains current and relevant.
  * 🔒 **Privacy-First Design**: All interactions are designed with security in mind, ensuring sensitive data is handled appropriately by the backend's PII redaction services.

-----

## 🛠️ Tech Stack

| Component         | Details                                                                              |
| :---------------- | :----------------------------------------------------------------------------------- |
| **Framework** | [WXT](https://wxt.dev/) v0.20.6 (Vite-based Web Extension Toolkit)                     |
| **UI** | React 19+                                                                            |
| **Styling** | Tailwind CSS v3                                                                      |
| **Language** | TypeScript                                                                           |
| **Package Manager** | pnpm                                                                                 |
| **Browser APIs** | Manifest V3, Side Panel API, `chrome.storage`, `chrome.runtime.messaging`, `chrome.tabs` |

-----

## 🚀 Getting Started

### Prerequisites

  * [Node.js](https://nodejs.org/) (v20+ recommended)
  * [pnpm](https://pnpm.io/installation) (v8+ recommended)
  * A running instance of the **FaultMaven Backend API**.

### Setup

1.  **Run the Backend First**: The Copilot requires a running FaultMaven API server to function. Ensure your backend is running at `http://api.faultmaven.local:8000` or update the configuration accordingly.

2.  **Clone this Repository**:

    ```bash
    git clone https://github.com/your-org/faultmaven-copilot.git
    cd faultmaven-copilot
    ```

3.  **Install Dependencies**:

    ```bash
    pnpm install
    ```

    This command will also run `wxt prepare` to set up the development environment.

4.  **Configure API Endpoint**: Create a `.env.local` file in the root of the project to tell the extension where to find your local backend server.

    ```bash
    # For local development
    ./scripts/setup-dev.sh
    
    # Or manually create .env.local:
    # VITE_API_URL=http://api.faultmaven.local:8000
    ```

### Development Workflow

Start the dev server, which enables Hot Module Replacement (HMR) for a fast development experience.

```bash
pnpm dev
```

### Load the Extension in Chrome

1.  Navigate to `chrome://extensions` in your browser.
2.  Enable **Developer mode** using the toggle in the top-right corner.
3.  Click **Load unpacked**.
4.  Select the `.output/chrome-mv3-dev/` folder from this project's directory.

The **FaultMaven Copilot** icon will now appear in your browser toolbar, and the side panel will be available.

-----

## 📦 Production and Packaging

  * **Create an optimized production build**: `pnpm wxt build`
  * **Package for store submission**: `pnpm wxt zip`

-----

## 📂 Project Structure

The project follows a standard WXT structure, organizing code by its function within the browser extension.

```
faultmaven-copilot/
├── public/                  # Static assets (icons)
├── src/                     # Main application source
│   ├── entrypoints/         # WXT entrypoints (background, sidepanel)
│   ├── lib/                 # Core logic (API clients, utils)
│   └── shared/              # Reusable React components and UI
│       └── ui/
│           ├── SidePanelApp.tsx     # Main app with tabbed interface
│           ├── KnowledgeBaseView.tsx  # Knowledge base management view
│           └── components/          # Reusable UI components
├── wxt.config.ts            # WXT configuration file
└── package.json
```

-----

## 🤝 Contributing

We welcome contributions from the community\! We encourage you to open issues for bugs, feature requests, and suggestions. If you'd like to contribute code, please see our [Contributing Guidelines](https://www.google.com/search?q=CONTRIBUTING.md) for details on our development process and how to submit a pull request.

-----

## 📜 License

This project is licensed under the **Apache-2.0 License**. See the `LICENSE.md` file for full terms.
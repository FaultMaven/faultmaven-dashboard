# FaultMaven Dashboard

> **Part of [FaultMaven](https://github.com/FaultMaven/faultmaven)** —
> The AI-Powered Troubleshooting Copilot

**The Command Center for Your Knowledge Engine**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://hub.docker.com/r/faultmaven/faultmaven-dashboard)

> **FaultMaven Dashboard** is the web application for managing your [FaultMaven](https://github.com/FaultMaven/faultmaven) knowledge base, viewing case history, and configuring AI agents.

<!-- TODO: Add screenshot here showing knowledge base view, case history, and configuration interface -->

---

## About FaultMaven

FaultMaven is an AI-powered troubleshooting copilot that correlates your live telemetry with your runbooks, docs, and past fixes. It delivers answers grounded in your actual system—not generic guesses.

**Learn More:**
- **[Product Overview](https://faultmaven.ai/product)** — See what FaultMaven can do
- **[Use Cases](https://faultmaven.ai/use-cases)** — Real-world troubleshooting scenarios
- **[Main Repository](https://github.com/FaultMaven/faultmaven)** — Architecture and documentation

---

## 🧠 Purpose

While the [Copilot](https://github.com/FaultMaven/faultmaven-copilot) is for *reacting* to incidents, the **Dashboard** is for *proactive* management:

- **Knowledge Base**: Upload runbooks, edit indexed documents, and manage vectors
- **Case History**: View, search, and export past troubleshooting sessions
- **Configuration**: Manage LLM providers (OpenAI/Ollama) and API keys

### Dashboard vs Copilot

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| **Dashboard** | Knowledge base management, case history, configuration | Proactive: uploading docs, reviewing past cases |
| **Copilot** | AI chat, real-time troubleshooting, evidence capture | Reactive: during incidents, debugging |

Both connect to the same FaultMaven backend.

---

## 🚀 Quick Start

> ⚠️ **Requires Backend:** This is a frontend-only application. You need a running FaultMaven API Gateway to use it.
> [Deploy the full stack →](https://github.com/FaultMaven/faultmaven-deploy)

### Using the Full Stack (Recommended)

The dashboard is included automatically in the main deployment:

```bash
git clone https://github.com/FaultMaven/faultmaven-deploy.git && cd faultmaven-deploy
./faultmaven start
```

Access the dashboard at `http://localhost:3000`.

### Local Development

To run only this dashboard locally for development:

```bash
# 1. Clone
git clone https://github.com/FaultMaven/faultmaven-dashboard.git
cd faultmaven-dashboard

# 2. Install & Run
npm install
npm run dev
```

Access at `http://localhost:5173`.

> **Note**: You still need a running FaultMaven API Gateway at `http://localhost:8090`.

### Docker Standalone

```bash
docker run -p 3000:80 \
  -e API_URL=http://localhost:8090 \
  faultmaven/faultmaven-dashboard:latest
```

Or use the [full stack deployment](https://github.com/FaultMaven/faultmaven-deploy).

---

## 🛠️ Development

### Setup

```bash
# Clone and install
git clone https://github.com/FaultMaven/faultmaven-dashboard.git
cd faultmaven-dashboard
npm install

# Run dev server (requires backend at localhost:8090)
npm run dev

# Run tests
npm run test

# Build for production
npm run build

# Preview production build
npm run preview
```

### Project Structure

```text
src/
├── components/     # Shared UI (Header, UploadModal, ConfirmDialog, etc.)
├── context/        # AuthContext (global auth state)
├── hooks/          # Custom hooks (useKBList for KB paging/search/delete)
├── lib/            # API client, config, storage adapter
├── pages/          # Route pages (Login, KB, Admin KB)
└── utils/          # Helpers (debounce)
```

### Tech Stack

- **Framework**: React 19 + Vite (SPA)
- **Routing**: React Router 7
- **Styling**: Tailwind CSS
- **State**: React Context + custom hooks (no external state lib)
- **Testing**: Vitest + Testing Library
- **Deployment**: Static files (Nginx)

---

## 🤝 Contributing

We welcome contributions to the FaultMaven Dashboard! Whether it's improving the knowledge base UI, adding new visualizations, or enhancing the user experience, your help makes FaultMaven better for everyone.

**Note:** This repository contains only the web dashboard UI. For backend features (AI agent, knowledge base, microservices), see the main [FaultMaven repository](https://github.com/FaultMaven/faultmaven).

**Getting Started:**
- Check out [`good-first-issue`](https://github.com/search?q=org%3AFaultMaven+label%3A%22good+first+issue%22+state%3Aopen+repo%3Afaultmaven-dashboard) tags for beginner-friendly tasks
- See our [Contributing Guide](https://github.com/FaultMaven/.github/blob/main/CONTRIBUTING.md) for detailed guidelines
- Join [GitHub Discussions](https://github.com/FaultMaven/faultmaven/discussions) to share ideas

---

## 📄 License

This project is licensed under the **Apache 2.0 License** - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Related Projects

The FaultMaven ecosystem includes:

- **[faultmaven](https://github.com/FaultMaven/faultmaven)** - Main repository with microservices backend
- **[faultmaven-copilot](https://github.com/FaultMaven/faultmaven-copilot)** - Browser extension for in-flow troubleshooting
- **[faultmaven-deploy](https://github.com/FaultMaven/faultmaven-deploy)** - Deployment configurations and tooling
- **[faultmaven-website](https://github.com/FaultMaven/faultmaven-website)** - Official website

---

## Support

- **Discussions:** [GitHub Discussions](https://github.com/FaultMaven/faultmaven/discussions)
- **Issues:** [GitHub Issues](https://github.com/FaultMaven/faultmaven-dashboard/issues)

---

**FaultMaven** — Your AI copilot for troubleshooting.

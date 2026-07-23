# FaultMaven Dashboard

> **Part of [FaultMaven](https://github.com/FaultMaven/faultmaven)** —
> The AI-Powered Troubleshooting Copilot

**The Command Center for Your Knowledge Engine**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-GHCR-blue.svg)](https://github.com/FaultMaven/faultmaven-dashboard/pkgs/container/faultmaven-dashboard)

> **FaultMaven Dashboard** is the web application for reviewing case investigations, managing your [FaultMaven](https://github.com/FaultMaven/faultmaven) knowledge base, configuring LLM providers, and administering users and teams.

---

## About FaultMaven

FaultMaven is an AI-powered troubleshooting copilot that reasons a problem to its solution the way a seasoned engineer would — methodically, grounded in your live telemetry, runbooks, docs, and past fixes rather than generic guesses. It's self-learning, too: every resolved case becomes knowledge it reuses, and this Dashboard is where that knowledge lives.

**Learn More:**
- **[Product Overview](https://faultmaven.ai/product)** — See what FaultMaven can do
- **[Use Cases](https://faultmaven.ai/use-cases)** — Real-world troubleshooting scenarios
- **[Main Repository](https://github.com/FaultMaven/faultmaven)** — Architecture and documentation

---

## 🧠 Purpose

While the [Copilot](https://github.com/FaultMaven/faultmaven-copilot) is for *reacting* to incidents, the **Dashboard** is the web command center for everything around them:

- **Case Investigation**: Browse and search past cases; open a case for its full detail — Transcript, Issue, auto-generated Report, Hypotheses, and Evidence tabs — and annotate or archive it
- **Knowledge Base**: Upload runbooks, edit indexed documents, and manage the 3-tier KB (personal / team / global)
- **LLM Configuration**: Configure providers and API keys, test connections, and set the fallback chain — hot-reloaded, no restart
- **User & Team Administration**: Manage users, roles, organizations, and teams

### Dashboard vs Copilot

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| **Dashboard** | Case review, knowledge base management, LLM configuration, user/team admin | Proactive: reviewing past cases, curating docs, configuring the platform |
| **Copilot** | AI chat, real-time troubleshooting, evidence capture | Reactive: during incidents, debugging |

Both connect to the same FaultMaven backend.

---

## 🚀 Quick Start

> ⚠️ **Requires Backend:** This is a frontend-only application. You need a running FaultMaven API to use it.
> [Deploy the full stack →](https://github.com/FaultMaven/faultmaven)

### Using the Full Stack (Recommended)

The dashboard is included automatically in the main FaultMaven deployment:

```bash
git clone https://github.com/FaultMaven/faultmaven.git
cd faultmaven
./faultmaven.sh start
# Or: docker compose up -d
```

This starts both the API (localhost:8090) and Dashboard (localhost:3333).

For detailed deployment options, see the [FaultMaven Quick Start](https://github.com/FaultMaven/faultmaven#quick-start).

Access the dashboard at `http://localhost:3333`.

### Local Development

**Prerequisites:** Node 20+ and [pnpm](https://pnpm.io/) (this repo uses a pnpm lockfile; CI runs Node 20 / pnpm).

To run only this dashboard locally for development:

```bash
# 1. Clone
git clone https://github.com/FaultMaven/faultmaven-dashboard.git
cd faultmaven-dashboard

# 2. Install & Run
pnpm install
pnpm dev
```

Access at `http://localhost:5173`.

> **Note**: You need the FaultMaven API running at `http://localhost:8090`. See [Backend Local Setup](https://github.com/FaultMaven/faultmaven/blob/main/docs/getting-started/local-setup.md).

**Configuration (optional):** The dev server auto-detects the API on the same host at port `8090`, so no config is needed for the common case. To override, copy `.env.example` to `.env.local` and set:

- `VITE_API_URL` — backend API origin (e.g. `https://api.faultmaven.ai`) when it isn't on the same host at `:8090`
- `VITE_MAX_FILE_SIZE_MB` — max upload size in MB (default `10`)

### Docker Standalone

```bash
# VITE_API_URL is read at container startup (inject-config.sh → window.ENV.API_URL).
# Omit it for the self-hosted default: the dashboard auto-detects the API on the
# same host at :8090.
docker run -p 3333:80 \
  -e VITE_API_URL=http://localhost:8090 \
  ghcr.io/faultmaven/faultmaven-dashboard:latest
```

The image is published to GHCR only: `ghcr.io/faultmaven/faultmaven-dashboard`.

For the full stack (API + Dashboard), use the [main FaultMaven deployment](https://github.com/FaultMaven/faultmaven#quick-start).

---

## 🛠️ Development

### Setup

```bash
# Clone and install (Node 20+, pnpm)
git clone https://github.com/FaultMaven/faultmaven-dashboard.git
cd faultmaven-dashboard
pnpm install

# Run dev server (requires backend at localhost:8090)
pnpm dev

# Lint and type-check (CI runs both)
pnpm lint
pnpm typecheck

# Run tests
pnpm test

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Project Structure

```text
src/
├── components/     # Shared UI (PageHeader, CaseTabs, CaseTable, UploadModal, DraftEditor, ...)
├── context/        # AuthContext (global auth state)
├── hooks/          # Custom hooks (useKBList for KB paging/search/delete)
├── lib/            # Modular API clients (cases/, knowledge/, llm/, users/, organization/,
│                   #   teams/, auth/, meta/) + storage adapter and config
├── pages/          # Route pages: Login, KB, Cases (list + detail), Admin cases,
│                   #   LLM config, User management, Org/Team management, OAuth, SSO callback
└── utils/          # Helpers
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

**Note:** This repository contains only the web dashboard UI. For backend features (AI agent, knowledge base, investigation engine), see the main [FaultMaven repository](https://github.com/FaultMaven/faultmaven).

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

- **[faultmaven](https://github.com/FaultMaven/faultmaven)** - Main repository with monolithic backend API
- **[faultmaven-copilot](https://github.com/FaultMaven/faultmaven-copilot)** - Browser extension for in-flow troubleshooting
- **[faultmaven-website](https://github.com/FaultMaven/faultmaven-website)** - Official website

For local development of both components, see:

- [Backend Local Setup](https://github.com/FaultMaven/faultmaven/blob/main/docs/getting-started/local-setup.md)
- [Dashboard Development](#%EF%B8%8F-development) (this README)

---

## Support

- **Discussions:** [GitHub Discussions](https://github.com/FaultMaven/faultmaven/discussions)
- **Issues:** [GitHub Issues](https://github.com/FaultMaven/faultmaven-dashboard/issues)

---

**FaultMaven** — troubleshoots like an engineer. Learns like a team.

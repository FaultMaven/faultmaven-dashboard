# FaultMaven Dashboard

**The Command Center for Your Knowledge Engine**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://hub.docker.com/r/faultmaven/faultmaven-dashboard)

> **FaultMaven Dashboard** is the web application for managing your [FaultMaven](https://github.com/FaultMaven/faultmaven) knowledge base, viewing case history, and configuring AI agents.

---

## About FaultMaven

FaultMaven is an AI-powered troubleshooting copilot for modern engineering. Learn more at [faultmaven.ai](https://faultmaven.ai).

---

## 🧠 Purpose

While the [Copilot](https://github.com/FaultMaven/faultmaven-copilot) is for *reacting* to incidents, the **Dashboard** is for *proactive* management:

- **Knowledge Base**: Upload runbooks, edit indexed documents, and manage vectors
- **Case History**: View, search, and export past troubleshooting sessions
- **Configuration**: Manage LLM providers (OpenAI/Ollama) and API keys

---

## 🚀 Quick Start

This app is included automatically in the main `docker-compose` stack.

**To run only this dashboard locally:**

```bash
# 1. Clone
git clone https://github.com/FaultMaven/faultmaven-dashboard.git
cd faultmaven-dashboard

# 2. Install & Run
npm install
npm run dev
```

Access at `http://localhost:5173`.

> **Note**: This is a client-side SPA (Vite + React). It requires a running FaultMaven API Gateway to function.
>
> **Need the backend?** Deploy FaultMaven in 5 minutes: [Quick Start](https://github.com/FaultMaven/faultmaven#quick-start)

---

## 🏗️ Architecture

- **Framework**: React + Vite (SPA)
- **Styling**: Tailwind CSS
- **State**: TanStack Query
- **Deployment**: Static files (served via Nginx in production)

---

## 🤝 Contributing

We welcome PRs! Note that this repo contains only the web dashboard UI. For backend features, see [faultmaven](https://github.com/FaultMaven/faultmaven).

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

## 🆘 Support

- **Website**: [faultmaven.ai](https://faultmaven.ai)
- **Documentation**: [GitHub README](https://github.com/FaultMaven/faultmaven)
- **Issues**: [GitHub Issues](https://github.com/FaultMaven/faultmaven-dashboard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/FaultMaven/faultmaven/discussions)
- **Email**: [support@faultmaven.ai](mailto:support@faultmaven.ai)

---

**FaultMaven** — Your AI copilot for incident response.

# FaultMaven Dashboard

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](./LICENSE.md)
[![React](https://img.shields.io/badge/React-19+-61DAFB.svg?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)

**FaultMaven Dashboard** is the Knowledge Base management web application for FaultMaven. It provides a clean, professional interface for uploading, organizing, and managing runbooks, post-mortems, and documentation that powers the FaultMaven AI assistant.

This dashboard works with both **self-hosted** and **enterprise** deployments of FaultMaven.
this is a test line - should be removed
---

## ✨ Key Features

* 📚 **Knowledge Base Management**: Upload and organize your team's runbooks and documentation
* 🔍 **Search & Discovery**: Find relevant documents quickly with semantic search
* 👥 **Team Collaboration**: Share knowledge across your organization (enterprise)
* 🔐 **Admin Controls**: Organization-wide KB management for admins (enterprise)
* 🐳 **Easy Deployment**: Docker-based deployment with Nginx
* 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices

---

## 🛠️ Tech Stack

| Component | Details |
|:----------|:--------|
| **Framework** | Vite 6.0+ (Fast web app build tool) |
| **UI** | React 19+ |
| **Routing** | React Router 7+ |
| **Styling** | Tailwind CSS 3+ |
| **Language** | TypeScript 5.8+ |
| **Deployment** | Docker + Nginx |

---

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) v20+ (or use Docker)
* [pnpm](https://pnpm.io/installation) v8+ (or npm)
* A running **FaultMaven Backend API**

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/FaultMaven/faultmaven-dashboard.git
   cd faultmaven-dashboard
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local`:
   ```bash
   # For local development
   VITE_API_URL=http://localhost:8000
   ```

4. **Start development server**:
   ```bash
   pnpm dev
   ```

   The dashboard will be available at `http://localhost:5173`

5. **Login**:
   - Navigate to `http://localhost:5173`
   - Enter any username (development mode)
   - Start managing your knowledge base!

### Building for Production

```bash
# Build optimized production bundle
pnpm build

# Preview production build locally
pnpm preview
```

The built files will be in `dist/` directory.

---

## 🐳 Docker Deployment

### Build Docker Image

```bash
# Self-hosted deployment
docker build -t faultmaven/dashboard:latest \
  --build-arg VITE_API_URL=http://localhost:8000 \
  .

# Enterprise deployment
docker build -t faultmaven/dashboard:latest \
  --build-arg VITE_API_URL=https://api.faultmaven.ai \
  .
```

### Run Container

```bash
docker run -d \
  -p 3000:80 \
  --name faultmaven-dashboard \
  faultmaven/dashboard:latest
```

The dashboard will be available at `http://localhost:3000`

### Docker Compose

For integrated deployment with the backend:

```yaml
version: '3.8'

services:
  dashboard:
    build:
      context: .
      args:
        - VITE_API_URL=http://localhost:8000
    ports:
      - "3000:80"
    depends_on:
      - backend
    networks:
      - faultmaven

networks:
  faultmaven:
    driver: bridge
```

---

## 📂 Project Structure

```
faultmaven-dashboard/
├── public/                  # Static assets (icons, images)
├── src/
│   ├── main.tsx            # Application entry point
│   ├── App.tsx             # Root component with routing
│   ├── index.css           # Global styles
│   ├── pages/              # Page components
│   │   ├── LoginPage.tsx          # Login page
│   │   ├── KBPage.tsx             # Personal KB management
│   │   └── AdminKBPage.tsx        # Global KB management
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   └── lib/                # Core logic
│       ├── api.ts                 # FaultMaven API client
│       ├── storage.ts             # LocalStorage adapter
│       ├── config.ts              # Configuration
│       └── utils/                 # Helper utilities
├── Dockerfile              # Docker build configuration
├── nginx.conf              # Nginx configuration
├── vite.config.ts          # Vite configuration
├── tailwind.config.cjs     # Tailwind CSS configuration
└── package.json
```

---

## 🔧 Configuration

### Environment Variables

Configure via `.env.local` file:

| Variable | Description | Default |
|:---------|:------------|:--------|
| `VITE_API_URL` | Backend API endpoint | `http://localhost:8000` |
| `VITE_MAX_FILE_SIZE_MB` | Max upload size (MB) | `10` |

**Note**: All `VITE_*` variables are replaced at **BUILD TIME**. Changing them requires rebuilding the application.

---

## 📖 Usage

### For End Users

1. **Login**: Use your username to access the dashboard
2. **Upload Documents**: Drag and drop or click to upload runbooks, documentation
3. **Search**: Use the search bar to find relevant documents
4. **Manage**: Edit metadata, organize by categories, delete outdated docs

### For Administrators

1. Navigate to **Global KB** tab (admin users only)
2. Upload system-wide documentation visible to all users
3. Manage categories and organization structure
4. Monitor KB usage and analytics (enterprise feature)

---

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **Apache-2.0 License**. See the `LICENSE.md` file for details.

---

## 🔗 Related Projects

* [FaultMaven Copilot](https://github.com/FaultMaven/faultmaven-copilot) - Browser extension for chat interface
* [FaultMaven Backend](https://github.com/FaultMaven/faultmaven-backend) - AI-powered troubleshooting backend

---

## 📚 Documentation

* [Migration Guide](./MIGRATION_GUIDE_V2.md) - Architecture and design decisions
* [Execution Guide](./EXECUTION_GUIDE.md) - Step-by-step implementation

---

## 💬 Support

* **Documentation**: [docs.faultmaven.ai](https://docs.faultmaven.ai)
* **Issues**: [GitHub Issues](https://github.com/FaultMaven/faultmaven-dashboard/issues)
* **Community**: [Discussions](https://github.com/FaultMaven/faultmaven-dashboard/discussions)

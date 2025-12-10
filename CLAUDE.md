# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the **FaultMaven Dashboard** - a web application for managing Knowledge Base content. It provides a clean interface for uploading, organizing, and searching runbooks, post-mortems, and documentation that powers the FaultMaven AI assistant.

**Key Technologies**: Vite 6.0+, React 19+, React Router 7+, TypeScript, Tailwind CSS, Vitest

## Common Commands

### Development
```bash
pnpm install               # Install dependencies
pnpm dev                   # Start development server (localhost:5173)
pnpm lint                  # ESLint (flat config)
pnpm test                  # Vitest + RTL
pnpm build                 # TypeScript + Vite build
```

## Configuration

### Environment Variables
All configuration is done via environment variables (set before build):

```bash
cp .env.example .env.local
# Edit .env.local
```

**Available Variables (common):**
- `VITE_API_URL` - Backend API endpoint (default: `http://127.0.0.1:8090`)
- `VITE_MAX_FILE_SIZE_MB` - Max file upload size in MB (default: `10`)

**Notes**
- Config is parsed in `src/config.ts`.
- VITE_* are build-time; restart dev server or rebuild after changes.

## High-Level Architecture

### Web Application Architecture
The dashboard is a standard React single-page application:

```
src/
├── main.tsx                  # Application entry point
├── App.tsx                   # Root component with routing
├── index.css                 # Global styles
├── pages/                    # Page components
│   ├── LoginPage.tsx         # Authentication page
│   ├── KBPage.tsx            # Personal KB management
│   └── AdminKBPage.tsx       # Global KB management (system-wide)
├── components/               # Reusable UI components (Header, UploadModal, ConfirmDialog, etc.)
├── context/                  # AuthContext (global auth state)
├── hooks/                    # Custom hooks (useKBList for KB paging/search/delete)
└── lib/                      # Core logic
    ├── api.ts                # Unified API (auth + user/admin KB)
    ├── storage.ts            # LocalStorage adapter
    ├── config.ts             # Configuration
    └── utils/                # Helper utilities
```

### Key Patterns

1. **Vite**: Fast build tool with HMR for development
2. **React Router**: Client-side routing for SPA
3. **AuthContext**: Global auth state for protected routes
4. **Custom Hooks**: `useKBList` for KB pagination/search/delete
5. **API Integration**: RESTful communication with FaultMaven backend
6. **Tailwind CSS**: Utility-first CSS framework
7. **TypeScript Strict**: Type safety throughout

### API Integration

The dashboard communicates with the FaultMaven backend through API calls:

- **Authentication**: `devLogin()`, `logoutAuth()`, AuthContext powered
- **Knowledge Base**: Upload, list (paginated), delete documents (user + admin scopes)

**API Endpoint Configuration:**
- Self-hosted: `http://localhost:8000`
- Enterprise: `https://api.faultmaven.ai`

### Application Flow

1. **Login**: User signs in; AuthContext stores token/state via storage adapter
2. **Routing**: React Router manages navigation between pages
3. **KB Management**: Upload, paginate, client-side search, delete documents
4. **Protected Routes**: Admin routes require admin privileges

### Component Architecture

- **LoginPage**: Authentication interface with FaultMaven branding
- **KBPage**: User knowledge base management
- **AdminKBPage**: Organization KB management (admin only)
- **Storage Adapter**: Browser extension API compatibility layer for web
- **Error Handling**: Graceful error display and recovery

## Development Guidelines

### Environment Setup

1. **Backend Dependency**: Dashboard requires FaultMaven backend running
2. **Environment Configuration**: Use `.env.local` for API endpoint:
   ```bash
   VITE_API_URL=http://localhost:8000
   ```

### Web Development

1. **Hot Module Replacement**: Vite provides instant updates during development
2. **Type Safety**: TypeScript strict mode enabled
3. **Responsive Design**: Mobile-first approach with Tailwind
4. **Accessibility**: Dialogs use role/aria-modal; confirm/upload modals accessible

### Code Patterns

- **Path Aliases**: Use `~/*` for `src/*` and `~lib/*` for `src/lib/*`
- **TypeScript Strict**: Strict mode enabled for type safety
- **Auth**: Use AuthContext (do not read localStorage directly)
- **KB State**: Use `useKBList` for KB lists instead of duplicating fetch logic
- **Accessibility**: ARIA labels, keyboard navigation, accessible dialogs

### API Development

When working with backend integration:
- All API functions include proper error handling
- Response types are strictly typed with TypeScript interfaces
- Auth tokens stored via storage adapter (localStorage)
- API client is compatible with both web and extension environments

**Important Files:**
- `src/lib/storage.ts` - LocalStorage adapter for browser.storage compatibility
- `src/lib/api.ts` - API client (shared with copilot extension)
- `src/lib/config.ts` - Configuration and environment variables

## Deployment

### Docker Deployment

The dashboard is containerized with Nginx for production:

```dockerfile
# Multi-stage build
# Stage 1: Build with Node
# Stage 2: Serve with Nginx
```

**Key files:**
- `Dockerfile` - Multi-stage build configuration
- `nginx.conf` - Nginx server configuration
- `.dockerignore` - Files to exclude from Docker build

### Production Build

```bash
# Build for production
pnpm build

# Output: dist/ directory with optimized static files
```

### Environment-Specific Builds

```bash
# Self-hosted
docker build --build-arg VITE_API_URL=http://localhost:8000 -t dashboard:self-hosted .

# Enterprise
docker build --build-arg VITE_API_URL=https://api.faultmaven.ai -t dashboard:enterprise .
```

## Related Projects

- **FaultMaven Copilot**: Browser extension for chat interface (separate repository)
- **FaultMaven Backend**: AI-powered troubleshooting backend API

This dashboard complements the copilot extension by providing dedicated KB management UI.

# FaultMaven Copilot Migration Guide: Option A → Option B

**Migration Goal:** Split Knowledge Base management from browser extension to dedicated web dashboard

**Document Version:** 1.0
**Last Updated:** 2025-11-14
**Estimated Timeline:** 3-4 weeks

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current vs Target Architecture](#current-vs-target-architecture)
3. [Prerequisites](#prerequisites)
4. [Phase 1: Build Web Dashboard](#phase-1-build-web-dashboard)
5. [Phase 2: Simplify Browser Extension](#phase-2-simplify-browser-extension)
6. [Phase 3: Deploy & Integration](#phase-3-deploy--integration)
7. [Phase 4: User Communication](#phase-4-user-communication)
8. [Testing Checklist](#testing-checklist)
9. [Rollback Procedure](#rollback-procedure)
10. [Troubleshooting](#troubleshooting)

---

## Executive Summary

### Why Migrate?

**Current Problem (Option A):**
- Browser extension handles both real-time troubleshooting AND KB management
- Large bundle size (~850 KB) = slower load times during critical incidents
- KB management UI cramped in side panel (300-400px width)
- Different use cases (urgent troubleshooting vs. planned documentation) share same interface

**Solution (Option B):**
- **Browser Extension:** Focus 100% on real-time troubleshooting (Copilot chat)
- **Web Dashboard:** Rich KB management with full screen space
- ~55% faster extension load time (850KB → 450KB)
- Better UX for each use case

### Key Benefits

| Aspect | Before (Option A) | After (Option B) |
|--------|------------------|------------------|
| Extension Bundle | 850 KB | 450 KB |
| Extension Load Time | ~400ms | ~180ms |
| KB Management UI | Cramped side panel | Full web app |
| Bulk Upload | Difficult | Easy |
| Search/Filter | Limited | Rich interface |
| Analytics | Not possible | Future feature |
| Team Collaboration | Limited | Better support |

---

## Current vs Target Architecture

### Current Architecture (Option A)

```
┌─────────────────────────────────────────┐
│   Browser Extension (Side Panel)        │
│   ├── Tab 1: Copilot Chat              │
│   ├── Tab 2: Knowledge Base (User)     │
│   └── Tab 3: Admin KB (Admins only)    │
│   Bundle: ~850 KB                       │
└─────────────────────────────────────────┘
              ↓ API
┌─────────────────────────────────────────┐
│       FaultMaven Backend API            │
│   - Sessions, Cases, Queries            │
│   - Knowledge Base (RAG)                │
└─────────────────────────────────────────┘
```

### Target Architecture (Option B)

```
┌─────────────────────────────────────────┐
│   Browser Extension (Side Panel)        │
│   ├── Copilot Chat ONLY                │
│   └── "Manage KB" link → Dashboard     │
│   Bundle: ~450 KB (55% smaller!)       │
└─────────────────────────────────────────┘
              ↓ API
┌─────────────────────────────────────────┐
│       FaultMaven Backend API            │
│   - Sessions, Cases, Queries            │
│   - Knowledge Base (RAG)                │
│   [No changes required]                 │
└─────────────────────────────────────────┘
              ↑ API
┌─────────────────────────────────────────┐
│   FaultMaven Web Dashboard (NEW)        │
│   ├── /kb - User KB Management         │
│   ├── /admin/kb - Admin KB              │
│   ├── /cases - Case History (future)   │
│   └── /settings - Settings (future)    │
│   Tech: React + Vite + TypeScript       │
│   Hosted: Vercel (recommended)          │
└─────────────────────────────────────────┘
```

---

## Prerequisites

### Tools & Access

- [ ] Node.js 18+ and pnpm installed
- [ ] Git repository access (sterlanyu/faultmaven-copilot)
- [ ] Vercel account (for dashboard hosting) OR self-hosting infrastructure
- [ ] Backend API access (to configure CORS)
- [ ] Chrome Web Store & Firefox Add-ons publisher access

### Backend Requirements

- [ ] Backend CORS configuration must allow dashboard domain
- [ ] Authentication endpoints work with web context (not just extension)
- [ ] No backend code changes needed (API contract stays the same)

### Domain Setup

**Recommended Dashboard URL:** `app.faultmaven.ai` or `dashboard.faultmaven.ai`

- [ ] DNS record configured
- [ ] SSL certificate (Vercel provides free Let's Encrypt)

---

## Phase 1: Build Web Dashboard

**Timeline:** Week 1-2
**Goal:** Create standalone React web app with KB management

### Step 1.1: Scaffold New React Project

```bash
# Create new Vite + React + TypeScript project
npm create vite@latest faultmaven-dashboard -- --template react-ts

# Navigate to project
cd faultmaven-dashboard

# Install dependencies
npm install

# Install additional dependencies
npm install react-router-dom
npm install -D tailwindcss postcss autoprefixer
npm install -D @tailwindcss/typography

# Initialize Tailwind
npx tailwindcss init -p
```

**Project Structure:**
```
faultmaven-dashboard/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── KBPage.tsx
│   │   ├── AdminKBPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── components/          # Copy from extension
│   │   ├── UploadPanel.tsx
│   │   ├── DocumentsListView.tsx
│   │   ├── SearchPanel.tsx
│   │   ├── EditMetadataModal.tsx
│   │   ├── DocumentDetailsModal.tsx
│   │   └── ErrorState.tsx
│   ├── lib/
│   │   ├── api.ts           # Copy from extension
│   │   ├── errors.ts        # Copy from extension
│   │   ├── config.ts        # Adapt from extension
│   │   └── hooks/
│   │       └── useAuth.tsx  # Copy from extension
│   ├── App.tsx              # Router setup
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── .env.example
└── README.md
```

### Step 1.2: Configure Tailwind CSS

**File: `tailwind.config.js`**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
```

**File: `src/index.css`**
```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

/* Match extension styling */
body {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1f2937;
  background-color: #f9fafb;
}
```

### Step 1.3: Copy Core Files from Extension

**Copy these files from `faultmaven-copilot` to `faultmaven-dashboard`:**

```bash
# From extension project root
cd ../faultmaven-copilot

# Copy API client
cp src/lib/api.ts ../faultmaven-dashboard/src/lib/api.ts

# Copy error handling
cp src/lib/errors.ts ../faultmaven-dashboard/src/lib/errors.ts

# Copy auth hook
cp src/shared/ui/hooks/useAuth.tsx ../faultmaven-dashboard/src/lib/hooks/useAuth.tsx

# Copy KB view components
cp src/shared/ui/KnowledgeBaseView.tsx ../faultmaven-dashboard/src/pages/KBPage.tsx
cp src/shared/ui/GlobalKBView.tsx ../faultmaven-dashboard/src/pages/AdminKBPage.tsx

# Copy UI components
cp src/shared/ui/components/UploadPanel.tsx ../faultmaven-dashboard/src/components/
cp src/shared/ui/components/DocumentsListView.tsx ../faultmaven-dashboard/src/components/
cp src/shared/ui/components/SearchPanel.tsx ../faultmaven-dashboard/src/components/
cp src/shared/ui/components/EditMetadataModal.tsx ../faultmaven-dashboard/src/components/
cp src/shared/ui/components/DocumentDetailsModal.tsx ../faultmaven-dashboard/src/components/
cp src/shared/ui/components/ErrorState.tsx ../faultmaven-dashboard/src/components/
```

### Step 1.4: Adapt Config for Web Environment

**File: `faultmaven-dashboard/src/lib/config.ts`**
```typescript
interface Config {
  apiUrl: string;
  maxFileSize: number;
  allowedFileExtensions: readonly string[];
}

const config: Config = {
  // Production API URL (override via VITE_API_URL)
  apiUrl: import.meta.env.VITE_API_URL || "https://api.faultmaven.ai",

  // Match backend limits
  maxFileSize: parseInt(import.meta.env.VITE_MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024,

  allowedFileExtensions: [
    '.md', '.txt', '.log', '.json', '.csv',
    '.pdf', '.doc', '.docx'
  ],
};

export default config;
```

**File: `.env.example`**
```bash
# Backend API endpoint
VITE_API_URL=https://api.faultmaven.ai

# Upload limits
VITE_MAX_FILE_SIZE_MB=50
```

### Step 1.5: Update API Client for Web Context

**File: `src/lib/api.ts` - Modify storage access**

Replace browser extension storage with localStorage:

```typescript
// BEFORE (Extension):
import { browser } from "wxt/browser";
const token = await browser.storage.local.get(['authToken']);

// AFTER (Web):
const token = localStorage.getItem('authToken');
```

**Full auth token retrieval function:**
```typescript
// Helper to get auth token (web context)
async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('faultmaven_auth_token');
}

// Helper to set auth token
async function setAuthToken(token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('faultmaven_auth_token', token);
}

// Helper to clear auth token
async function clearAuthToken(): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('faultmaven_auth_token');
}
```

### Step 1.6: Create Router & Pages

**File: `src/App.tsx`**
```typescript
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/hooks/useAuth';
import LoginPage from './pages/LoginPage';
import KBPage from './pages/KBPage';
import AdminKBPage from './pages/AdminKBPage';
import NotFoundPage from './pages/NotFoundPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/kb" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/kb" replace />} />
        <Route
          path="/kb"
          element={
            <ProtectedRoute>
              <KBPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/kb"
          element={
            <ProtectedRoute requireAdmin>
              <AdminKBPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Step 1.7: Create Login Page

**File: `src/pages/LoginPage.tsx`**
```typescript
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { devLogin } from '../lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const auth = await devLogin(username.trim());

      // Store auth token and session
      localStorage.setItem('faultmaven_auth_token', auth.access_token);
      localStorage.setItem('faultmaven_session_id', auth.session_id);

      // Navigate to KB page
      navigate('/kb');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white border border-gray-200 rounded-lg p-8 w-full max-w-md shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            FaultMaven Dashboard
          </h1>
          <p className="text-sm text-gray-600">
            Sign in to manage your knowledge base
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
            autoFocus
          />

          {error && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username}
            className="w-full mt-4 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500">
          Need help? <a href="https://docs.faultmaven.ai" className="text-blue-600 hover:underline">View Documentation</a>
        </div>
      </div>
    </div>
  );
}
```

### Step 1.8: Adapt KB Pages

**File: `src/pages/KBPage.tsx`**

Wrap the copied `KnowledgeBaseView` component:

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import KnowledgeBaseView from '../components/KnowledgeBaseView';
import { useAuth } from '../lib/hooks/useAuth';

export default function KBPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-800">
              FaultMaven Dashboard
            </h1>
            <nav className="flex gap-2">
              <a
                href="/kb"
                className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg"
              >
                My Knowledge Base
              </a>
            </nav>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <KnowledgeBaseView />
      </main>
    </div>
  );
}
```

**Similar structure for `AdminKBPage.tsx`** using `GlobalKBView` component.

### Step 1.9: Create Not Found Page

**File: `src/pages/NotFoundPage.tsx`**
```typescript
import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-800 mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-8">Page not found</p>
        <Link
          to="/kb"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Knowledge Base
        </Link>
      </div>
    </div>
  );
}
```

### Step 1.10: Update Main Entry Point

**File: `src/main.tsx`**
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### Step 1.11: Local Testing

```bash
# Run development server
npm run dev

# Should open at http://localhost:5173
```

**Test checklist:**
- [ ] Login page loads
- [ ] Can log in with username
- [ ] Redirects to /kb after login
- [ ] KB page loads without errors
- [ ] Can upload a document
- [ ] Can view documents list
- [ ] Can search documents
- [ ] Logout works

---

## Phase 2: Simplify Browser Extension

**Timeline:** Week 2
**Goal:** Remove KB tabs, add dashboard link

### Step 2.1: Remove KB Tabs from SidePanelApp

**File: `src/shared/ui/SidePanelApp.tsx`**

**Changes:**

1. **Remove KB tab state:**
```typescript
// BEFORE:
const [activeTab, setActiveTab] = useState<'copilot' | 'kb' | 'admin-kb'>('copilot');

// AFTER:
// Remove activeTab state entirely - only copilot tab now
```

2. **Remove KB imports:**
```typescript
// DELETE these imports:
import KnowledgeBaseView from "./KnowledgeBaseView";
import GlobalKBView from "./GlobalKBView";
```

3. **Remove KB-related state:**
```typescript
// DELETE:
const [viewingDocument, setViewingDocument] = useState<any | null>(null);
const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
// ... any other KB-specific state
```

4. **Remove tab navigation handlers:**
```typescript
// DELETE:
const handleTabChange = (tab: 'copilot' | 'kb' | 'admin-kb') => {
  setActiveTab(tab);
  // ...
};
```

### Step 2.2: Update Navigation Component

**File: `src/shared/ui/layouts/CollapsibleNavigation.tsx`**

**Add "Manage KB" button:**

```typescript
// After the "New Chat" button, add:
<button
  onClick={() => {
    // Open dashboard in new tab
    if (typeof browser !== 'undefined' && browser.tabs) {
      browser.tabs.create({
        url: 'https://app.faultmaven.ai/kb'
      });
    }
  }}
  className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
>
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
    />
  </svg>
  Manage Knowledge Base
</button>
```

### Step 2.3: Remove KB Component Files

**Delete these files:**
```bash
# From extension root
rm src/shared/ui/KnowledgeBaseView.tsx
rm src/shared/ui/GlobalKBView.tsx
rm src/shared/ui/components/UploadPanel.tsx
rm src/shared/ui/components/DocumentsListView.tsx
rm src/shared/ui/components/SearchPanel.tsx
rm src/shared/ui/components/EditMetadataModal.tsx
# Keep DocumentDetailsModal.tsx - still used for viewing sources in chat
```

### Step 2.4: Clean Up API Functions

**File: `src/lib/api.ts`**

Keep only the API functions used by Copilot:
- `createSession()`, `deleteSession()`
- `createCase()`, `submitQueryToCase()`, `uploadDataToCase()`
- `getUserCases()`, `getCaseConversation()`
- `getKnowledgeDocument()` (for viewing sources)
- `devLogin()`, `logoutAuth()`

Remove:
- `uploadUserKBDocument()`, `uploadAdminKBDocument()`
- `getUserKBDocuments()`, `getAdminKBDocuments()`
- `deleteUserKBDocument()`, `deleteAdminKBDocument()`
- `searchKnowledgeBase()`

### Step 2.5: Update Extension Manifest

**File: `wxt.config.ts`**

No changes needed to permissions, but verify:
```typescript
export default defineConfig({
  // ... existing config
  manifest: {
    // These permissions are still needed for Copilot:
    permissions: ['storage', 'sidePanel', 'activeTab', 'tabs', 'scripting'],
    host_permissions: [
      'https://api.faultmaven.ai/*',
      'https://app.faultmaven.ai/*',  // NEW: Allow opening dashboard
    ],
  },
});
```

### Step 2.6: Update Extension Version

**File: `package.json`**
```json
{
  "version": "0.4.0",
  "description": "AI-powered troubleshooting assistant - now faster and focused!"
}
```

**File: `wxt.config.ts`**
```typescript
manifest: {
  version: "0.4.0",
  name: "FaultMaven Copilot",
  description: "AI-powered troubleshooting assistant - now faster and focused!",
  // ...
}
```

### Step 2.7: Test Simplified Extension

```bash
# Build extension
pnpm build

# Test in Chrome
# Load .output/chrome-mv3/ as unpacked extension
```

**Test checklist:**
- [ ] Extension loads without errors
- [ ] Copilot chat works normally
- [ ] "Manage KB" button opens dashboard in new tab
- [ ] No KB tabs visible
- [ ] Bundle size reduced (check .output/chrome-mv3/size)

---

## Phase 3: Deploy & Integration

**Timeline:** Week 3
**Goal:** Deploy dashboard to production, publish extension update

### Step 3.1: Deploy Dashboard to Vercel

#### Option A: Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to dashboard project
cd faultmaven-dashboard

# Build for production
npm run build

# Login to Vercel
vercel login

# Deploy (first time - follow prompts)
vercel

# Production deployment
vercel --prod
```

#### Option B: GitHub Integration (Recommended)

1. **Push dashboard to GitHub:**
```bash
git init
git add .
git commit -m "Initial dashboard commit"
git remote add origin https://github.com/sterlanyu/faultmaven-dashboard.git
git push -u origin main
```

2. **Connect to Vercel:**
   - Go to https://vercel.com/new
   - Import GitHub repository: `sterlanyu/faultmaven-dashboard`
   - Configure:
     - Framework: Vite
     - Build Command: `npm run build`
     - Output Directory: `dist`
     - Root Directory: `./`

3. **Set environment variables:**
   - `VITE_API_URL`: `https://api.faultmaven.ai`
   - `VITE_MAX_FILE_SIZE_MB`: `50`

4. **Deploy:**
   - Click "Deploy"
   - Wait for build to complete

### Step 3.2: Configure Custom Domain

**In Vercel dashboard:**
1. Go to Project Settings → Domains
2. Add domain: `app.faultmaven.ai`
3. Configure DNS (add CNAME record):
   ```
   Type: CNAME
   Name: app
   Value: cname.vercel-dns.com
   ```
4. Wait for DNS propagation (~5-10 minutes)

### Step 3.3: Update Backend CORS Configuration

**Backend file (FastAPI example):**
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.faultmaven.ai",        # NEW: Dashboard
        "https://api.faultmaven.ai",        # Existing
        "http://localhost:5173",            # Dashboard dev
        "http://localhost:3000",            # Extension dev
        "chrome-extension://*",             # Extension
        "moz-extension://*",                # Firefox extension
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Test CORS:**
```bash
# From dashboard dev environment
curl -H "Origin: https://app.faultmaven.ai" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://api.faultmaven.ai/api/v1/auth/login
```

Should return CORS headers.

### Step 3.4: Publish Extension to Stores

#### Chrome Web Store

```bash
# Build production extension
cd faultmaven-copilot
pnpm build
pnpm zip

# Upload .output/faultmaven-copilot-0.4.0-chrome.zip to:
# https://chrome.google.com/webstore/devconsole
```

**Release notes:**
```
Version 0.4.0 - Faster & More Focused

What's New:
• 55% faster load times - Extension now focuses exclusively on real-time troubleshooting
• Knowledge Base moved to dedicated web dashboard for better management
• Click "Manage Knowledge Base" button to access your documents

Technical Improvements:
• Reduced bundle size from 850KB to 450KB
• Improved startup performance during critical incidents
• Enhanced UI responsiveness

To manage your Knowledge Base, visit: https://app.faultmaven.ai

Questions? Contact support@faultmaven.ai
```

#### Firefox Add-ons

```bash
# Build Firefox version
pnpm build:firefox
pnpm zip:firefox

# Upload .output/faultmaven-copilot-0.4.0-firefox.zip to:
# https://addons.mozilla.org/developers
```

### Step 3.5: Staging Environment Testing

Before full release, test on staging:

**Dashboard Staging:**
- Deploy to `https://dashboard-staging.faultmaven.ai`
- Test with staging backend: `https://api-staging.faultmaven.ai`

**Extension Beta:**
- Create unlisted Chrome extension version
- Share with beta testers
- Collect feedback for 1 week

---

## Phase 4: User Communication

**Timeline:** Week 3-4
**Goal:** Inform users about changes, provide migration guide

### Step 4.1: In-App Notification

**Extension update banner (show once on v0.4.0 first launch):**

```typescript
// Add to SidePanelApp.tsx
const [showUpdateNotification, setShowUpdateNotification] = useState(false);

useEffect(() => {
  const hasSeenUpdate = localStorage.getItem('faultmaven_v040_notification_seen');
  if (!hasSeenUpdate) {
    setShowUpdateNotification(true);
  }
}, []);

const handleDismissNotification = () => {
  localStorage.setItem('faultmaven_v040_notification_seen', 'true');
  setShowUpdateNotification(false);
};

// In render:
{showUpdateNotification && (
  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
    <div className="flex justify-between items-start">
      <div>
        <h3 className="text-sm font-medium text-blue-800 mb-1">
          🎉 FaultMaven v0.4.0 - Faster & More Focused!
        </h3>
        <p className="text-sm text-blue-700 mb-2">
          Knowledge Base moved to dedicated dashboard for better management.
        </p>
        <a
          href="https://app.faultmaven.ai/kb"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
        >
          Open Dashboard →
        </a>
      </div>
      <button
        onClick={handleDismissNotification}
        className="text-blue-500 hover:text-blue-700"
      >
        ✕
      </button>
    </div>
  </div>
)}
```

### Step 4.2: Email to Existing Users

**Subject:** FaultMaven Update: Faster Extension + New KB Dashboard

**Body:**
```
Hi [User],

We're excited to announce FaultMaven Copilot v0.4.0 with major improvements!

🚀 What's New:

1. 55% Faster Extension
   Your troubleshooting assistant now loads in under 200ms - perfect for critical incidents.

2. Dedicated Knowledge Base Dashboard
   We've moved KB management to a full web app with:
   • More screen space for document management
   • Bulk upload capabilities
   • Advanced search and filtering
   • Team collaboration features (coming soon)

🔧 Action Required:

The extension will auto-update. To manage your Knowledge Base:
→ Click "Manage Knowledge Base" in the extension
→ Or visit: https://app.faultmaven.ai/kb

Your existing documents are safe and accessible through the dashboard.

📚 Learn More:
• Migration Guide: https://docs.faultmaven.ai/kb-migration
• Dashboard Tutorial: https://docs.faultmaven.ai/dashboard-guide

Questions? Reply to this email or visit our support page.

Happy troubleshooting!
The FaultMaven Team
```

### Step 4.3: Update Documentation

**Create new docs pages:**

1. **docs.faultmaven.ai/kb-migration**
   - Why we made the change
   - How to access the dashboard
   - FAQ

2. **docs.faultmaven.ai/dashboard-guide**
   - Dashboard features walkthrough
   - How to upload documents
   - How to organize your KB
   - Admin KB management

3. **Update existing extension docs:**
   - Remove KB management sections
   - Add link to dashboard guide

### Step 4.4: Changelog

**File: `CHANGELOG.md` (in both repos)**

```markdown
## [0.4.0] - 2025-11-XX

### 🎉 Major Changes

#### Browser Extension
- **REMOVED:** Knowledge Base management tabs (moved to web dashboard)
- **ADDED:** "Manage Knowledge Base" button to open dashboard
- **PERFORMANCE:** 55% smaller bundle size (850KB → 450KB)
- **PERFORMANCE:** ~180ms load time (was ~400ms)
- **IMPROVED:** Focus on real-time troubleshooting

#### Web Dashboard (NEW)
- **ADDED:** Dedicated Knowledge Base management interface
- **ADDED:** User KB management (/kb)
- **ADDED:** Admin KB management (/admin/kb)
- **ADDED:** Full-screen document viewer
- **ADDED:** Advanced search and filtering

### Migration Guide
See [Migration Guide](./MIGRATION_GUIDE.md) for details.

### Breaking Changes
- Extension no longer includes KB management UI
- Users must use web dashboard (app.faultmaven.ai) for KB operations
```

---

## Testing Checklist

### Pre-Deployment Testing

#### Dashboard Tests
- [ ] Login works with username
- [ ] User KB page loads
- [ ] Admin KB page loads (for admin users)
- [ ] Upload document succeeds
- [ ] View document details
- [ ] Edit document metadata
- [ ] Delete document
- [ ] Search documents (semantic search)
- [ ] Filter by document type
- [ ] Pagination works
- [ ] Logout works
- [ ] Protected routes redirect to login
- [ ] Admin routes redirect non-admins

#### Extension Tests
- [ ] Extension installs/updates without errors
- [ ] Copilot chat works normally
- [ ] "Manage KB" button opens dashboard
- [ ] Dashboard link uses correct URL (production)
- [ ] Submit query works (uses RAG from dashboard-uploaded docs)
- [ ] Upload data to case works
- [ ] No console errors
- [ ] Bundle size < 500KB

### Integration Tests
- [ ] Login to extension → login to dashboard (same user)
- [ ] Upload doc in dashboard → visible in RAG during chat
- [ ] Delete doc in dashboard → not in RAG anymore
- [ ] Admin uploads doc → visible to all users
- [ ] CORS works (no preflight errors)

### Cross-Browser Tests
- [ ] Chrome extension works
- [ ] Firefox extension works
- [ ] Edge extension works
- [ ] Dashboard works in Chrome
- [ ] Dashboard works in Firefox
- [ ] Dashboard works in Edge
- [ ] Dashboard works in Safari

### Performance Tests
- [ ] Extension load time < 200ms
- [ ] Dashboard initial load < 2s
- [ ] Document upload < 5s for 10MB file
- [ ] Search results < 1s

---

## Rollback Procedure

If critical issues arise, use this procedure:

### Emergency Rollback (Same Day)

**Extension:**
```bash
# Revert to v0.3.x in Chrome/Firefox stores
# Users will auto-downgrade

# Or: Pull extension from stores temporarily
```

**Dashboard:**
```bash
# Vercel: Rollback to previous deployment
vercel rollback

# Or: Redeploy previous commit
git revert HEAD
git push
```

### Planned Rollback (Issues Discovered Later)

1. **Keep v0.3.x available:**
   - Host old version at `https://old-extension.faultmaven.ai`
   - Provide manual download link

2. **Fix issues in v0.4.x:**
   - Identify problems via error tracking
   - Release v0.4.1 with fixes

3. **Communication:**
   - Email users about known issues
   - Provide workaround instructions
   - Set timeline for fix

---

## Troubleshooting

### Common Issues

#### 1. CORS Errors in Dashboard

**Symptom:** Network requests fail with CORS errors

**Solution:**
```bash
# Verify backend CORS config includes dashboard domain
# Check browser console for exact error

# Backend should have:
allow_origins = ["https://app.faultmaven.ai"]
```

#### 2. Authentication Fails

**Symptom:** Login works in extension but not dashboard (or vice versa)

**Solution:**
- Check localStorage vs browser.storage.local differences
- Verify auth token format is the same
- Check token expiration handling

#### 3. "Manage KB" Button Opens Wrong URL

**Symptom:** Button opens localhost or staging URL in production

**Solution:**
```typescript
// In extension code, use environment variable:
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || 'https://app.faultmaven.ai';

// Then:
browser.tabs.create({ url: `${DASHBOARD_URL}/kb` });
```

#### 4. Documents Not Visible in RAG

**Symptom:** Upload doc in dashboard, but not used in Copilot

**Solution:**
- Verify user_id matches between dashboard and extension
- Check backend logs for indexing errors
- Ensure RAG system processes new uploads (may take 1-2 min)

#### 5. Extension Bundle Still Large

**Symptom:** Bundle size > 500KB after removing KB

**Solution:**
```bash
# Analyze bundle
npm install -g webpack-bundle-analyzer
cd .output/chrome-mv3
npx webpack-bundle-analyzer chunks/*.js

# Common culprits:
# - Unused dependencies (remove from package.json)
# - Large images (compress or remove)
# - Duplicate libraries (check imports)
```

---

## Success Metrics

Track these metrics post-migration:

### Extension Performance
- **Load Time:** < 200ms (target)
- **Bundle Size:** < 500KB (target)
- **Memory Usage:** < 50MB (target)

### Dashboard Adoption
- **Week 1:** 50% of active users log in to dashboard
- **Week 2:** 70% of KB uploads happen in dashboard
- **Week 4:** 90% adoption rate

### User Satisfaction
- **Support Tickets:** < 10 related to migration
- **Extension Rating:** Maintain 4.5+ stars
- **User Feedback:** Positive mentions of speed improvement

### Feature Usage
- **KB Uploads:** Should stay same or increase
- **Document Views:** Track in dashboard
- **Search Usage:** New metric (was not available in extension)

---

## Future Enhancements

After successful migration, consider:

### Dashboard Features (Phase 2)
- [ ] Bulk document upload (multiple files)
- [ ] Document versioning
- [ ] Team folders/workspaces
- [ ] Usage analytics dashboard
- [ ] Document sharing/permissions
- [ ] API key management
- [ ] Webhook configuration

### Extension Features
- [ ] Inline citations (click to view source in dashboard)
- [ ] Quick-add document from current page
- [ ] Recent documents preview

### Integration
- [ ] Slack bot with KB access
- [ ] API for programmatic KB management
- [ ] GitHub integration (docs sync)

---

## Appendix

### A. File Checklist

Files to copy from extension to dashboard:
```
✓ src/lib/api.ts
✓ src/lib/errors.ts
✓ src/lib/hooks/useAuth.tsx
✓ src/shared/ui/KnowledgeBaseView.tsx → src/pages/KBPage.tsx
✓ src/shared/ui/GlobalKBView.tsx → src/pages/AdminKBPage.tsx
✓ src/shared/ui/components/UploadPanel.tsx
✓ src/shared/ui/components/DocumentsListView.tsx
✓ src/shared/ui/components/SearchPanel.tsx
✓ src/shared/ui/components/EditMetadataModal.tsx
✓ src/shared/ui/components/DocumentDetailsModal.tsx
✓ src/shared/ui/components/ErrorState.tsx
```

Files to delete from extension:
```
✗ src/shared/ui/KnowledgeBaseView.tsx
✗ src/shared/ui/GlobalKBView.tsx
✗ src/shared/ui/components/UploadPanel.tsx
✗ src/shared/ui/components/DocumentsListView.tsx
✗ src/shared/ui/components/SearchPanel.tsx
✗ src/shared/ui/components/EditMetadataModal.tsx
```

### B. Environment Variables Reference

**Extension (.env.local):**
```bash
VITE_API_URL=https://api.faultmaven.ai
VITE_DASHBOARD_URL=https://app.faultmaven.ai
VITE_MAX_QUERY_LENGTH=200000
VITE_MAX_FILE_SIZE_MB=10
```

**Dashboard (.env):**
```bash
VITE_API_URL=https://api.faultmaven.ai
VITE_MAX_FILE_SIZE_MB=50
```

### C. URL Structure

**Dashboard URLs:**
- Production: `https://app.faultmaven.ai`
- Staging: `https://dashboard-staging.faultmaven.ai`
- Development: `http://localhost:5173`

**Key Routes:**
- `/login` - Authentication
- `/kb` - User Knowledge Base
- `/admin/kb` - Admin Knowledge Base
- `/cases` - Case history (future)
- `/settings` - User settings (future)

### D. Support Resources

- Migration Guide: https://docs.faultmaven.ai/kb-migration
- Dashboard Docs: https://docs.faultmaven.ai/dashboard-guide
- API Docs: https://api.faultmaven.ai/docs
- Support Email: support@faultmaven.ai
- GitHub Issues: https://github.com/sterlanyu/faultmaven-copilot/issues

---

**Document End**

Last Updated: 2025-11-14
Version: 1.0
Maintained by: FaultMaven Engineering Team

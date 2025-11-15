# FaultMaven Copilot Migration Guide: Universal Split Architecture

**Migration Goal:** Single extension with universal split architecture supporting both self-hosted and enterprise deployments

**Document Version:** 2.1
**Last Updated:** 2025-11-15
**Estimated Timeline:** 4-5 weeks

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Deployment Modes](#deployment-modes)
4. [Backend: Capabilities Negotiation API](#backend-capabilities-negotiation-api)
5. [Extension: Universal Implementation](#extension-universal-implementation)
6. [Dashboard: Web Application](#dashboard-web-application)
7. [First-Run Experience](#first-run-experience)
8. [Authentication & Security](#authentication--security)
9. [KB Ingestion Lifecycle](#kb-ingestion-lifecycle)
10. [Performance & Observability](#performance--observability)
11. [Deployment](#deployment)
12. [Testing Strategy](#testing-strategy)
13. [Rollout Plan](#rollout-plan)
14. [Failure Modes & Resilience](#failure-modes--resilience)
15. [Appendices](#appendices)

---

## Executive Summary

### The Challenge

FaultMaven operates under an **open-core model**:
- **Self-Hosted (Open Source):** Individual developers run backend locally
- **Enterprise Cloud (SaaS):** Teams use managed service with enterprise features

**Previous approach** bundled KB management in extension (~850 KB), causing:
- Slow load times during incidents (400ms)
- Cramped UI in 300px side panel
- Dual codebase maintenance burden

### The Solution: Universal Split Architecture

**ONE extension binary. TWO backends. IDENTICAL user experience.**

**Key Principle:** Both self-hosted and enterprise use the **same split architecture**:
- **Extension:** Chat ONLY (450 KB)
- **Dashboard:** KB Management (web app)

```
┌────────────────────────────────────────┐
│  FaultMaven Extension (Universal)      │
│  - Chat UI (450 KB)                    │
│  - "Open Dashboard" button             │
│  - Settings: API Endpoint config       │
└────────────────────────────────────────┘
             │
             ├─── Self-Hosted User
             │    API: http://localhost:8000
             │    Dashboard: http://localhost:3000
             │    Deploy: docker-compose
             │
             └─── Enterprise User
                  API: https://api.faultmaven.ai
                  Dashboard: https://app.faultmaven.ai
                  Deploy: Managed SaaS
```

### Strategic Benefits

| Aspect | Universal Split | Old Dual-UI Approach |
|--------|----------------|----------------------|
| **Code Maintenance** | Single KB UI codebase | Two separate KB UIs |
| **Extension Bundle** | 450 KB (always) | 450 KB (ent) / 850 KB (self) |
| **Upgrade Path** | Seamless (same UX) | Jarring (different tools) |
| **UX Consistency** | ✅ Identical | ❌ Different |
| **Self-Hosted Deploy** | docker-compose | Single container |
| **Future-Proof** | Easy to add features | Hard to maintain parity |

### Business Model Alignment

**Open-Core Strategy:**
- **Free Tier (Self-Hosted):** Full chat + basic KB (10MB files, single-user)
- **Paid Tier (Enterprise):** Advanced KB (50MB files), Admin KB, Teams, SSO, Analytics

**Frictionless Upgrade:**
1. User already using dashboard for KB management
2. Upgrade → same tools, more features
3. No learning curve, no migration

---

## Architecture Overview

### Universal Extension Architecture

**Single extension** adapts based on backend capabilities:

```typescript
// Extension discovers backend type via /v1/meta/capabilities
GET http://localhost:8000/v1/meta/capabilities
→ { "deploymentMode": "self-hosted", "dashboardUrl": "http://localhost:3000" }

GET https://api.faultmaven.ai/v1/meta/capabilities
→ { "deploymentMode": "enterprise", "dashboardUrl": "https://app.faultmaven.ai" }

// Extension shows SAME UI for both:
// - Chat (always)
// - "Open Dashboard" button (always)
// - No KB tabs in extension (never)
```

### Component Architecture

```
┌─────────────────────────────────────────┐
│         Browser Extension               │
│  ┌───────────────────────────────────┐  │
│  │  SidePanelApp.tsx                 │  │
│  │  - ChatWindow (always)            │  │
│  │  - DashboardButton (always)       │  │
│  │  - No KB tabs (removed)           │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Bundle: 450 KB (KB code removed)      │
└─────────────────────────────────────────┘
              ↓ /v1/meta/capabilities
┌─────────────────────────────────────────┐
│         Backend API                     │
│  - Capabilities endpoint (public)       │
│  - Chat/Cases API                       │
│  - KB API                               │
│  - Auth                                 │
└─────────────────────────────────────────┘
              ↑ /api/v1/kb/*
┌─────────────────────────────────────────┐
│         Web Dashboard                   │
│  - KB Management (universal)            │
│  - Upload, search, organize             │
│  - Admin KB (enterprise only)           │
│  - Analytics (enterprise only)          │
└─────────────────────────────────────────┘
```

---

## Deployment Modes

### Mode 1: Self-Hosted (Open Source)

**Target:** Individual developers, hobbyists, privacy-focused users

**Stack:**
- **Backend:** Open-source, single-user, localhost
- **Dashboard:** Open-source, single-user, localhost
- **Deployment:** docker-compose (2 containers)

**User Journey:**
1. Install extension from Chrome Web Store
2. Run `docker-compose up -d` (starts backend + dashboard)
3. Open extension → Choose "Self-Hosted" in welcome screen
4. Extension auto-configures to `http://localhost:8000`
5. Extension shows "Open Dashboard" button → opens `http://localhost:3000`

**Capabilities Response:**

```json
{
  "deploymentMode": "self-hosted",
  "kbManagement": "dashboard",
  "dashboardUrl": "http://localhost:3000",
  "features": {
    "extensionKB": false,
    "adminKB": false,
    "teamWorkspaces": false,
    "caseHistory": false,
    "sso": false
  },
  "limits": {
    "maxFileBytes": 10485760,
    "allowedExtensions": [".md", ".txt", ".log", ".json", ".csv"]
  },
  "branding": {
    "name": "FaultMaven (Self-Hosted)",
    "supportUrl": "https://docs.faultmaven.ai"
  }
}
```

**Key Points:**
- `extensionKB: false` → KB tabs NOT shown in extension
- `dashboardUrl: "http://localhost:3000"` → Dashboard button opens local URL
- 10 MB file limit
- No enterprise features

---

### Mode 2: Enterprise Cloud (SaaS)

**Target:** Teams, organizations, enterprise subscribers

**Stack:**
- **Backend:** Proprietary, multi-tenant, hosted
- **Dashboard:** Hosted, team features, SSO
- **Deployment:** Managed by FaultMaven

**User Journey:**
1. Install extension from Chrome Web Store
2. Open extension → Choose "Enterprise Cloud" in welcome screen (default)
3. Extension uses default `https://api.faultmaven.ai`
4. Login with enterprise credentials
5. Extension shows "Open Dashboard" button → opens `https://app.faultmaven.ai`

**Capabilities Response:**

```json
{
  "deploymentMode": "enterprise",
  "kbManagement": "dashboard",
  "dashboardUrl": "https://app.faultmaven.ai",
  "features": {
    "extensionKB": false,
    "adminKB": true,
    "teamWorkspaces": true,
    "caseHistory": true,
    "sso": true
  },
  "limits": {
    "maxFileBytes": 52428800,
    "allowedExtensions": [".md", ".txt", ".log", ".json", ".csv", ".pdf", ".doc", ".docx"]
  },
  "branding": {
    "name": "FaultMaven",
    "supportUrl": "https://support.faultmaven.ai"
  }
}
```

**Key Points:**
- `extensionKB: false` → KB tabs NOT shown in extension (same as self-hosted)
- `dashboardUrl: "https://app.faultmaven.ai"` → Dashboard button opens SaaS URL
- 50 MB file limit
- Enterprise features enabled

---

### Deployment Comparison

| Aspect | Self-Hosted | Enterprise Cloud |
|--------|-------------|------------------|
| **Extension UI** | Chat + Dashboard button | Chat + Dashboard button |
| **Backend** | Open-source, single-user | Proprietary, multi-tenant |
| **Dashboard** | `http://localhost:3000` | `https://app.faultmaven.ai` |
| **Deployment** | docker-compose | Managed SaaS |
| **Max File Size** | 10 MB | 50 MB |
| **File Types** | Basic (md, txt, json, csv) | Advanced (+pdf, doc, docx) |
| **Admin KB** | ❌ | ✅ |
| **Team Workspaces** | ❌ | ✅ |
| **Case History** | ❌ | ✅ |
| **SSO** | ❌ | ✅ |
| **Cost** | Free (self-deploy) | Paid subscription |

**Important:** Both modes use **identical extension UI**. The only difference is which backend they connect to.

---

## Backend: Capabilities Negotiation API

### Endpoint Specification

**GET `/v1/meta/capabilities`**

**Purpose:** Allow extension to discover backend deployment mode and adapt UI

**Authentication:** None required (public endpoint for feature discovery)

**Response Schema:**

```typescript
interface CapabilitiesResponse {
  deploymentMode: 'self-hosted' | 'enterprise';
  kbManagement: 'dashboard';  // Always 'dashboard' in v2
  dashboardUrl: string;
  features: {
    extensionKB: boolean;      // Always false in v2
    adminKB: boolean;
    teamWorkspaces: boolean;
    caseHistory: boolean;
    sso: boolean;
  };
  limits: {
    maxFileBytes: number;
    allowedExtensions: string[];
    maxDocuments?: number;
  };
  branding?: {
    name: string;
    logoUrl?: string;
    supportUrl?: string;
  };
}
```

### Backend Implementation

**File: `backend/api/v1/meta.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from ..config import settings

router = APIRouter(prefix="/v1/meta", tags=["meta"])

class Features(BaseModel):
    extensionKB: bool = False      # Always false in v2
    adminKB: bool
    teamWorkspaces: bool
    caseHistory: bool
    sso: bool = False

class Limits(BaseModel):
    maxFileBytes: int
    allowedExtensions: List[str]
    maxDocuments: Optional[int] = None

class Branding(BaseModel):
    name: str
    logoUrl: Optional[str] = None
    supportUrl: Optional[str] = None

class CapabilitiesResponse(BaseModel):
    deploymentMode: str
    kbManagement: str = "dashboard"  # Always dashboard
    dashboardUrl: str
    features: Features
    limits: Limits
    branding: Optional[Branding] = None

@router.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities():
    """
    Returns deployment capabilities for extension adaptation.

    This endpoint is public (no auth required) to allow feature
    discovery before login.
    """

    if settings.DEPLOYMENT_MODE == "enterprise":
        return CapabilitiesResponse(
            deploymentMode="enterprise",
            kbManagement="dashboard",
            dashboardUrl=settings.DASHBOARD_URL or "https://app.faultmaven.ai",
            features=Features(
                extensionKB=False,
                adminKB=True,
                teamWorkspaces=True,
                caseHistory=True,
                sso=True
            ),
            limits=Limits(
                maxFileBytes=52428800,  # 50 MB
                allowedExtensions=[
                    ".md", ".txt", ".log", ".json", ".csv",
                    ".pdf", ".doc", ".docx"
                ],
                maxDocuments=10000
            ),
            branding=Branding(
                name="FaultMaven",
                supportUrl="https://support.faultmaven.ai"
            )
        )
    else:
        # Self-hosted (default)
        return CapabilitiesResponse(
            deploymentMode="self-hosted",
            kbManagement="dashboard",
            dashboardUrl=settings.DASHBOARD_URL or "http://localhost:3000",
            features=Features(
                extensionKB=False,  # KB in dashboard only
                adminKB=False,
                teamWorkspaces=False,
                caseHistory=False,
                sso=False
            ),
            limits=Limits(
                maxFileBytes=10485760,  # 10 MB
                allowedExtensions=[".md", ".txt", ".log", ".json", ".csv"]
            ),
            branding=Branding(
                name="FaultMaven (Self-Hosted)",
                supportUrl="https://docs.faultmaven.ai"
            )
        )
```

**Configuration:**

```python
# backend/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DEPLOYMENT_MODE: str = "self-hosted"  # or "enterprise"
    DASHBOARD_URL: str | None = None      # Auto-set based on mode
    MAX_UPLOAD_SIZE_MB: int = 10          # 10 for self-hosted, 50 for enterprise

    class Config:
        env_file = ".env"

settings = Settings()
```

**Environment Variables:**

```bash
# Self-Hosted .env
DEPLOYMENT_MODE=self-hosted
DASHBOARD_URL=http://localhost:3000
MAX_UPLOAD_SIZE_MB=10

# Enterprise .env
DEPLOYMENT_MODE=enterprise
DASHBOARD_URL=https://app.faultmaven.ai
MAX_UPLOAD_SIZE_MB=50
```

---

## Extension: Universal Implementation

### Capabilities Manager

**File: `src/lib/capabilities.ts`**

```typescript
export interface BackendCapabilities {
  deploymentMode: 'self-hosted' | 'enterprise';
  kbManagement: 'dashboard';
  dashboardUrl: string;
  features: {
    extensionKB: boolean;  // Should always be false
    adminKB: boolean;
    teamWorkspaces: boolean;
    caseHistory: boolean;
    sso: boolean;
  };
  limits: {
    maxFileBytes: number;
    allowedExtensions: string[];
    maxDocuments?: number;
  };
  branding?: {
    name: string;
    logoUrl?: string;
    supportUrl?: string;
  };
}

class CapabilitiesManager {
  private capabilities: BackendCapabilities | null = null;
  private fetchPromise: Promise<BackendCapabilities> | null = null;

  async fetch(apiUrl: string): Promise<BackendCapabilities> {
    // Return cached if available
    if (this.capabilities) {
      return this.capabilities;
    }

    // Prevent duplicate requests
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = (async () => {
      try {
        const response = await fetch(`${apiUrl}/v1/meta/capabilities`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          throw new Error(`Capabilities fetch failed: ${response.status}`);
        }

        const caps = await response.json();
        this.capabilities = caps;

        // Cache in storage for offline access
        if (typeof browser !== 'undefined' && browser.storage) {
          await browser.storage.local.set({ backendCapabilities: caps });
        }

        console.log('[CapabilitiesManager] Connected to:', caps.deploymentMode);
        return caps;

      } catch (error) {
        console.warn('[CapabilitiesManager] Fetch failed, trying cache:', error);

        // Try cache
        if (typeof browser !== 'undefined' && browser.storage) {
          const cached = await browser.storage.local.get(['backendCapabilities']);
          if (cached.backendCapabilities) {
            this.capabilities = cached.backendCapabilities;
            return this.capabilities;
          }
        }

        // Final fallback: assume self-hosted
        const fallback: BackendCapabilities = {
          deploymentMode: 'self-hosted',
          kbManagement: 'dashboard',
          dashboardUrl: 'http://localhost:3000',
          features: {
            extensionKB: false,
            adminKB: false,
            teamWorkspaces: false,
            caseHistory: false,
            sso: false
          },
          limits: {
            maxFileBytes: 10485760,
            allowedExtensions: ['.md', '.txt', '.log', '.json', '.csv']
          }
        };

        this.capabilities = fallback;
        return fallback;
      } finally {
        this.fetchPromise = null;
      }
    })();

    return this.fetchPromise;
  }

  getCapabilities(): BackendCapabilities | null {
    return this.capabilities;
  }

  getDashboardUrl(): string | null {
    return this.capabilities?.dashboardUrl ?? null;
  }

  getUploadLimits() {
    return this.capabilities?.limits ?? {
      maxFileBytes: 10485760,
      allowedExtensions: ['.md', '.txt', '.log', '.json', '.csv']
    };
  }
}

export const capabilitiesManager = new CapabilitiesManager();
```

### Main App Component

**File: `src/shared/ui/SidePanelApp.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';
import { capabilitiesManager, type BackendCapabilities } from '../../lib/capabilities';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { ErrorScreen } from './components/ErrorScreen';
import { ChatWindow } from './components/ChatWindow';
import { CollapsibleNavigation } from './layouts/CollapsibleNavigation';
import config from '../../config';

export default function SidePanelApp() {
  const [hasCompletedFirstRun, setHasCompletedFirstRun] = useState<boolean | null>(null);
  const [apiEndpoint, setApiEndpoint] = useState<string>('');
  const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    // 1. Check if first run
    const { hasCompletedFirstRun: completed } = await browser.storage.local.get([
      'hasCompletedFirstRun'
    ]);

    if (!completed) {
      setHasCompletedFirstRun(false);
      setLoading(false);
      return;
    }

    setHasCompletedFirstRun(true);

    // 2. Load API endpoint from settings
    const { apiEndpoint: savedEndpoint } = await browser.storage.local.get(['apiEndpoint']);
    const endpoint = savedEndpoint || 'https://api.faultmaven.ai'; // Default to enterprise
    setApiEndpoint(endpoint);
    config.apiUrl = endpoint;

    // 3. Fetch capabilities from backend
    try {
      const caps = await capabilitiesManager.fetch(endpoint);
      setCapabilities(caps);
      console.log('[SidePanelApp] Deployment mode:', caps.deploymentMode);
      console.log('[SidePanelApp] Dashboard URL:', caps.dashboardUrl);
    } catch (err: any) {
      console.error('[SidePanelApp] Failed to fetch capabilities:', err);
      setError('Unable to connect to backend. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleWelcomeComplete = async () => {
    setLoading(true);
    await initialize();
  };

  // Show welcome screen on first run
  if (hasCompletedFirstRun === false) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />;
  }

  // Show loading state
  if (loading) {
    return <LoadingScreen message="Connecting to backend..." />;
  }

  // Show error state
  if (error || !capabilities) {
    return (
      <ErrorScreen
        message={error || 'Unable to connect to backend'}
        action={{
          label: 'Open Settings',
          onClick: () => browser.runtime.openOptionsPage()
        }}
      />
    );
  }

  // Main app UI
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Deployment mode badge */}
      <div className="absolute top-2 right-2 z-50">
        <span
          className={`text-xs px-2 py-1 rounded ${
            capabilities.deploymentMode === 'self-hosted'
              ? 'bg-gray-100 text-gray-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {capabilities.deploymentMode === 'self-hosted' ? '🏠 Self-Hosted' : '☁️ Enterprise'}
        </span>
      </div>

      {/* Navigation sidebar */}
      <CollapsibleNavigation
        dashboardUrl={capabilities.dashboardUrl}
        branding={capabilities.branding}
        // ... other props
      />

      {/* Main content area - ONLY chat */}
      <main className="flex-1 overflow-hidden">
        <ChatWindow
          // ... props
        />
      </main>
    </div>
  );
}
```

### Navigation Component

**File: `src/shared/ui/layouts/CollapsibleNavigation.tsx`**

```typescript
import React from 'react';
import { browser } from 'wxt/browser';

interface CollapsibleNavigationProps {
  dashboardUrl: string;
  branding?: {
    name: string;
    supportUrl?: string;
  };
  // ... other props
}

export function CollapsibleNavigation({
  dashboardUrl,
  branding,
  // ... other props
}: CollapsibleNavigationProps) {
  const handleOpenDashboard = () => {
    browser.tabs.create({ url: dashboardUrl });
  };

  const handleOpenSettings = () => {
    browser.runtime.openOptionsPage();
  };

  return (
    <nav className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo/Branding */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-800">
          {branding?.name || 'FaultMaven'}
        </h1>
      </div>

      {/* Main actions */}
      <div className="flex-1 p-4 space-y-2">
        {/* New Chat button */}
        <button
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          // ... onClick handler
        >
          + New Chat
        </button>

        {/* Open Dashboard button */}
        <button
          onClick={handleOpenDashboard}
          className="w-full px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          Manage Knowledge Base
        </button>

        {/* Chat history */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Recent Chats
          </h3>
          {/* ... chat list */}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <button
          onClick={handleOpenSettings}
          className="w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg text-left"
        >
          ⚙️ Settings
        </button>
        {branding?.supportUrl && (
          <a
            href={branding.supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg text-left"
          >
            📚 Documentation
          </a>
        )}
      </div>
    </nav>
  );
}
```

---

## First-Run Experience

### Welcome Screen

**File: `src/shared/ui/components/WelcomeScreen.tsx`**

```typescript
import React from 'react';
import { browser } from 'wxt/browser';

interface WelcomeScreenProps {
  onComplete: () => void;
}

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const handleCloudSetup = async () => {
    // Use default enterprise endpoint
    await browser.storage.local.set({
      apiEndpoint: 'https://api.faultmaven.ai',
      hasCompletedFirstRun: true
    });
    onComplete();
  };

  const handleSelfHostedSetup = async () => {
    // Mark as completed and open settings
    await browser.storage.local.set({
      hasCompletedFirstRun: true
    });

    // Open settings page for configuration
    await browser.runtime.openOptionsPage();
    onComplete();
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to FaultMaven Copilot
          </h1>
          <p className="text-lg text-gray-600">
            AI-powered troubleshooting assistant for SRE and DevOps teams
          </p>
        </div>

        {/* Deployment options */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Enterprise Cloud */}
          <button
            onClick={handleCloudSetup}
            className="group bg-white border-2 border-blue-200 rounded-xl p-6 hover:border-blue-500 hover:shadow-lg transition-all text-left"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                <svg className="w-6 h-6 text-blue-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">
                Enterprise Cloud
              </h3>
            </div>

            <p className="text-gray-600 mb-4">
              Managed SaaS platform with team collaboration, admin controls, and advanced features.
            </p>

            <ul className="space-y-2 text-sm text-gray-600 mb-6">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Zero setup - works immediately</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Team knowledge base & admin KB</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>SSO, case history, analytics</span>
              </li>
            </ul>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-600">Recommended</span>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          {/* Self-Hosted */}
          <button
            onClick={handleSelfHostedSetup}
            className="group bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-gray-400 hover:shadow-lg transition-all text-left"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-gray-500 transition-colors">
                <svg className="w-6 h-6 text-gray-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">
                Self-Hosted
              </h3>
            </div>

            <p className="text-gray-600 mb-4">
              Run the open-source backend on your own infrastructure. Perfect for individual developers.
            </p>

            <ul className="space-y-2 text-sm text-gray-600 mb-6">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>100% free and open source</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Full data control & privacy</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Air-gapped environments supported</span>
              </li>
            </ul>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Requires Docker</span>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          You can change this later in extension settings
        </p>
      </div>
    </div>
  );
}
```

### Settings Page

**File: `src/entrypoints/options.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <title>FaultMaven Settings</title>
  <link rel="stylesheet" href="/assets/options.css">
</head>
<body>
  <div class="settings-container">
    <h1>FaultMaven Settings</h1>

    <div class="setting-group">
      <label for="api-endpoint">API Endpoint</label>
      <input
        type="text"
        id="api-endpoint"
        placeholder="https://api.faultmaven.ai"
      />
      <p class="help-text">
        <strong>Self-hosted:</strong> Use <code>http://localhost:8000</code><br>
        <strong>Enterprise:</strong> Use <code>https://api.faultmaven.ai</code> (default)
      </p>
    </div>

    <div class="setting-group">
      <label>Detected Mode</label>
      <div id="deployment-mode" class="badge">
        Loading...
      </div>
    </div>

    <button id="save-settings" class="primary-button">Save Settings</button>
    <button id="test-connection" class="secondary-button">Test Connection</button>

    <div id="status-message"></div>
  </div>

  <script src="/assets/options.js"></script>
</body>
</html>
```

**File: `src/entrypoints/options.ts`**

```typescript
import { browser } from 'wxt/browser';
import { capabilitiesManager } from '../lib/capabilities';

document.addEventListener('DOMContentLoaded', async () => {
  const apiEndpointInput = document.getElementById('api-endpoint') as HTMLInputElement;
  const deploymentModeDiv = document.getElementById('deployment-mode');
  const saveButton = document.getElementById('save-settings');
  const testButton = document.getElementById('test-connection');
  const statusMessage = document.getElementById('status-message');

  // Load saved settings
  const { apiEndpoint } = await browser.storage.local.get(['apiEndpoint']);
  apiEndpointInput.value = apiEndpoint || 'https://api.faultmaven.ai';

  // Load current capabilities
  await loadCapabilities(apiEndpointInput.value);

  // Save settings
  saveButton?.addEventListener('click', async () => {
    const endpoint = apiEndpointInput.value.trim();

    if (!endpoint) {
      showStatus('Please enter an API endpoint', 'error');
      return;
    }

    await browser.storage.local.set({ apiEndpoint: endpoint });
    showStatus('Settings saved! Please refresh the extension.', 'success');

    await loadCapabilities(endpoint);
  });

  // Test connection
  testButton?.addEventListener('click', async () => {
    const endpoint = apiEndpointInput.value.trim();
    await testConnection(endpoint);
  });

  async function loadCapabilities(endpoint: string) {
    try {
      const caps = await capabilitiesManager.fetch(endpoint);

      if (deploymentModeDiv) {
        deploymentModeDiv.className = `badge badge-${caps.deploymentMode}`;
        deploymentModeDiv.textContent =
          caps.deploymentMode === 'self-hosted'
            ? '🏠 Self-Hosted (Open Source)'
            : '☁️ Enterprise (SaaS)';
      }
    } catch (error) {
      if (deploymentModeDiv) {
        deploymentModeDiv.className = 'badge badge-error';
        deploymentModeDiv.textContent = '❌ Unable to connect';
      }
    }
  }

  async function testConnection(endpoint: string) {
    showStatus('Testing connection...', 'info');

    try {
      const response = await fetch(`${endpoint}/v1/meta/capabilities`);

      if (response.ok) {
        const caps = await response.json();
        showStatus(
          `✓ Connected to ${caps.deploymentMode} backend at ${caps.dashboardUrl}`,
          'success'
        );
      } else {
        showStatus(`✗ Connection failed: ${response.status}`, 'error');
      }
    } catch (error: any) {
      showStatus(`✗ Connection failed: ${error.message}`, 'error');
    }
  }

  function showStatus(message: string, type: 'success' | 'error' | 'info') {
    if (statusMessage) {
      statusMessage.textContent = message;
      statusMessage.className = `status-${type}`;

      setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
      }, 5000);
    }
  }
});
```

---

## Dashboard: Web Application

### Dashboard is Identical for Both Modes

**Key Point:** The dashboard codebase is **100% shared** between self-hosted and enterprise.

**Differences are backend-driven:**
- Self-hosted: Admin KB tab hidden (backend returns 403)
- Enterprise: Admin KB tab visible (backend returns data)

**File: `faultmaven-dashboard/src/App.tsx`**

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/hooks/useAuth';
import LoginPage from './pages/LoginPage';
import KBPage from './pages/KBPage';
import AdminKBPage from './pages/AdminKBPage';

function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/kb" replace />;
  }

  return children;
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
      </Routes>
    </BrowserRouter>
  );
}
```

**Navigation adapts to backend mode:**

```typescript
// In KBPage.tsx header
const { capabilities } = useCapabilities();  // Fetch from /v1/meta/capabilities

<nav>
  <a href="/kb">My KB</a>
  {capabilities?.features.adminKB && (
    <a href="/admin/kb">Admin KB</a>
  )}
  {capabilities?.features.caseHistory && (
    <a href="/cases">Case History</a>
  )}
</nav>
```

---

## Deployment

### Self-Hosted Deployment (docker-compose)

**File: `docker-compose.yml`**

```yaml
version: '3.8'

services:
  backend:
    image: faultmaven/backend:latest
    container_name: faultmaven-backend
    ports:
      - "8000:8000"
    environment:
      - DEPLOYMENT_MODE=self-hosted
      - DASHBOARD_URL=http://localhost:3000
      - DATABASE_URL=postgresql://faultmaven:faultmaven@db:5432/faultmaven
      - REDIS_URL=redis://redis:6379/0
      - QDRANT_URL=http://qdrant:6333
      - MAX_UPLOAD_SIZE_MB=10
    depends_on:
      - db
      - redis
      - qdrant
    volumes:
      - ./data/uploads:/app/uploads
    networks:
      - faultmaven

  dashboard:
    image: faultmaven/dashboard:latest
    container_name: faultmaven-dashboard
    ports:
      - "3000:80"
    environment:
      - VITE_API_URL=http://localhost:8000
      - VITE_MAX_FILE_SIZE_MB=10
    networks:
      - faultmaven

  db:
    image: postgres:15-alpine
    container_name: faultmaven-db
    environment:
      POSTGRES_USER: faultmaven
      POSTGRES_PASSWORD: faultmaven
      POSTGRES_DB: faultmaven
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - faultmaven

  redis:
    image: redis:7-alpine
    container_name: faultmaven-redis
    networks:
      - faultmaven

  qdrant:
    image: qdrant/qdrant:latest
    container_name: faultmaven-vectordb
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - faultmaven

volumes:
  postgres_data:
  qdrant_data:

networks:
  faultmaven:
    driver: bridge
```

**Quick Start Guide:**

```markdown
# Self-Hosted Setup (5 minutes)

## Prerequisites
- Docker Desktop (Mac/Windows) or Docker Engine (Linux)
- 4 GB RAM minimum
- 10 GB disk space

## Installation

1. **Clone repository:**
   ```bash
   git clone https://github.com/faultmaven/faultmaven-backend.git
   cd faultmaven-backend
   ```

2. **Start services:**
   ```bash
   docker-compose up -d
   ```

3. **Verify services:**
   ```bash
   docker-compose ps
   # All services should show "Up"
   ```

4. **Install browser extension:**
   - Install from [Chrome Web Store](https://chrome.google.com/webstore/...)
   - On first launch, select "Self-Hosted"
   - Settings will open automatically

5. **Configure extension:**
   - API Endpoint: `http://localhost:8000` (pre-filled)
   - Click "Test Connection" → Should show "✓ Connected to self-hosted backend"
   - Click "Save Settings"

6. **Access dashboard:**
   - Click "Manage Knowledge Base" button in extension
   - Opens `http://localhost:3000`
   - Login with any username (no password in dev mode)

## What's Running

- **Backend API:** http://localhost:8000
- **Dashboard:** http://localhost:3000
- **PostgreSQL:** Port 5432 (internal)
- **Qdrant Vector DB:** Port 6333 (internal)
- **Redis:** Port 6379 (internal)

## Stopping Services

```bash
docker-compose down         # Stop and remove containers
docker-compose down -v      # Also remove volumes (deletes data)
```

## Upgrading

```bash
docker-compose pull         # Pull latest images
docker-compose up -d        # Restart with new images
```
```

### Enterprise Cloud Deployment

**Backend:**
- Deployed on AWS/GCP with auto-scaling
- PostgreSQL RDS, Redis Elasticache, Qdrant Cloud
- Multi-tenant with organization isolation

**Dashboard:**
- Deployed on Vercel
- Environment variables configured in Vercel dashboard

**File: `faultmaven-dashboard/vercel.json`**

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.faultmaven.ai;"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ]
}
```

---

## Key Design Decisions Summary

### 1. Universal Split Architecture
- **Decision:** Both self-hosted and enterprise use split (extension chat + dashboard KB)
- **Rationale:** Single codebase, consistent UX, seamless upgrade path
- **Impact:** Removes 400 KB from extension, easier maintenance

### 2. Default to Enterprise
- **Decision:** Extension defaults to `https://api.faultmaven.ai`
- **Rationale:** Frictionless SaaS onboarding (largest user base)
- **Impact:** Self-hosted users configure in welcome screen (acceptable for technical users)

### 3. First-Run Welcome Screen
- **Decision:** Show welcome screen on first launch
- **Rationale:** Prevents confusion, guides users to correct setup
- **Impact:** Professional UX, clear choice between modes

### 4. Capabilities-Driven UI
- **Decision:** Backend dictates available features via `/v1/meta/capabilities`
- **Rationale:** Keep extension "dumb," backend controls features
- **Impact:** Easy to add features, no extension updates needed

### 5. Self-Hosted Uses Dashboard
- **Decision:** Self-hosted gets dashboard (not extension KB tabs)
- **Rationale:** Code reuse, consistent UX, easier upgrades
- **Impact:** docker-compose instead of single container (acceptable tradeoff)

---

**Document End**

**Last Updated:** 2025-11-15
**Version:** 2.1
**Maintained by:** FaultMaven Engineering Team

**Changelog:**
- v2.1 (2025-11-15): Complete redesign for universal split architecture
  - Removed 3-mode model, simplified to 2 modes
  - Both modes use split architecture (extension chat + dashboard KB)
  - Added first-run welcome screen
  - Default to enterprise endpoint
  - Self-hosted uses docker-compose (backend + dashboard)
- v2.0 (2025-11-15): Initial adaptive multi-mode version
- v1.0 (2025-11-14): Original simple split approach

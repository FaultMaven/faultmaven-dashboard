# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the **FaultMaven Copilot** browser extension - an AI-powered troubleshooting assistant built with WXT framework. The extension provides engineers (especially in SRE and DevOps roles) with in-context help, analyzes web content, and enables interaction with the FaultMaven AI to diagnose and resolve issues efficiently.

**Key Technologies**: WXT v0.20.6, React 19+, TypeScript, Tailwind CSS, Vitest

## Common Commands

### Development
```bash
pnpm install                    # Install dependencies
pnpm dev                       # Chrome development with HMR
pnpm dev:firefox               # Firefox development
pnpm compile                   # TypeScript compilation check
```

### Building and Packaging
```bash
pnpm build                     # Chrome production build
pnpm build:firefox             # Firefox production build
pnpm zip                       # Package for Chrome Web Store
pnpm zip:firefox               # Package for Firefox Add-ons
```

### Testing
```bash
pnpm test                      # Run all tests
pnpm test --watch              # Run tests in watch mode
pnpm test:ui                   # Run tests with UI
pnpm test:coverage             # Generate coverage report
```

### Asset Generation
```bash
pnpm generate-icons            # Generate extension icons from SVG
```

## Configuration

### Environment Variables
All configuration is done via environment variables (set before build):

```bash
# Copy example template
cp .env.example .env.local

# Edit .env.local with your settings
```

**Available Variables:**
- `VITE_API_URL` - Backend API endpoint (default: `http://127.0.0.1:8000`)
- `VITE_DATA_MODE_LINES` - Lines threshold for data upload mode (default: `100`)
- `VITE_MAX_QUERY_LENGTH` - Max input characters (default: `10000`)
- `VITE_MAX_FILE_SIZE_MB` - Max file upload size in MB (default: `10`)

**Configuration Files:**
- **`src/config.ts`** - Central configuration with environment variable parsing
- **`src/shared/ui/layouts/constants.ts`** - UI constants derived from config
- **`.env.example`** - Complete documentation of all available variables
- **`.env.local`** - Your local overrides (gitignored)

**Important:** All VITE_* variables are replaced at BUILD TIME. Changing them requires:
- Dev mode: Restart `pnpm dev`
- Production: Rebuild with `pnpm build`

## High-Level Architecture

### Browser Extension Architecture (v0.4.0 - Universal Split Architecture)
The extension follows WXT framework conventions with clear separation of concerns:

```
src/
├── entrypoints/              # WXT entry points
│   ├── background.ts         # Service worker (session management, messaging)
│   ├── page-content.content.ts # Content script
│   ├── sidepanel_manual/     # Side panel entry point (chat UI)
│   └── options/              # Settings page entry point
├── lib/                      # Core logic
│   ├── api.ts               # FaultMaven API client (sessions, queries, cases)
│   ├── capabilities.ts      # Backend capabilities detection
│   └── utils/               # Helper utilities
├── shared/ui/               # React components
│   ├── SidePanelApp.tsx     # Main app (chat-only)
│   ├── components/          # Reusable UI components
│   │   ├── WelcomeScreen.tsx   # First-run setup
│   │   ├── LoadingScreen.tsx   # Loading states
│   │   └── ErrorScreen.tsx     # Error handling
│   └── layouts/             # Layout components
└── config.ts                # Environment configuration
```

**Note**: KB management is now handled by the separate `faultmaven-dashboard` web application.

### Key Patterns

1. **WXT Framework**: Uses modern WebExtension toolkit with Vite-based build system
2. **Manifest V3**: Chrome extensions with background service worker
3. **Side Panel API**: Modern Chrome extension UI pattern
4. **Session Management**: Backend session creation with local storage caching
5. **API Integration**: RESTful communication with FaultMaven backend
6. **Universal Deployment**: Single binary adapts to self-hosted or enterprise backend
7. **Capabilities-Driven UI**: Extension adapts based on backend `/v1/meta/capabilities`
8. **Error Boundaries**: React error boundaries for crash protection

### API Integration

The extension communicates with the FaultMaven backend through structured API calls:

- **Capabilities**: `GET /v1/meta/capabilities` - Detects deployment mode and features
- **Sessions**: `createSession()`, `deleteSession()`, `heartbeatSession()`
- **Cases**: `createCase()`, `getCaseConversation()`, `updateCaseTitle()`
- **Troubleshooting**: `submitQueryToCase()` with contextual data
- **Data Upload**: `uploadDataToCase()` for files/text/page content
- **Knowledge Base**: `getKnowledgeDocument()` (read-only for viewing sources)

**API Endpoint Configuration:**
- Set during first-run via welcome screen
- Can be changed in extension options page
- Self-hosted: `http://localhost:8000`
- Enterprise: `https://api.faultmaven.ai` (default)

### Browser Extension Flow

1. **First-Run**: Welcome screen guides deployment mode selection
2. **Capabilities Fetch**: Extension fetches backend capabilities on startup
3. **Background Script**: Manages sessions, handles extension lifecycle
4. **Side Panel**: Chat-only UI (KB management via dashboard button)
5. **Content Script**: Injects page analysis capabilities
6. **Storage**: Chrome storage API for session persistence and settings
7. **Messaging**: Runtime messaging between components

### Component Architecture

- **SidePanelApp**: Main application (chat-only), capabilities-driven UI, session management
- **WelcomeScreen**: First-run setup component (Enterprise vs Self-Hosted selection)
- **LoadingScreen**: Loading state display during capabilities fetch
- **ErrorScreen**: Error handling with actionable retry/settings options
- **CollapsibleNavigation**: Sidebar with chat, dashboard button, conversation list
- **OptionsApp**: Settings page for API endpoint configuration
- **Error Boundaries**: Graceful error handling throughout the UI
- **Accessible Components**: WCAG 2.1 AA compliant UI elements

**Note**: Knowledge Base UI components have been removed in v0.4.0 and are now in the separate dashboard.

### Testing Infrastructure

- **Vitest**: Fast testing with jsdom environment
- **React Testing Library**: Component testing utilities
- **Coverage**: Comprehensive test coverage tracking
- **Mock Setup**: Browser API mocking in `src/test/setup.ts`

Current test results: ✓ 19 tests passed across 2 test files

## Development Guidelines

### Environment Setup

1. **Backend Dependency**: Extension requires FaultMaven backend running
2. **Environment Configuration**: Use `.env.local` for API endpoint:
   ```bash
   VITE_API_URL=http://api.faultmaven.local:8000
   ```

### Extension Development

1. **Load Extension**: Use `.output/chrome-mv3-dev/` folder in chrome://extensions
2. **Hot Reload**: WXT provides automatic reloading during development
3. **Cross-Browser**: Test in both Chrome (`pnpm dev`) and Firefox (`pnpm dev:firefox`)

### Code Patterns

- **Path Aliases**: Use `~/*` for `src/*` and `~lib/*` for `src/lib/*`
- **TypeScript Strict**: Strict mode enabled for type safety
- **Error Handling**: Comprehensive try-catch with user-friendly messages
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

### Extension Manifest

Key permissions and features:
- **Permissions**: storage, sidePanel, activeTab, tabs, scripting
- **Host Permissions**: FaultMaven API endpoints
- **CSP**: Secure content security policy for extension pages
- **Icons**: Generated automatically from SVG sources

### API Development

When working with backend integration:
- All API functions include proper error handling
- Response types are strictly typed with TypeScript interfaces
- Session management includes automatic timeout and cleanup
- Capabilities are fetched on startup and cached in browser storage
- KB management API calls have been removed (use dashboard)

**Important Files:**
- `src/lib/capabilities.ts` - Backend capabilities detection and caching
- `src/lib/api.ts` - API client (KB functions removed in v0.4.0)
- `src/config.ts` - Configuration and environment variables
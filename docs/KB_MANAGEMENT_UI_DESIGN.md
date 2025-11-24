# Knowledge Base Management Dashboard - UI Design Document

**Version:** 2.0
**Date:** November 24, 2025
**Status:** Proposed Design
**Authors:** FaultMaven Product Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Vision & Goals](#2-vision--goals)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Information Architecture](#4-information-architecture)
5. [Core Features & UI Specifications](#5-core-features--ui-specifications)
6. [Backend API Requirements](#6-backend-api-requirements)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Success Metrics](#8-success-metrics)
9. [Open Questions](#9-open-questions)

---

## 1. Executive Summary

This document specifies the user interface design for the **FaultMaven Knowledge Base Management Dashboard**, a web application that enables teams to organize, share, and access troubleshooting documentation, runbooks, and post-mortems.

### Key Design Principles

- **Unified View:** Single interface showing all accessible documents across different scopes
- **Progressive Disclosure:** UI complexity scales with user permissions
- **Clear Ownership:** Every document has a visible owner and access scope
- **Collaboration-First:** Sharing and team access are first-class features
- **Performance-Aware:** Designed for organizations with thousands of documents

### Proposed Architecture

**Four KB Scopes:**
- 🏠 **My KB** - Personal documents owned by the user
- 👥 **Team KBs** - Documents shared within teams
- 🔗 **Shared with Me** - Documents individually shared by other users
- 🌍 **Organization KB** - Company-wide public knowledge base

**Three User Roles:**
- **Member** - Individual team member (read/write own KB, read team/org KB)
- **Team Admin** - Team administrator (manage team KB and membership)
- **System Admin** - Platform administrator (manage organization KB)

---

## 2. Vision & Goals

### Product Vision

> "Every team member has instant access to the troubleshooting knowledge they need, organized by relevance and access level, with the ability to contribute and collaborate seamlessly."

### User Goals

**As a Member, I want to:**
- Quickly find relevant runbooks and documentation
- Upload my own troubleshooting guides
- Share specific documents with teammates
- See what documentation is available across the organization

**As a Team Admin, I want to:**
- Curate high-quality team documentation
- Control access to sensitive team runbooks
- See what my team is contributing
- Promote best practices through shared documentation

**As a System Admin, I want to:**
- Maintain organization-wide documentation standards
- Ensure critical runbooks are accessible to all
- Monitor KB usage and adoption
- Manage platform access and security

### Non-Goals (Out of Scope)

- Real-time collaborative editing (future consideration)
- Version control and document history (Phase 2)
- Advanced analytics and reporting (Phase 2)
- Integration with external knowledge bases (Phase 3)
- AI-powered document suggestions (separate product feature)

---

## 3. User Roles & Permissions

### Role Definitions

| Role | Scope | Key Capabilities |
|------|-------|------------------|
| **Member** | Individual | • Full control over My KB<br>• Read access to Team & Organization KB<br>• Can share own documents with specific users |
| **Team Admin** | Team-level | • All Member capabilities<br>• Manage Team KB documents<br>• Control team membership<br>• Set document visibility within team |
| **System Admin** | Organization-wide | • All Member capabilities<br>• Manage Organization KB<br>• Create/manage teams<br>• Platform configuration |

### Permission Matrix

| Action | My KB | Team KB | Shared (I own) | Shared with Me | Organization KB |
|--------|-------|---------|----------------|----------------|-----------------|
| **View/Read** | ✅ Owner | ✅ All team members | ✅ Owner | ✅ Per permission | ✅ All users |
| **Upload/Create** | ✅ Owner | 🔶 Team Admin only | N/A | N/A | 🔴 System Admin only |
| **Edit** | ✅ Owner | 🔶 Team Admin only | ✅ Owner | 🔶 If granted write | 🔴 System Admin only |
| **Delete** | ✅ Owner | 🔶 Team Admin + Owner | ✅ Owner | ❌ No | 🔴 System Admin only |
| **Share** | ✅ Owner | 🔶 Team Admin only | ✅ Owner | ❌ No | ❌ Already public |
| **Manage Access** | N/A | 🔶 Team Admin only | ✅ Owner | ❌ No | 🔴 System Admin only |

**Legend:** ✅ Always, 🔶 Role-dependent, 🔴 Admin only, ❌ Never

---

## 4. Information Architecture

### KB Scope Hierarchy

```
Organization
├── Organization KB (Public to all)
│   └── Managed by System Admins
├── Team A
│   ├── Team A KB
│   │   └── Accessible to Team A members
│   └── Members
│       └── Individual "My KB" spaces
├── Team B
│   ├── Team B KB
│   └── Members
└── Shared Documents
    └── Cross-user/team sharing
```

### Document Data Model

```typescript
interface KBDocument {
  // Identity
  document_id: string;
  title: string;
  content: string;
  document_type: 'runbook' | 'postmortem' | 'documentation' | 'guide' | 'other';

  // Ownership & Scope
  owner_id: string;
  owner_name: string; // Denormalized for display
  scope: 'personal' | 'team' | 'organization' | 'shared';
  team_id?: string; // Required if scope='team'
  team_name?: string; // Denormalized for display

  // Access Control (if scope='shared')
  shared_with?: Array<{
    user_id: string;
    user_name: string;
    permission: 'read' | 'write';
    shared_at: string;
  }>;

  // Metadata
  category?: string;
  tags: string[];
  status: 'processing' | 'ready' | 'error';
  file_size?: number; // bytes

  // Audit
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
}
```

---

## 5. Core Features & UI Specifications

### 5.1 Main Navigation & Layout

#### Header Component

```
┌─────────────────────────────────────────────────────────────────┐
│ [FM Logo] FaultMaven Dashboard    [🔍 Search...]  [User Menu ▼] │
└─────────────────────────────────────────────────────────────────┘
```

**Elements:**
- **Logo & Title:** Left-aligned branding
- **Global Search:** Center, ~400px wide, searches across all accessible documents
- **User Menu:** Right-aligned dropdown
  - Profile settings
  - Team management (if Team Admin)
  - System settings (if System Admin)
  - Logout

#### Primary Navigation (Tabs)

```
┌─────────────────────────────────────────────────────────────────┐
│ [🏠 My KB] [👥 Team KBs] [🔗 Shared with Me] [🌍 Organization]  │
│                                              [+ New Document]     │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Active tab highlighted with primary color
- Badge counts shown on tabs (e.g., "Shared with Me (3)")
- **+ New Document** button always visible, context-aware behavior

**Tab Visibility Rules:**
- **My KB:** Always visible
- **Team KBs:** Visible if user belongs to ≥1 team
- **Shared with Me:** Visible if ≥1 document shared, or always visible with empty state
- **Organization:** Always visible (read-only for Members/Team Admins)

---

### 5.2 Document List View

This is the primary interface for all tabs. Layout adapts based on selected tab.

#### Desktop Layout (≥1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ My Knowledge Base                                    [+ New Document]│
│ Upload and manage your personal runbooks and guides                  │
├─────────────────────────────────────────────────────────────────────┤
│ [🔍 Search in My KB...]  [🏷️ All Types ▼]  [⚙️ Sort: Recent ▼]      │
├──────────────────────────┬─────────┬──────────┬───────────┬─────────┤
│ Title                    │ Type    │ Updated  │ Size      │ Actions │
├──────────────────────────┼─────────┼──────────┼───────────┼─────────┤
│ □ Database Recovery...   │ Runbook │ 2h ago   │ 45 KB     │ [⋮]     │
│ □ API Rate Limit Guide   │ Guide   │ 1d ago   │ 12 KB     │ [⋮]     │
│ □ 2024-11 Outage PM      │ PM      │ 3d ago   │ 128 KB    │ [⋮]     │
└──────────────────────────┴─────────┴──────────┴───────────┴─────────┘
```

#### Column Specifications

| Column | Width | Description | Sort Options |
|--------|-------|-------------|--------------|
| **Checkbox** | 40px | Bulk selection | N/A |
| **Title** | Flex (40%) | Document name, clickable to open | Alphabetical |
| **Type** | 100px | Document type badge | Type |
| **Updated** | 100px | Relative time (2h ago, 3d ago) | Date (newest/oldest) |
| **Size** | 80px | Human-readable file size | Size |
| **Actions** | 60px | Context menu (⋮) | N/A |

#### Context Menu (⋮) Actions

Actions shown based on document scope and user permissions:

**My KB Documents:**
- 👁️ View
- ✏️ Edit
- 🔗 Share
- 📥 Download
- 🗑️ Delete

**Team KB Documents (as Team Admin):**
- 👁️ View
- ✏️ Edit
- 👥 Manage Team Access
- 📥 Download
- 🗑️ Delete

**Team KB Documents (as Member):**
- 👁️ View
- 📥 Download

**Shared with Me (Read permission):**
- 👁️ View
- 📥 Download

**Shared with Me (Write permission):**
- 👁️ View
- ✏️ Edit
- 📥 Download

**Organization KB:**
- 👁️ View
- 📥 Download
- (+ Edit/Delete for System Admins)

#### Bulk Actions Bar

Appears when ≥1 document is selected:

```
┌─────────────────────────────────────────────────────────────────┐
│ ☑️ 3 selected  [🏷️ Add Tags]  [📁 Move to...]  [🗑️ Delete]  [✖️] │
└─────────────────────────────────────────────────────────────────┘
```

**Available for:**
- My KB only (safety first - no bulk operations on team/shared docs)

---

### 5.3 Search Interface

#### Global Search (Header)

**Behavior:**
- Searches **all accessible documents** across all scopes
- Shows results grouped by scope
- Debounced input (300ms delay)
- Keyboard shortcut: `Cmd/Ctrl + K`

**Results Modal:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Search: "database recovery"                              [✖️]    │
├─────────────────────────────────────────────────────────────────┤
│ My KB (2 results)                                                │
│   📄 Database Recovery Runbook                        2h ago     │
│   📄 DB Backup Procedures                             5d ago     │
│                                                                   │
│ Team: Engineering (3 results)                                    │
│   📄 Production DB Failover Guide                     1w ago     │
│   📄 Database Performance Tuning                      2w ago     │
│   📄 MongoDB Recovery Checklist                       1mo ago    │
│                                                                   │
│ Organization (1 result)                                          │
│   📄 Critical System Recovery Protocols               3mo ago    │
└─────────────────────────────────────────────────────────────────┘
```

#### Scoped Search (Per Tab)

**Behavior:**
- Searches only documents in current tab/scope
- Filters results inline (no modal)
- Shows match count: "Showing 5 of 127 documents"

**Search Filters:**

```
┌─────────────────────────────────────────────────────────────────┐
│ [🔍 Search...] [🏷️ Type: All ▼] [👤 Owner: All ▼] [Sort: Recent]│
└─────────────────────────────────────────────────────────────────┘
```

**Filter Options:**
- **Type:** All, Runbook, Post-Mortem, Documentation, Guide, Other
- **Owner:** All, Me, Other team members (in Team KB view)
- **Tags:** Multi-select dropdown (shows tags used in current scope)
- **Date Range:** Last 7 days, Last 30 days, Last 90 days, Custom

---

### 5.4 Document Upload Flow

#### Entry Points

1. **+ New Document** button (header)
2. **Empty state** "Upload your first document" CTA
3. **Drag & drop** anywhere on document list area

#### Upload Modal

**Phase 1: Basic Upload (MVP)**

```
┌─────────────────────────────────────────────────────────────────┐
│ Upload Document                                          [✖️]    │
├─────────────────────────────────────────────────────────────────┤
│ Upload to:  [Scope Dropdown ▼]                                  │
│                                                                   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │  📁 Click to upload or drag file here                     │   │
│ │     Supported: .md, .txt, .json, .csv, .log, .pdf        │   │
│ │     Max size: 10 MB                                       │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│ Title: [Auto-filled from filename, editable]                     │
│                                                                   │
│ Type:  [Dropdown: Runbook ▼]                                     │
│        - Runbook                                                  │
│        - Post-Mortem                                              │
│        - Documentation                                            │
│        - Guide                                                    │
│        - Other                                                    │
│                                                                   │
│ Tags:  [Input with autocomplete]                                 │
│        (e.g., "database, recovery, production")                  │
│                                                                   │
│                                   [Cancel]  [Upload Document]    │
└─────────────────────────────────────────────────────────────────┘
```

**Phase 2: Rich Editor (Future)**

Add inline markdown editor with preview:
- Split view: Editor | Preview
- Toolbar: Bold, Italic, Code, Lists, Links, Images
- Syntax highlighting for code blocks
- Real-time markdown preview

#### Scope Dropdown Behavior

**For Member:**
```
My Knowledge Base (selected by default)
```

**For Team Admin:**
```
My Knowledge Base (selected by default)
─────────────────
Team: Engineering
Team: DevOps
```

**For System Admin:**
```
My Knowledge Base (selected by default)
─────────────────
Organization KB
```

#### Upload Progress

```
┌─────────────────────────────────────────────────────────────────┐
│ Uploading database-recovery.md...                               │
│ ████████████████████░░░░░░░░░░░░░░ 65%                          │
│                                                                   │
│ Processing document... This may take a few seconds.              │
└─────────────────────────────────────────────────────────────────┘
```

**Post-Upload States:**
1. **Success:** Green toast notification "Document uploaded successfully"
2. **Error:** Red banner in modal with error message and retry option
3. **Processing:** Document appears in list with "Processing..." badge, refreshes when ready

---

### 5.5 Document Sharing Flow

#### Share Button Action

Clicking **🔗 Share** on a document (My KB only) opens the Share Modal.

#### Share Management Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ Share: "Database Recovery Runbook"                      [✖️]    │
├─────────────────────────────────────────────────────────────────┤
│ Share with people                                                │
│                                                                   │
│ [🔍 Search by name or email...]                    [Add Person]  │
│                                                                   │
│ Current Access                                                    │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ 👤 Jane Doe (jane@example.com)                            │   │
│ │    [Can Edit ▼]                            Shared 2d ago  │   │
│ │    [Remove]                                                │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ 👤 Bob Smith (bob@example.com)                            │   │
│ │    [Can View ▼]                            Shared 1w ago  │   │
│ │    [Remove]                                                │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│ 🔗 Copy Link                                                      │
│ Anyone with this link can view this document (read-only)         │
│ [Copy Link]  [Disable Link]                                      │
│                                                                   │
│                                        [Done]                     │
└─────────────────────────────────────────────────────────────────┘
```

#### User Search Dropdown

When typing in search field:

```
┌─────────────────────────────────────────────────────────────────┐
│ Search Results                                                    │
├─────────────────────────────────────────────────────────────────┤
│ 👤 Sarah Johnson                                                  │
│    sarah.johnson@example.com • Engineering Team                  │
│    [Add with View ▼]                                              │
│                                                                   │
│ 👤 John Williams                                                  │
│    john.w@example.com • DevOps Team                              │
│    [Add with View ▼]                                              │
└─────────────────────────────────────────────────────────────────┘
```

#### Permission Levels

| Level | Capabilities |
|-------|-------------|
| **Can View** | Read document content, download file, see metadata |
| **Can Edit** | All View permissions + Edit content, modify metadata |

**Notes:**
- Owner cannot change own permission (always full control)
- Cannot transfer ownership (Phase 2 feature)
- Removing all shares does not delete document

---

### 5.6 Team KB Management (Team Admins Only)

#### Team Access Control Modal

Triggered by: **👥 Manage Team Access** on Team KB documents

```
┌─────────────────────────────────────────────────────────────────┐
│ Team Access: "Production Deployment Runbook"            [✖️]    │
├─────────────────────────────────────────────────────────────────┤
│ Team: Engineering                                                │
│                                                                   │
│ Default Access                                                    │
│ ○ All team members can view and edit (default)                  │
│ ● Restrict access to specific members                            │
│                                                                   │
│ Team Members with Access                                         │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ ☑️ Jane Doe (Team Admin)                                  │   │
│ │    [Can Edit ▼]                                            │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☑️ Bob Smith                                               │   │
│ │    [Can View ▼]                                            │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ ☐ Alice Wong                                               │   │
│ │    [No Access]                                             │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│                                   [Cancel]  [Save Changes]       │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Default: All team members inherit team-level permissions
- When "Restrict access" selected: Must explicitly grant access to individuals
- Team Admins always have access (cannot be removed)

---

### 5.7 Document Viewer

#### Entry Point

Clicking document title or **👁️ View** action

#### Viewer Layout (Modal or Slide-over Panel)

**Recommendation:** Slide-over panel (keeps list context visible)

```
┌─────────────────────────┬───────────────────────────────────────┐
│ Document List           │ Database Recovery Runbook       [✖️]  │
│                         ├───────────────────────────────────────┤
│ [Search...]             │ 📄 Runbook • Updated 2h ago           │
│                         │ 👤 Jane Doe • 🏠 My KB                │
│ □ Database Recovery...  │ 🏷️ database, recovery, production     │
│ □ API Rate Limit...     │ 📥 Download  ✏️ Edit  🔗 Share         │
│ □ 2024-11 Outage PM     ├───────────────────────────────────────┤
│                         │                                       │
│                         │ # Database Recovery Runbook           │
│                         │                                       │
│                         │ ## Prerequisites                      │
│                         │ - Access to admin dashboard           │
│                         │ - Database credentials                │
│                         │                                       │
│                         │ ## Steps                              │
│                         │ 1. Verify backup availability...      │
│                         │ 2. Stop application services...       │
│                         │                                       │
│                         │ [Full rendered markdown content]      │
│                         │                                       │
└─────────────────────────┴───────────────────────────────────────┘
```

#### Viewer Features

**Header Section:**
- Document title (H1)
- Metadata row: Type • Last updated • Owner • Scope
- Tags row (clickable to filter)
- Action buttons: Download, Edit (if permitted), Share (if owner)

**Content Area:**
- Rendered markdown with syntax highlighting
- Responsive typography
- Copy code blocks button
- Anchor links for headers
- Table of contents (auto-generated for long docs)

**Footer (Future):**
- View history (who accessed when)
- Related documents
- Comments section

---

### 5.8 Empty States

High-quality empty states encourage adoption and guide users.

#### My KB - Empty State

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│                         📚                                        │
│                                                                   │
│              Start Building Your Knowledge Base                   │
│                                                                   │
│   Upload your first runbook, troubleshooting guide, or           │
│   documentation to make it accessible to your team.              │
│                                                                   │
│                    [+ Upload Document]                            │
│                                                                   │
│                                                                   │
│   💡 Tip: Markdown files work great for runbooks                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Team KBs - No Teams

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│                         👥                                        │
│                                                                   │
│                 You're Not in Any Teams Yet                       │
│                                                                   │
│   Ask your administrator to add you to a team to access          │
│   shared team documentation and runbooks.                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Team KBs - Team Has No Documents

```
┌─────────────────────────────────────────────────────────────────┐
│                         📂                                        │
│                                                                   │
│              No Team Documents Yet                                │
│                                                                   │
│   [Team Admins only]: Upload documentation for your team         │
│   [Members]: Your team hasn't uploaded any documents yet         │
│                                                                   │
│   [For Team Admins: + Upload Team Document]                      │
└─────────────────────────────────────────────────────────────────┘
```

#### Shared with Me - Empty

```
┌─────────────────────────────────────────────────────────────────┐
│                         🔗                                        │
│                                                                   │
│              No Shared Documents Yet                              │
│                                                                   │
│   When someone shares a document with you, it will               │
│   appear here.                                                    │
│                                                                   │
│   💡 You can share your own documents from My KB                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Search - No Results

```
┌─────────────────────────────────────────────────────────────────┐
│                         🔍                                        │
│                                                                   │
│                No Results Found                                   │
│                                                                   │
│   We couldn't find any documents matching "api gateway"          │
│                                                                   │
│   Try:                                                            │
│   • Checking your spelling                                       │
│   • Using different keywords                                     │
│   • Searching in a different KB scope                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5.9 Mobile Responsive Design

#### Breakpoints

- **Desktop:** ≥1024px (full table view)
- **Tablet:** 768px - 1023px (condensed table)
- **Mobile:** <768px (card view)

#### Mobile Document List (Card Layout)

```
┌─────────────────────────────────┐
│ [☰ Menu]  My KB  [🔍] [+ New]  │
├─────────────────────────────────┤
│ [🔍 Search...]    [⚙️ Filter]   │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 📄 Database Recovery...     │ │
│ │ Runbook • 2h ago            │ │
│ │ database, recovery          │ │
│ │                        [⋮] │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 📄 API Rate Limit Guide     │ │
│ │ Guide • 1d ago              │ │
│ │ api, backend                │ │
│ │                        [⋮] │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

#### Mobile Navigation

- Hamburger menu (☰) reveals:
  - Tab navigation (My KB, Team KBs, etc.)
  - User profile
  - Settings
  - Logout
- Bottom action button: **+ New Document** (floating action button)

---

## 6. Backend API Requirements

This section defines the minimum backend API surface needed to support the UI design.

### 6.1 Authentication & User Management

#### Current Status: ✅ **Exists**

```typescript
POST /api/v1/auth/dev-login
POST /api/v1/auth/logout
GET  /api/v1/users/me
```

#### New Requirements: 🔴 **Needed**

```typescript
// Get user's team memberships
GET /api/v1/users/me/teams
Response: {
  teams: Array<{
    team_id: string;
    team_name: string;
    role: 'member' | 'admin'; // User's role in this team
    member_count: number;
  }>;
}

// Get user's role information
GET /api/v1/users/me/permissions
Response: {
  is_system_admin: boolean;
  team_admin_of: string[]; // team_ids
  teams: string[]; // team_ids user belongs to
}
```

---

### 6.2 Team Management

#### Status: 🔴 **Needed** (All endpoints)

```typescript
// List all teams (system admin only)
GET /api/v1/teams
Query: ?limit=50&offset=0
Response: {
  teams: Team[];
  total: number;
}

// Create team (system admin only)
POST /api/v1/teams
Body: {
  name: string;
  description?: string;
}
Response: Team

// Get team details
GET /api/v1/teams/{team_id}
Response: Team

// Update team (team admin or system admin)
PUT /api/v1/teams/{team_id}
Body: {
  name?: string;
  description?: string;
}

// Delete team (system admin only)
DELETE /api/v1/teams/{team_id}

// Team membership management
GET    /api/v1/teams/{team_id}/members
POST   /api/v1/teams/{team_id}/members
DELETE /api/v1/teams/{team_id}/members/{user_id}

// Update member role (team admin or system admin)
PUT /api/v1/teams/{team_id}/members/{user_id}
Body: {
  role: 'member' | 'admin';
}
```

---

### 6.3 Document Management

#### 6.3.1 Personal KB (My KB)

**Current Status:** ✅ **Exists** (basic endpoints)

```typescript
GET    /api/v1/users/{user_id}/kb/documents
POST   /api/v1/users/{user_id}/kb/documents
DELETE /api/v1/users/{user_id}/kb/documents/{doc_id}
```

**New Requirements:** 🟡 **Enhancement Needed**

```typescript
// Enhanced list with filtering
GET /api/v1/users/{user_id}/kb/documents
Query: {
  search?: string;           // Full-text search
  document_type?: string;    // Filter by type
  tags?: string;             // Comma-separated
  limit?: number;            // Default 50
  offset?: number;           // Pagination
  sort?: 'updated' | 'created' | 'title';
  order?: 'asc' | 'desc';    // Default desc
}
Response: {
  documents: KBDocument[];
  total: number;
  limit: number;
  offset: number;
}

// Get single document with full details
GET /api/v1/users/{user_id}/kb/documents/{doc_id}
Response: KBDocument

// Update document
PUT /api/v1/users/{user_id}/kb/documents/{doc_id}
Body: {
  title?: string;
  content?: string;
  document_type?: string;
  category?: string;
  tags?: string[];
}

// Upload enhancement: return document immediately
POST /api/v1/users/{user_id}/kb/documents
Response: {
  document_id: string;
  status: 'processing' | 'ready';
  // ... full document once processing complete
}
```

#### 6.3.2 Team KB

**Status:** 🔴 **Needed** (All endpoints)

```typescript
// List team documents
GET /api/v1/teams/{team_id}/kb/documents
Query: {
  search?: string;
  document_type?: string;
  tags?: string;
  owner_id?: string;  // Filter by contributor
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
}
Response: {
  documents: KBDocument[];  // with team context
  total: number;
}

// Upload to team KB (team admin only)
POST /api/v1/teams/{team_id}/kb/documents
Body: FormData {
  file: File;
  title?: string;
  document_type: string;
  category?: string;
  tags?: string;
}
Response: KBDocument

// Get team document
GET /api/v1/teams/{team_id}/kb/documents/{doc_id}

// Update team document (team admin only)
PUT /api/v1/teams/{team_id}/kb/documents/{doc_id}

// Delete team document (team admin or owner)
DELETE /api/v1/teams/{team_id}/kb/documents/{doc_id}

// Document access control (team admin only)
GET /api/v1/teams/{team_id}/kb/documents/{doc_id}/access
Response: {
  default_access: boolean;  // true = all team members
  members: Array<{
    user_id: string;
    user_name: string;
    permission: 'read' | 'write';
  }>;
}

PUT /api/v1/teams/{team_id}/kb/documents/{doc_id}/access
Body: {
  default_access: boolean;
  members?: Array<{
    user_id: string;
    permission: 'read' | 'write';
  }>;
}
```

#### 6.3.3 Organization KB (Public)

**Current Status:** ✅ **Exists** (basic endpoints)

```typescript
GET    /api/v1/knowledge/documents
POST   /api/v1/knowledge/documents  // System admin only
PUT    /api/v1/knowledge/documents/{document_id}
DELETE /api/v1/knowledge/documents/{document_id}
```

**New Requirements:** 🟡 **Enhancement Needed**

Same filtering/search enhancements as Personal KB

#### 6.3.4 Shared Documents

**Status:** 🔴 **Needed** (All endpoints)

```typescript
// Share document (owner only)
POST /api/v1/kb/documents/{doc_id}/share
Body: {
  user_id: string;
  permission: 'read' | 'write';
}
Response: {
  share_id: string;
  shared_at: string;
}

// Get sharing status for a document
GET /api/v1/kb/documents/{doc_id}/shares
Response: {
  shares: Array<{
    share_id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    permission: 'read' | 'write';
    shared_at: string;
  }>;
}

// Update share permission
PUT /api/v1/kb/documents/{doc_id}/shares/{share_id}
Body: {
  permission: 'read' | 'write';
}

// Revoke share
DELETE /api/v1/kb/documents/{doc_id}/shares/{share_id}

// List documents shared WITH me
GET /api/v1/users/me/kb/shared
Query: {
  search?: string;
  document_type?: string;
  limit?: number;
  offset?: number;
}
Response: {
  documents: Array<KBDocument & {
    shared_by_id: string;
    shared_by_name: string;
    my_permission: 'read' | 'write';
    shared_at: string;
  }>;
  total: number;
}

// Generate shareable link (Phase 2)
POST /api/v1/kb/documents/{doc_id}/share/link
Response: {
  link_id: string;
  url: string;
  permission: 'read';  // Links are always read-only
  expires_at?: string;
}
```

---

### 6.4 Search

**Status:** 🔴 **Needed**

```typescript
// Global search across all accessible documents
GET /api/v1/kb/search
Query: {
  q: string;              // Search query
  scope?: 'all' | 'personal' | 'team' | 'shared' | 'organization';
  team_id?: string;       // If scope=team
  document_type?: string;
  tags?: string;
  limit?: number;         // Default 20
  offset?: number;
}
Response: {
  results: Array<{
    document: KBDocument;
    scope: string;         // 'personal', 'team', 'shared', 'organization'
    relevance_score: number;
    snippet?: string;      // Highlighted matching text
  }>;
  grouped_by_scope?: {     // Optional grouped results
    personal: KBDocument[];
    team: Record<string, KBDocument[]>;  // team_id -> docs
    shared: KBDocument[];
    organization: KBDocument[];
  };
  total: number;
}
```

---

### 6.5 Analytics & Metadata (Phase 2)

```typescript
// Document view tracking
POST /api/v1/kb/documents/{doc_id}/views

// Get document stats
GET /api/v1/kb/documents/{doc_id}/stats
Response: {
  view_count: number;
  last_viewed_at: string;
  shared_count: number;
  download_count: number;
}

// User KB usage stats
GET /api/v1/users/{user_id}/kb/stats
Response: {
  total_documents: number;
  total_size_bytes: number;
  documents_shared_by_me: number;
  documents_shared_with_me: number;
  most_viewed: KBDocument[];
}
```

---

### 6.6 User Directory (for Sharing UI)

**Status:** 🔴 **Needed**

```typescript
// Search users for sharing
GET /api/v1/users/search
Query: {
  q: string;           // Name or email
  limit?: number;      // Default 10
  exclude_me?: boolean; // Don't include requester
}
Response: {
  users: Array<{
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    teams: Array<{
      team_id: string;
      team_name: string;
    }>;
  }>;
}
```

---

### 6.7 API Summary Table

| Endpoint Category | Status | Priority | Phase |
|-------------------|--------|----------|-------|
| Auth & User Profile | ✅ Exists | - | Current |
| User Teams & Permissions | 🔴 Needed | High | 1 |
| Team Management | 🔴 Needed | High | 1 |
| Personal KB (Enhanced) | 🟡 Partial | High | 1 |
| Team KB | 🔴 Needed | High | 1 |
| Organization KB (Enhanced) | 🟡 Partial | Medium | 1 |
| Document Sharing | 🔴 Needed | High | 2 |
| Global Search | 🔴 Needed | High | 1 |
| User Directory | 🔴 Needed | Medium | 2 |
| Analytics & Stats | 🔴 Needed | Low | 2 |

---

## 7. Implementation Roadmap

### Phase 1: Foundation (4-6 weeks)

**Goal:** Make the existing UI functional with core features

**Backend Requirements:**
- ✅ Auth (existing)
- 🔴 Enhanced document list/upload/delete for Personal KB
- 🔴 Enhanced document list for Organization KB
- 🔴 Basic search within Personal/Organization scopes
- 🔴 User teams query (read-only)

**Frontend Features:**
- ✅ Existing page shells (My KB, Admin KB)
- 🆕 Functional document upload (Personal & Organization)
- 🆕 Document list with real data
- 🆕 Document viewer (read-only)
- 🆕 Document edit (in-place text editor)
- 🆕 Document delete
- 🆕 Scoped search (per tab)
- 🆕 Type and tag filtering

**Out of Scope Phase 1:**
- Team KB (no team concept yet)
- Sharing (no sharing API yet)
- Bulk operations
- Advanced editing (markdown preview)

**Success Metrics:**
- Users can upload, view, search, and delete their own documents
- Admins can manage organization-wide documents
- <2s document upload time
- Search returns results in <500ms

---

### Phase 2: Teams & Collaboration (6-8 weeks)

**Goal:** Enable team-based knowledge sharing

**Backend Requirements:**
- 🔴 Team management (CRUD)
- 🔴 Team membership management
- 🔴 Team KB document management
- 🔴 Team-based permissions
- 🔴 Document sharing (individual-to-individual)
- 🔴 "Shared with Me" endpoints
- 🔴 User directory search

**Frontend Features:**
- 🆕 Team KB tab (if user in ≥1 team)
- 🆕 Team admin: Upload to team KB
- 🆕 Team admin: Manage team members
- 🆕 Team admin: Document access control
- 🆕 Sharing modal (share personal docs)
- 🆕 "Shared with Me" tab
- 🆕 Permission indicators (Can View / Can Edit)
- 🆕 Global search across all scopes

**Success Metrics:**
- Teams can share knowledge within team scope
- Individuals can collaborate via sharing
- 80% of teams have ≥5 team documents
- 50% of users have shared ≥1 document

---

### Phase 3: Polish & Scale (4-6 weeks)

**Goal:** Refine UX and optimize for large-scale usage

**Features:**
- Rich markdown editor with preview
- Bulk operations (select multiple, bulk tag, bulk delete)
- Document version history
- Document templates
- Advanced search filters (date range, owner, file size)
- Document analytics (view count, most popular)
- Export documents (PDF, markdown)
- Keyboard shortcuts
- Mobile app (React Native, optional)

**Backend Requirements:**
- Document versioning API
- Analytics and metrics API
- Bulk operation endpoints
- Template management

**Success Metrics:**
- 90% user satisfaction score
- <1s search response time for 10k+ documents
- 5+ documents per user on average
- 30% monthly active usage rate

---

## 8. Success Metrics

### Product Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Adoption Rate** | 80% of users upload ≥1 document in first 30 days | User onboarding funnel |
| **Engagement** | 60% weekly active users | Weekly logins + document views |
| **Content Growth** | 10 documents/user average | Total documents / total users |
| **Team Collaboration** | 70% of teams have ≥5 team documents | Team KB stats |
| **Search Usage** | 50% of sessions include search | Search event tracking |
| **Sharing Adoption** | 40% of users share ≥1 document | Sharing event tracking |

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Page Load Time** | <1.5s (p95) | Real user monitoring |
| **Search Response Time** | <500ms (p95) | API response time |
| **Upload Success Rate** | >98% | Upload completion / attempts |
| **API Error Rate** | <1% | Error responses / total requests |
| **Uptime** | 99.9% | Service availability |

### User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **User Satisfaction** | >4.5/5 | In-app survey (NPS) |
| **Task Completion Rate** | >90% for core flows | User testing |
| **Support Ticket Volume** | <2% of users | Support system |
| **Feature Discovery** | 70% users aware of sharing within 60 days | Feature usage tracking |

---

## 9. Open Questions

### Product Questions

1. **Multi-Organization Support:**
   - Should users be able to belong to multiple organizations?
   - Is there a hierarchy: Organization → Teams → Members?
   - **Proposed:** Phase 3 feature, single-org for MVP

2. **Document Ownership Transfer:**
   - Can I transfer ownership of my personal documents?
   - What happens to shared access when ownership transfers?
   - **Proposed:** Not in MVP, add in Phase 2

3. **Team KB Contribution Model:**
   - Can team members upload to team KB, or only admins?
   - If members can upload, is there an approval workflow?
   - **Proposed:** Admin-only uploads for MVP, member contributions in Phase 2

4. **Document Lifecycle:**
   - Should documents have status (draft, published, archived)?
   - Can documents expire or require review?
   - **Proposed:** Phase 3 feature

5. **Notification System:**
   - Notify users when documents are shared with them?
   - Notify team admins when team docs are accessed?
   - **Proposed:** Phase 2 feature

### Technical Questions

1. **Document Storage:**
   - Where are documents stored? (S3, database, filesystem)
   - What's the strategy for large files (>10MB)?
   - **Needs:** Backend architecture decision

2. **Search Implementation:**
   - Full-text search engine? (Elasticsearch, PostgreSQL FTS)
   - Real-time indexing or batch?
   - **Needs:** Backend architecture decision

3. **File Processing:**
   - Synchronous or asynchronous upload processing?
   - Support for PDF text extraction?
   - **Proposed:** Async processing with status updates

4. **Rate Limiting:**
   - Upload limits per user/team?
   - Search rate limits?
   - **Proposed:** 100 uploads/day per user, 1000 searches/hour

5. **Data Retention:**
   - Soft delete vs hard delete?
   - Document retention policy?
   - **Proposed:** Soft delete with 30-day recovery window

### Design Questions

1. **Navigation Model:**
   - Tabs (current proposal) vs sidebar navigation?
   - Should tabs collapse on mobile?
   - **Proposed:** Tabs for desktop, hamburger menu for mobile

2. **Document Preview:**
   - Modal overlay vs slide-over panel vs new page?
   - **Proposed:** Slide-over panel (keeps context)

3. **Bulk Selection:**
   - Checkboxes visible always or on hover?
   - **Proposed:** Always visible (accessibility)

4. **Empty State Behavior:**
   - Hide empty tabs or show with empty state?
   - **Proposed:** Show all tabs with helpful empty states

---

## Appendix A: Design System

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Blue | `#2563EB` | CTAs, active states, links |
| Primary Hover | `#1D4ED8` | Button hover |
| Success Green | `#10B981` | Success messages, status |
| Warning Yellow | `#F59E0B` | Warnings, processing |
| Error Red | `#EF4444` | Errors, destructive actions |
| Gray 50 | `#F9FAFB` | Background |
| Gray 200 | `#E5E7EB` | Borders, dividers |
| Gray 700 | `#374151` | Body text |
| Gray 900 | `#111827` | Headings |

### Typography

- **Font Family:** Inter (system: -apple-system, BlinkMacSystemFont, "Segoe UI")
- **Headings:** 600-700 weight
- **Body:** 400 weight
- **Scale:** 12px, 14px, 16px, 18px, 20px, 24px, 32px

### Spacing Scale

4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px

### Component Library

**Recommendation:** Use Tailwind CSS + Headless UI (current stack)

**Key Components:**
- Button (primary, secondary, ghost, danger)
- Input (text, search, file)
- Select / Dropdown
- Modal
- Toast notification
- Badge / Tag
- Table
- Card
- Empty state

---

## Appendix B: Accessibility Requirements

### WCAG 2.1 AA Compliance

**Required Standards:**
- Color contrast ratio ≥4.5:1 for text
- Keyboard navigation for all interactive elements
- Focus indicators visible and clear
- Semantic HTML (proper heading hierarchy)
- Alt text for all images and icons
- ARIA labels where needed
- Screen reader testing (NVDA, JAWS)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open global search |
| `Cmd/Ctrl + N` | New document |
| `/` | Focus scoped search |
| `Escape` | Close modal/panel |
| `Tab` / `Shift+Tab` | Navigate elements |
| `Enter` | Activate button/link |

### Focus Management

- Trap focus within modals
- Return focus to trigger element on close
- Skip navigation links for screen readers
- Logical tab order throughout

---

## Appendix C: Security Considerations

### Authentication & Authorization

- JWT tokens with short expiration (15 min)
- Refresh token rotation
- Secure token storage (httpOnly cookies preferred over localStorage)
- Role-based access control enforced server-side
- Document-level permissions checked on every request

### Data Protection

- TLS 1.3 for all connections
- Encrypt documents at rest
- Sanitize user input (prevent XSS)
- CSRF protection on all state-changing requests
- Content Security Policy headers

### Privacy

- Document access logging (audit trail)
- User consent for analytics
- GDPR compliance (data export, right to be forgotten)
- No tracking without user consent

---

## Document Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Product Team | Initial draft based on original spec |
| 2.0 | 2025-11-24 | Product Team | Comprehensive revision with feedback integration |

---

**End of Document**

For questions or feedback on this design document, please open an issue in the repository or contact the product team.

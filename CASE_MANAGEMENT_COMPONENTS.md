# Case Management UI Components

This document describes the comprehensive set of React components created for multi-case workflow management in the FaultMaven Copilot extension.

## Overview

The case management system provides intuitive UI components that enable users to create, select, switch between, and manage multiple troubleshooting cases. All components are built with TypeScript, use Tailwind CSS for styling, and integrate seamlessly with the existing Zustand-based state management system.

## Components

### 1. CaseSelector

**Location:** `src/shared/ui/components/CaseSelector.tsx`

A dropdown interface for case selection with search and filtering capabilities.

**Features:**
- Dropdown with search functionality
- Visual indicators for case status and priority
- Keyboard navigation support (Enter to open, Escape to close)
- Loading states and error handling
- Optional "Create new case" action
- Accessibility compliant with proper ARIA labels

**Props:**
```typescript
interface CaseSelectorProps {
  className?: string;
  onCaseSelect?: (caseId: string) => void;
  disabled?: boolean;
  showCreateNew?: boolean;
}
```

**Usage:**
```tsx
<CaseSelector 
  showCreateNew={true}
  onCaseSelect={(caseId) => console.log('Selected case:', caseId)}
  className="mb-4"
/>
```

### 2. CaseManagementPanel

**Location:** `src/shared/ui/components/CaseManagementPanel.tsx`

A modal panel for creating and editing cases with full form validation.

**Features:**
- Create and edit modes
- Form validation with real-time feedback
- Tag management (add/remove up to 5 tags)
- Priority and status selection
- Delete confirmation with safety checks
- Character limits and validation
- Keyboard shortcuts (Escape to close)

**Props:**
```typescript
interface CaseManagementPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  caseToEdit?: CaseWithState | null;
  className?: string;
}
```

**Usage:**
```tsx
<CaseManagementPanel
  isOpen={showPanel}
  onClose={() => setShowPanel(false)}
  mode="create"
  caseToEdit={null}
/>
```

### 3. CaseQuickActions

**Location:** `src/shared/ui/components/CaseQuickActions.tsx`

Quick access buttons and shortcuts for common case operations.

**Features:**
- New case creation with keyboard shortcut (Ctrl/Cmd + N)
- Case switcher with keyboard shortcut (Ctrl/Cmd + K)
- Recent cases quick access
- Draft warning indicators
- Case statistics display
- Compact and full layout modes

**Props:**
```typescript
interface CaseQuickActionsProps {
  className?: string;
  onCreateCase?: () => void;
  onManageCase?: (case_: CaseWithState) => void;
  compact?: boolean;
}
```

**Usage:**
```tsx
<CaseQuickActions
  compact={true}
  onCreateCase={() => openCreatePanel()}
  onManageCase={(case_) => openEditPanel(case_)}
/>
```

### 4. CaseStatusDisplay

**Location:** `src/shared/ui/components/CaseStatusDisplay.tsx`

Displays current case information with progress indicators and metadata.

**Features:**
- Multiple layout modes (header, sidebar, card)
- Progress tracking based on message exchanges
- Real-time session duration
- Priority and status indicators
- Activity timestamps
- Tag display
- Action buttons (edit, close)

**Props:**
```typescript
interface CaseStatusDisplayProps {
  className?: string;
  layout?: 'header' | 'sidebar' | 'card';
  showProgress?: boolean;
  showActions?: boolean;
  onEdit?: (case_: CaseWithState) => void;
  onClose?: (case_: CaseWithState) => void;
}
```

**Usage:**
```tsx
<CaseStatusDisplay
  layout="header"
  showProgress={true}
  showActions={true}
  onEdit={(case_) => editCase(case_)}
/>
```

### 5. Enhanced ConversationsList

**Location:** `src/shared/ui/components/ConversationsList.tsx`

Updated to support case-based organization alongside session-based views.

**New Features:**
- Toggle between Cases and Sessions view
- Case-based grouping by status (Active, Resolved, Archived)
- Visual priority indicators
- Case selection integration
- Maintains backward compatibility

**New Props:**
```typescript
interface ConversationsListProps {
  // ... existing props
  showCases?: boolean;
  onCaseSelect?: (caseId: string) => void;
}
```

### 6. CaseProvider

**Location:** `src/shared/ui/components/CaseProvider.tsx`

Context provider for case-specific data and actions.

**Features:**
- Case-specific context with data and actions
- Draft management with auto-save
- Loading state management
- Higher-order component wrapper
- Utility components for conditional rendering
- Auto-cleanup on case switches

**Context Value:**
```typescript
interface CaseContextValue {
  activeCase: CaseWithState | null;
  messages: ConversationMessage[];
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
  draftMessage: string;
  updateDraft: (content: string) => void;
  hasUnsavedChanges: boolean;
  // ... more properties and methods
}
```

**Usage:**
```tsx
<CaseProvider>
  <YourComponents />
</CaseProvider>

// Or use the hook
function MyComponent() {
  const { activeCase, sendMessage } = useCaseContext();
  return <div>...</div>;
}
```

## State Management Integration

All components integrate with the Zustand-based app store through custom hooks:

- `useAppStore()` - Access to main store actions
- `useActiveCase()` - Current active case
- `useActiveCaseMessages()` - Messages for active case
- `useFilteredCases()` - Filtered case list
- `useHasActiveDraft()` - Draft state indicator

## Accessibility Features

All components follow WCAG 2.1 AA guidelines:

- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management
- Screen reader compatibility
- Color contrast compliance
- Semantic HTML structure

## Responsive Design

Components are designed to work across different screen sizes:

- Responsive layouts using Tailwind CSS
- Collapsible sidebars
- Mobile-friendly touch targets
- Adaptive content display

## Error Handling

Comprehensive error handling throughout:

- Graceful degradation
- User-friendly error messages
- Retry mechanisms
- Loading state indicators
- Network error handling

## Performance Optimizations

- Memoized components and hooks
- Efficient re-rendering
- Virtualized large lists (in ConversationsList)
- Debounced search inputs
- Optimistic updates

## Usage Examples

### Complete Integration

```tsx
import { CaseProvider } from './CaseProvider';
import CaseSelector from './CaseSelector';
import CaseQuickActions from './CaseQuickActions';
import CaseStatusDisplay from './CaseStatusDisplay';
import CaseManagementPanel from './CaseManagementPanel';

function App() {
  const [showPanel, setShowPanel] = useState(false);
  
  return (
    <CaseProvider>
      <div className="h-screen flex flex-col">
        {/* Header with case selector */}
        <div className="flex items-center gap-4 p-4 border-b">
          <CaseSelector className="flex-1 max-w-md" />
          <CaseQuickActions 
            compact 
            onCreateCase={() => setShowPanel(true)}
          />
        </div>
        
        {/* Main content */}
        <div className="flex-1">
          <CaseStatusDisplay layout="header" />
          {/* Your chat interface here */}
        </div>
        
        {/* Management panel */}
        <CaseManagementPanel
          isOpen={showPanel}
          onClose={() => setShowPanel(false)}
          mode="create"
        />
      </div>
    </CaseProvider>
  );
}
```

### Sidebar Layout

```tsx
<CaseProvider>
  <div className="flex h-screen">
    <div className="w-80 border-r">
      <CaseSelector className="p-4" />
      <CaseQuickActions className="px-4" />
      <CaseStatusDisplay layout="sidebar" className="p-4" />
    </div>
    <div className="flex-1">
      {/* Main content */}
    </div>
  </div>
</CaseProvider>
```

## Component File Structure

```
src/shared/ui/components/
├── CaseSelector.tsx           # Case dropdown selector
├── CaseManagementPanel.tsx    # Create/edit case modal
├── CaseQuickActions.tsx       # Quick action buttons
├── CaseStatusDisplay.tsx      # Case status information
├── CaseProvider.tsx           # Context provider
├── ConversationsList.tsx      # Enhanced with case support
└── CaseManagementExample.tsx  # Integration examples
```

## Integration with Existing Components

These components are designed to integrate seamlessly with existing components:

- **ChatWindow**: Can use CaseProvider context for case-aware messaging
- **SidePanelApp**: Can incorporate case management in sidebar
- **KnowledgeBaseView**: Can benefit from case context for relevant documents

## Next Steps

1. **Integration**: Integrate components into main `SidePanelApp.tsx`
2. **Testing**: Add unit tests for all components
3. **Documentation**: Create Storybook stories for component showcase
4. **Accessibility**: Conduct accessibility audit
5. **Performance**: Profile and optimize rendering performance

## Support and Maintenance

All components are built with maintainability in mind:

- Comprehensive TypeScript interfaces
- Clear separation of concerns
- Extensive inline documentation
- Error boundaries for fault isolation
- Consistent naming conventions

For questions or issues, refer to the component source code which includes detailed inline documentation and examples.
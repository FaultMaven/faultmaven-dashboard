# Quick Reference - Formatting Fixes

This formatting belongs to the shared chat panel, `@faultmaven/copilot-ui`,
which is developed in the faultmaven-copilot repository and consumed here at
the commit pinned in `package.json`. The dashboard renders it wherever it
mounts that panel: the case page (its conversation dock, or the Transcript tab
at narrow width) and the Investigate page.
None of the files below live in this repository.

## What Changed?

### 1. PII Tokens: Before → After

| Before | After |
|--------|-------|
| `<US_DRIVER_LICENSE>` | `[🔒 REDACTED: Driver License]` (yellow badge) |
| `<PHONE_NUMBER>` | `[🔒 REDACTED: Phone Number]` (yellow badge) |
| `<EMAIL_ADDRESS>` | `[🔒 REDACTED: Email]` (yellow badge) |
| `<IP_ADDRESS>` | `[🔒 REDACTED: IP Address]` (yellow badge) |
| `<PERSON>` | `[🔒 REDACTED: Name]` (yellow badge) |
| `<NRP>` | `[🔒 REDACTED: ID Number]` (yellow badge) |

### 2. Footnotes: Before → After

**Before:**
```
Sentence one [1]. Sentence two [2]. Sentence three [3].
Sentence four [4]. Sentence five [5]. Sentence six [6].
```

**After:**
```
Sentence one. Sentence two. Sentence three. [1]

Sentence four. Sentence five. Sentence six. [2]
```
- 75% fewer footnote markers
- Placed only at logical paragraph breaks
- Hoverable with source previews

### 3. Markdown: Before → After

**Code Blocks:**
- Before: Plain text or poorly formatted
- After: Dark theme with syntax highlighting

**Headers:**
- Before: May appear as plain text
- After: Proper h1, h2, h3 hierarchy with sizing

**Lists:**
- Before: Inconsistent formatting
- After: Proper bullets/numbers with spacing

**Tables:**
- Before: May appear as raw markdown
- After: Bordered cells with header styling

## New Components

### PIIBadge Component
```
Visual: [🔒 REDACTED: Phone Number]
Style: Yellow background, dark yellow text, lock icon
Hover: "This information has been redacted for privacy: Phone Number"
```

### Source Citation Component
```
Visual: [1]
Style: Blue superscript badge
Hover: Shows preview card with source details
Click: Opens full document (if available)
```

## Files to Review

In the faultmaven-copilot repository (the package is its `packages/copilot-ui`):

1. **Main Component:** `packages/copilot-ui/shared/ui/components/InlineSourcesRenderer.tsx`
2. **Text Processor:** `packages/copilot-ui/lib/utils/text-processor.ts`
3. **Tests:** `src/test/utils/text-processor.test.ts` (run them in that repository)

In this repository the installed copy is under
`node_modules/@faultmaven/copilot-ui/` — read-only; a change is made upstream
and adopted by moving the pin.

## How to Verify

1. Open one of your cases in the dashboard and start a conversation in its panel
2. Check for:
   - Yellow badges instead of `<TOKEN>` markers
   - Fewer [1], [2], [3] markers in text
   - Proper markdown rendering (bold, code, lists)
   - Dark code blocks with syntax highlighting
   - Hoverable source citations

## Supported PII Tokens (17 types)

- US_DRIVER_LICENSE → Driver License
- PHONE_NUMBER → Phone Number
- EMAIL_ADDRESS → Email
- CREDIT_CARD → Credit Card
- US_SSN → SSN
- US_PASSPORT → Passport
- IP_ADDRESS → IP Address
- PERSON → Name
- NRP → ID Number
- LOCATION → Location
- DATE_TIME → Date/Time
- URL → URL
- IBAN_CODE → IBAN
- US_BANK_NUMBER → Bank Account
- CRYPTO → Crypto Wallet
- MEDICAL_LICENSE → Medical License
- US_ITIN → ITIN

## Common Issues & Solutions

**Issue:** PII tokens still showing as raw text
**Solution:** Hard-reload the page, and check that `node_modules` matches the
pinned package (`pnpm install`)

**Issue:** Footnotes not removed
**Solution:** The fix lives in the package's `text-processor.ts`; check the
pinned commit includes it

**Issue:** Markdown not rendering
**Solution:** Verify ReactMarkdown plugins are loaded

## Accessibility

All components are WCAG 2.1 AA compliant:
- ✅ Sufficient color contrast
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ Descriptive tooltips
- ✅ Visual indicators (lock icons)

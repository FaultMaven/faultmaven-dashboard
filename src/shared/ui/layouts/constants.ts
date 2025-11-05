/**
 * Layout Constants
 *
 * Central configuration for navigation widths, transitions, and responsive breakpoints.
 * Phase 1 Week 1: Extract magic numbers for maintainability and responsive design foundation.
 */

/**
 * Navigation Sidebar Widths
 * Per enhanced-ui-design.md: 250px expanded ↔ 20px collapsed
 */
export const NAVIGATION_WIDTH = {
  EXPANDED: '18rem',      // 288px (Tailwind w-72)
  COLLAPSED: '4rem',      // 64px (Tailwind w-16)
  EXPANDED_MAX: '18rem',  // max-w-72
} as const;

/**
 * Transition Configuration
 * Smooth collapse/expand animation
 */
export const TRANSITION = {
  DURATION: 'duration-300',
  ALL: 'transition-all',
} as const;

/**
 * Responsive Breakpoints
 * Per enhanced-ui-design.md section 3.3
 */
export const BREAKPOINTS = {
  MOBILE_MIN: '400px',    // Minimum usable width
  MOBILE_MAX: '500px',    // Mobile optimization threshold
  TABLET: '700px',        // Tablet/small desktop threshold
} as const;

/**
 * Tailwind Responsive Classes
 * Generated from breakpoints above
 */
export const RESPONSIVE_CLASSES = {
  HIDE_ON_MOBILE: 'hidden sm:block',           // Hide below 500px
  COMPACT_ON_MOBILE: 'text-xs sm:text-sm',     // Smaller text on mobile
  STACK_ON_MOBILE: 'flex-col sm:flex-row',     // Stack vertically on mobile
} as const;

/**
 * Z-Index Layers
 * Consistent layering for overlays and modals
 */
export const Z_INDEX = {
  BASE: 'z-0',
  NAVIGATION: 'z-10',
  DROPDOWN: 'z-20',
  MODAL_BACKDROP: 'z-30',
  MODAL: 'z-40',
  TOAST: 'z-50',
} as const;

/**
 * Input Configuration
 * Unified Input Bar settings
 *
 * Note: These values are loaded from src/config.ts which reads environment variables.
 * See config.ts documentation for how to customize via VITE_* env vars.
 */
import config from '../../../config';

export const INPUT_LIMITS = {
  // Smart detection threshold: text >= this many lines is treated as data
  DATA_MODE_LINE_THRESHOLD: config.inputLimits.dataModeLinesThreshold,

  // Maximum character length for input
  MAX_QUERY_LENGTH: config.inputLimits.maxQueryLength,

  // Textarea auto-sizing bounds
  TEXTAREA_MIN_ROWS: config.inputLimits.textareaMinRows,
  TEXTAREA_MAX_ROWS: config.inputLimits.textareaMaxRows,

  // File upload limits
  MAX_FILE_SIZE: config.inputLimits.maxFileSize,
  ALLOWED_FILE_EXTENSIONS: config.inputLimits.allowedFileExtensions,
  ALLOWED_MIME_TYPES: config.inputLimits.allowedMimeTypes,
} as const;

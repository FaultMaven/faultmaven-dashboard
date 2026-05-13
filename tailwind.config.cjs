/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            'pre code': {
              backgroundColor: 'transparent',
              padding: 0,
              borderRadius: 0,
            },
          },
        },
      },

      /*
       * =============================================
       *  FaultMaven Dashboard — Charcoal Theme Tokens
       *  Shared with Copilot (ADR-003)
       *  Base: Stripe / Tailwind Slate Dark
       * =============================================
       */

      screens: {
        'xs': '400px',
        'sm': '500px',
        'md': '700px',
      },

      colors: {
        /* --- Surface Layers (3-tier elevation) --- */
        fm: {
          // Layer 0 — Deepest: sidebar, panels
          "base": "#0B1222",
          // Layer 1 — Canvas: main content background
          "canvas": "#0F172A",
          // Layer 2 — Surface: cards, sections, top/bottom bars
          "surface": "#1E293B",
          // Layer 2.5 — Surface alt: input field backgrounds
          "surface-alt": "#172033",
          // Layer 3 — Elevated: hover states, popovers
          "elevated": "#243044",

          /* --- Borders --- */
          "border": "rgba(51, 65, 85, 0.5)",
          "border-subtle": "rgba(51, 65, 85, 0.3)",
          "border-strong": "#334155",

          /* --- Text Hierarchy --- */
          "text-primary": "#F1F5F9",
          "text-secondary": "#94A3B8",
          "text-tertiary": "#64748B",

          /* --- Accent (Indigo) --- */
          "accent": "#818CF8",
          "accent-soft": "rgba(129, 140, 248, 0.1)",
          "accent-border": "rgba(129, 140, 248, 0.25)",
          "accent-hover": "rgba(129, 140, 248, 0.18)",

          /* --- Severity / Status --- */
          "critical": "#F87171",
          "critical-bg": "rgba(248, 113, 113, 0.1)",
          "critical-border": "rgba(248, 113, 113, 0.25)",

          "warning": "#FBBF24",
          "warning-bg": "rgba(251, 191, 36, 0.1)",
          "warning-border": "rgba(251, 191, 36, 0.25)",

          "success": "#34D399",
          "success-bg": "rgba(52, 211, 153, 0.1)",
          "success-border": "rgba(52, 211, 153, 0.25)",

          "info": "#60A5FA",
          "info-bg": "rgba(96, 165, 250, 0.08)",
          "info-border": "rgba(96, 165, 250, 0.2)",

          /* --- Inline Code --- */
          "code": "#CBD5E1",
          "code-bg": "rgba(148, 163, 184, 0.12)",
          "code-border": "rgba(148, 163, 184, 0.2)",

          /* --- Code Blocks --- */
          "codeblock": "#0B1120",
          "codeblock-border": "rgba(51, 65, 85, 0.5)",
          "codeblock-text": "#CBD5E1",
        },
      },

      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },

      fontSize: {
        /* Compact scale (shared with Copilot) */
        "fm-xs": ["10px", { lineHeight: "1.4" }],
        "fm-sm": ["11px", { lineHeight: "1.4" }],
        "fm-code": ["12px", { lineHeight: "1.5" }],
        "fm-body": ["13px", { lineHeight: "1.5" }],
        "fm-chat": ["14px", { lineHeight: "1.5" }],
        "fm-title": ["15px", { lineHeight: "1.4" }],
        /* Dashboard extended scale */
        "fm-subhead": ["18px", { lineHeight: "1.4" }],
        "fm-heading": ["24px", { lineHeight: "1.3" }],
        "fm-display": ["32px", { lineHeight: "1.2" }],
      },

      borderRadius: {
        "fm-card": "10px",
        "fm-btn": "6px",
        "fm-chip": "4px",
        "fm-input": "10px",
      },

      boxShadow: {
        "fm-glow": "0 4px 14px 0 rgba(99, 102, 241, 0.39)",
        "fm-card": "0 1px 3px 0 rgba(0, 0, 0, 0.2)",
      },

      backgroundImage: {
        "fm-accent-gradient": "linear-gradient(135deg, #818CF8, #6366F1)",
      },

      transitionDuration: {
        "fm-fast": "150ms",
        "fm-normal": "200ms",
        "fm-slow": "250ms",
      },

      /* ADR-003: "Candidate" visual treatment - dashed border for unreviewed AI suggestions */
      borderWidth: {
        'candidate': '2px',
      },

      keyframes: {
        "fm-fade-in": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "0.2", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
        "slide-in-from-top": {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "fm-fade-in": "fm-fade-in 200ms ease",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
        "slide-in-from-top": "slide-in-from-top 0.2s ease-out",
      },

      maxWidth: {
        "fm-content": "780px",
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

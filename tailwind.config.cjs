// tailwind.config.cjs
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      // Custom responsive breakpoints per enhanced-ui-design.md section 3.3
      screens: {
        'xs': '400px',   // Minimum usable mobile width
        'sm': '500px',   // Mobile optimization threshold
        'md': '700px',   // Tablet/small desktop threshold
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans", "sans-serif", "Apple Color Emoji", "Segoe UI Emoji"],
        // ADR-003: JetBrains Mono for code/log readability
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      // ADR-003: SRE-Native Dark Theme colors mapped from design tokens
      colors: {
        // Backgrounds
        'bg-primary': 'var(--bg-primary)',
        'bg-surface': 'var(--bg-surface)',
        'bg-elevated': 'var(--bg-elevated)',
        // Borders
        'border-default': 'var(--border-default)',
        'border-active': 'var(--border-active)',
        // Text
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        // Accents
        'accent-blue': 'var(--accent-blue)',
        'accent-green': 'var(--accent-green)',
        'accent-yellow': 'var(--accent-yellow)',
        'accent-red': 'var(--accent-red)',
        'accent-purple': 'var(--accent-purple)',
      },
      // ADR-003: Spacing scale (4px base)
      spacing: {
        'xs': 'var(--space-xs)',
        'sm': 'var(--space-sm)',
        'md': 'var(--space-md)',
        'lg': 'var(--space-lg)',
        'xl': 'var(--space-xl)',
      },
      // ADR-003: "Candidate" visual treatment - dashed border for unreviewed AI suggestions
      borderWidth: {
        'candidate': '2px',
      },
      animation: {
        'slide-in-from-top': 'slideInFromTop 0.2s ease-out',
      },
      keyframes: {
        slideInFromTop: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

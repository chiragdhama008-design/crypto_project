/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        inset: 'var(--bg-inset)',
        hoverbg: 'var(--bg-hover)',
        ink: {
          DEFAULT: 'var(--ink-primary)',
          secondary: 'var(--ink-secondary)',
          muted: 'var(--ink-muted)',
        },
        line: {
          DEFAULT: 'var(--border-hairline)',
          strong: 'var(--border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-hover)',
          ink: 'var(--accent-ink)',
          soft: 'var(--accent-soft)',
          border: 'var(--accent-border)',
        },
        signal: {
          illicit: 'var(--signal-illicit)',
          licit: 'var(--signal-licit)',
          unknown: 'var(--signal-unknown)',
          high: 'var(--signal-high)',
          medium: 'var(--signal-medium)',
          info: 'var(--signal-info)',
        },
      },
      fontFamily: {
        sans: ['"Manrope"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Manrope"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        elevated: 'var(--shadow-elevated)',
      },
    },
  },
  plugins: [],
};

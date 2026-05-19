import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{vue,ts,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Board palette — tuned for accessibility (WCAG AA on white & dark).
        board: {
          given: '#0f172a',
          entered: '#1d4ed8',
          conflict: '#b91c1c',
          selected: '#dbeafe',
          peer: '#eff6ff',
          same: '#bfdbfe',
        },
      },
      fontFamily: {
        digit: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;

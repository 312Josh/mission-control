import type { Config } from 'tailwindcss';

const withOpacity = (cssVariable: string) => `rgb(var(${cssVariable}) / <alpha-value>)`;

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Mission Control M3 dark tokens exposed via CSS variables.
        'mc-bg': withOpacity('--mc-bg-rgb'),
        'mc-bg-secondary': withOpacity('--mc-bg-secondary-rgb'),
        'mc-bg-tertiary': withOpacity('--mc-bg-tertiary-rgb'),
        'mc-border': withOpacity('--mc-border-rgb'),
        'mc-text': withOpacity('--mc-text-rgb'),
        'mc-text-secondary': withOpacity('--mc-text-secondary-rgb'),
        'mc-accent': withOpacity('--mc-accent-rgb'),
        'mc-accent-green': withOpacity('--mc-accent-green-rgb'),
        'mc-accent-yellow': withOpacity('--mc-accent-yellow-rgb'),
        'mc-accent-red': withOpacity('--mc-accent-red-rgb'),
        'mc-accent-purple': withOpacity('--mc-accent-purple-rgb'),
        'mc-accent-pink': withOpacity('--mc-accent-pink-rgb'),
        'mc-accent-cyan': withOpacity('--mc-accent-cyan-rgb'),

        // M3 semantic token aliases for future use.
        surface: withOpacity('--mc-bg-rgb'),
        'surface-container-low': withOpacity('--mc-bg-secondary-rgb'),
        'surface-container': withOpacity('--mc-bg-tertiary-rgb'),
        'surface-container-high': withOpacity('--mc-surface-high-rgb'),
        'surface-container-highest': withOpacity('--mc-surface-highest-rgb'),
        'on-surface': withOpacity('--mc-text-rgb'),
        'on-surface-variant': withOpacity('--mc-text-secondary-rgb'),
        primary: withOpacity('--mc-accent-rgb'),
        'primary-container': withOpacity('--mc-accent-cyan-rgb'),
        secondary: withOpacity('--mc-accent-purple-rgb'),
        tertiary: withOpacity('--mc-accent-green-rgb'),
        error: withOpacity('--mc-accent-red-rgb'),
        outline: withOpacity('--mc-outline-rgb'),
        'outline-variant': withOpacity('--mc-border-rgb'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

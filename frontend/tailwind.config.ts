import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'Menlo', 'monospace'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: '#22d3ee',
      },
      animation: {
        'flow-a': 'flow 2s ease-in-out infinite',
        'flow-b': 'flow 2s ease-in-out infinite 0.7s',
        'flow-c': 'flow 2s ease-in-out infinite 1.4s',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        flow: {
          '0%':   { transform: 'translateY(-4px)', opacity: '0' },
          '15%':  { opacity: '1' },
          '85%':  { opacity: '1' },
          '100%': { transform: 'translateY(44px)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

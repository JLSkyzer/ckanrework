import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          bg: '#0d0d1a',
          surface: '#12122a',
          border: 'rgba(99, 102, 241, 0.15)',
          accent: '#6366f1',
          'accent-hover': '#818cf8',
          'text-primary': '#e2e8f0',
          'text-secondary': '#94a3b8',
          'text-muted': '#64748b',
        }
      }
    }
  },
  plugins: [],
}

export default config

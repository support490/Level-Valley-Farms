/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lvf: {
          dark: '#0a0e1a',
          darker: '#060912',
          card: 'rgba(15, 23, 42, 0.6)',
          border: 'rgba(100, 160, 255, 0.15)',
          glow: 'rgba(100, 160, 255, 0.08)',
          accent: '#60a5fa',
          accent2: '#818cf8',
          success: '#34d399',
          warning: '#fbbf24',
          danger: '#f87171',
          text: '#e2e8f0',
          muted: '#94a3b8',
        }
      },
      backdropBlur: {
        glass: '20px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'glass-hover': '0 12px 40px rgba(100, 160, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      spacing: {
        13: '3.25rem',
        15: '3.75rem',
        18: '4.5rem',
        22: '5.5rem',
        68: '17rem',
      },
      scale: {
        98: '0.98',
        99: '0.99',
      },
      backdropBlur: {
        xs: '2px',
      },
      colors: {
        car: {
          bg: '#0a0d14',
          card: '#131826',
          border: '#1f293d',
          accent: '#2563eb',
          accentHover: '#1d4ed8',
          success: '#10b981',
          danger: '#ef4444',
          textMuted: '#94a3b8'
        }
      }
    },
  },
  plugins: [],
}

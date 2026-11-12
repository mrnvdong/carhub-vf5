/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: '420px',
        // Matches all CarPlay landscape viewports (including 640x360 @2x & 710x480 minus CarPlay dock)
        car: { raw: '(min-width: 560px)' },
        // Targets ultrawide/long automotive screens (e.g. 1280x480, 1920x720, 21:9 displays)
        ultrawide: { raw: '(min-width: 980px) and (min-aspect-ratio: 21/10)' },
        // Targets VinFast VF5 8-inch CarPlay landscape heights (360px - 500px)
        short: { raw: '(max-height: 500px)' },
        // Targets ultra-compact @2x CarPlay viewports (<= 400px height)
        vshort: { raw: '(max-height: 400px)' },
      },
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
      opacity: {
        12: '0.12',
        14: '0.14',
        18: '0.18',
        22: '0.22',
        35: '0.35',
        55: '0.55',
        92: '0.92',
        94: '0.94',
        96: '0.96',
        98: '0.98',
      },
      backdropBlur: {
        xs: '2px',
      },
      colors: {
        car: {
          bg: '#050507',
          card: '#131826',
          border: '#1f293d',
          accent: '#2563eb',
          accentHover: '#1d4ed8',
          success: '#10b981',
          danger: '#ef4444',
          textMuted: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
};

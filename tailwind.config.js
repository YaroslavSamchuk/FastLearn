/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#09090b',
          surface: '#121215',
          elevated: '#1a1a1f',
          popover: '#18181c',
          border: 'rgba(255, 255, 255, 0.08)',
          borderStrong: 'rgba(255, 255, 255, 0.18)',
        },
        accent: {
          signal: '#eab308',
          signalDim: 'rgba(234, 179, 8, 0.15)',
          signalBorder: 'rgba(234, 179, 8, 0.5)',
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
        ipa: ['Charis SIL', 'Doulos SIL', 'Segoe UI', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

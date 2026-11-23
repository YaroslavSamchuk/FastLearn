/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
          popover: '#16161a',
          border: 'rgba(255, 255, 255, 0.08)',
          borderStrong: 'rgba(255, 255, 255, 0.16)',
        },
        aura: {
          blue: '#3b82f6',
          purple: '#8b5cf6',
          amber: '#f59e0b',
          teal: '#14b8a6',
        },
        accent: {
          signal: '#eab308',
          signalDim: 'rgba(234, 179, 8, 0.14)',
          signalBorder: 'rgba(234, 179, 8, 0.45)',
          signalGlow: 'rgba(234, 179, 8, 0.25)',
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
        ipa: ['Charis SIL', 'Doulos SIL', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.36), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'glass-light': '0 8px 32px 0 rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.8)',
        'aura': '0 0 40px -10px rgba(234, 179, 8, 0.3)',
        'dock': '0 4px 20px -2px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
      animation: {
        'aura-pulse': 'auraPulse 8s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'spring-in': 'springIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'spring-bounce': 'springBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        auraPulse: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)', opacity: '0.35' },
          '50%': { transform: 'scale(1.15) rotate(180deg)', opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        springIn: {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        springBounce: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        }
      }
    },
  },
  plugins: [],
}

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
        asana: {
          blue: {
            DEFAULT: '#4573D2',
            light: '#E1E9F8',
            dark: '#2D4A85',
          },
          green: {
            DEFAULT: '#37A169',
            light: '#E6F4EA',
            dark: '#1C6B45',
          },
          red: {
            DEFAULT: '#E53E3E',
            light: '#FFF5F5',
            dark: '#9B2C2C',
          },
          orange: {
            DEFAULT: '#D69E2E',
            light: '#FEF9E7',
            dark: '#975A16',
          },
          coral: '#FF584A',
          mint: '#3BE8B0',
          slate: '#6A67CE',
          bg: '#F9FBFC',
          surface: '#FFFFFF',
          border: '#E8ECEF',
          text: {
            primary: '#1E293B',
            secondary: '#64748B',
            muted: '#94A3B8',
          }
        },
        primary: {
          50: '#f0f4ff',
          100: '#e1e9f8',
          500: '#4573D2',
          600: '#3D66BA',
        }
      },
      borderRadius: {
        'asana': '6px',
        'asana-lg': '12px',
      },
      boxShadow: {
        'asana-card': '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
        'asana-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      }
    },
  },
  plugins: [],
}

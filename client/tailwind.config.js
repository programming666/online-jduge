/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography'
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3b82f6', // Blue 500
          hover: '#2563eb',   // Blue 600
          light: '#60a5fa',   // Blue 400
        },
        secondary: {
          DEFAULT: '#eab308', // Yellow 500
          hover: '#ca8a04',   // Yellow 600
        },
        success: '#22c55e',   // Green 500
        warning: '#f59e0b',   // Amber 500
        error: '#ef4444',     // Red 500
        surface: {
          DEFAULT: '#ffffff',
          dark: '#1f2937',    // Gray 800
        }
      },
      boxShadow: {
        'soft': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'card': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(59, 130, 246, 0.5)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      }
    },
  },
  plugins: [typography],
}

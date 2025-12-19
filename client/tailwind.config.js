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
        primary: '#3b82f6', // Blue 500
        secondary: '#eab308', // Yellow 500
      }
    },
  },
  plugins: [typography],
}

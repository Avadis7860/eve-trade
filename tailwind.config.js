/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        streamlit: {
          bg: '#0e1117',
          secondary: '#262730',
          sidebar: '#1a1c24',
          border: '#31333f',
          text: '#fafafa',
          muted: '#808495',
          accent: '#ff4b4b',
          buy: '#4d8dff',
          sell: '#ff4d4d',
        }
      }
    },
  },
  plugins: [],
}

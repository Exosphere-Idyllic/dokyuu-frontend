/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0A0A0C',
        darkSurface: '#121215',
        neonBlue: '#3B82F6',
        neonBlueHover: '#2563EB',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}


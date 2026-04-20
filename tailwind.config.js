/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Apuntan a las variables CSS — cambian automáticamente con data-theme
        darkBg: 'var(--color-bg)',
        darkSurface: 'var(--color-surface)',
        neonBlue: 'var(--color-accent)',
        neonBlueHover: 'var(--color-accent-hover)',
        textPrimary: 'var(--color-text)',
        textMuted: 'var(--color-text-muted)',
      },
    },
  },
  plugins: [],
};
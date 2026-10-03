/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        zap: {
          50: '#eefdf3',
          100: '#d6f9e3',
          200: '#b0f1ca',
          300: '#7ae4a9',
          400: '#3ecf81',
          500: '#25D366',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d'
        }
      }
    }
  },
  plugins: []
};
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          200: '#b6dcff',
          400: '#4aa8ff',
          500: '#1e8fff',
          600: '#0b6fd6',
          700: '#0a55a0',
          900: '#082f5c',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

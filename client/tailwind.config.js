/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#101815',
          900: '#17211d',
          800: '#223029',
          700: '#314239',
        },
        ember: {
          50: '#fff7ed',
          100: '#ffedd5',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
        },
        canvas: '#f5f2ea',
      },
      boxShadow: {
        soft: '0 24px 60px -28px rgba(16, 24, 21, 0.35)',
        card: '0 14px 32px -22px rgba(16, 24, 21, 0.28)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

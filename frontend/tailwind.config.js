/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        kaafila: {
          bg: '#141615',
          surface: '#1A1D1B',
          elevated: '#222623',
          yellow: '#F3C744',
          yellowHover: '#FAD666',
          earth: '#75553C',
          earthLight: '#8E694C',
          text: '#E7E1D2',
          muted: '#A39D8E',
          border: 'rgba(243, 199, 68, 0.2)',
        },
      },
      fontFamily: {
        display: ['"Oswald"', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        amber: '0 0 30px -8px rgba(243, 199, 68, 0.22)',
        card: '0 14px 40px -15px rgba(0, 0, 0, 0.7)',
      },
    },
  },
  plugins: [],
};


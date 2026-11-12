/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        kaafila: {
          bg: '#EAF7F8',
          surface: '#FFFFFF',
          elevated: '#F4FBFB',
          offwhite: '#F4F7F8',
          aqua: '#C9E9E9',
          primary: '#50C9C1',
          'primary-hover': '#35B5AD',
          accent: '#287D80',
          royal: '#2563EB',
          text: '#17364B',
          secondary: '#3A586B',
          muted: '#647C89',
          coral: '#F3A66B',
          sand: '#F4EBDD',
          border: '#D5E8E9',
          dark: '#102B3D',
          nav: '#101820',
        },
      },
      fontFamily: {
        display: ['"Manrope"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        blue: '0 8px 24px -8px rgba(37, 99, 235, 0.16)',
        card: '0 10px 28px -14px rgba(23, 54, 75, 0.1), 0 1px 3px rgba(23, 54, 75, 0.05)',
      },
    },
  },
  plugins: [],
};

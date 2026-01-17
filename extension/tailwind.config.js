/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './entrypoints/**/*.{js,ts,jsx,tsx,html}',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#fafafa',
          secondary: '#ffffff',
          tertiary: '#f5f5f5',
        },
        border: {
          light: '#e5e5e5',
          medium: '#d4d4d4',
          dark: '#a3a3a3',
        },
        text: {
          primary: '#0a0a0a',
          secondary: '#525252',
          tertiary: '#737373',
          quaternary: '#a3a3a3',
        },
        accent: {
          blue: '#3b82f6',
          green: '#10b981',
          amber: '#f59e0b',
          red: '#ef4444',
        },
      },
      boxShadow: {
        xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
        sm: '0 1px 3px rgba(0, 0, 0, 0.06)',
        md: '0 2px 8px rgba(0, 0, 0, 0.08)',
        lg: '0 4px 16px rgba(0, 0, 0, 0.1)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 250ms ease-out',
        'slide-down': 'slideDown 250ms ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { maxHeight: '0', opacity: '0' },
          to: { maxHeight: '500px', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

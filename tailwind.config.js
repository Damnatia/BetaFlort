/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5',
        secondary: '#0EA5E9',
        surface: '#FFFFFF',
        'surface-muted': '#F8FAFC',
        'surface-app': '#F4F7FB',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        'text-primary': '#0F172A',
        'text-secondary': '#475569',
        'border-subtle': '#E2E8F0',
      },
      borderRadius: {
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        card: '1rem',
      },
      boxShadow: {
        'elevation-1': '0 1px 2px rgba(15, 23, 42, 0.08)',
        'elevation-2': '0 8px 20px rgba(15, 23, 42, 0.08)',
        'elevation-3': '0 14px 32px rgba(15, 23, 42, 0.12)',
      },
      spacing: {
        18: '4.5rem',
      },
    },
  },
  plugins: [],
};

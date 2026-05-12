/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: '#ffffff',
        'surface-dark': '#1e1e2e',
        background: '#f8f9fb',
        'background-dark': '#141420',
        primary: '#6366f1',
        'primary-hover': '#4f46e5',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        muted: '#64748b',
        border: '#e5e7eb',
        'border-dark': '#2e2e42',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
}

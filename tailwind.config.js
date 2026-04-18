/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: '#ffffff',
        'surface-dark': '#1a1a1a',
        background: '#fafafa',
        'background-dark': '#0f0f0f',
        primary: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        border: '#e5e7eb',
        'border-dark': '#374151',
      }
    },
  },
  plugins: [],
}

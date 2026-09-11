/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Chrome stays near-neutral on purpose: every bucket already carries
        // a user-chosen color, and those are the only saturated things on
        // screen. A brand accent here would be a twelfth color competing
        // with eleven that mean something.
        surface: '#ffffff',
        'surface-dark': '#181c1a',
        background: '#f3f6f2',      // faint greenbar cast, after columnar ledger paper
        'background-dark': '#101312',
        primary: '#2f4f43',         // deep ledger green, used only for controls/focus
        'primary-hover': '#243e35',
        success: '#2d6a4a',         // money set aside
        'success-light': '#63b98c',
        warning: '#a8722a',
        danger: '#b23a26',          // envelope empty or overspent
        'danger-light': '#e4705a',
        muted: '#5c6661',
        'muted-dark': '#9aa39d',
        border: '#e1e7e0',
        'border-dark': 'rgba(255,255,255,0.08)',
        rule: '#cbd4c9',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'xl': '0.375rem',
        '2xl': '0.5rem',
      },
    },
  },
  plugins: [],
}

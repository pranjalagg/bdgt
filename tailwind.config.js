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
        // with eleven that mean something -- so controls are ink, not a hue:
        // near-black on light, near-white on dark. primary/primary-hover
        // read from CSS custom properties (see app.css) so every existing
        // bg-primary/text-primary/border-primary/ring-primary usage flips
        // correctly in both themes from one definition, instead of each
        // call site needing its own dark: patch.
        surface: '#ffffff',
        'surface-dark': '#1b1d20',
        background: '#f4f5f3',
        'background-dark': '#131416',
        primary: 'rgb(var(--color-ctl) / <alpha-value>)',
        'primary-hover': 'rgb(var(--color-ctl-hover) / <alpha-value>)',
        success: '#2b7a52',         // money set aside -- the one job green has
        'success-light': '#63c592',
        warning: '#a8722a',
        danger: '#b83a26',          // envelope empty or overspent -- the one job red has
        'danger-light': '#f0836c',
        muted: '#5d625f',
        'muted-dark': '#9da2a0',
        border: '#e3e5e1',
        'border-dark': 'rgba(255,255,255,0.09)',
        rule: '#cdcfcc',
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

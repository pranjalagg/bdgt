/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  // hover: styles apply only on devices that can hover. On touch screens a
  // tapped element would otherwise keep its hover look, as if stuck.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        // iOS system surfaces and labels. Both themes' values live in
        // app.css as space-separated RGB, so one class works in light and
        // dark and <alpha-value> (bg-tint/10) keeps working.
        page: 'rgb(var(--c-page) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        fill: 'rgb(var(--c-fill) / var(--fill-alpha))',
        label: 'rgb(var(--c-label) / <alpha-value>)',
        'label-2': 'rgb(var(--c-label-2) / <alpha-value>)',
        sep: 'rgb(var(--c-sep) / var(--sep-alpha))',
        // The one colour for actions. Text in it uses textColor.tint below,
        // lighter in dark mode so it stays legible on dark cards.
        tint: 'rgb(var(--c-tint) / <alpha-value>)',
        // Meanings: green fits, set aside, kept; amber warns; red is over.
        good: 'rgb(var(--color-success) / <alpha-value>)',
        warn: 'rgb(var(--color-warning) / <alpha-value>)',
        bad: 'rgb(var(--color-danger) / <alpha-value>)',

        // Older names, kept while screens move over (removed in the cleanup).
        background: 'rgb(var(--c-page) / <alpha-value>)',
        'background-dark': '#000000',
        'surface-dark': '#1c1c1e',
        'raised-dark': '#2c2c2e',
        primary: 'rgb(var(--color-ctl) / <alpha-value>)',
        'primary-hover': 'rgb(var(--color-ctl-hover) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-light': '#63c592',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-light': '#f0836c',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        'muted-dark': '#a1a1a8',
        border: '#dedee3',
        'border-dark': '#38383a',
        rule: '#c7c7cc',
        'tile-bills': '#8d91f7',
        'tile-saved': '#7cd462',
        'tile-ink': '#0e0f11',
      },
      textColor: {
        tint: 'rgb(var(--c-tint-text) / <alpha-value>)',
        // Older screens set text in "primary": same legible text variant.
        primary: 'rgb(var(--c-tint-text) / <alpha-value>)',
      },
      fontFamily: {
        // San Francisco on Apple devices, Inter everywhere else.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Inter Variable"', 'Inter', 'system-ui', '"Segoe UI"', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', '"Inter Variable"', 'Inter', 'system-ui', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'xl': '1.25rem', // cards
        '2xl': '1.75rem', // sheets, dialogs, tiles
        card: '22px', // cards and grouped lists
        sheet: '30px', // sheet top corners
      },
    },
  },
  plugins: [],
}

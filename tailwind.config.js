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
        // Meanings: green fits, set aside and kept; amber warns; red is over.
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
      },
      textColor: {
        tint: 'rgb(var(--c-tint-text) / <alpha-value>)',
      },
      fontFamily: {
        // One token (app.css --font-sans), so the face is one line to change.
        sans: ['var(--font-sans)'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'xl': '1.25rem', // cards
        '2xl': '1.75rem', // sheets, dialogs, tiles
        card: '24px', // cards and grouped lists
        sheet: '30px', // sheet top corners
      },
    },
  },
  plugins: [],
}

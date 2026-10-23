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
        'surface-dark': '#18191c',
        background: '#f3f4f1',
        'background-dark': '#0e0f11',
        // A step above a card: inputs, chips, the safe-to-spend ring's track.
        raised: '#ecedea',
        'raised-dark': '#232428',
        primary: 'rgb(var(--color-ctl) / <alpha-value>)',
        'primary-hover': 'rgb(var(--color-ctl-hover) / <alpha-value>)',
        // Status colours follow the theme (app.css), so text set in them
        // stays legible on dark cards without a dark: variant. The -light
        // names are the dark-theme values, kept for existing dark: variants.
        success: 'rgb(var(--color-success) / <alpha-value>)', // money set aside -- the one job green has
        'success-light': '#63c592',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)', // envelope empty or overspent -- the one job red has
        'danger-light': '#f0836c',
        // Follows the theme (app.css), so a bare text-muted stays legible in
        // dark mode; muted-dark is the same dark value, kept for existing
        // dark: variants.
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        'muted-dark': '#9da2a0',
        border: '#e3e5e1',
        'border-dark': 'rgba(255,255,255,0.08)',
        rule: '#cdcfcc',
        // The dashboard's two tiles, always with dark text: bills that are
        // due (committed money) and money set aside (the same meaning green
        // has everywhere, in a tile-sized tint).
        'tile-bills': '#8d91f7',
        'tile-saved': '#7cd462',
        'tile-ink': '#0e0f11',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Variable"', '"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Large titles and hero figures, set wide (font-stretch 125%).
        display: ['"Archivo Variable"', '"IBM Plex Sans Variable"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'xl': '1.25rem', // cards
        '2xl': '1.75rem', // sheets, dialogs, tiles
      },
    },
  },
  plugins: [],
}

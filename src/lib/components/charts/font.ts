import { Chart } from 'chart.js';

// Chart labels in the app's text face (fontFamily.sans in tailwind.config.js),
// not Chart.js's default Helvetica/Arial.
Chart.defaults.font.family = '"IBM Plex Sans Variable", "IBM Plex Sans", system-ui, sans-serif';

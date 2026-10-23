import { Chart } from 'chart.js';

// Chart labels in the app's text face (fontFamily.sans in tailwind.config.js),
// not Chart.js's default Helvetica/Arial.
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Inter Variable", Inter, system-ui, sans-serif';

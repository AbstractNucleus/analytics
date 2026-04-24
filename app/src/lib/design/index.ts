// Public entry for the design system. Importing this module applies the
// CSS tokens and font-face declarations as a side effect so any consumer
// of $lib/design gets the bundled styles without a separate step.

import './tokens.css';
import './fonts.css';

export { theme, setTheme } from './theme';
export type { Theme } from './theme';

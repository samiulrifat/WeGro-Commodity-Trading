import 'i18next';
import type { en } from './en';

// Keys are checked against the English file.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}

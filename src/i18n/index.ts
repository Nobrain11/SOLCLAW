/**
 * Centralized translations.
 * Usage: t(lang, 'home.title')
 */

import type { Language, TranslationDict } from './types.js';
import { isLanguage } from './types.js';
import { en } from './en.js';
import { zh } from './zh.js';
import { es } from './es.js';

export type { Language } from './types.js';
export { isLanguage, LANGUAGES } from './types.js';

const DICTS: Record<Language, TranslationDict> = { en, zh, es };

export function t(lang: Language | null | undefined, key: string): string {
  const code: Language = lang && isLanguage(lang) ? lang : 'en';
  return DICTS[code][key] ?? DICTS.en[key] ?? key;
}

export function tb(lang: Language | null | undefined, key: string): string {
  return t(lang, key);
}

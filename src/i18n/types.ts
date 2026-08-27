/**
 * i18n types for SOL TRADE BOT
 */

export type Language = 'en' | 'zh' | 'es';

export const LANGUAGES: Language[] = ['en', 'zh', 'es'];

export function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'zh' || v === 'es';
}

/** Flat translation key → string map */
export type TranslationDict = Record<string, string>;

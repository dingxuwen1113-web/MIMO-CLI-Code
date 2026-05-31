/**
 * I18n Type Definitions
 * Internationalization types for the MIMO CLI Code project.
 */

/** All 16 supported locale codes. */
export type SupportedLocale =
  | 'en'
  | 'zh'
  | 'zh-hant'
  | 'ja'
  | 'de'
  | 'es'
  | 'fr'
  | 'tr'
  | 'uk'
  | 'af'
  | 'ko'
  | 'it'
  | 'ga'
  | 'pt'
  | 'ru'
  | 'hu';

/** Flat key-value map of translation strings (dot-path keys resolved to leaves). */
export type TranslationDict = Record<string, string>;

/** Nested translation structure as loaded from YAML files. */
export interface NestedTranslationDict {
  [key: string]: string | NestedTranslationDict;
}

/** Configuration for the i18n system. */
export interface I18nConfig {
  /** The currently active locale. */
  locale: SupportedLocale;
  /** Base directory for locale YAML files. */
  localesDir: string;
  /** Fallback locale used when a key is missing in the active locale. */
  fallbackLocale: SupportedLocale;
  /** Loaded translation dictionaries keyed by locale code. */
  translations: Partial<Record<SupportedLocale, TranslationDict>>;
}

/** Parameters for string interpolation. Values are converted to strings. */
export type InterpolationParams = Record<string, string | number | boolean>;

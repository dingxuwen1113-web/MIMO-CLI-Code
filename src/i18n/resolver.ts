/**
 * I18n Language Resolver
 * Detects the user's language from multiple sources and provides the
 * singleton `i18n` object with the `t()` translation method.
 */

import * as path from 'path';
import type { SupportedLocale, I18nConfig, InterpolationParams } from './types';
import { loadTranslations, resolveKey } from './loader';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All valid locale codes as a Set for O(1) lookups. */
const VALID_LOCALES = new Set<string>([
  'en', 'zh', 'zh-hant', 'ja', 'de', 'es', 'fr', 'tr',
  'uk', 'af', 'ko', 'it', 'ga', 'pt', 'ru', 'hu',
]);

/** Mapping of human-readable aliases / language names to locale codes. */
const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  // English
  english: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  'en-au': 'en',
  'en-ca': 'en',
  // Chinese Simplified
  chinese: 'zh',
  'zh-cn': 'zh',
  'zh-sg': 'zh',
  'zh-hans': 'zh',
  'chinese-simplified': 'zh',
  'simplified-chinese': 'zh',
  // Chinese Traditional
  'zh-tw': 'zh-hant',
  'zh-hk': 'zh-hant',
  'zh-mo': 'zh-hant',
  'chinese-traditional': 'zh-hant',
  'traditional-chinese': 'zh-hant',
  cantonese: 'zh-hant',
  // Japanese
  japanese: 'ja',
  'ja-jp': 'ja',
  // German
  deutsch: 'de',
  german: 'de',
  'de-de': 'de',
  'de-at': 'de',
  'de-ch': 'de',
  // Spanish
  'espanol': 'es',
  spanish: 'es',
  'es-es': 'es',
  'es-mx': 'es',
  'es-ar': 'es',
  // French
  'francais': 'fr',
  french: 'fr',
  'fr-fr': 'fr',
  'fr-ca': 'fr',
  'fr-be': 'fr',
  // Turkish
  turkish: 'tr',
  turkce: 'tr',
  'tr-tr': 'tr',
  // Ukrainian
  ukrainian: 'uk',
  'uk-ua': 'uk',
  // Afrikaans
  afrikaans: 'af',
  'af-za': 'af',
  // Korean
  korean: 'ko',
  'ko-kr': 'ko',
  hungguk: 'ko',
  // Italian
  italian: 'it',
  italiano: 'it',
  'it-it': 'it',
  'it-ch': 'it',
  // Irish (Gaelic)
  irish: 'ga',
  gaeilge: 'ga',
  'ga-ie': 'ga',
  gaelic: 'ga',
  // Portuguese
  portuguese: 'pt',
  'portugues': 'pt',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  // Russian
  russian: 'ru',
  'ru-ru': 'ru',
  // Hungarian
  hungarian: 'hu',
  magyar: 'hu',
  'hu-hu': 'hu',
};

// ---------------------------------------------------------------------------
// Language Detection
// ---------------------------------------------------------------------------

/**
 * Normalize a locale string to a supported locale code.
 * Handles aliases, BCP-47 tags, and language names.
 * Returns undefined if no match is found.
 */
export function normalizeLocale(input: string): SupportedLocale | undefined {
  const lower = input.trim().toLowerCase();

  // Direct match
  if (VALID_LOCALES.has(lower)) {
    return lower as SupportedLocale;
  }

  // Alias match
  if (lower in LOCALE_ALIASES) {
    return LOCALE_ALIASES[lower];
  }

  // Try prefix match (e.g., "en" from "en-AU-x-private")
  const prefix = lower.split('-')[0];
  if (VALID_LOCALES.has(prefix) && prefix !== 'zh') {
    // Avoid mapping zh-* to zh when it might be zh-hant
    return prefix as SupportedLocale;
  }

  return undefined;
}

/**
 * Detect the system locale from environment variables.
 * Checks LANG, LC_ALL, LC_MESSAGES, and LANGUAGE (in that order).
 */
function detectSystemLocale(): SupportedLocale | undefined {
  const envVars = ['LANG', 'LC_ALL', 'LC_MESSAGES', 'LANGUAGE'];

  for (const varName of envVars) {
    const value = process.env[varName];
    if (value) {
      // Extract the language portion (before the first dot or @)
      const langPart = value.split(/[.@]/)[0];
      const resolved = normalizeLocale(langPart);
      if (resolved) return resolved;
    }
  }

  return undefined;
}

/**
 * Detect the locale from the MIMO_LANGUAGE environment variable.
 */
function detectEnvLocale(): SupportedLocale | undefined {
  const envLang = process.env.MIMO_LANGUAGE;
  if (envLang) {
    return normalizeLocale(envLang);
  }
  return undefined;
}

/**
 * Resolve the locale using the priority chain:
 * 1. Explicit parameter
 * 2. MIMO_LANGUAGE environment variable
 * 3. Config file setting
 * 4. System locale (LANG, LC_ALL, etc.)
 * 5. Fallback to English
 */
export function resolveLocale(options?: {
  explicit?: string;
  configLocale?: SupportedLocale;
}): SupportedLocale {
  // 1. Explicit parameter
  if (options?.explicit) {
    const resolved = normalizeLocale(options.explicit);
    if (resolved) return resolved;
  }

  // 2. MIMO_LANGUAGE env var
  const envLocale = detectEnvLocale();
  if (envLocale) return envLocale;

  // 3. Config file
  if (options?.configLocale) {
    return options.configLocale;
  }

  // 4. System locale
  const sysLocale = detectSystemLocale();
  if (sysLocale) return sysLocale;

  // 5. Fallback
  return 'en';
}

// ---------------------------------------------------------------------------
// I18n Singleton
// ---------------------------------------------------------------------------

/**
 * Interpolate parameters into a template string.
 * Supports {name} placeholder syntax.
 * Example: interpolate("Hello, {name}!", { name: "World" }) => "Hello, World!"
 */
function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (key in params) {
      return String(params[key]);
    }
    return match; // Leave unresolved placeholders as-is
  });
}

/**
 * Create an I18n instance with the given configuration.
 */
function createI18n() {
  // Determine the locales directory: ../../locales relative to this file
  // At runtime from dist/i18n/ this resolves to the project-root/locales/
  const defaultLocalesDir = path.resolve(__dirname, '..', '..', 'locales');

  const config: I18nConfig = {
    locale: 'en',
    localesDir: defaultLocalesDir,
    fallbackLocale: 'en',
    translations: {},
  };

  /**
   * Initialize the i18n system. Must be called before using `t()`.
   * Loads translations for the resolved locale and English (fallback).
   */
  function init(options?: {
    locale?: string;
    localesDir?: string;
    configLocale?: SupportedLocale;
  }): void {
    if (options?.localesDir) {
      config.localesDir = options.localesDir;
    }

    config.locale = resolveLocale({
      explicit: options?.locale,
      configLocale: options?.configLocale,
    });

    loadTranslations(config, [config.locale]);
  }

  /**
   * Translate a key with optional interpolation parameters.
   * Falls back to the key itself if no translation is found.
   *
   * @example
   *   t('approval.choose')                        // => "Choose"
   *   t('errors.rate_limit', { retry: 30 })       // => "Rate limit reached. Retry in {retry}s."
   */
  function t(key: string, params?: InterpolationParams): string {
    const resolved = resolveKey(config, key);
    if (resolved === undefined) {
      // Return the raw key as last resort so the caller always gets a string
      return key;
    }
    return interpolate(resolved, params);
  }

  /**
   * Get the currently active locale.
   */
  function getLocale(): SupportedLocale {
    return config.locale;
  }

  /**
   * Change the active locale at runtime.
   * Loads translations for the new locale if not already loaded.
   */
  function setLocale(locale: SupportedLocale): void {
    config.locale = locale;
    loadTranslations(config, [locale]);
  }

  /**
   * Get the full i18n config (read-only snapshot).
   */
  function getConfig(): Readonly<I18nConfig> {
    return { ...config };
  }

  return { init, t, getLocale, setLocale, getConfig };
}

/** Singleton i18n instance. */
export const i18n = createI18n();

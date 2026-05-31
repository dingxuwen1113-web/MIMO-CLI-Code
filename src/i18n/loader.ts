/**
 * I18n Translation Loader
 * Loads YAML translation files from the locales/ directory and resolves
 * nested dot-path keys into a flat TranslationDict.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type {
  SupportedLocale,
  TranslationDict,
  NestedTranslationDict,
  I18nConfig,
} from './types';

/**
 * Flatten a nested translation object into dot-path keys.
 * Example: { approval: { choose: "Choose" } } => { "approval.choose": "Choose" }
 */
export function flattenTranslations(
  nested: NestedTranslationDict,
  prefix: string = '',
): TranslationDict {
  const result: TranslationDict = {};

  for (const [key, value] of Object.entries(nested)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenTranslations(value as NestedTranslationDict, fullKey));
    }
  }

  return result;
}

/**
 * Load a single YAML translation file and return a flattened TranslationDict.
 * Returns an empty dict if the file does not exist or cannot be parsed.
 */
export function loadTranslationFile(
  localesDir: string,
  locale: SupportedLocale,
): TranslationDict {
  const filePath = path.join(localesDir, `${locale}.yaml`);

  if (!fs.existsSync(filePath)) {
    console.warn(`[i18n] Translation file not found: ${filePath}`);
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.parse(raw) as NestedTranslationDict;

    if (!parsed || typeof parsed !== 'object') {
      console.warn(`[i18n] Empty or invalid translation file: ${filePath}`);
      return {};
    }

    return flattenTranslations(parsed);
  } catch (err) {
    console.error(`[i18n] Failed to parse translation file ${filePath}:`, err);
    return {};
  }
}

/**
 * Load translation files for all specified locales into the i18n config.
 * The fallback locale (English) is always loaded first.
 */
export function loadTranslations(
  config: I18nConfig,
  locales: SupportedLocale[] = [],
): I18nConfig {
  const localesToLoad = [config.fallbackLocale, ...locales];
  const seen = new Set<string>();

  for (const locale of localesToLoad) {
    if (!seen.has(locale) && !config.translations[locale]) {
      seen.add(locale);
      config.translations[locale] = loadTranslationFile(config.localesDir, locale);
    }
  }

  return config;
}

/**
 * Resolve a dot-path key from a translation dictionary.
 * Falls back to the fallback locale if the key is not found in the active locale.
 * Returns undefined if the key does not exist in either locale.
 */
export function resolveKey(
  config: I18nConfig,
  key: string,
): string | undefined {
  const localeDict = config.translations[config.locale];
  const fallbackDict = config.translations[config.fallbackLocale];

  // Try the active locale first
  if (localeDict && key in localeDict) {
    return localeDict[key];
  }

  // Fall back to the fallback locale
  if (fallbackDict && key in fallbackDict) {
    return fallbackDict[key];
  }

  return undefined;
}

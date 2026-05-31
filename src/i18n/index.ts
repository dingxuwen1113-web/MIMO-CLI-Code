/**
 * I18n Module - Internationalization for MIMO CLI Code
 *
 * Supports 16 languages with YAML-based translations, dot-path key resolution,
 * string interpolation, and automatic locale detection.
 *
 * @example
 *   import { i18n } from './i18n';
 *   i18n.init({ locale: 'zh' });
 *   console.log(i18n.t('approval.choose'));          // "选择"
 *   console.log(i18n.t('errors.rate_limit', { retry: 30 }));
 */

export { i18n, resolveLocale, normalizeLocale } from './resolver';
export { loadTranslationFile, loadTranslations, flattenTranslations, resolveKey } from './loader';
export type {
  SupportedLocale,
  TranslationDict,
  NestedTranslationDict,
  I18nConfig,
  InterpolationParams,
} from './types';

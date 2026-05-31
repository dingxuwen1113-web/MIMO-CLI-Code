export { LocaleManager, t, getLocaleManager } from './locale';
export type { Locale } from './locale';
export { default as zhCN } from './zh-CN';
export { default as enUS } from './en-US';

import { getLocaleManager } from './locale';
import zhCN from './zh-CN';
import enUS from './en-US';

/**
 * Initialize i18n system with default messages.
 * Call this once at application startup.
 */
export function initI18n(locale?: 'zh-CN' | 'en-US'): void {
  const manager = getLocaleManager();
  manager.loadMessages(zhCN);
  manager.loadMessages(enUS);
  if (locale) {
    manager.setLocale(locale);
  }
}

// ── i18n Locale Manager ──────────────────────────────

export type Locale = 'zh-CN' | 'en-US';

export class LocaleManager {
  private locale: Locale = 'zh-CN';
  private messages: Record<string, Record<Locale, string>> = {};

  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  getLocale(): Locale {
    return this.locale;
  }

  t(key: string, ...args: any[]): string {
    const entry = this.messages[key];
    if (!entry) {
      return key; // fallback: return key itself
    }
    let template = entry[this.locale] ?? entry['zh-CN'] ?? key;
    // Simple positional interpolation: {0}, {1}, ...
    if (args.length > 0) {
      for (let i = 0; i < args.length; i++) {
        template = template.replace(new RegExp(`\\{${i}\\}`, 'g'), String(args[i]));
      }
    }
    return template;
  }

  loadMessages(messages: Record<string, Record<Locale, string>>): void {
    this.messages = { ...this.messages, ...messages };
  }
}

// ── Global singleton ─────────────────────────────────

const globalManager = new LocaleManager();

/**
 * Global translate function.
 *
 * Usage:
 *   import { t } from '../i18n';
 *   console.log(t('commands.help.title')); // "命令" or "Commands"
 *   console.log(t('errors.api.429', retries)); // with interpolation
 */
export function t(key: string, ...args: any[]): string {
  return globalManager.t(key, ...args);
}

/**
 * Access the global LocaleManager instance for configuration.
 */
export function getLocaleManager(): LocaleManager {
  return globalManager;
}

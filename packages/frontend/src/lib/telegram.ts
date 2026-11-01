import { init, retrieveLaunchParams, miniApp, hapticFeedback } from '@telegram-apps/sdk';

let initialized = false;

/**
 * Initialize the Telegram SDK and return the raw initData string.
 * Returns null outside Telegram (e.g. plain browser during development).
 */
export function getInitData(): string | null {
  try {
    if (!initialized) {
      init();
      initialized = true;
    }
    const lp = retrieveLaunchParams();
    const raw = (lp as unknown as { initDataRaw?: string }).initDataRaw;
    return raw ?? null;
  } catch {
    return null;
  }
}

/** Mount the Mini App to apply the native Telegram theme. */
export function applyTelegramTheme(): void {
  try {
    if (!initialized) {
      init();
      initialized = true;
    }
    if (miniApp.mount.isAvailable()) void miniApp.mount();
  } catch {
    // Not inside Telegram — ignore.
  }
}

/** Light haptic feedback when available. */
export function haptic(): void {
  try {
    if (!initialized) {
      init();
      initialized = true;
    }
    if (hapticFeedback.impactOccurred.isAvailable()) hapticFeedback.impactOccurred('light');
  } catch {
    // ignore
  }
}

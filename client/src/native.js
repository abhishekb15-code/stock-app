// Runtime platform detection for the Capacitor native wrapper.
// Capacitor injects a global `window.Capacitor` when running inside the
// iOS/Android shell. On the plain web the global is absent → isNative() false.
export function isNative() {
  return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
}

// Apple App Store & Google Play require their own in-app purchase (15–30% cut)
// for digital subscriptions sold *inside* the app. We are a "reader" app: Pro
// is bought on the website, and the native app only unlocks it for users who
// already paid. So we must NOT show an in-app purchase / checkout flow on native.
export const canPurchaseInApp = () => !isNative();

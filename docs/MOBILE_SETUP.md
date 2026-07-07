# Mobile App (iOS + Android) — Capacitor Wrap

Stock Intel ships to the App Store and Play Store as a **thin native wrapper** around the existing web app (Capacitor). The native shell loads the live hosted site, so **one web deploy updates both web and mobile** — you only rebuild the app for icon/splash/config/native-plugin changes.

Already done in the repo:
- Capacitor installed (`@capacitor/core`, `cli`, `android`, `ios`, `status-bar`, `splash-screen`)
- `client/capacitor.config.json` — appId `com.stockintel.app`, loads `https://stock-intelligence-jttc.onrender.com`
- Reader-app compliance: in-app purchase is hidden on native (`client/src/native.js`); Pro is bought on the web.

---

## Prerequisites

| Target | You need |
|---|---|
| **Android** | [Android Studio](https://developer.android.com/studio) (any OS incl. Windows) + a JDK (bundled with Studio) |
| **iOS** | A **Mac** with **Xcode** + an Apple Developer account ($99/yr). iOS cannot be built on Windows. |

---

## One-time setup

```bash
cd client
npm install
npm run build            # produces the web bundle (fallback for offline shell)

npx cap add android      # creates client/android/  (needs Android Studio)
npx cap add ios          # creates client/ios/       (needs a Mac + Xcode)
```

If you own a domain, change `appId` in `capacitor.config.json` to your reverse-domain (e.g. `in.yourbrand.stockintel`) **before** `cap add` — it's hard to change after store submission.

---

## Run on a device / emulator

```bash
cd client
npm run cap:sync         # copies config + web assets into the native projects
npm run cap:android      # opens Android Studio → press Run ▶
npm run cap:ios          # opens Xcode (Mac) → press Run ▶
```

---

## Updating the app

- **Web/content changes** (99% of updates): just deploy the web app to Render. The native shell loads the live URL, so users get it instantly — **no app rebuild, no store review.**
- **Native changes** (app icon, splash, `capacitor.config.json`, adding a native plugin): run `npm run cap:sync`, then rebuild in Android Studio / Xcode and submit an update.

---

## App icon & splash screen

1. Put a 1024×1024 `icon.png` and a `splash.png` in `client/resources/`.
2. `npm install -D @capacitor/assets` then `npx capacitor-assets generate` — generates all icon/splash sizes for both platforms.
3. `npm run cap:sync`.

---

## Store submission checklist

**Both stores require** (you already have these):
- [ ] Privacy Policy URL → `https://<your-app>/privacy`
- [ ] In-app **account deletion** → Profile → Delete account ✓
- [ ] Terms URL → `/terms`

**Apple App Store:**
- [ ] Apple Developer Program ($99/yr)
- [ ] App icon, screenshots (per device size), description
- [ ] App Privacy "nutrition label" (declare: email, name, financial-app usage data)
- [ ] Note in review comments that Pro is a **reader-app** purchased on the website (no in-app purchase) — this is why there's no IAP.

**Google Play:**
- [ ] Play Console ($25 one-time)
- [ ] Data safety form, content rating, screenshots
- [ ] Target API level per Play's current requirement (Android Studio warns you)

---

## ⚠️ Two known caveats

1. **In-app purchase is intentionally absent on native.** Apple & Google take 15–30% and require *their* IAP for digital subscriptions sold inside an app. As a reader app, Pro is sold on the web and the app unlocks it for logged-in payers. Do **not** add a Razorpay checkout button to the native flow — it will get the app rejected. (`native.js` already enforces this.)

2. **Google Sign-In may be blocked inside the app's webview.** Google rejects OAuth in embedded webviews (`disallowed_useragent`). **Email/password sign-in works fine.** If you want Google Sign-In on mobile later, add a native Google-auth plugin or route it through the system browser (`@capacitor/browser`). Not a launch blocker — email/password covers it.

---

## Why this approach (vs React Native)

Capacitor reuses your **entire existing React app** unchanged — zero rewrite, one codebase, and web updates ship to mobile without a store review. React Native would mean rebuilding every screen natively. For a light, fast-to-market app, Capacitor is the right call.

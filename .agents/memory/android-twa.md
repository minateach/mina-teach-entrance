---
name: Android wrapper and sign-in
description: Why MINA TEACH AI uses a Trusted Web Activity and the signing association required for verified fullscreen.
---

Use a Trusted Web Activity for Android distribution so the existing web app and Clerk sign-in open in Chrome instead of an embedded WebView.

**Why:** The configured Clerk sign-in flow is not supported for an embedded WebView in this setup. A TWA reuses the existing website origin and keeps the established browser authentication path.

**How to apply:** Keep the native wrapper pointed at the current published app. After Play App Signing is configured, add its SHA-256 signing fingerprint to the TWA configuration and publish the matching Digital Asset Links JSON on that same origin. Do not claim verified fullscreen or generate a release signing key before this association is set up.

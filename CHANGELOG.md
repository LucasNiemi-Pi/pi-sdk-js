# Changelog

All notable changes to `@pinetwork/pi-sdk-js` are documented here.

## Unreleased

Releases as 2.1.0. npm's latest is `@pinetwork/pi-sdk-js@2.0.0` (2026-03-19), which exported a `PiSdkBase` class that authenticated through `connect()` and posted payment callbacks to routes on the consuming app's own backend, plus the `PiUser` and `PaymentData` types. This release replaces it with a typed wrapper over `window.Pi`, so the package and the `pi-sdk.js` script tag expose the same methods with the same signatures. The changes below are breaking despite the minor version bump: no release went out between 2.0.0 and this one.

* ⚠️ Replace `PiSdkBase` with `loadPi(options)`, which resolves with an initialized instance, and the `Pi` class behind it
* ⚠️ Replace `connect()` with `authenticate(scopes, onIncompletePaymentFound)`, Pi's own signature
* ⚠️ Take Pi's callbacks in `createPayment(paymentData, callbacks)` and return the payment handle
* ⚠️ Remove the backend plumbing: `paymentBasePath`, `checkPaymentBasePath()`, `postToServer()` and the five statics that posted to your routes
  - `onReadyForServerApproval`, `onReadyForServerCompletion`, `onCancel`, `onError` and `onIncompletePaymentFound` are gone. Call your own backend from `createPayment`'s callbacks instead; the same routes still work.
* ⚠️ Remove `initializePiSdkBase()`, whose body was empty
* ⚠️ Remove the `onConnection` callback; `authenticate()` resolves once the session exists
* ⚠️ Remove the remaining `PiSdkBase` statics: the session (`user`, `connected`, `accessToken`), the accessors `get_connected()` and `get_user()`, the logging helpers (`log`, `error`, `logPrefix`), `version` and `connectMutex`
  - `authenticate()` resolves with the access token and user, so hold them yourself rather than reading them off the class.
* ⚠️ Reshape the `PiUser` type to Pi's own user, keyed on `uid` with scopes under `credentials`; the name is unchanged but no field of the old shape survives
* ⚠️ Stop assigning `window.PiSdkBase` on import; the package installs no global of its own
* Load `pi-sdk.js` automatically, so a script tag is no longer required
  - An existing `window.Pi` or script tag is reused, matching on the URL without its query string so a cache-buster still counts. Pass `{ url }` to change the source, or `{ inject: false }` to opt out.
* Add `init()`, Pi's own initializer, and `load()` for fetching `pi-sdk.js` without initializing
  - `loadPi()` with no options loads without initializing, which is what signing in from an ordinary browser needs.
* Add `signIn()`, which signs a user in from any browser rather than only inside Pi Browser
* Add `Ads.showAd()`, `Ads.isAdReady()` and `Ads.requestAd()`
* Add `nativeFeaturesList()`, `openShareDialog()`, `openUrlInSystemBrowser()`, `copyText()`, `openConversation()` and `requestPermission()`
* Add `PiSdkError`, carrying `PI_SDK_NOT_LOADED`, `NOT_INITIALIZED` or `ALREADY_INITIALIZED`; failures raised by Pi itself pass through untouched
* Point `types` and the `exports` map at the bundled declarations, which 2.0.0 shipped without advertising
* Declare `engines` for Node 18 and up, and ship `CHANGELOG.md` with the package
* Ship types for every method the Pi documentation covers
  - `init()` takes Pi's version-discriminated options, so `sandbox` is available on `version: "2.0"` and absent on `"3.0"`.
  - `PaymentData` mirrors the platform's type, which carries an optional `tokenCanonical` for token payments.
* Point the documentation links at developers.minepi.com; 2.0.0 linked developer.minepi.com, whose certificate expired in 2023

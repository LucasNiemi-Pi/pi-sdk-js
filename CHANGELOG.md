# Changelog

All notable changes to `@pinetwork/pi-sdk-js` are documented here.

## Unreleased

Not released yet. npm's latest is `pi-sdk-js@2.0.0` (2026-03-19), which exported `PiSdkBase`
and the `PiUser` and `PaymentData` types.

* ⚠️ Rename the package to `@pinetwork/pi-sdk-js`, the name it publishes under
  - Update the dependency key and any `import … from 'pi-sdk-js'` specifiers.
* ⚠️ Rename `connect()` to `authenticate()`, and replace `get_connected()` and `get_user()` with the `connected` and `user` getters
* ⚠️ `PiUser.uid` is now `PiUser.user_uid`
  - Pi's own `window.Pi.authenticate()` still returns `uid`; the remap happens once at this SDK's boundary.
* ⚠️ `postToServer` sends `payment_id` and `transaction_id`, not `paymentId` and `transactionId`
  - Affects every callback that posts to your backend, so its route handlers must accept the new names.
  - `accessToken` and `error` are unchanged.
* Add `PiSdkOptions.scopes`, the scopes `authenticate()` asks Pi to consent to
  - Defaults to `["payments", "username"]`. An app that pays users must add `wallet_address`, or A2U `create` is refused with `missing_scope`.
  - `authenticate()` re-authenticates rather than serving a cached session when the configured scopes are wider than what Pi granted.
* Export `PiPaymentDto`, pin the dependencies, and fill in the publish metadata
  - The type already appeared in the `onError` and `onIncompletePaymentFound` signatures, so callers were handed a value they could not name.
  - Declares `engines` for Node 18 and up, and ships `CHANGELOG.md`.
* Point the documentation links at docs.minepi.com
* Export `PiSdkError`, and the `PiAuthResponse`, `PiSdkErrorCode` and `PiSdkOptions` types

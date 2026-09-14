# Pi Network JS SDK – Community Developer Guide

This package provides a fully-typed, modern ES module interface to the
Pi Network protocol for browser or web-app integrations. It is
intended for developers building applications that use the Pi browser
extension or the `window.Pi` global API, and wish to use TypeScript or
class-based control.
It is part of the "Ten Minutes to Transactions" effort described in this
[video](https://www.youtube.com/watch?v=cIFqf1Z5pRM&t=35s).

**This package only contains the front end interface for initiating and
completing Pi transactions. It does not include back end support and
will not operate without it.** Pair it with one of the Pi back end SDKs; the
[Official Pi SDK Docs](https://docs.minepi.com/) cover which are available.

---

## 🚀 Quick Start

1. **Install with yarn or npm**
   ```sh
   yarn add @pinetwork/pi-sdk-js
   # or
   npm install @pinetwork/pi-sdk-js
   ```
2. **Ensure the global Pi SDK (`window.Pi`) is available in your HTML**
   ```html
   <script src="https://sdk.minepi.com/pi-sdk.js"></script>
   ```
3. **Import and use the SDK in your project:**

   ```ts
   import { PiSdkBase, type PaymentData } from '@pinetwork/pi-sdk-js';

   const payment: PaymentData = {
     amount: 1,
     memo: 'Demo',
     metadata: { productId: 42 },
   };
   const pi = new PiSdkBase({
     paymentBasePath: '/api/pi_payment',
     // Add 'wallet_address' if your app pays users (A2U).
     scopes: ['payments', 'username'],
   });
   const { user } = await pi.authenticate();

   console.log(user);
   pi.createPayment(payment);
   ```

4. **Provide back end transaction support in your app:**
   as described in the [Official Pi SDK Docs](https://docs.minepi.com/).

---

## 📦 API Overview

### Classes and Types

#### **`PiSdkBase` (Class)**
Core interface to Pi Network via the browser SDK. Example usage:
- **`authenticate()`** – Initiates authentication and session handshake. Should be called on user intent (or mount).
- **`createPayment(paymentData)`** – Begins a payment operation. All server callbacks are handled automatically via Pi's callback protocol.
- **Constructor options**:
  - `paymentBasePath: string` – Sets the application route prefix used by payment callbacks.
  - `scopes: string[]` – Scopes to request from Pi. Defaults to `['payments', 'username']`.
- **Static helpers**:
  - `PiSdkBase.user: PiUser | null` – Current user after `.authenticate()`
  - `PiSdkBase.connected: boolean` – Is SDK authenticated/connected?
  - `PiSdkBase.accessToken: string | null` – Latest session or payment JWT

#### **`PiUser` (Type)**
Represents an authenticated Pi user as `{ user_uid: string, username: string }`.

#### **`PaymentData` (Type)**
```ts
interface PaymentData {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}
```
---

## 🔑 Key Details
- **ESM Only**: Use `import { ... } from '@pinetwork/pi-sdk-js'`; no CommonJS support.
- **Depends on the global `window.Pi`**: The SDK does NOT bundle or polyfill the Pi Network global; you must include the Pi SDK `<script>` yourself.
- **Callbacks & Events**: Payment lifecycle events (`approve`, `complete`, `cancel`, `error`, and `incomplete`) are forwarded to the configured payment base path.
- **Scopes**: `authenticate()` requests `['payments', 'username']` unless you configure `scopes`. Paying a user (A2U) additionally requires `wallet_address` — without it the platform rejects the payout with `missing_scope`. Widening `scopes` after a session exists re-prompts the user rather than reusing the narrower token.
- **Incomplete payments**: Authentication automatically forwards incomplete payments to the backend `incomplete` route for recovery. A failing incomplete recovery rejects authentication with `PiSdkError`.
- **Errors**: Initialization, authentication, validation, and backend failures throw `PiSdkError` with a stable `code` and optional `cause`. Lifecycle callback failures also throw instead of being swallowed.
- **No React dependency.**

```ts
import { PiSdkBase, PiSdkError } from '@pinetwork/pi-sdk-js';

try {
  await new PiSdkBase().authenticate();
} catch (error) {
  if (error instanceof PiSdkError) {
    console.error(error.code, error.cause);
  }
}
```

---

## ❓ FAQ

### How do I mock `window.Pi` for testing/development?
Assign a stub to `window.Pi` with mock methods (see your test runner for examples). No real payments or network calls will be made.

### What is required to run in Node.js?
This package is **intended for browsers**; headless use requires you to polyfill `window` and `window.Pi`.

### Where are user roles or advanced Pi features?
See the complete API in source. Most advanced features are mapped, but basics are exposed as above for typical dApps.

---

## 📚 Further Resources
- [Official Pi SDK Docs](https://docs.minepi.com/)
- [Pi SDK JavaScript API Reference](https://docs.minepi.com/api-reference/SdkReference)

For advanced integration patterns, see the
[pi-sdk-react](https://github.com/pi-apps/pi-sdk-react) package or
your framework's best practices.

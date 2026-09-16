# Pi Network JS SDK

Typed ES module access to the Pi Network browser SDK. It exposes the same methods, with the same signatures, as the `window.Pi` global loaded from `pi-sdk.js` — the package adds TypeScript types and loads the script for you, and nothing else.

> **⚠️ 2.1.0 is not compatible with 2.0.0.** The previous release exposed a `PiSdkBase` class that posted payment lifecycle callbacks to routes on your own backend. That layer is gone. Payment callbacks are now yours to handle, exactly as they are with the script tag. See the migration notes below.

---

## Install

```sh
yarn add @pinetwork/pi-sdk-js
# or
npm install @pinetwork/pi-sdk-js
```

No script tag required — `loadPi()` fetches `https://sdk.minepi.com/pi-sdk.js` for you. If the page already carries the tag, it is reused.

## Quick start

```ts
import { loadPi } from '@pinetwork/pi-sdk-js';

const pi = await loadPi({ version: '2.0' });

const { accessToken, user } = await pi.authenticate(
  ['payments', 'username'],
  (payment) => console.log('incomplete payment', payment.identifier),
);

pi.createPayment(
  { amount: 1, memo: 'Demo', metadata: { productId: 42 } },
  {
    onReadyForServerApproval: (paymentId) => approveOnYourServer(paymentId, accessToken),
    onReadyForServerCompletion: (paymentId, txid) => completeOnYourServer(paymentId, txid),
    onCancel: (paymentId) => console.log('cancelled', paymentId),
    onError: (error) => console.error(error),
  },
);
```

Send the access token to your own backend and verify it against `GET /v2/me`. The user object is for presentation only — never treat it as proof of identity.

### Starting up

`loadPi(options)` loads `pi-sdk.js` and initializes it, resolving with a ready instance — so you can never hold one that is not initialized. For code moving off the script tag, the `Pi` class exposes Pi's own `init()`:

```ts
import { Pi } from '@pinetwork/pi-sdk-js';

const pi = new Pi();
await pi.init({ version: '2.0' });
```

Signing in from an ordinary browser needs no initialization, so call `loadPi()` with no options. `init()` talks to the Pi Browser host, so on an ordinary page it does pointless work and logs a `postMessage` origin error to the console.

```ts
const pi = await loadPi();
pi.signIn({ clientId: 'abc', redirectUri: 'https://app.example.com/callback' });
```

Initializing twice with different options throws rather than quietly keeping the first set, because the underlying SDK initializes only once per page.

The second constructor argument controls how the script is fetched:

```ts
new Pi({ version: '2.0' }, { url: 'https://cdn.example.com/pi-sdk.js' });
new Pi({ version: '2.0' }, { inject: false }); // you supply the script tag
```

`sandbox` is accepted on `version: '2.0'` for compatibility with existing script-tag code, but the SDK detects sandbox mode on its own and does not read the flag.

## Methods

Every method below delegates to its `window.Pi` counterpart with identical arguments. Use `loadPi()` and they are all safe to call; on a `Pi` you constructed yourself, everything except `signIn` needs `init()` first.

| Method | Purpose |
| --- | --- |
| `init(options)` | Initialize the SDK. `loadPi(options)` calls this for you. |
| `load()` | Load `pi-sdk.js` without initializing. Only `signIn` works before `init()`. |
| `authenticate(scopes, onIncompletePaymentFound)` | Sign the user in inside Pi Browser and resolve with their access token. |
| `createPayment(paymentData, callbacks)` | Start a user-to-app payment. |
| `signIn(options)` | Sign in with Pi from any browser, by OAuth redirect. |
| `Ads.showAd(type)` | Display an interstitial or rewarded ad. |
| `Ads.isAdReady(type)` | Report whether an ad of that type is loaded. |
| `Ads.requestAd(type)` | Ask for a new ad to be loaded. |
| `nativeFeaturesList()` | List the native features this Pi Browser supports. |
| `openShareDialog(title, message)` | Open the operating system share sheet. |
| `openUrlInSystemBrowser(url)` | Open a URL outside Pi Browser. |
| `copyText(text)` | Copy text to the device clipboard. |
| `openConversation(conversationId)` | Open a Pi chat conversation. |
| `requestPermission(permission)` | Ask the user for a native permission. |

`loadPi` rejects if the script cannot be loaded or `init()` fails, so a resolved instance is always usable.

### `authenticate` and `signIn` are different doors

`authenticate` talks to the Pi Browser host and resolves with the token. It only works inside Pi Browser — and outside it the promise never settles rather than rejecting, because the platform waits for the consent prompt without a timeout. Do not rely on it failing.

`signIn` redirects the whole page to Pi's OAuth server and returns nothing; the token comes back in the URL fragment of your `redirectUri`. It works in any browser, which is what makes it the option for an ordinary website.

## Errors

Failures raised by the Pi SDK itself pass through untouched. The wrapper throws `PiSdkError`, carrying a `code`, only for problems of its own:

| Code | Raised when |
| --- | --- |
| `PI_SDK_NOT_LOADED` | The script could not be loaded, or a method ran before it was. |
| `NOT_INITIALIZED` | A method needing initialization ran before `init()`. |
| `ALREADY_INITIALIZED` | `init()` was called again with different options. |

```ts
import { loadPi, PiSdkError } from '@pinetwork/pi-sdk-js';

try {
  await loadPi({ version: '2.0' });
} catch (error) {
  if (error instanceof PiSdkError) console.error(error.code);
}
```

## Migrating from 2.0.0

| 2.0.0 | 2.1.0 |
| --- | --- |
| `new PiSdkBase({ paymentBasePath, scopes })` | `await loadPi({ version: '2.0' })` |
| `pi.authenticate()` | `pi.authenticate(scopes, onIncompletePaymentFound)` |
| `pi.createPayment(data)` | `pi.createPayment(data, callbacks)` |
| `user.user_uid` | `user.uid` |
| Callbacks posted to `paymentBasePath` | You call your own backend from the callbacks |

The approve, complete, cancel, error and incomplete requests the old release sent for you are now yours to make. Your existing backend routes still work — call them from the matching callback. A Pi backend SDK such as [`@pinetwork/pi-sdk-express`](https://www.npmjs.com/package/@pinetwork/pi-sdk-express) still serves that half of the integration.

## Key details

- **ESM only.** There is no CommonJS build.
- **Browser only.** `loadPi` rejects with `PI_SDK_NOT_LOADED` outside a browser.
- **No React dependency.** React bindings live in `@pinetwork/pi-sdk-react`.
- **Backend required for payments.** Approval and completion happen on your server, using your API key, which must never reach the browser.
- **Approval and completion callbacks can fire more than once** while the payment timer runs, so make them idempotent.
- **The payment object handed to your callbacks comes from the browser**, so never let your backend act on its `amount` or `status`. Send the `identifier` and read the payment back from the Platform API server-side.

## Further reading

- [Pi Developer Docs](https://developers.minepi.com/docs)
- [Client SDK reference](https://developers.minepi.com/docs/api-reference/SdkReference)
- [Pi Sign-in guide](https://developers.minepi.com/docs/use-native-features/PiSignIn)

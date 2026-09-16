# Pi SDK with Vite

A minimal app showing how `@pinetwork/pi-sdk-js` is used, and a check that the package resolves and builds under a real bundler.

```sh
yarn --cwd ../.. build   # the example installs the package from source
yarn install
yarn dev
```

Sign-in runs in any browser. Authentication and payments only work inside Pi Browser, against a development URL registered in the Developer Portal, so open the app through your app's Sandbox URL to try them.

The payment callbacks here only write to the page. In a real app each one calls your own backend, which holds your API key and talks to the Pi Platform API.

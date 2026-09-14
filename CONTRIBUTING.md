# Contributing

Thanks for your interest in `@pinetwork/pi-sdk-js`.

## Getting set up

Node 20.19 or newer, and yarn. That is higher than the `engines` floor in `package.json`:
`engines` is the promise to consumers, who install only `dist/` and `async-mutex` and are fine
on Node 18, while `jsdom` in the test toolchain needs 20.19. CI covers 20 and 22.

```sh
yarn install
yarn test --run     # vitest; drop --run to watch
yarn typecheck      # tsc --noEmit
yarn build          # vite build, writes dist/
```

`dist/` is a build artifact and is not committed. CI builds it, and `prepublishOnly`
rebuilds it before anything is published.

## Making a change

Every change needs a test that fails without it. Tests live beside the source they cover,
as `*.test.ts`.

Keep the public surface deliberate: anything exported from `src/index.ts` is a promise to
consumers, and widening it is a decision rather than a detail. The layout and the reasoning
behind it are in [ARCHITECTURE.md](./ARCHITECTURE.md).

Add a bullet to [CHANGELOG.md](./CHANGELOG.md) under `Unreleased` describing the change from
a consumer's point of view — one line, with a link to the pull request. Mark anything that
breaks an existing integration.

## Releasing

Set the version in `package.json`, land it, then push a matching `v<version>` tag. The publish
workflow refuses to run if the tag and the manifest disagree.

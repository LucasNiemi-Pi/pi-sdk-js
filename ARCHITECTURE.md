# js-base Architecture

## Philosophy
- Aligned with modern JS/TS best practices: ESM-only, no CJS, tree-shakable, colocated tests
- Transparent, explicit named exports for all API surface
- Designed as the strict TypeScript/ESM bridge package between the browser Pi SDK (global Pi) and higher-level packages (like React or SSR integrations)

## Structure
- **Source:** `/src/`
- **Tests:** Colocated `*.test.ts` files
- **Entry:** `src/index.ts` re-exports all public APIs
- **Build:** Vite builds ESM into `/dist/` with type declarations

## Exports
- `PiSdkBase` – Main API class
- Types – `PiUser`, `PaymentData`, etc.

## Testing
- [Vitest](https://vitest.dev/) is used for all unit and integration testing
- Each module/function should be tested close to its implementation

## Integration:
- Consuming packages must support ESM. For Legacy/Node.js CJS, consumers should use import assertions with dynamic import.

## Related Files
- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)


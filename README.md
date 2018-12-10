# OAuth2 Spike

**This SDK is stubbed out with a build but does not do anything yet.**

## Developing

See the scripts section of [package.json](./package.json).

- install with `npm i`
- build artifacts with `npm run build`
- test with `npm t`
- git hooks
  - format on commit with Prettier
  - `npm run validate` prior to pushing

Architecture decisions are documented at [docs/adrs](./docs/adrs).

## Usage Examples

See [examples](./examples/).

- [cra](./examples/cra) - Consume the library from a standard React app (i.e. one created with create-react-app)
- [cra-ts](./examples/cra-ts) - Consume the library from a TypeScript project (also created with create-react-app)
- [no-build](./examples/no-build) - Consume the library via a script tag

# nfl-pbp

## Development scripts

- `npm run lint` – run ESLint (TypeScript + Prettier integration) across `src/`
- `npm run lint:fix` – run ESLint with auto-fix enabled
- `npm run format` – format the entire repo with Prettier
- `npm run format:check` – verify files are already formatted

The project uses `ts-node` for running TypeScript entrypoints (see `npm run pipeline`).

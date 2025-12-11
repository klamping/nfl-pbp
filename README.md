# nfl-pbp

## Setup

1) Install Node deps: `npm install`
2) Install Python deps (recommend a virtualenv): `pip install -r requirements.txt`

## Development scripts

- `npm run lint` – run ESLint (TypeScript + Prettier integration) across `src/`
- `npm run lint:fix` – run ESLint with auto-fix enabled
- `npm run format` – format the entire repo with Prettier
- `npm run format:check` – verify files are already formatted

The project uses `ts-node` for running TypeScript entrypoints (see `npm run pipeline`).

## Model notes

- The pipeline writes artifacts to `data/model_runs/`.
- Evaluation appends run history to `data/model_runs/history/metrics_history.jsonl` and CSV. Set `DEMO_RUN_ID` to tag runs (defaults to timestamp).
- The model regresses a margin (score differential), not a binary outcome. Key metrics:
  - `mae` – mean absolute error between predicted and actual margins (lower is better); compare to `baseline_mae` (predicting the mean margin).
  - `rmse` – root mean squared error (lower is better); compare to `baseline_rmse`.
  - `bias` – average signed error (predicted - actual); near zero is better.
  - `r2` – variance explained; closer to 1 is better; can be negative if worse than baseline.
- Render metrics history:
  - `npm run pipeline -- --scenario report:metrics-history` to pretty-print the history table and summary from `data/model_runs/history/metrics_history.jsonl`.

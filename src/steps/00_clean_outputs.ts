import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const MODEL_RUNS_DIR = path.join(DATA_DIR, 'model_runs');
const COLLATED_CURRENT_DIR = path.join(DATA_DIR, 'collated', 'current');
const TEAM_HISTORY_DIR = path.join(DATA_DIR, 'team_history');
const DERIVED_STATS_DIR = path.join(DATA_DIR, 'derived_stats');
const CURRENT_SEASON = (process.env.CURRENT_SEASON ?? new Date().getFullYear()).toString();

function removePath(target: string): void {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
  console.info(`Removed ${target}`);
}

export function cleanOutputs(): void {
  // Model run artifacts
  [
    path.join(MODEL_RUNS_DIR, 'predictions.json'),
    path.join(MODEL_RUNS_DIR, 'predictions.csv'),
    path.join(MODEL_RUNS_DIR, 'predictions_with_outcomes.json'),
    path.join(MODEL_RUNS_DIR, 'metrics.json'),
  ].forEach(removePath);

  // Current-season derived artifacts to force rebuild with fresh stats.
  removePath(COLLATED_CURRENT_DIR);
  removePath(path.join(TEAM_HISTORY_DIR, CURRENT_SEASON));
  removePath(path.join(DERIVED_STATS_DIR, CURRENT_SEASON));
}

if (require.main === module) {
  cleanOutputs();
}

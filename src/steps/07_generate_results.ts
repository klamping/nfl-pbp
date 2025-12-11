import fs from 'node:fs';
import path from 'node:path';

interface PredictionRow {
  game_id: string;
  guess: number;
  predicted_margin: number;
}

interface PredictionWithOutcome extends PredictionRow {
  actual_margin: number;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'model_runs');
const PREDICTIONS_JSON = path.join(DATA_DIR, 'predictions.json');
const RESULTS_JSON = path.join(DATA_DIR, 'predictions_with_outcomes.json');
const RESULTS_CSV = path.join(DATA_DIR, 'predictions_with_outcomes.csv');
const META_DIR = path.join(PROJECT_ROOT, 'data', 'game_meta');
const CURRENT_SEASON = (process.env.CURRENT_SEASON ?? new Date().getFullYear()).toString();

function loadPredictions(): PredictionRow[] {
  if (!fs.existsSync(PREDICTIONS_JSON)) {
    throw new Error(
      `Predictions file not found at ${PREDICTIONS_JSON}. Run 06_run_margin_model.py first.`,
    );
  }
  const raw = fs.readFileSync(PREDICTIONS_JSON, 'utf-8');
  const parsed = JSON.parse(raw) as PredictionRow[];
  return parsed.map((row) => ({
    ...row,
    guess: Number(row.guess),
    predicted_margin: Number(row.predicted_margin),
  }));
}

function loadActualResults(): Map<string, number> {
  const seasonDir = path.join(META_DIR, CURRENT_SEASON);
  const resultsByGameId = new Map<string, number>();
  if (!fs.existsSync(seasonDir)) {
    console.warn(`No game meta directory found for season ${CURRENT_SEASON} at ${seasonDir}`);
    return resultsByGameId;
  }

  const files = fs.readdirSync(seasonDir).filter((f) => f.endsWith('.json'));
  files.forEach((file) => {
    const contents = fs.readFileSync(path.join(seasonDir, file), 'utf-8');
    const games = JSON.parse(contents) as any[];
    games.forEach((game) => {
      const res = game.results;
      const margin = res?.result;
      if (margin === null || margin === undefined) return;
      const parsedMargin = Number(margin);
      if (Number.isNaN(parsedMargin)) return;
      if (typeof game.game_id === 'string') {
        resultsByGameId.set(game.game_id, parsedMargin);
      }
    });
  });

  return resultsByGameId;
}

function writeResults(rows: PredictionWithOutcome[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_JSON, JSON.stringify(rows, null, 2));

  const header = 'game_id,guess,predicted_margin,actual_margin';
  const lines = rows.map(
    (row) =>
      [
        row.game_id,
        row.guess.toFixed(2),
        row.predicted_margin.toFixed(2),
        row.actual_margin.toFixed(1),
      ].join(','),
  );
  fs.writeFileSync(RESULTS_CSV, [header, ...lines].join('\n'));
}

export async function generateResults(): Promise<void> {
  const predictions = loadPredictions();
  const actuals = loadActualResults();
  const enriched: PredictionWithOutcome[] = [];

  predictions.forEach((row) => {
    const margin = actuals.get(row.game_id);
    if (margin === undefined) {
      return;
    }
    enriched.push({
      ...row,
      actual_margin: margin,
    });
  });

  writeResults(enriched);
  console.info(
    `Attached outcomes for ${enriched.length} rows (season ${CURRENT_SEASON}) -> ${RESULTS_JSON}`,
  );
}

if (require.main === module) {
  generateResults().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

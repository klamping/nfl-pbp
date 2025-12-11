import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface PredictionResult {
  game_id: string;
  guess: number;
  predicted_margin: number;
  actual_margin: number;
}

interface BucketStats {
  correct: number;
  total: number;
}

interface Metrics {
  samples: number;
  correct: number;
  accuracy: number;
  mae: number;
  rmse: number;
  bias: number;
  r2: number;
  mean_actual: number;
  baseline_mae: number;
  baseline_rmse: number;
  buckets: Record<string, BucketStats>;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'model_runs');
const RESULTS_JSON = path.join(DATA_DIR, 'predictions_with_outcomes.json');
const METRICS_JSON = path.join(DATA_DIR, 'metrics.json');
const MODEL_PATH = path.join(DATA_DIR, 'margin_model.json');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const HISTORY_JSONL = path.join(HISTORY_DIR, 'metrics_history.jsonl');
const HISTORY_CSV = path.join(HISTORY_DIR, 'metrics_history.csv');

const BUCKET_NAMES = [
  'favorite_predicted_cover',
  'underdog_predicted_cover',
  'favorite_is_home',
  'favorite_is_away',
  'thursday',
  'monday',
  'favorite_blowout',
  'upset',
  'within_3_of_vegas',
  'spread_0_5',
  'spread_1_5',
  'spread_2_5',
  'spread_3_5',
  'spread_4_5',
  'spread_5_5',
  'spread_6_5',
  'spread_7_5',
  'spread_8_5',
  'spread_9_5',
  'spread_10_5_plus',
];

function loadResults(): PredictionResult[] {
  if (!fs.existsSync(RESULTS_JSON)) {
    throw new Error(
      `Results file not found at ${RESULTS_JSON}. Run 07_generate_results first.`,
    );
  }
  const raw = fs.readFileSync(RESULTS_JSON, 'utf-8');
  const parsed = JSON.parse(raw) as PredictionResult[];
  return parsed.map((row) => ({
    ...row,
    guess: Number(row.guess),
    predicted_margin: Number(row.predicted_margin),
    actual_margin: Number(row.actual_margin),
  }));
}

function loadMeta(): Map<
  string,
  { spread_line: number; weekday?: string; home_team?: string; away_team?: string }
> {
  const CURRENT_SEASON = (process.env.CURRENT_SEASON ?? new Date().getFullYear()).toString();
  const metaDir = path.join(PROJECT_ROOT, 'data', 'game_meta', CURRENT_SEASON);
  const map = new Map<
    string,
    { spread_line: number; weekday?: string; home_team?: string; away_team?: string }
  >();
  if (!fs.existsSync(metaDir)) {
    return map;
  }
  const files = fs.readdirSync(metaDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const games = JSON.parse(fs.readFileSync(path.join(metaDir, file), 'utf-8')) as any[];
    games.forEach((game) => {
      if (!game?.game_id) return;
      const spread = Number(game.spread_line);
      map.set(game.game_id, {
        spread_line: spread,
        weekday: game.weekday,
        home_team: game.home_team,
        away_team: game.away_team,
      });
    });
  }
  return map;
}

function initBuckets(names: string[]): Record<string, BucketStats> {
  return names.reduce<Record<string, BucketStats>>((acc, name) => {
    acc[name] = { correct: 0, total: 0 };
    return acc;
  }, {});
}

function bumpBucket(buckets: Record<string, BucketStats>, name: string, isCorrect: boolean): void {
  const bucket = buckets[name];
  if (!bucket) return;
  bucket.total += 1;
  if (isCorrect) bucket.correct += 1;
}

function spreadBucketName(spread: number): string {
  const abs = Math.abs(spread);
  if (abs >= 10.5) return 'spread_10_5_plus';
  const bucket = Math.floor(abs) + 0.5; // yields 0.5, 1.5, 2.5, ...
  const label = bucket.toFixed(1).replace('.', '_');
  return `spread_${label}`;
}

function computeMetrics(rows: PredictionResult[]): Metrics {
  const n = rows.length;
  if (n === 0) {
    throw new Error('No rows to evaluate.');
  }

  const metaByGame = loadMeta();
  const buckets = initBuckets(BUCKET_NAMES);

  let correct = 0;

  const meanActual = rows.reduce((acc, r) => acc + r.actual_margin, 0) / n;
  const errors = rows.map((r) => r.predicted_margin - r.actual_margin);
  const mae = errors.reduce((acc, e) => acc + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(errors.reduce((acc, e) => acc + e * e, 0) / n);
  const bias = errors.reduce((acc, e) => acc + e, 0) / n;

  const baselinePred = meanActual;
  const baselineErrors = rows.map((r) => baselinePred - r.actual_margin);
  const baselineMae = baselineErrors.reduce((acc, e) => acc + Math.abs(e), 0) / n;
  const baselineRmse = Math.sqrt(baselineErrors.reduce((acc, e) => acc + e * e, 0) / n);

  const ssRes = rows.reduce(
    (acc, r) => acc + (r.actual_margin - r.predicted_margin) ** 2,
    0,
  );
  const ssTot = rows.reduce((acc, r) => acc + (r.actual_margin - meanActual) ** 2, 0);
  const r2 = ssTot === 0 ? Number.NaN : 1 - ssRes / ssTot;

  rows.forEach((row) => {
    const meta = metaByGame.get(row.game_id);
    if (!meta || Number.isNaN(meta.spread_line)) {
      return;
    }

    const spread = meta.spread_line;
    const predictedDiff = row.predicted_margin - spread;
    const actualDiff = row.actual_margin - spread;
    const isCorrect = predictedDiff === 0 || actualDiff === 0 ? true : predictedDiff * actualDiff >= 0;
    if (isCorrect) correct += 1;

    const favoriteIsHome = spread > 0;
    const favoriteMargin = favoriteIsHome ? row.actual_margin : -row.actual_margin;
    const predictedFavCover = predictedDiff >= 0;

    bumpBucket(buckets, predictedFavCover ? 'favorite_predicted_cover' : 'underdog_predicted_cover', isCorrect);
    bumpBucket(buckets, favoriteIsHome ? 'favorite_is_home' : 'favorite_is_away', isCorrect);

    const weekday = meta.weekday?.toLowerCase?.() ?? '';
    if (weekday === 'thursday') bumpBucket(buckets, 'thursday', isCorrect);
    if (weekday === 'monday') bumpBucket(buckets, 'monday', isCorrect);

    if (favoriteMargin > 7) bumpBucket(buckets, 'favorite_blowout', isCorrect);
    if (favoriteMargin < -3) bumpBucket(buckets, 'upset', isCorrect);
    if (Math.abs(row.actual_margin - spread) <= 3) bumpBucket(buckets, 'within_3_of_vegas', isCorrect);

    const spreadBucket = spreadBucketName(spread);
    bumpBucket(buckets, spreadBucket, isCorrect);
  });

  const total = rows.length;
  const accuracy = total === 0 ? Number.NaN : correct / total;

  return {
    samples: n,
    correct,
    accuracy,
    mae,
    rmse,
    bias,
    r2,
    mean_actual: meanActual,
    baseline_mae: baselineMae,
    baseline_rmse: baselineRmse,
    buckets,
  };
}

function writeMetrics(metrics: Metrics): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(METRICS_JSON, JSON.stringify(metrics, null, 2));
}

function printReport(metrics: Metrics): void {
  const lines = [
    `Samples:              ${metrics.samples}`,
    `Accuracy:             ${Number.isNaN(metrics.accuracy) ? 'NaN' : metrics.accuracy.toFixed(3)} (${metrics.correct}/${metrics.samples})`,
    `MAE:                  ${metrics.mae.toFixed(3)} (baseline ${metrics.baseline_mae.toFixed(3)})`,
    `RMSE:                 ${metrics.rmse.toFixed(3)} (baseline ${metrics.baseline_rmse.toFixed(3)})`,
    `Bias (pred-actual):   ${metrics.bias.toFixed(3)}`,
    `R^2:                  ${Number.isNaN(metrics.r2) ? 'NaN' : metrics.r2.toFixed(3)}`,
    `Mean actual margin:   ${metrics.mean_actual.toFixed(3)}`,
  ];
  console.info(lines.join('\n'));

  const bucketNames = Object.keys(metrics.buckets);
  if (bucketNames.length) {
    console.info('\nBucketed accuracy:');
    bucketNames.forEach((name) => {
      const bucket = metrics.buckets[name];
      const acc = bucket.total === 0 ? 'n/a' : (bucket.correct / bucket.total).toFixed(3);
      console.info(`  ${name.padEnd(24)} ${acc} (${bucket.correct}/${bucket.total})`);
    });
  }
}

export async function evaluateDummyModel(): Promise<void> {
  const rows = loadResults();
  const metrics = computeMetrics(rows);
  writeMetrics(metrics);
  printReport(metrics);
  persistHistory(metrics);
}

if (require.main === module) {
  evaluateDummyModel().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

function computeModelHash(): string {
  if (!fs.existsSync(MODEL_PATH)) {
    return 'missing';
  }
  const buffer = fs.readFileSync(MODEL_PATH);
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
}

function persistHistory(metrics: Metrics): void {
  const now = new Date();
  const runId = process.env.DEMO_RUN_ID ?? now.toISOString();
  const record = {
    run_id: runId,
    timestamp: now.toISOString(),
    model_hash: computeModelHash(),
    metrics,
  };

  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.appendFileSync(HISTORY_JSONL, `${JSON.stringify(record)}\n`);

  const bucketHeaders = BUCKET_NAMES.map((name) => `acc_${name}`);
  const csvHeader =
    'run_id,timestamp,model_hash,samples,correct,accuracy,mae,rmse,bias,r2,mean_actual,baseline_mae,baseline_rmse,' +
    bucketHeaders.join(',');

  const acc = (name: string): string => {
    const b = metrics.buckets[name];
    if (!b || b.total === 0) return 'NaN';
    return (b.correct / b.total).toFixed(4);
  };

  const csvRow = [
    runId,
    record.timestamp,
    record.model_hash,
    metrics.samples,
    metrics.correct,
    Number.isNaN(metrics.accuracy) ? 'NaN' : metrics.accuracy.toFixed(4),
    metrics.mae.toFixed(4),
    metrics.rmse.toFixed(4),
    metrics.bias.toFixed(4),
    Number.isNaN(metrics.r2) ? 'NaN' : metrics.r2.toFixed(4),
    metrics.mean_actual.toFixed(4),
    metrics.baseline_mae.toFixed(4),
    metrics.baseline_rmse.toFixed(4),
    ...BUCKET_NAMES.map((name) => acc(name)),
  ].join(',');

  if (!fs.existsSync(HISTORY_CSV)) {
    fs.writeFileSync(HISTORY_CSV, `${csvHeader}\n${csvRow}\n`);
  } else {
    fs.appendFileSync(HISTORY_CSV, `${csvRow}\n`);
  }
}

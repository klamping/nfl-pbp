import fs from 'node:fs';
import path from 'node:path';

interface Metrics {
  samples: number;
  correct?: number;
  accuracy?: number;
  mae: number;
  rmse: number;
  bias: number;
  r2: number;
  mean_actual: number;
  baseline_mae: number;
  baseline_rmse: number;
  buckets?: Record<string, { correct: number; total: number }>;
}

interface HistoryRecord {
  run_id: string;
  timestamp: string;
  model_hash: string;
  metrics: Metrics;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_HISTORY = path.join(
  PROJECT_ROOT,
  'data',
  'model_runs',
  'history',
  'metrics_history.jsonl',
);

function loadHistory(filePath: string): HistoryRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Metrics history not found at ${filePath}`);
  }

  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => JSON.parse(line) as HistoryRecord)
    .filter((rec) => rec.metrics && typeof rec.metrics.mae === 'number');
}

function formatNumber(value: number, digits = 3): string {
  return value.toFixed(digits);
}

function renderTable(records: HistoryRecord[]): void {
  const headers = ['run_id', 'accuracy', 'mae', 'rmse', 'bias', 'r2', 'model'];
  const rows = records.map((r) => [
    r.run_id,
    r.metrics.accuracy === undefined || Number.isNaN(r.metrics.accuracy)
      ? 'n/a'
      : formatNumber(r.metrics.accuracy, 3),
    formatNumber(r.metrics.mae, 3),
    formatNumber(r.metrics.rmse, 3),
    formatNumber(r.metrics.bias, 3),
    Number.isNaN(r.metrics.r2) ? 'NaN' : formatNumber(r.metrics.r2, 3),
    r.model_hash,
  ]);

  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, colIdx) =>
    Math.max(...allRows.map((row) => String(row[colIdx]).length)),
  );

  const divider = colWidths.map((w) => '-'.repeat(w)).join('  ');
  const formatRow = (row: (string | number)[]) =>
    row
      .map((cell, idx) => String(cell).padEnd(colWidths[idx], ' '))
      .join('  ');

  console.info(formatRow(headers));
  console.info(divider);
  rows.forEach((row) => console.info(formatRow(row)));
}

function printSummary(records: HistoryRecord[]): void {
  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const bestMae = sorted.reduce(
    (best, r) => (r.metrics.mae < best.metrics.mae ? r : best),
    sorted[0],
  );
  const bestRmse = sorted.reduce(
    (best, r) => (r.metrics.rmse < best.metrics.rmse ? r : best),
    sorted[0],
  );
  const latest = sorted[sorted.length - 1];

  const lines = [
    `Runs: ${records.length}`,
    `Latest: ${latest.run_id} @ ${latest.timestamp} (acc=${latest.metrics.accuracy === undefined || Number.isNaN(latest.metrics.accuracy) ? 'NaN' : formatNumber(latest.metrics.accuracy)}, mae=${formatNumber(latest.metrics.mae)}, rmse=${formatNumber(latest.metrics.rmse)}, bias=${formatNumber(latest.metrics.bias)}, r2=${Number.isNaN(latest.metrics.r2) ? 'NaN' : formatNumber(latest.metrics.r2)})`,
    `Best MAE (lower better): ${bestMae.run_id} (mae=${formatNumber(bestMae.metrics.mae)})`,
    `Best RMSE (lower better): ${bestRmse.run_id} (rmse=${formatNumber(bestRmse.metrics.rmse)})`,
  ];

  console.info('\nSummary');
  console.info('-------');
  lines.forEach((line) => console.info(line));
}

export async function renderMetricsHistory(filePath: string = DEFAULT_HISTORY): Promise<void> {
  const records = loadHistory(filePath);
  if (records.length === 0) {
    console.info('No metrics recorded yet.');
    return;
  }

  const latest = records.slice(-20); // only show last 20 runs
  renderTable(latest);
  printSummary(latest);
}

if (require.main === module) {
  const [, , maybePath] = process.argv;
  renderMetricsHistory(maybePath ?? DEFAULT_HISTORY).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

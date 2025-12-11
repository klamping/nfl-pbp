import fs from 'node:fs';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DERIVED_DIR = path.join(PROJECT_ROOT, 'data', 'derived_stats');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'team_history');
const CURRENT_SEASON = (process.env.CURRENT_SEASON ?? new Date().getFullYear()).toString();

function copyFile(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copySeason(seasonDir: string, season: string): void {
  const files = fs.readdirSync(seasonDir).filter((f) => f.endsWith('.json'));
  files.forEach((file) => {
    const src = path.join(seasonDir, file);
    const dest = path.join(OUTPUT_DIR, season, file);
    copyFile(src, dest);
  });
}

export async function buildTrends(options?: { includeHistorical?: boolean; includeCurrent?: boolean }): Promise<void> {
  const includeHistorical = options?.includeHistorical ?? true;
  const includeCurrent = options?.includeCurrent ?? true;

  if (!fs.existsSync(DERIVED_DIR)) {
    console.info(`No derived stats found at ${DERIVED_DIR}; nothing to copy.`);
    return;
  }

  const seasons = fs.readdirSync(DERIVED_DIR).filter((entry) => /^\d{4}$/.test(entry));
  seasons.forEach((season) => {
    const seasonDir = path.join(DERIVED_DIR, season);
    if (!fs.statSync(seasonDir).isDirectory()) return;
    const isCurrent = season === CURRENT_SEASON;
    if ((isCurrent && includeCurrent) || (!isCurrent && includeHistorical)) {
      copySeason(seasonDir, season);
    }
  });

  console.info(`Copied derived stats into ${OUTPUT_DIR}`);
}

if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .option('historical', {
      type: 'boolean',
      describe: 'Include historical seasons when copying',
      default: true,
    })
    .option('current', {
      type: 'boolean',
      describe: 'Include the current season when copying',
      default: true,
    })
    .help()
    .parseSync();

  buildTrends({ includeHistorical: argv.historical, includeCurrent: argv.current }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

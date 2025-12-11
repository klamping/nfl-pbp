import fs from 'node:fs';
import path from 'node:path';
import {
  buildCalculators,
  loadAllowedStats,
  GameMeta,
  StatCalculator,
  StatContext,
} from './calculators';

interface WeekFile {
  season: string;
  week: string;
  filePath: string;
}

export interface TeamWeekStatsRow {
  season: string;
  week: string;
  game_id: string;
  team: string;
  stats: Record<string, number>;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PBP_DIR = path.join(PROJECT_ROOT, 'data', 'pbp_data');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'derived_stats');
const CURRENT_SEASON = (process.env.CURRENT_SEASON ?? new Date().getFullYear()).toString();

function listWeekFiles(): WeekFile[] {
  if (!fs.existsSync(PBP_DIR)) {
    throw new Error(`PBP directory not found at ${PBP_DIR}`);
  }

  const seasons = fs.readdirSync(PBP_DIR).filter((entry) => /^\d{4}$/.test(entry));
  const files: WeekFile[] = [];
  seasons.forEach((season) => {
    const seasonDir = path.join(PBP_DIR, season);
    if (!fs.statSync(seasonDir).isDirectory()) return;
    fs.readdirSync(seasonDir)
      .filter((f) => f.endsWith('.json'))
      .forEach((file) => {
        const week = file.replace('.json', '');
        files.push({ season, week, filePath: path.join(seasonDir, file) });
      });
  });

  return files.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function buildStatContext(
  entry: TeamWeekStatsRow,
  meta?: GameMeta,
  allowedStats?: Set<string> | null,
): StatContext {
  return {
    season: entry.season,
    week: entry.week,
    game_id: entry.game_id,
    team: entry.team,
    stats: entry.stats,
    meta,
    allowedStats,
    addStat(key: string, value: number) {
      if (allowedStats && !allowedStats.has(key) && !key.startsWith('_')) return;
      entry.stats[key] = value;
    },
    incrementStat(key: string, by: number = 1) {
      if (allowedStats && !allowedStats.has(key) && !key.startsWith('_')) return;
      const current = entry.stats[key] ?? 0;
      entry.stats[key] = current + by;
    },
  };
}

export function computeTeamStatsForWeek(
  rows: any[],
  season: string,
  week: string,
  calculators?: StatCalculator[],
): TeamWeekStatsRow[] {
  const teamStatsByKey = new Map<string, TeamWeekStatsRow>();
  const { metaLookup, calculators: calcList } = buildCalculators(season, week, calculators);
  const allowedStats = loadAllowedStats();
  const calcs = calculators ?? calcList;

  for (const row of rows) {
    const gameId = row.game_id;
    const team = row.posteam;
    if (!team || !gameId) continue;

    const mapKey = `${gameId}::${team}`;
    if (!teamStatsByKey.has(mapKey)) {
      const entry: TeamWeekStatsRow = { season, week, game_id: gameId, team, stats: {} };
      const ctx = buildStatContext(entry, metaLookup.get(gameId), allowedStats);
      calcs.forEach((calc) => calc.init?.(ctx));
      teamStatsByKey.set(mapKey, entry);
    }

    const entry = teamStatsByKey.get(mapKey)!;
    const ctx = buildStatContext(entry, metaLookup.get(gameId), allowedStats);
    calcs.forEach((calc) => calc.accumulate?.(row, ctx));
  }

  for (const entry of teamStatsByKey.values()) {
    const ctx = buildStatContext(entry, metaLookup.get(entry.game_id), allowedStats);
    calcs.forEach((calc) => calc.finalize?.(ctx));
  }

  return Array.from(teamStatsByKey.values());
}

export function writeWeekOutput(rows: TeamWeekStatsRow[], season: string, week: string): void {
  const dir = path.join(OUTPUT_DIR, season);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${week}.json`);
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.info(`Wrote derived stats for ${rows.length} team-entries -> ${outPath}`);
}

export async function computeTeamStats(options?: {
  calculators?: StatCalculator[];
  includeHistorical?: boolean;
  includeCurrent?: boolean;
}): Promise<void> {
  const calculators = options?.calculators;
  const includeHistorical = options?.includeHistorical ?? true;
  const includeCurrent = options?.includeCurrent ?? true;
  const weeks = listWeekFiles();
  if (!weeks.length) {
    console.info('No PBP files found; nothing to do.');
    return;
  }

  for (const wf of weeks) {
    if (!includeHistorical && wf.season !== CURRENT_SEASON) {
      continue;
    }
    if (!includeCurrent && wf.season === CURRENT_SEASON) {
      continue;
    }

    const rows = JSON.parse(fs.readFileSync(wf.filePath, 'utf-8'));
    const stats = computeTeamStatsForWeek(rows, wf.season, wf.week, calculators);
    writeWeekOutput(stats, wf.season, wf.week);
  }
}

// Backward-compatible wrapper for legacy callers.
export async function computeOffPlays(): Promise<void> {
  return computeTeamStats();
}

if (require.main === module) {
  computeOffPlays().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

import fs from 'node:fs';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type StatBlock = Record<string, number>;

interface DerivedRow {
  season: string;
  week: string;
  game_id: string;
  team: string;
  stats: StatBlock;
}

interface HistoryEntry {
  week: number;
  gameId: string;
  stats: StatBlock;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DERIVED_DIR = path.join(PROJECT_ROOT, 'data', 'derived_stats');
const META_DIR = path.join(PROJECT_ROOT, 'data', 'game_meta');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'team_history');
const CURRENT_SEASON = (process.env.CURRENT_SEASON ?? new Date().getFullYear()).toString();

function readJson<T>(pathname: string): T {
  return JSON.parse(fs.readFileSync(pathname, 'utf-8'));
}

function listSeasonWeeks(seasonDir: string): string[] {
  return fs
    .readdirSync(seasonDir)
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => {
      const aNum = Number(a.replace('.json', ''));
      const bNum = Number(b.replace('.json', ''));
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.localeCompare(b);
    });
}

function averageStats(games: StatBlock[]): StatBlock {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  games.forEach((stats) => {
    Object.entries(stats ?? {}).forEach(([key, value]) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      sums[key] = (sums[key] ?? 0) + value;
      counts[key] = (counts[key] ?? 0) + 1;
    });
  });

  const averages: StatBlock = {};
  Object.keys(sums).forEach((key) => {
    averages[key] = sums[key] / counts[key];
  });
  return averages;
}

function computeOpponentStrength(
  teamHistory: HistoryEntry[],
  metaByGameId: Map<string, any>,
  team: string,
  currentWeek: number,
  historyByTeam: Record<string, HistoryEntry[]>,
): StatBlock {
  const opponentAverages: StatBlock[] = [];

  teamHistory.forEach((g) => {
    if (g.week >= currentWeek) return;
    const meta = metaByGameId.get(g.gameId);
    if (!meta) return;
    const opponent = meta.home_team === team ? meta.away_team : meta.home_team;
    if (!opponent) return;
    const oppHistory = (historyByTeam[opponent] ?? []).filter((h) => h.week < currentWeek);
    if (!oppHistory.length) return;
    const oppAvg = averageStats(oppHistory.map((h) => h.stats));
    opponentAverages.push(oppAvg);
  });

  if (!opponentAverages.length) {
    return {
      avg_opponent_off_epa_per_play: 0,
      avg_opponent_def_epa_per_play: 0,
      strength_of_schedule_simple: 0,
      strength_of_schedule_epa: 0,
    };
  }

  const mean = (getter: (s: StatBlock) => number): number =>
    opponentAverages.reduce((sum, s) => sum + getter(s), 0) / opponentAverages.length;

  const oppOff = mean((s) => s.off_epa_per_play ?? 0);
  const oppDef = mean((s) => s.def_epa_per_play ?? 0);
  const oppWinPct = mean((s) => s.win_pct ?? 0);
  const oppEpaCombo = mean((s) => (s.off_epa_per_play ?? 0) + (s.def_epa_per_play ?? 0));

  return {
    avg_opponent_off_epa_per_play: oppOff,
    avg_opponent_def_epa_per_play: oppDef,
    strength_of_schedule_simple: oppWinPct,
    strength_of_schedule_epa: oppEpaCombo,
  };
}

function buildSeasonTrends(season: string, includeSeason: boolean): void {
  if (!includeSeason) return;

  const seasonDir = path.join(DERIVED_DIR, season);
  const metaSeasonDir = path.join(META_DIR, season);
  if (!fs.existsSync(metaSeasonDir)) {
    console.warn(`No game meta for season ${season}; skipping trend build.`);
    return;
  }

  const weeks = listSeasonWeeks(seasonDir);
  const historyByTeam: Record<string, HistoryEntry[]> = {};
  const metaByGameId = new Map<string, any>();

  weeks.forEach((weekFile) => {
    const derivedPath = path.join(seasonDir, weekFile);
    const metaPath = path.join(metaSeasonDir, weekFile);
    if (!fs.existsSync(metaPath)) {
      console.warn(`Skipping ${season} week ${weekFile}: missing meta at ${metaPath}`);
      return;
    }

    const derivedRows = readJson<DerivedRow[]>(derivedPath);
    const metaRows = readJson<any[]>(metaPath);
    metaRows.forEach((row) => {
      if (row?.game_id) metaByGameId.set(row.game_id, row);
    });

    const trendsForWeek: any[] = [];

    derivedRows.forEach((row) => {
      const meta = metaByGameId.get(row.game_id);
      const weekNumber = Number(meta?.week ?? row.week);
      if (Number.isNaN(weekNumber)) return;

      const teamHistory = historyByTeam[row.team] ?? [];
      const priorGames = teamHistory.filter((g) => g.week < weekNumber);
      const lastFiveGames = priorGames.slice(-5);

      const seasonAvg = averageStats(priorGames.map((g) => g.stats));
      const lastFiveAvg = averageStats(lastFiveGames.map((g) => g.stats));

      const oppStrength = computeOpponentStrength(priorGames, metaByGameId, row.team, weekNumber, historyByTeam);
      const offAdj = (seasonAvg.off_epa_per_play ?? 0) - (oppStrength.avg_opponent_def_epa_per_play ?? 0);
      const defAdj = (seasonAvg.def_epa_per_play ?? 0) - (oppStrength.avg_opponent_off_epa_per_play ?? 0);

      seasonAvg.avg_opponent_off_epa_per_play = oppStrength.avg_opponent_off_epa_per_play ?? 0;
      seasonAvg.avg_opponent_def_epa_per_play = oppStrength.avg_opponent_def_epa_per_play ?? 0;
      seasonAvg.strength_of_schedule_simple = oppStrength.strength_of_schedule_simple ?? 0;
      seasonAvg.strength_of_schedule_epa = oppStrength.strength_of_schedule_epa ?? 0;
      seasonAvg.off_epa_per_play_adj = offAdj;
      seasonAvg.def_epa_per_play_adj = defAdj;

      lastFiveAvg.avg_opponent_off_epa_per_play = oppStrength.avg_opponent_off_epa_per_play ?? 0;
      lastFiveAvg.avg_opponent_def_epa_per_play = oppStrength.avg_opponent_def_epa_per_play ?? 0;
      lastFiveAvg.strength_of_schedule_simple = oppStrength.strength_of_schedule_simple ?? 0;
      lastFiveAvg.strength_of_schedule_epa = oppStrength.strength_of_schedule_epa ?? 0;
      lastFiveAvg.off_epa_per_play_adj = offAdj;
      lastFiveAvg.def_epa_per_play_adj = defAdj;

      trendsForWeek.push({
        season: row.season,
        week: row.week,
        game_id: row.game_id,
        team: row.team,
        games_played: priorGames.length,
        stats: {
          season: seasonAvg,
          last5: lastFiveAvg,
        },
      });

      historyByTeam[row.team] = [...teamHistory, { week: weekNumber, stats: row.stats, gameId: row.game_id }];
    });

    const dest = path.join(OUTPUT_DIR, season, weekFile);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(trendsForWeek, null, 2));
  });
}

export async function buildTrends(options?: { includeHistorical?: boolean; includeCurrent?: boolean }): Promise<void> {
  const includeHistorical = options?.includeHistorical ?? true;
  const includeCurrent = options?.includeCurrent ?? true;

  if (!fs.existsSync(DERIVED_DIR)) {
    console.info(`No derived stats found at ${DERIVED_DIR}; nothing to process.`);
    return;
  }

  const seasons = fs.readdirSync(DERIVED_DIR).filter((entry) => /^\d{4}$/.test(entry));
  seasons.forEach((season) => {
    const seasonDir = path.join(DERIVED_DIR, season);
    if (!fs.statSync(seasonDir).isDirectory()) return;
    const isCurrent = season === CURRENT_SEASON;
    const includeSeason = (isCurrent && includeCurrent) || (!isCurrent && includeHistorical);
    buildSeasonTrends(season, includeSeason);
  });

  console.info(`Built trend averages into ${OUTPUT_DIR}`);
}

if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .option('historical', {
      type: 'boolean',
      describe: 'Include historical seasons when building trend averages',
      default: true,
    })
    .option('current', {
      type: 'boolean',
      describe: 'Include the current season when building trend averages',
      default: true,
    })
    .help()
    .parseSync();

  buildTrends({ includeHistorical: argv.historical, includeCurrent: argv.current }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

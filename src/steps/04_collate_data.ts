import fs from 'node:fs';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import _ from 'lodash';
import { flattenObject } from '../utils';

interface WeekFile {
  season: string;
  week: string;
  filePath: string;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DERIVED_DIR = path.join(PROJECT_ROOT, 'data', 'derived_stats');
const META_DIR = path.join(PROJECT_ROOT, 'data', 'game_meta');
const OUTPUT_ROOT = path.join(PROJECT_ROOT, 'data', 'collated');
const CURRENT_SEASON = (process.env.CURRENT_SEASON ?? new Date().getFullYear()).toString();
function listDerivedWeekFiles(): WeekFile[] {
  if (!fs.existsSync(DERIVED_DIR)) {
    throw new Error(`Derived stats directory not found at ${DERIVED_DIR}`);
  }

  const seasons = fs.readdirSync(DERIVED_DIR).filter((entry) => /^\d{4}$/.test(entry));
  const files: WeekFile[] = [];
  seasons.forEach((season) => {
    const seasonDir = path.join(DERIVED_DIR, season);
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

function readJson(pathname: string): any {
  return JSON.parse(fs.readFileSync(pathname, 'utf-8'));
}

function determineFavorite(meta: any): { favorite: string; underdog: string } | null {
  const spread = Number(meta.spread_line);
  const home = meta.home_team;
  const away = meta.away_team;
  if (!home || !away || Number.isNaN(spread)) {
    return null;
  }

  if (spread > 0) return { favorite: home, underdog: away };
  if (spread < 0) return { favorite: away, underdog: home };
  return { favorite: home, underdog: away }; // spread = 0 defaults home as favorite
}

function mergeRows(derivedRows: any[], metaRows: any[]): any[] {
  const metaByGameId = new Map<string, any>();
  metaRows.forEach((row) => {
    if (row.game_id) {
      metaByGameId.set(row.game_id, row);
    }
  });

  const derivedByGameTeam = new Map<string, any>();
  derivedRows.forEach((row) => {
    if (row.game_id && row.team) {
      derivedByGameTeam.set(`${row.game_id}::${row.team}`, row);
    }
  });

  const merged: any[] = [];
  metaByGameId.forEach((meta, gameId) => {
    const fav = determineFavorite(meta);
    if (!fav) {
      return;
    }
    const favoriteRow = derivedByGameTeam.get(`${gameId}::${fav.favorite}`);
    const underdogRow = derivedByGameTeam.get(`${gameId}::${fav.underdog}`);
    if (!favoriteRow || !underdogRow) {
      return;
    }

    const results = meta.results ?? {};

    const structured = {
      meta: {
        game_id: gameId,
        season: meta.season,
        week: meta.week,
        gameday: meta.gameday,
        weekday: meta.weekday,
        gametime: meta.gametime,
        home_team: meta.home_team,
        away_team: meta.away_team,
        location: meta.location,
        roof: meta.roof,
        surface: meta.surface,
        temp: meta.temp,
        wind: meta.wind,
        stadium_id: meta.stadium_id,
        stadium: meta.stadium,
      },
      betting: {
        favorite: favoriteRow.team,
        underdog: underdogRow.team,
        spread_line: meta.spread_line,
        home_moneyline: meta.home_moneyline,
        away_moneyline: meta.away_moneyline,
        under_odds: meta.under_odds,
        over_odds: meta.over_odds,
        total_line: meta.total_line,
      },
      results: {
        home_score: results.home_score,
        away_score: results.away_score,
        overtime: results.overtime,
        result: results.result,
        total: results.total,
      },
      teamStats: {
        favorite: favoriteRow.stats,
        underdog: underdogRow.stats
      }
    };

    merged.push(structured);
  });

  return merged;
}

function toCsv(rows: any[]): string {
  if (rows.length === 0) return '';
  const flatRows = rows.map((row) => flattenObject(row));
  const keysSet = new Set<string>();
  flatRows.forEach((r) => Object.keys(r).forEach((k) => keysSet.add(k)));
  const headerKeys = Array.from(keysSet);
  const resultsKeys = headerKeys.filter((key) => key.startsWith('results_'));
  const nonResultsKeys = headerKeys.filter((key) => !key.startsWith('results_'));
  const orderedHeaderKeys = [...nonResultsKeys, ...resultsKeys];
  const header = orderedHeaderKeys.join(',');
  const lines = flatRows.map((record) => {
    return orderedHeaderKeys
      .map((key) => {
        const value = record[key];
        if (value === null || value === undefined) return '';
        const str = String(value);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(',');
  });

  return [header, ...lines].join('\n');
}

function writeCsv(pathname: string, rows: any[]): void {
  const dir = path.dirname(pathname);
  fs.mkdirSync(dir, { recursive: true });
  const csv = toCsv(rows);
  fs.writeFileSync(pathname, csv);
  console.info(`Wrote ${rows.length} rows -> ${pathname}`);
}

function writeJson(pathname: string, rows: any[]): void {
  const dir = path.dirname(pathname);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pathname, JSON.stringify(rows, null, 2));
  console.info(`Wrote ${rows.length} rows -> ${pathname}`);
}

export async function collateData(options?: { includeHistorical?: boolean; includeCurrent?: boolean }): Promise<void> {
  const includeHistorical = options?.includeHistorical ?? true;
  const includeCurrent = options?.includeCurrent ?? true;

  const weekFiles = listDerivedWeekFiles();
  if (!weekFiles.length) {
    console.info('No derived stats files found; nothing to do.');
    return;
  }

  const historicalRows: any[] = [];

  for (const wf of weekFiles) {
    const metaPath = path.join(META_DIR, wf.season, `${wf.week}.json`);
    if (!fs.existsSync(metaPath)) {
      console.warn(`Skipping ${wf.season} week ${wf.week}: no meta file at ${metaPath}`);
      continue;
    }

    const derived = readJson(wf.filePath);
    const meta = readJson(metaPath);
    const merged = mergeRows(derived, meta);

    if (wf.season === CURRENT_SEASON) {
      const outPath = path.join(OUTPUT_ROOT, 'current', `${wf.week}.csv`);
      const jsonPath = path.join(OUTPUT_ROOT, 'current', `${wf.week}.json`);
      if (includeCurrent) {
        writeCsv(outPath, merged);
        writeJson(jsonPath, merged);
      }
    } else {
      if (!includeHistorical) continue;
      historicalRows.push(...merged);
    }
  }

  if (includeHistorical && historicalRows.length) {
    const histPath = path.join(OUTPUT_ROOT, 'historical.csv');
    const histJson = path.join(OUTPUT_ROOT, 'historical.json');
    writeCsv(histPath, historicalRows);
    writeJson(histJson, historicalRows);
  }
}

if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .option('historical', {
      type: 'boolean',
      describe: 'Include historical seasons in the collated output (historical.csv)',
      default: true,
    })
    .option('current', {
      type: 'boolean',
      describe: 'Include the current season per-week CSV outputs',
      default: true,
    })
    .help()
    .parseSync();

  collateData({ includeHistorical: argv.historical, includeCurrent: argv.current }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

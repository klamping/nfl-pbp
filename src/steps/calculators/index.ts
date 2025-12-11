import fs from 'node:fs';
import path from 'node:path';
import { offensiveEfficiencyCalculator, offenseEfficiencyScaffold } from './offense_efficiency';
import { offensivePlayCountCalculator, offenseBasicScaffold } from './offense_basic';
import { buildResultsCalculator, resultsScaffold } from './results';
import { buildDefenseBasicScaffold } from './defense_basic';
import { buildDefenseEfficiencyScaffold } from './defense_efficiency';
import { buildSpecialTeamsScaffold } from './special_teams';
import { buildTurnoversPenaltiesScaffold } from './turnovers_penalties';
import { buildAdvancedEpaSuccessScaffold } from './advanced_epa_success';
import { buildAdvancedPassingScaffold } from './advanced_passing';
import { buildAdvancedRushingScaffold } from './advanced_rushing';
import { buildSituationalLeverageScaffold } from './situational_leverage';
import { buildStylePaceScaffold } from './style_pace';
import { buildScheduleAdjustedScaffold } from './schedule_adjusted';
import { loadAllowedStats, loadSchemaGroups } from './schema';
import { GameMeta, StatCalculator } from './types';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const META_DIR = path.join(PROJECT_ROOT, 'data', 'game_meta');

function loadWeekMeta(season: string, week: string): Map<string, GameMeta> {
  const metaPath = path.join(META_DIR, season, `${week}.json`);
  if (!fs.existsSync(metaPath)) return new Map();
  const games = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as any[];
  const map = new Map<string, GameMeta>();
  games.forEach((g) => {
    if (!g?.game_id) return;
    map.set(g.game_id, {
      home_team: g.home_team,
      away_team: g.away_team,
      home_score: g.results?.home_score !== undefined ? Number(g.results?.home_score) : undefined,
      away_score: g.results?.away_score !== undefined ? Number(g.results?.away_score) : undefined,
    });
  });
  return map;
}

export function buildCalculators(
  season: string,
  week: string,
  calculators?: StatCalculator[],
): { calculators: StatCalculator[]; metaLookup: Map<string, GameMeta> } {
  const metaLookup = loadWeekMeta(season, week);
  if (calculators) {
    return { calculators, metaLookup };
  }

  const groupScaffolds: StatCalculator[] = [];
  const groups = loadSchemaGroups();
  if (groups) {
    Object.entries(groups).forEach(([groupName, stats]) => {
      switch (groupName) {
        case 'defense_basic':
          groupScaffolds.push(buildDefenseBasicScaffold(stats));
          break;
        case 'defense_efficiency':
          groupScaffolds.push(buildDefenseEfficiencyScaffold(stats));
          break;
        case 'special_teams':
          groupScaffolds.push(buildSpecialTeamsScaffold(stats));
          break;
        case 'turnovers_penalties':
          groupScaffolds.push(buildTurnoversPenaltiesScaffold(stats));
          break;
        case 'advanced_epa_success':
          groupScaffolds.push(buildAdvancedEpaSuccessScaffold(stats));
          break;
        case 'advanced_passing':
          groupScaffolds.push(buildAdvancedPassingScaffold(stats));
          break;
        case 'advanced_rushing':
          groupScaffolds.push(buildAdvancedRushingScaffold(stats));
          break;
        case 'situational_leverage':
          groupScaffolds.push(buildSituationalLeverageScaffold(stats));
          break;
        case 'style_pace':
          groupScaffolds.push(buildStylePaceScaffold(stats));
          break;
        case 'schedule_adjusted':
          groupScaffolds.push(buildScheduleAdjustedScaffold(stats));
          break;
        default:
          groupScaffolds.push({
            name: `scaffold_${groupName}`,
            finalize(ctx) {
              stats.forEach((key) => {
                if (ctx.stats[key] === undefined) {
                  ctx.addStat(key, 0);
                }
              });
            },
          });
      }
    });
  }

  const defaults: StatCalculator[] = [
    offensivePlayCountCalculator,
    offensiveEfficiencyCalculator,
    offenseBasicScaffold,
    offenseEfficiencyScaffold,
    buildResultsCalculator(metaLookup),
    resultsScaffold,
    ...groupScaffolds,
  ];

  return { calculators: defaults, metaLookup };
}

export { loadAllowedStats } from './schema';
export { GameMeta, StatCalculator, StatContext } from './types';

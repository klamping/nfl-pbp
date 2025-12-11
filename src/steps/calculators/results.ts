import { StatCalculator, StatContext, GameMeta } from './types';

export function buildResultsCalculator(metaLookup: Map<string, GameMeta>): StatCalculator {
  return {
    name: 'results_stats',
    finalize(ctx) {
      const meta = metaLookup.get(ctx.game_id);
      if (!meta) return;
      const isHome = meta.home_team === ctx.team;
      const pointsFor = isHome ? meta.home_score : meta.away_score;
      const pointsAgainst = isHome ? meta.away_score : meta.home_score;
      if (pointsFor === undefined || pointsAgainst === undefined) return;

      const diff = Number(pointsFor) - Number(pointsAgainst);
      const gamesPlayed = 1;
      ctx.addStat('points_for', Number(pointsFor));
      ctx.addStat('points_against', Number(pointsAgainst));
      ctx.addStat('point_differential', diff);
      ctx.addStat('points_for_per_game', Number(pointsFor) / gamesPlayed);
      ctx.addStat('points_against_per_game', Number(pointsAgainst) / gamesPlayed);
      ctx.addStat('scoring_margin_per_game', diff / gamesPlayed);

      const isOneScore = Math.abs(diff) <= 8;
      ctx.addStat('one_score_games_played', isOneScore ? 1 : 0);
      const oneScoreWin = isOneScore && diff > 0 ? 1 : 0;
      const oneScoreTotal = isOneScore ? 1 : 0;
      if (oneScoreTotal > 0) {
        ctx.addStat('one_score_win_pct', oneScoreWin / oneScoreTotal);
      } else {
        ctx.addStat('one_score_win_pct', 0);
      }
    }
  };
}

// Scaffold to ensure other results stats exist if not computed.
const RESULTS_STATS = [
  'games_played',
  'wins',
  'losses',
  'ties',
  'win_pct',
  'points_for',
  'points_against',
  'point_differential',
  'points_for_per_game',
  'points_against_per_game',
  'scoring_margin_per_game',
  'one_score_games_played',
  'one_score_win_pct',
];

export const resultsScaffold: StatCalculator = {
  name: 'results_scaffold',
  finalize(ctx: StatContext) {
    RESULTS_STATS.forEach((key) => {
      if (ctx.stats[key] === undefined) {
        ctx.addStat(key, 0);
      }
    });
  }
};


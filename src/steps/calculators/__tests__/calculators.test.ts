import { test } from 'node:test';
import assert from 'node:assert';
import { offensivePlayCountCalculator } from '../offense_basic';
import { offensiveEfficiencyCalculator } from '../offense_efficiency';
import { buildResultsCalculator } from '../results';
import { StatContext, GameMeta } from '../types';

function createContext(meta?: GameMeta): StatContext {
  const stats: Record<string, number> = {};
  return {
    season: '2025',
    week: '1',
    game_id: 'gid',
    team: 'TEAM',
    stats,
    meta,
    addStat(key, value) {
      stats[key] = value;
    },
    incrementStat(key, by: number = 1) {
      stats[key] = (stats[key] ?? 0) + by;
    },
  };
}

test('offensivePlayCountCalculator counts only offensive play types', () => {
  const ctx = createContext();
  offensivePlayCountCalculator.accumulate?.({ play_type: 'pass' }, ctx);
  offensivePlayCountCalculator.accumulate?.({ play_type: 'run' }, ctx);
  offensivePlayCountCalculator.accumulate?.({ play_type: 'sack' }, ctx);
  offensivePlayCountCalculator.accumulate?.({ play_type: 'punt' }, ctx); // should not count

  assert.equal(ctx.stats.off_plays, 3);
});

test('offensiveEfficiencyCalculator tracks third downs and red zone', () => {
  const ctx = createContext();
  offensiveEfficiencyCalculator.init?.(ctx);

  // Third-down conversion
  offensiveEfficiencyCalculator.accumulate?.(
    { posteam: 'TEAM', play_type: 'pass', down: 3, first_down: true },
    ctx,
  );
  // Third-down failure
  offensiveEfficiencyCalculator.accumulate?.(
    { posteam: 'TEAM', play_type: 'run', down: 3, first_down: false },
    ctx,
  );

  // Red-zone drive start and TD
  offensiveEfficiencyCalculator.accumulate?.(
    { posteam: 'TEAM', play_type: 'run', down: 1, yardline_100: 18, fixed_drive: 1 },
    ctx,
  );
  offensiveEfficiencyCalculator.accumulate?.(
    {
      posteam: 'TEAM',
      play_type: 'run',
      down: 2,
      yardline_100: 10,
      fixed_drive: 1,
      touchdown: true,
    },
    ctx,
  );

  offensiveEfficiencyCalculator.finalize?.(ctx);

  assert.equal(ctx.stats.off_3rd_down_att, 2);
  assert.equal(ctx.stats.off_3rd_down_conv, 1);
  assert.equal(ctx.stats.off_3rd_down_pct, 0.5);
  assert.equal(ctx.stats.off_red_zone_trips, 1);
  assert.equal(ctx.stats.off_red_zone_tds, 1);
  assert.equal(ctx.stats.off_red_zone_td_pct, 1);
});

test('results calculator records points and one-score flags', () => {
  const metaLookup = new Map<string, GameMeta>([
    [
      'gid',
      {
        home_team: 'TEAM',
        away_team: 'OPP',
        home_score: 21,
        away_score: 17,
      },
    ],
  ]);
  const calc = buildResultsCalculator(metaLookup);
  const ctx = createContext(metaLookup.get('gid'));

  calc.finalize?.(ctx);

  assert.equal(ctx.stats.points_for, 21);
  assert.equal(ctx.stats.points_against, 17);
  assert.equal(ctx.stats.point_differential, 4);
  assert.equal(ctx.stats.scoring_margin_per_game, 4);
  assert.equal(ctx.stats.one_score_games_played, 1);
  assert.equal(ctx.stats.one_score_win_pct, 1);
});

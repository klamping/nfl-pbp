import { StatCalculator, StatContext } from './types';

// Offensive play count (existing logic)
export const offensivePlayCountCalculator: StatCalculator = {
  name: 'offensive_play_count',
  accumulate(play, ctx) {
    const playType = play.play_type;
    const isOffPlay =
      playType === 'run' ||
      playType === 'rush' ||
      playType === 'pass' ||
      playType === 'sack';
    if (!isOffPlay) return;

    ctx.incrementStat('off_plays');
  }
};

// Scaffold for offense_basic stats to ensure keys exist if not computed elsewhere.
const OFFENSE_BASIC_STATS = [
  'off_plays',
  'off_yards',
  'off_first_downs_total',
  'off_first_downs_rush',
  'off_first_downs_pass',
  'off_first_downs_penalty',
  'rush_att_off',
  'rush_yds_off',
  'rush_tds_off',
  'pass_att_off',
  'pass_cmp_off',
  'pass_yds_off',
  'pass_tds_off',
  'ints_thrown_off',
  'sacks_taken_off',
  'sack_yards_lost_off',
  'fum_off',
  'lost_fum_off',
  'yards_after_catch_off',
  'yards_after_contact_off',
  'broken_tackles_off',
  'tackles_for_loss_allowed',
];

export const offenseBasicScaffold: StatCalculator = {
  name: 'offense_basic_scaffold',
  finalize(ctx: StatContext) {
    OFFENSE_BASIC_STATS.forEach((key) => {
      if (ctx.stats[key] === undefined) {
        ctx.addStat(key, 0);
      }
    });
  }
};


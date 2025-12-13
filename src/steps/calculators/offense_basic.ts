import { StatCalculator, StatContext } from './types';

// Offensive play count (existing logic)
export const offensivePlayCountCalculator: StatCalculator = {
  name: 'offensive_play_count',
  accumulate(play, ctx) {
    if (play.posteam !== ctx.team) return;
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

const numeric = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const offenseBasicCalculator: StatCalculator = {
  name: 'offense_basic',
  accumulate(play, ctx) {
    if (play.posteam !== ctx.team) return;

    const yards = numeric(play.yards_gained);
    if (yards !== null) {
      ctx.incrementStat('off_yards', yards);
    }

    // First downs by type
    if (play.first_down_rush) ctx.incrementStat('off_first_downs_rush');
    if (play.first_down_pass) ctx.incrementStat('off_first_downs_pass');
    if (play.first_down_penalty) ctx.incrementStat('off_first_downs_penalty');

    // Rushing
    if (play.rush_attempt) {
      ctx.incrementStat('rush_att_off');
      const rushYds = numeric(play.rushing_yards);
      if (rushYds !== null) {
        ctx.incrementStat('rush_yds_off', rushYds);
      } else if (yards !== null) {
        ctx.incrementStat('rush_yds_off', yards);
      }
      if (play.rush_touchdown || (play.touchdown && play.play_type === 'run')) {
        ctx.incrementStat('rush_tds_off');
      }
    }

    // Passing
    if (play.pass_attempt) {
      ctx.incrementStat('pass_att_off');
      if (play.complete_pass) ctx.incrementStat('pass_cmp_off');
      const passYds = numeric(play.passing_yards);
      if (passYds !== null) {
        ctx.incrementStat('pass_yds_off', passYds);
      } else if (yards !== null) {
        ctx.incrementStat('pass_yds_off', yards);
      }
      if (play.pass_touchdown) ctx.incrementStat('pass_tds_off');
      if (play.interception) ctx.incrementStat('ints_thrown_off');
      const yac = numeric(play.yards_after_catch);
      if (yac !== null) {
        ctx.incrementStat('yards_after_catch_off', yac);
      }
    }

    // Sacks
    if (play.play_type === 'sack' || play.sack) {
      ctx.incrementStat('sacks_taken_off');
      const sackYards = numeric(play.sack_yards);
      const loss = sackYards !== null ? Math.abs(sackYards) : yards !== null ? Math.abs(yards) : 0;
      ctx.incrementStat('sack_yards_lost_off', loss);
    }

    // Ball security
    if (play.fumble) ctx.incrementStat('fum_off');
    if (play.fumble_lost) ctx.incrementStat('lost_fum_off');

    // Misc
    if (play.tackled_for_loss) ctx.incrementStat('tackles_for_loss_allowed');
  },
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

import { StatCalculator, StatContext } from './types';

const toNumber = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const stylePaceCalculator: StatCalculator = {
  name: 'style_pace',
  init(ctx) {
    ctx.addStat('off_seconds_per_play', 0);
    ctx.addStat('off_run_play_pct', 0);
    ctx.addStat('off_pass_play_pct', 0);
    ctx.addStat('play_action_rate_off', 0);
    ctx.addStat('shotgun_rate_off', 0);
    ctx.addStat('no_huddle_rate_off', 0);
    ctx.addStat('_off_plays_count', 0);
    ctx.addStat('_rush_att_count', 0);
    ctx.addStat('_pass_like_count', 0);
    ctx.addStat('_play_action_count', 0);
    ctx.addStat('_shotgun_count', 0);
    ctx.addStat('_no_huddle_count', 0);
    ctx.addStat('_total_play_seconds', 0);
  },
  accumulate(play, ctx) {
    if (play.posteam !== ctx.team) return;

    const playType = play.play_type;
    const isOffPlay =
      playType === 'run' ||
      playType === 'rush' ||
      playType === 'pass' ||
      playType === 'sack';
    if (!isOffPlay) return;

    ctx.incrementStat('_off_plays_count');

    // Time between snaps proxy: use play_clock if available, else drive_time_of_possession / plays later.
    const playClock = toNumber(play.play_clock);
    if (playClock !== null && playClock > 0) {
      // play_clock counts down; using it directly is noisy, so skip unless we implement a better diff.
    }

    // Rush/pass splits
    if (playType === 'run' || playType === 'rush') {
      ctx.incrementStat('_rush_att_count');
    }
    if (play.pass_attempt || playType === 'pass' || playType === 'sack') {
      ctx.incrementStat('_pass_like_count');
    }

    // Play-action and formations
    if (play.qb_dropback && play.play_action) {
      ctx.incrementStat('_play_action_count');
    }
    if (play.shotgun) {
      ctx.incrementStat('_shotgun_count');
    }
    if (play.no_huddle) {
      ctx.incrementStat('_no_huddle_count');
    }
  },
  finalize(ctx) {
    const safeDiv = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);
    const offPlays = ctx.stats['_off_plays_count'] ?? 0;
    const rushAtt = ctx.stats['_rush_att_count'] ?? 0;
    const passLike = ctx.stats['_pass_like_count'] ?? 0;

    ctx.addStat('off_run_play_pct', safeDiv(rushAtt, offPlays));
    ctx.addStat('off_pass_play_pct', safeDiv(passLike, offPlays));
    ctx.addStat('play_action_rate_off', safeDiv(ctx.stats['_play_action_count'] ?? 0, offPlays));
    ctx.addStat('shotgun_rate_off', safeDiv(ctx.stats['_shotgun_count'] ?? 0, offPlays));
    ctx.addStat('no_huddle_rate_off', safeDiv(ctx.stats['_no_huddle_count'] ?? 0, offPlays));

    // For seconds per play, we don't have precise per-play timing deltas in the PBP; leave 0 scaffolded.
    ctx.addStat('off_seconds_per_play', ctx.stats['off_seconds_per_play'] ?? 0);
  },
};

export function buildStylePaceScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'style_pace_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}

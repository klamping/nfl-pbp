import { StatCalculator, StatContext } from './types';

const toNumber = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const advancedRushingCalculator: StatCalculator = {
  name: 'advanced_rushing',
  init(ctx) {
    ctx.addStat('stuffed_runs_off', 0);
    ctx.addStat('explosive_runs_off', 0);
    ctx.addStat('designed_qb_runs_off', 0);
    ctx.addStat('qb_scrambles_off', 0);
    ctx.addStat('_rush_attempts_off', 0);
  },
  accumulate(play, ctx) {
    if (play.posteam !== ctx.team) return;

    const playType = play.play_type;
    const isRush = playType === 'run' || playType === 'rush' || play.rush_attempt;
    if (!isRush) return;

    ctx.incrementStat('_rush_attempts_off');

    const rushYds = toNumber(play.rushing_yards);
    const yards = rushYds !== null ? rushYds : toNumber(play.yards_gained);

    if (yards !== null && yards <= 0) {
      ctx.incrementStat('stuffed_runs_off');
    }
    if (yards !== null && yards >= 10) {
      ctx.incrementStat('explosive_runs_off');
    }

    // Scrambles flagged explicitly.
    if (play.qb_scramble) {
      ctx.incrementStat('qb_scrambles_off');
    }

    // Rough approximation of designed QB runs: rush attempt, not a scramble, not a dropback/spike/kneel.
    const isDesignedQbRun =
      (play.qb_kneel || play.qb_spike) ? false :
      !play.qb_scramble &&
      !play.qb_dropback &&
      isRush;
    if (isDesignedQbRun) {
      ctx.incrementStat('designed_qb_runs_off');
    }
  },
  finalize(ctx) {
    const safeDiv = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);
    const rushAtt = ctx.stats['_rush_attempts_off'] ?? 0;
    ctx.addStat('stuff_rate_off', safeDiv(ctx.stats['stuffed_runs_off'] ?? 0, rushAtt));
    ctx.addStat('explosive_run_rate_off', safeDiv(ctx.stats['explosive_runs_off'] ?? 0, rushAtt));
  },
};

export function buildAdvancedRushingScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'advanced_rushing_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}

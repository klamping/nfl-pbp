import { StatCalculator, StatContext } from './types';

// We don't have season-wide opponent adjustments available in this per-game context,
// so we surface placeholders/derived values to keep columns present.
export const scheduleAdjustedCalculator: StatCalculator = {
  name: 'schedule_adjusted',
  init(ctx) {
    ctx.addStat('avg_opponent_off_epa_per_play', 0);
    ctx.addStat('avg_opponent_def_epa_per_play', 0);
    ctx.addStat('off_epa_per_play_adj', 0);
    ctx.addStat('def_epa_per_play_adj', 0);
    ctx.addStat('strength_of_schedule_simple', 0);
    ctx.addStat('strength_of_schedule_epa', 0);
  },
  finalize(ctx) {
    // Use unadjusted EPA per play as a proxy for adjusted values.
    const offEpaPerPlay = ctx.stats['off_epa_per_play'] ?? 0;
    const defEpaPerPlay = ctx.stats['def_epa_per_play'] ?? 0;
    ctx.addStat('off_epa_per_play_adj', offEpaPerPlay);
    ctx.addStat('def_epa_per_play_adj', defEpaPerPlay);
    // Leave opponent averages and SOS metrics at 0 unless populated elsewhere.
  },
};

export function buildScheduleAdjustedScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'schedule_adjusted_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}

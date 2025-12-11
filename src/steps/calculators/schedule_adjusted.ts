import { StatCalculator, StatContext } from './types';

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


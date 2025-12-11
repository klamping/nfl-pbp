import { StatCalculator, StatContext } from './types';

export function buildAdvancedPassingScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'advanced_passing_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}


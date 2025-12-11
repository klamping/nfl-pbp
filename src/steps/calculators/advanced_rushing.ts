import { StatCalculator, StatContext } from './types';

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


import { StatCalculator, StatContext } from './types';

export function buildDefenseBasicScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'defense_basic_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}


import { StatCalculator, StatContext } from './types';

export function buildDefenseEfficiencyScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'defense_efficiency_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}


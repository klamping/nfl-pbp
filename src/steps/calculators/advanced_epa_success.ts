import { StatCalculator, StatContext } from './types';

export function buildAdvancedEpaSuccessScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'advanced_epa_success_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}


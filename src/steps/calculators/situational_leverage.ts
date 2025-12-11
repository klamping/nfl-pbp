import { StatCalculator, StatContext } from './types';

export function buildSituationalLeverageScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'situational_leverage_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}


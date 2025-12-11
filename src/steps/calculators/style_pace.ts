import { StatCalculator, StatContext } from './types';

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


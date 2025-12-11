import { StatCalculator, StatContext } from './types';

export function buildSpecialTeamsScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'special_teams_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}


import { StatCalculator, StatContext } from './types';

export function buildTurnoversPenaltiesScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'turnovers_penalties_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}


import { StatCalculator, StatContext } from './types';

const toNumber = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const turnoversPenaltiesCalculator: StatCalculator = {
  name: 'turnovers_penalties',
  init(ctx) {
    ctx.addStat('turnovers_off', 0);
    ctx.addStat('takeaways', 0);
    ctx.addStat('total_penalties', 0);
    ctx.addStat('total_penalty_yards', 0);
  },
  accumulate(play, ctx) {
    const posteam = play.posteam;
    const defteam = play.defteam;

    // Offensive turnovers: interceptions or fumbles lost by this offense.
    if (posteam === ctx.team) {
      if (play.interception) {
        ctx.incrementStat('turnovers_off');
      }
      if (play.fumble) {
        const recTeams = [play.fumble_recovery_1_team, play.fumble_recovery_2_team].filter(Boolean);
        if (recTeams.length && recTeams.every((t: string) => t !== ctx.team)) {
          ctx.incrementStat('turnovers_off');
        }
      }
    }

    // Defensive takeaways: interceptions or fumble recoveries by this defense.
    if (defteam === ctx.team) {
      if (play.interception) {
        ctx.incrementStat('takeaways');
      }
      if (play.fumble) {
        const recTeams = [play.fumble_recovery_1_team, play.fumble_recovery_2_team].filter(Boolean);
        if (recTeams.some((t: string) => t === ctx.team)) {
          ctx.incrementStat('takeaways');
        }
      }
    }

    // Penalties assessed to this team.
    if (play.penalty && play.penalty_team === ctx.team) {
      ctx.incrementStat('total_penalties');
      const penYds = toNumber(play.penalty_yards);
      if (penYds !== null) {
        ctx.incrementStat('total_penalty_yards', penYds);
      }
    }
  },
  finalize(ctx) {
    const takeaways = ctx.stats['takeaways'] ?? 0;
    const turnovers = ctx.stats['turnovers_off'] ?? 0;
    const margin = takeaways - turnovers;
    ctx.addStat('turnover_margin', margin);
    ctx.addStat('turnover_margin_per_game', margin); // single-game context

    const pens = ctx.stats['total_penalties'] ?? 0;
    const penYds = ctx.stats['total_penalty_yards'] ?? 0;
    ctx.addStat('penalties_per_game', pens);
    ctx.addStat('penalty_yards_per_game', penYds);
  },
};

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

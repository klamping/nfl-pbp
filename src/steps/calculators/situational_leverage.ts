import { StatCalculator, StatContext } from './types';

const toNumber = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const situationalLeverageCalculator: StatCalculator = {
  name: 'situational_leverage',
  init(ctx) {
    ctx.addStat('late_down_epa_off', 0);
    ctx.addStat('late_down_epa_def', 0);
    ctx.addStat('two_min_epa_off', 0);
    ctx.addStat('two_min_epa_def', 0);
    ctx.addStat('close_game_epa_off', 0);
    ctx.addStat('close_game_epa_def', 0);
    ctx.addStat('_late_down_off_plays', 0);
    ctx.addStat('_late_down_def_plays', 0);
    ctx.addStat('_two_min_off_plays', 0);
    ctx.addStat('_two_min_def_plays', 0);
    ctx.addStat('_close_game_off_plays', 0);
    ctx.addStat('_close_game_def_plays', 0);
  },
  accumulate(play, ctx) {
    const epa = toNumber(play.epa);
    const down = toNumber(play.down);
    const halfRemain = toNumber(play.half_seconds_remaining);
    const posteam = play.posteam;
    const defteam = play.defteam;
    const scoreDiff =
      toNumber(play.posteam_score) !== null && toNumber(play.defteam_score) !== null
        ? Math.abs((toNumber(play.posteam_score) || 0) - (toNumber(play.defteam_score) || 0))
        : null;

    if (epa === null) {
      return;
    }

    // Late downs: 3rd or 4th down
    if (down === 3 || down === 4) {
      if (posteam === ctx.team) {
        ctx.incrementStat('late_down_epa_off', epa);
        ctx.incrementStat('_late_down_off_plays');
      }
      if (defteam === ctx.team) {
        ctx.incrementStat('late_down_epa_def', epa);
        ctx.incrementStat('_late_down_def_plays');
      }
    }

    // Two-minute: final 120 seconds of half
    if (halfRemain !== null && halfRemain <= 120) {
      if (posteam === ctx.team) {
        ctx.incrementStat('two_min_epa_off', epa);
        ctx.incrementStat('_two_min_off_plays');
      }
      if (defteam === ctx.team) {
        ctx.incrementStat('two_min_epa_def', epa);
        ctx.incrementStat('_two_min_def_plays');
      }
    }

    // Close game: score differential <= 8
    if (scoreDiff !== null && scoreDiff <= 8) {
      if (posteam === ctx.team) {
        ctx.incrementStat('close_game_epa_off', epa);
        ctx.incrementStat('_close_game_off_plays');
      }
      if (defteam === ctx.team) {
        ctx.incrementStat('close_game_epa_def', epa);
        ctx.incrementStat('_close_game_def_plays');
      }
    }
  },
  finalize(ctx) {
    const safeDiv = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);

    ctx.addStat(
      'late_down_epa_off',
      safeDiv(ctx.stats['late_down_epa_off'] ?? 0, ctx.stats['_late_down_off_plays'] ?? 0),
    );
    ctx.addStat(
      'late_down_epa_def',
      safeDiv(ctx.stats['late_down_epa_def'] ?? 0, ctx.stats['_late_down_def_plays'] ?? 0),
    );
    ctx.addStat(
      'two_min_epa_off',
      safeDiv(ctx.stats['two_min_epa_off'] ?? 0, ctx.stats['_two_min_off_plays'] ?? 0),
    );
    ctx.addStat(
      'two_min_epa_def',
      safeDiv(ctx.stats['two_min_epa_def'] ?? 0, ctx.stats['_two_min_def_plays'] ?? 0),
    );
    ctx.addStat(
      'close_game_epa_off',
      safeDiv(ctx.stats['close_game_epa_off'] ?? 0, ctx.stats['_close_game_off_plays'] ?? 0),
    );
    ctx.addStat(
      'close_game_epa_def',
      safeDiv(ctx.stats['close_game_epa_def'] ?? 0, ctx.stats['_close_game_def_plays'] ?? 0),
    );
  },
};

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

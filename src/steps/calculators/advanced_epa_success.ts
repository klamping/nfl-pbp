import { StatCalculator, StatContext } from './types';

const toNumber = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const advancedEpaSuccessCalculator: StatCalculator = {
  name: 'advanced_epa_success',
  init(ctx) {
    // Offense
    ctx.addStat('off_total_epa', 0);
    ctx.addStat('off_success_plays', 0);
    ctx.addStat('off_plays', 0);
    ctx.addStat('off_rush_plays', 0);
    ctx.addStat('off_pass_plays', 0);
    // Defense
    ctx.addStat('def_total_epa_allowed', 0);
    ctx.addStat('def_success_plays', 0);
    ctx.addStat('def_plays', 0);
    ctx.addStat('def_rush_plays', 0);
    ctx.addStat('def_pass_plays', 0);
  },
  accumulate(play, ctx) {
    const playType = play.play_type;
    const isOffPlay =
      playType === 'run' ||
      playType === 'rush' ||
      playType === 'pass' ||
      playType === 'sack';
    const epa = toNumber(play.epa) ?? 0;
    const isSuccess = Boolean(play.success);

    // Offense side
    if (play.posteam === ctx.team && isOffPlay) {
      ctx.incrementStat('off_total_epa', epa);
      ctx.incrementStat('off_plays');
      if (playType === 'run' || playType === 'rush') {
        ctx.incrementStat('off_rush_plays');
        ctx.incrementStat('off_epa_per_rush', epa);
      }
      if (playType === 'pass' || playType === 'sack') {
        ctx.incrementStat('off_pass_plays');
        ctx.incrementStat('off_epa_per_pass', epa);
      }
      if (isSuccess) {
        ctx.incrementStat('off_success_plays');
      }
    }

    // Defense side
    if (play.defteam === ctx.team && isOffPlay) {
      ctx.incrementStat('def_total_epa_allowed', epa);
      ctx.incrementStat('def_plays');
      if (playType === 'run' || playType === 'rush') {
        ctx.incrementStat('def_rush_plays');
        ctx.incrementStat('def_epa_per_rush', epa);
      }
      if (playType === 'pass' || playType === 'sack') {
        ctx.incrementStat('def_pass_plays');
        ctx.incrementStat('def_epa_per_pass', epa);
      }
      if (isSuccess) {
        ctx.incrementStat('def_success_plays');
      }
    }
  },
  finalize(ctx) {
    const safeDiv = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);

    // Offense
    const offPlays = ctx.stats['off_plays'] ?? 0;
    const offRush = ctx.stats['off_rush_plays'] ?? 0;
    const offPass = ctx.stats['off_pass_plays'] ?? 0;
    const offEpa = ctx.stats['off_total_epa'] ?? 0;
    const offRushEpa = ctx.stats['off_epa_per_rush'] ?? 0;
    const offPassEpa = ctx.stats['off_epa_per_pass'] ?? 0;
    ctx.addStat('off_epa_per_play', safeDiv(offEpa, offPlays));
    ctx.addStat('off_epa_per_rush', safeDiv(offRushEpa, offRush));
    ctx.addStat('off_epa_per_pass', safeDiv(offPassEpa, offPass));
    ctx.addStat('off_success_rate', safeDiv(ctx.stats['off_success_plays'] ?? 0, offPlays));

    // Defense
    const defPlays = ctx.stats['def_plays'] ?? 0;
    const defRush = ctx.stats['def_rush_plays'] ?? 0;
    const defPass = ctx.stats['def_pass_plays'] ?? 0;
    const defEpa = ctx.stats['def_total_epa_allowed'] ?? 0;
    const defRushEpa = ctx.stats['def_epa_per_rush'] ?? 0;
    const defPassEpa = ctx.stats['def_epa_per_pass'] ?? 0;
    ctx.addStat('def_epa_per_play', safeDiv(defEpa, defPlays));
    ctx.addStat('def_epa_per_rush', safeDiv(defRushEpa, defRush));
    ctx.addStat('def_epa_per_pass', safeDiv(defPassEpa, defPass));
    ctx.addStat('def_success_rate', safeDiv(ctx.stats['def_success_plays'] ?? 0, defPlays));
  },
};

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

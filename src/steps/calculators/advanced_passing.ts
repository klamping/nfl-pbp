import { StatCalculator, StatContext } from './types';

const toNumber = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const advancedPassingCalculator: StatCalculator = {
  name: 'advanced_passing',
  init(ctx) {
    ctx.addStat('air_yards_off', 0);
    ctx.addStat('yac_off', 0);
    ctx.addStat('air_yards_per_attempt_off', 0);
    ctx.addStat('yac_per_reception_off', 0);
    ctx.addStat('cpoe_off', 0);
    ctx.addStat('_adv_pass_air_attempt_sum', 0);
    ctx.addStat('_adv_pass_air_attempt_count', 0);
    ctx.addStat('_adv_pass_yac_rec_sum', 0);
    ctx.addStat('_adv_pass_yac_rec_count', 0);
    ctx.addStat('_adv_pass_cpoe_sum', 0);
    ctx.addStat('_adv_pass_cpoe_count', 0);
    ctx.addStat('pressure_dropbacks_off', 0);
    ctx.addStat('dropbacks_off', 0);
    ctx.addStat('pressure_rate_off', 0);
    ctx.addStat('sack_to_pressure_rate_off', 0);
    ctx.addStat('time_to_throw_off', 0);
  },
  accumulate(play, ctx) {
    if (play.posteam !== ctx.team) return;

    const playType = play.play_type;
    const isPassPlay =
      playType === 'pass' ||
      playType === 'sack' ||
      play.pass_attempt ||
      play.qb_dropback;

    if (!isPassPlay) return;

    ctx.incrementStat('dropbacks_off');

    const air = toNumber(play.air_yards);
    if (air !== null) {
      ctx.incrementStat('air_yards_off', air);
    }
    const yac = toNumber(play.yards_after_catch);
    if (yac !== null) {
      ctx.incrementStat('yac_off', yac);
    }

    if (play.complete_pass) {
      ctx.incrementStat('_adv_pass_yac_rec_sum', yac ?? 0);
      ctx.incrementStat('_adv_pass_yac_rec_count');
    }
    if (play.pass_attempt || playType === 'pass' || playType === 'sack') {
      ctx.incrementStat('_adv_pass_air_attempt_sum', air ?? 0);
      ctx.incrementStat('_adv_pass_air_attempt_count');
    }

    const cpoe = toNumber(play.cpoe);
    if (cpoe !== null) {
      ctx.incrementStat('_adv_pass_cpoe_sum', cpoe);
      ctx.incrementStat('_adv_pass_cpoe_count');
    }

    // Approximate pressures via QB hits or sacks
    const pressured = Boolean(play.qb_hit) || playType === 'sack';
    if (pressured) {
      ctx.incrementStat('pressure_dropbacks_off');
      if (playType === 'sack') {
        ctx.incrementStat('sack_to_pressure_rate_off');
      }
    }
  },
  finalize(ctx) {
    const safeDiv = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);
    const dropbacks = ctx.stats['dropbacks_off'] ?? 0;

    const airSum = ctx.stats['_adv_pass_air_attempt_sum'] ?? 0;
    const airCount = ctx.stats['_adv_pass_air_attempt_count'] ?? 0;
    ctx.addStat('air_yards_per_attempt_off', safeDiv(airSum, airCount));

    const yacSum = ctx.stats['_adv_pass_yac_rec_sum'] ?? 0;
    const yacCount = ctx.stats['_adv_pass_yac_rec_count'] ?? 0;
    ctx.addStat('yac_per_reception_off', safeDiv(yacSum, yacCount));

    const cpoeSum = ctx.stats['_adv_pass_cpoe_sum'] ?? 0;
    const cpoeCount = ctx.stats['_adv_pass_cpoe_count'] ?? 0;
    ctx.addStat('cpoe_off', safeDiv(cpoeSum, cpoeCount));

    const pressureDropbacks = ctx.stats['pressure_dropbacks_off'] ?? 0;
    ctx.addStat('pressure_rate_off', safeDiv(pressureDropbacks, dropbacks));
    ctx.addStat(
      'sack_to_pressure_rate_off',
      safeDiv(ctx.stats['sack_to_pressure_rate_off'] ?? 0, pressureDropbacks),
    );

    // time_to_throw_off unavailable in source; leave as 0 (scaffold will ensure key exists)
  },
};

export function buildAdvancedPassingScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'advanced_passing_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}

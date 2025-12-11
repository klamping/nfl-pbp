import { StatCalculator, StatContext } from './types';

export const offensiveEfficiencyCalculator: StatCalculator = {
  name: 'offense_efficiency',
  init(ctx) {
    ctx.addStat('off_first_downs_total', 0);
    ctx.addStat('off_3rd_down_att', 0);
    ctx.addStat('off_3rd_down_conv', 0);
    ctx.addStat('off_red_zone_trips', 0);
    ctx.addStat('off_red_zone_tds', 0);
    (ctx as any)._rz_drives = new Set<string | number>();
  },
  accumulate(play, ctx) {
    if (play.posteam !== ctx.team) return;

    if (play.first_down) {
      ctx.incrementStat('off_first_downs_total');
    }

    const playType = play.play_type;
    const isOffPlay =
      playType === 'run' ||
      playType === 'rush' ||
      playType === 'pass' ||
      playType === 'sack';

    if (play.down === 3 && isOffPlay) {
      ctx.incrementStat('off_3rd_down_att');
      if (play.first_down) {
        ctx.incrementStat('off_3rd_down_conv');
      }
    }

    const yardline = typeof play.yardline_100 === 'number' ? play.yardline_100 : null;
    const driveId = play.fixed_drive ?? play.drive;
    if (yardline !== null && yardline <= 20 && play.down === 1 && driveId !== undefined) {
      const key = driveId;
      const set = ((ctx as any)._rz_drives ||= new Set<string | number>()) as Set<string | number>;
      if (!set.has(key)) {
        set.add(key);
        ctx.incrementStat('off_red_zone_trips');
      }
    }
    if (yardline !== null && yardline <= 20 && play.touchdown && play.posteam === ctx.team) {
      ctx.incrementStat('off_red_zone_tds');
    }
  },
  finalize(ctx) {
    const att = ctx.stats['off_3rd_down_att'] ?? 0;
    const conv = ctx.stats['off_3rd_down_conv'] ?? 0;
    if (att > 0) {
      ctx.addStat('off_3rd_down_pct', conv / att);
    }
    const trips = ctx.stats['off_red_zone_trips'] ?? 0;
    const tds = ctx.stats['off_red_zone_tds'] ?? 0;
    if (trips > 0) {
      ctx.addStat('off_red_zone_td_pct', tds / trips);
    }
  }
};

// Scaffold for efficiency-related stats to ensure presence.
const OFFENSE_EFFICIENCY_STATS = [
  'off_3rd_down_att',
  'off_3rd_down_conv',
  'off_3rd_down_pct',
  'off_red_zone_trips',
  'off_red_zone_tds',
  'off_red_zone_td_pct',
];

export const offenseEfficiencyScaffold: StatCalculator = {
  name: 'offense_efficiency_scaffold',
  finalize(ctx: StatContext) {
    OFFENSE_EFFICIENCY_STATS.forEach((key) => {
      if (ctx.stats[key] === undefined) {
        ctx.addStat(key, 0);
      }
    });
  }
};


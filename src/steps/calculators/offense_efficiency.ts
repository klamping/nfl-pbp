import { StatCalculator, StatContext } from './types';

export const offensiveEfficiencyCalculator: StatCalculator = {
  name: 'offense_efficiency',
  init(ctx) {
    ctx.addStat('off_first_downs_total', 0);
    ctx.addStat('off_3rd_down_att', 0);
    ctx.addStat('off_3rd_down_conv', 0);
    ctx.addStat('off_red_zone_trips', 0);
    ctx.addStat('off_red_zone_tds', 0);
    (ctx.stats as any)._off_eff_state = {
      rzDrives: new Set<string | number>(),
      drives: new Map<string | number, { plays?: number; first_downs?: number; result?: string | null }>(),
    };
  },
  accumulate(play, ctx) {
    if (play.posteam !== ctx.team) return;

    const state =
      (ctx.stats as any)._off_eff_state ||
      ((ctx.stats as any)._off_eff_state = {
        rzDrives: new Set<string | number>(),
        drives: new Map<string | number, { plays?: number; first_downs?: number; result?: string | null }>(),
      });

    const playType = play.play_type;
    const isOffPlay =
      playType === 'run' ||
      playType === 'rush' ||
      playType === 'pass' ||
      playType === 'sack';

    if (play.first_down) {
      ctx.incrementStat('off_first_downs_total');
    }

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
      const set = state.rzDrives as Set<string | number>;
      if (!set.has(key)) {
        set.add(key);
        ctx.incrementStat('off_red_zone_trips');
      }
    }
    if (yardline !== null && yardline <= 20 && play.touchdown && play.posteam === ctx.team) {
      ctx.incrementStat('off_red_zone_tds');
    }

    // Track drive-level info for efficiency metrics.
    if (driveId !== undefined && driveId !== null) {
      const drives = state.drives as Map<string | number, any>;
      const entry = drives.get(driveId) ?? {};
      if (play.drive_play_count !== undefined && play.drive_play_count !== null) {
        entry.plays = play.drive_play_count;
      }
      if (play.drive_first_downs !== undefined && play.drive_first_downs !== null) {
        entry.first_downs = play.drive_first_downs;
      }
      if (play.fixed_drive_result) {
        entry.result = play.fixed_drive_result as string;
      }
      drives.set(driveId, entry);
    }

    // Fourth-down attempts/conversions.
    if (play.down === 4 && isOffPlay) {
      ctx.incrementStat('off_4th_down_att');
      if (play.first_down) {
        ctx.incrementStat('off_4th_down_conv');
      }
    }
  },
  finalize(ctx) {
    const safeDiv = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);

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

    // Drive-level metrics.
    const state =
      (ctx.stats as any)._off_eff_state ||
      ((ctx.stats as any)._off_eff_state = {
        rzDrives: new Set<string | number>(),
        drives: new Map<string | number, { plays?: number; first_downs?: number; result?: string | null }>(),
      });
    const driveList = Array.from((state.drives as Map<string | number, any>).values());
    const driveCount = driveList.length;
    ctx.addStat('off_drives', driveCount);

    const tdDrives = driveList.filter((d) => d.result === 'Touchdown').length;
    const fgDrives = driveList.filter((d) => d.result === 'Field goal').length;
    const puntDrives = driveList.filter((d) => d.result === 'Punt').length;
    const turnoverDrives = driveList.filter((d) =>
      ['Turnover', 'Turnover on downs', 'Opp touchdown', 'Safety'].includes(d.result),
    ).length;

    ctx.addStat('off_td_drives', tdDrives);
    ctx.addStat('off_fg_drives', fgDrives);
    ctx.addStat('off_punt_drives', puntDrives);
    ctx.addStat('off_turnover_drives', turnoverDrives);

    const threeAndOutDrives = driveList.filter((d) => {
      const plays = typeof d.plays === 'number' ? d.plays : null;
      const fds = typeof d.first_downs === 'number' ? d.first_downs : null;
      return plays !== null && plays <= 3 && (fds ?? 0) === 0;
    }).length;
    ctx.addStat('off_3_and_out_drives', threeAndOutDrives);
    ctx.addStat('off_3_and_out_rate', safeDiv(threeAndOutDrives, driveCount));

    // Points per drive using simple mapping.
    const drivePoints = (result: string | undefined | null): number => {
      switch (result) {
        case 'Touchdown':
          return 7;
        case 'Field goal':
          return 3;
        case 'Safety':
          return 2;
        default:
          return 0;
      }
    };
    const totalDrivePoints = driveList.reduce(
      (sum, d) => sum + drivePoints(d.result as string | undefined),
      0,
    );
    ctx.addStat('off_points_per_drive', safeDiv(totalDrivePoints, driveCount));

    // Rate stats derived from base totals.
    const rushAtt = ctx.stats['rush_att_off'] ?? 0;
    const rushYds = ctx.stats['rush_yds_off'] ?? 0;
    ctx.addStat('yards_per_rush_off', safeDiv(rushYds, rushAtt));

    const passAtt = ctx.stats['pass_att_off'] ?? 0;
    const passCmp = ctx.stats['pass_cmp_off'] ?? 0;
    const passYds = ctx.stats['pass_yds_off'] ?? 0;
    const sacks = ctx.stats['sacks_taken_off'] ?? 0;
    const sackYds = ctx.stats['sack_yards_lost_off'] ?? 0;
    const offPlays = ctx.stats['off_plays'] ?? 0;
    const offYards = ctx.stats['off_yards'] ?? 0;

    ctx.addStat('completion_pct_off', safeDiv(passCmp, passAtt));
    ctx.addStat('yards_per_play_off', safeDiv(offYards, offPlays));
    ctx.addStat('yards_per_pass_attempt_off', safeDiv(passYds, passAtt));
    ctx.addStat(
      'net_yards_per_pass_attempt_off',
      safeDiv(passYds - sackYds, passAtt + sacks),
    );
    ctx.addStat('yards_per_play_off', safeDiv(offYards, offPlays));
    ctx.addStat('yards_per_rush_off', safeDiv(rushYds, rushAtt));
    ctx.addStat('off_points_per_drive', safeDiv(totalDrivePoints, driveCount));
    ctx.addStat('off_4th_down_pct', safeDiv(ctx.stats['off_4th_down_conv'] ?? 0, ctx.stats['off_4th_down_att'] ?? 0));
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
  'yards_per_play_off',
  'yards_per_rush_off',
  'yards_per_pass_attempt_off',
  'net_yards_per_pass_attempt_off',
  'completion_pct_off',
  'off_drives',
  'off_points_per_drive',
  'off_td_drives',
  'off_fg_drives',
  'off_punt_drives',
  'off_turnover_drives',
  'off_3_and_out_drives',
  'off_3_and_out_rate',
  'off_4th_down_att',
  'off_4th_down_conv',
  'off_4th_down_pct',
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

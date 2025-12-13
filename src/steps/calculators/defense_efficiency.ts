import { StatCalculator, StatContext } from './types';

const toNumber = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const defenseEfficiencyCalculator: StatCalculator = {
  name: 'defense_efficiency',
  init(ctx) {
    ctx.addStat('def_3rd_down_att', 0);
    ctx.addStat('def_3rd_down_conv', 0);
    ctx.addStat('def_red_zone_trips_allowed', 0);
    ctx.addStat('def_red_zone_tds_allowed', 0);
    (ctx.stats as any)._def_eff_state = {
      rzDrives: new Set<string | number>(),
      drives: new Map<string | number, { plays?: number; first_downs?: number; result?: string | null }>(),
    };
  },
  accumulate(play, ctx) {
    if (play.defteam !== ctx.team) return;

    const state =
      (ctx.stats as any)._def_eff_state ||
      ((ctx.stats as any)._def_eff_state = {
        rzDrives: new Set<string | number>(),
        drives: new Map<string | number, { plays?: number; first_downs?: number; result?: string | null }>(),
      });

    const playType = play.play_type;
    const isOffPlay =
      playType === 'run' ||
      playType === 'rush' ||
      playType === 'pass' ||
      playType === 'sack';

    if (play.down === 3 && isOffPlay) {
      ctx.incrementStat('def_3rd_down_att');
      if (play.first_down) {
        ctx.incrementStat('def_3rd_down_conv');
      }
    }

    const yardline = typeof play.yardline_100 === 'number' ? play.yardline_100 : null;
    const driveId = play.fixed_drive ?? play.drive;
    if (yardline !== null && yardline <= 20 && play.down === 1 && driveId !== undefined) {
      const key = driveId;
      const set = state.rzDrives as Set<string | number>;
      if (!set.has(key)) {
        set.add(key);
        ctx.incrementStat('def_red_zone_trips_allowed');
      }
    }
    if (yardline !== null && yardline <= 20 && play.touchdown && play.posteam !== ctx.team) {
      ctx.incrementStat('def_red_zone_tds_allowed');
    }

    // Track drives where this team is on defense.
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
  },
  finalize(ctx) {
    const safeDiv = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);

    // Rates for downs/red zone
    const dAtt = ctx.stats['def_3rd_down_att'] ?? 0;
    const dConv = ctx.stats['def_3rd_down_conv'] ?? 0;
    ctx.addStat('def_3rd_down_pct', safeDiv(dConv, dAtt));

    const rzTrips = ctx.stats['def_red_zone_trips_allowed'] ?? 0;
    const rzTds = ctx.stats['def_red_zone_tds_allowed'] ?? 0;
    ctx.addStat('def_red_zone_td_pct_allowed', safeDiv(rzTds, rzTrips));

    // Drive-level metrics
    const state =
      (ctx.stats as any)._def_eff_state ||
      ((ctx.stats as any)._def_eff_state = {
        rzDrives: new Set<string | number>(),
        drives: new Map<string | number, { plays?: number; first_downs?: number; result?: string | null }>(),
      });
    const driveList = Array.from((state.drives as Map<string | number, any>).values());
    const driveCount = driveList.length;
    ctx.addStat('def_drives', driveCount);

    const tdAllowed = driveList.filter((d) => d.result === 'Touchdown').length;
    const fgAllowed = driveList.filter((d) => d.result === 'Field goal').length;
    ctx.addStat('def_td_drives_allowed', tdAllowed);
    ctx.addStat('def_fg_drives_allowed', fgAllowed);

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
    const totalPointsAllowed = driveList.reduce(
      (sum, d) => sum + drivePoints(d.result as string | undefined),
      0,
    );
    ctx.addStat('def_points_per_drive', safeDiv(totalPointsAllowed, driveCount));

    // Takeaways
    const ints = ctx.stats['ints_def'] ?? 0;
    const fumbles = ctx.stats['fumble_recoveries_def'] ?? 0;
    const takeaways = ints + fumbles;
    ctx.addStat('takeaways', takeaways);
    ctx.addStat('takeaways_per_game', takeaways); // single-game context

    // Yards/rate metrics
    const defPlays = ctx.stats['def_plays'] ?? 0;
    const defYards = ctx.stats['def_yards_allowed'] ?? 0;
    const rushAtt = ctx.stats['rush_att_def'] ?? 0;
    const rushYds = ctx.stats['rush_yds_allowed'] ?? 0;
    const passAtt = ctx.stats['pass_att_def'] ?? 0;
    const passCmp = ctx.stats['pass_cmp_def'] ?? 0;
    const passYds = ctx.stats['pass_yds_allowed'] ?? 0;
    const sacks = ctx.stats['sacks_def'] ?? 0;
    const sackYds = ctx.stats['sack_yards_def'] ?? 0;

    ctx.addStat('yards_per_play_def', safeDiv(defYards, defPlays));
    ctx.addStat('yards_per_rush_def', safeDiv(rushYds, rushAtt));
    ctx.addStat('yards_per_pass_attempt_def', safeDiv(passYds, passAtt));
    ctx.addStat('net_yards_per_pass_attempt_def', safeDiv(passYds + sackYds, passAtt + sacks));
    ctx.addStat('completion_pct_def', safeDiv(passCmp, passAtt));
  },
};

export function buildDefenseEfficiencyScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'defense_efficiency_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}

import { StatCalculator, StatContext } from './types';

const toNumber = (val: any): number | null => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
};

export const defenseBasicCalculator: StatCalculator = {
  name: 'defense_basic',
  accumulate(play, ctx) {
    // Only count plays where this team is on defense.
    if (play.defteam !== ctx.team) return;

    const playType = play.play_type;
    const isOffPlay =
      playType === 'run' ||
      playType === 'rush' ||
      playType === 'pass' ||
      playType === 'sack';

    if (isOffPlay) {
      ctx.incrementStat('def_plays');
      const yards = toNumber(play.yards_gained);
      if (yards !== null) {
        ctx.incrementStat('def_yards_allowed', yards);
      }
    }

    // Rushing defense
    if (playType === 'run' || playType === 'rush') {
      ctx.incrementStat('rush_att_def');
      const rushYds = toNumber(play.rushing_yards);
      const yards = rushYds !== null ? rushYds : toNumber(play.yards_gained);
      if (yards !== null) {
        ctx.incrementStat('rush_yds_allowed', yards);
      }
      if (play.touchdown || play.rush_touchdown) {
        ctx.incrementStat('rush_tds_allowed');
      }
    }

    // Passing defense
    if (play.pass_attempt || playType === 'pass' || playType === 'sack') {
      ctx.incrementStat('pass_att_def');
      if (play.complete_pass) {
        ctx.incrementStat('pass_cmp_def');
      }
      const passYds = toNumber(play.passing_yards);
      const yards = passYds !== null ? passYds : toNumber(play.yards_gained);
      if (yards !== null) {
        ctx.incrementStat('pass_yds_allowed', yards);
      }
      if (play.pass_touchdown) {
        ctx.incrementStat('pass_tds_allowed');
      }
    }

    // Sacks
    if (playType === 'sack' || play.sack) {
      ctx.incrementStat('sacks_def');
      const sackYds = toNumber(play.sack_yards);
      const yards = sackYds !== null ? Math.abs(sackYds) : toNumber(play.yards_gained);
      if (yards !== null) {
        ctx.incrementStat('sack_yards_def', yards);
      }
    }

    // Turnovers
    if (play.interception) {
      ctx.incrementStat('ints_def');
    }

    if (play.fumble) {
      // Forced fumble if offense is fumbling.
      const fumblingTeam = play.fumbled_1_team ?? play.fumbled_2_team;
      if (fumblingTeam && fumblingTeam !== ctx.team) {
        ctx.incrementStat('forced_fumbles_def');
      }
      // Recoveries by defense.
      if (play.fumble_recovery_1_team === ctx.team || play.fumble_recovery_2_team === ctx.team) {
        ctx.incrementStat('fumble_recoveries_def');
      }
    }

    // Defensive touchdowns (touchdowns scored by the defensive team).
    if (play.touchdown && play.td_team === ctx.team) {
      ctx.incrementStat('defensive_tds');
    }

    // Defensive penalties.
    if (play.penalty && play.penalty_team === ctx.team) {
      ctx.incrementStat('defensive_penalties');
      const penYds = toNumber(play.penalty_yards);
      if (penYds !== null) {
        ctx.incrementStat('defensive_penalty_yards', penYds);
      }
    }
  },
};

export function buildDefenseBasicScaffold(stats: string[] = []): StatCalculator {
  return {
    name: 'defense_basic_scaffold',
    finalize(ctx: StatContext) {
      stats.forEach((key) => {
        if (ctx.stats[key] === undefined) {
          ctx.addStat(key, 0);
        }
      });
    },
  };
}

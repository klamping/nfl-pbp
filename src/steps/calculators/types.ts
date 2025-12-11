export interface GameMeta {
  home_team?: string;
  away_team?: string;
  home_score?: number;
  away_score?: number;
}

export type StatContext = {
  season: string;
  week: string;
  game_id: string;
  team: string;
  stats: Record<string, number>;
  meta?: GameMeta;
  allowedStats?: Set<string> | null;
  addStat: (key: string, value: number) => void;
  incrementStat: (key: string, by?: number) => void;
};

export type StatCalculator = {
  name: string;
  init?: (ctx: StatContext) => void;
  accumulate?: (play: any, ctx: StatContext) => void;
  finalize?: (ctx: StatContext) => void;
};

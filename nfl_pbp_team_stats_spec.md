# NFL PBP → Team Game Stats Feature Pipeline

## 1. Problem Statement
We derive predictive features from play-by-play (PBP) to model whether a team will cover the spread. A per-team-per-game stats layer will serve as the core feature foundation for a machine-learning cover-prediction model.

## 2. Scope
- Input: Raw PBP (`sample.json` format)
- Output: Game-matched feature table for model training
- Excludes: player-level embeddings, roster substitutions

## 3. Requirements
3.1 System shall load PBP data with columns including season, week, game_id, posteam, defteam, play_type, rush_attempt, pass_attempt, success, epa, wpa, yardline_100, down, ydstogo, qtr, fixed_drive, drive_time_of_possession, touchdown indicators, interception, fumble, roof, surface, temp, wind, div_game.

3.2 System shall filter out non-play rows (quarter ends, game start, administrative plays).

3.3 System shall compute per-play flags including:
- is_run
- is_pass
- is_dropback
- is_explosive_run
- is_explosive_pass
- is_red_zone
- is_third_down_play
- is_fourth_down_play
- is_short_yardage

3.4 System shall compute offense metrics per team-game:
- EPA per play, success rate, yards/play
- rush EPA, pass EPA, explosive play rates
- 3rd/4th down conversion rates
- red-zone EPA & TD rate
- turnover count & turnover rate

3.5 System shall compute defense metrics per team-game:
- defensive EPA per play allowed
- run/pass splits
- explosive plays allowed
- 3rd/4th conversion allowed
- red-zone allowed TD rate
- takeaways

3.6 System shall compute drive metrics per team-game:
- drives, 3-and-out rate, long-drive rate, scoring rate
- first-downs/drive
- red-zone drives

3.7 System shall produce a unified table (team_game_stats) including offense, defense, drive metrics, weather/roof/surface.

3.8 System shall compute rolling & season-to-date stats for each metric using last 1/3/all prior games.

3.9 System shall join team rows into per-game matchup rows containing home vs away values and team differentials.

3.10 System shall apply spread outcome labeling: favorite_covered.

## 4. Acceptance Criteria
4.1 Given PBP input, system produces team_game_stats where each row = (season, week, game_id, team).

4.2 All metrics in Req 3.4–3.6 are present with NULL-handling.

4.3 Rolling stats computed with proper shifting; no future leakage.

4.4 Matchup dataset outputs one row per game with differential features.

4.5 favorite_covered defined as final_margin > spread.

## 5. Data Flow
Raw PBP → Filtered Plays → Team Offense/Defense Aggregations → Drive Aggregations → Merge → Rolling Computations → Matchup Build → Model Table

## 6. Implementation Plan
- Script 01_load_pbp: load & filter
- Script 02_team_off_def: aggregate offense/defense
- Script 03_drive_metrics: aggregate drives
- Script 04_team_game_stats: unify tables
- Script 05_rolling_features: add windows
- Script 06_matchup_features: pivot to games

## End of Spec


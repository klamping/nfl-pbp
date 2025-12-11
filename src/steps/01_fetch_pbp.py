from __future__ import annotations

import os
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

import argparse
try:  # Optional dependency; script still runs if not installed.
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - graceful fallback
    def load_dotenv(*args, **kwargs):
        return None
try:
    import nflreadpy as nfl
except ImportError as exc:
    raise ImportError("Missing dependency: install nflreadpy (pip install nflreadpy).") from exc
try:
    from tqdm import tqdm
except ImportError as exc:
    raise ImportError("Missing dependency: install tqdm (pip install tqdm).") from exc

# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
log = logging.getLogger("fetch_pbp")

# ------------------------------------------------------------
# Configuration
# ------------------------------------------------------------
load_dotenv()
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "data")
DATA_DIR = os.path.join(OUTPUT_DIR, "pbp_data")
GAME_META_DIR = os.path.join(OUTPUT_DIR, "game_meta")
os.makedirs(DATA_DIR, exist_ok=True)
ALLOWED_MODES = {"historical", "current", "update-current"}
DEFAULT_MODE = os.getenv("FETCH_MODE", "current").lower()
if DEFAULT_MODE not in ALLOWED_MODES:
    DEFAULT_MODE = "current"

def parse_arguments() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Fetch NFL play-by-play data from nflverse")
    parser.add_argument(
        "-m", "--mode",
        choices=sorted(ALLOWED_MODES),
        default=DEFAULT_MODE,
        help="Execution mode: historical range, full current season, or incremental update",
    )
    parser.add_argument(
        "-w", "--weeks",
        type=str,
        default=None,
        help="Weeks to fetch (e.g., '1-18' or '1,2,3,17,18'). "
             "Overrides defaults for the selected mode."
    )
    parser.add_argument(
        "-f", "--force",
        action="store_true",
        help="Force refetch even if file exists"
    )
    return parser.parse_args()

def get_historical_range() -> tuple[int, int]:
    """Read the historical season range from the environment."""
    start_season = int(os.getenv("HISTORICAL_START_SEASON", 2016))
    end_season = int(os.getenv("HISTORICAL_END_SEASON", 2024))
    if end_season < start_season:
        log.warning(
            "HISTORICAL_END_SEASON (%s) is before HISTORICAL_START_SEASON (%s). "
            "Swapping values.", end_season, start_season
        )
        start_season, end_season = end_season, start_season
    return start_season, end_season

def get_current_season() -> int:
    """Return the season to treat as 'current' from env or clock."""
    return int(os.getenv("CURRENT_SEASON", datetime.now().year))

def parse_weeks(weeks_str: str) -> List[int]:
    """Parse weeks string into a list of week numbers."""
    if '-' in weeks_str:
        start_week, end_week = map(int, weeks_str.split('-'))
        return list(range(start_week, end_week + 1))
    return [int(w) for w in weeks_str.split(',')]

def resolve_weeks(override_weeks: Optional[str], env_var_name: str, fallback: str = "1-18") -> List[int]:
    """Resolve which weeks to process using CLI override, env, or fallback string."""
    weeks_str = override_weeks or os.getenv(env_var_name, fallback)
    return parse_weeks(weeks_str)

def ensure_directory_exists(path: str) -> None:
    """Ensure the directory exists, create it if it doesn't."""
    os.makedirs(path, exist_ok=True)

def get_existing_weeks(season: int) -> List[int]:
    """Return the weeks already stored for a season."""
    year_dir = os.path.join(DATA_DIR, str(season))
    if not os.path.isdir(year_dir):
        return []
    weeks: List[int] = []
    for filename in os.listdir(year_dir):
        if not filename.endswith(".json"):
            continue
        week_part = filename.split(".")[0]
        try:
            weeks.append(int(week_part))
        except ValueError:
            continue
    return sorted(weeks)

def extract_weeks_from_data(season_data) -> List[int]:
    """Extract sorted unique week numbers from a season dataset."""
    try:
        weeks = season_data["week"].to_list()
        return sorted({int(week) for week in weeks})
    except Exception as exc:  # pragma: no cover - defensive
        log.error(f"Unable to determine weeks from season data: {exc}")
        return []

# List of columns to keep in the output
KEEP_COLUMNS = [
    "season", "week", "game_id",
    "play_id", "posteam", "defteam", "side_of_field", "yardline_100", "quarter_seconds_remaining",
    "half_seconds_remaining", "game_seconds_remaining", "game_half", "quarter_end", "drive", "sp",
    "qtr", "down", "goal_to_go", "yrdln", "ydstogo", "ydsnet", "play_type", "yards_gained",
    "shotgun", "no_huddle", "qb_dropback", "qb_kneel", "qb_spike", "qb_scramble", "pass_length",
    "pass_location", "air_yards", "yards_after_catch", "field_goal_result", "kick_distance",
    "extra_point_result", "two_point_conv_result", "td_team", "posteam_score", "defteam_score",
    "td_prob", "ep", "epa", "total_home_epa", "total_away_epa", "total_home_rush_epa",
    "total_away_rush_epa", "total_home_pass_epa", "total_away_pass_epa", "air_epa", "yac_epa",
    "comp_air_epa", "comp_yac_epa", "total_home_comp_air_epa", "total_away_comp_air_epa",
    "total_home_comp_yac_epa", "total_away_comp_yac_epa", "total_home_raw_air_epa",
    "total_away_raw_air_epa", "total_home_raw_yac_epa", "total_away_raw_yac_epa", "wp", "def_wp",
    "wpa", "vegas_wpa", "vegas_home_wpa", "vegas_wp", "vegas_home_wp", "total_home_rush_wpa",
    "total_away_rush_wpa", "total_home_pass_wpa", "total_away_pass_wpa", "air_wpa", "yac_wpa",
    "comp_air_wpa", "comp_yac_wpa", "total_home_comp_air_wpa", "total_away_comp_air_wpa",
    "total_home_comp_yac_wpa", "total_away_comp_yac_wpa", "total_home_raw_air_wpa",
    "total_away_raw_air_wpa", "total_home_raw_yac_wpa", "total_away_raw_yac_wpa", "punt_blocked",
    "first_down_rush", "first_down_pass", "first_down_penalty", "third_down_converted",
    "third_down_failed", "fourth_down_converted", "fourth_down_failed", "incomplete_pass",
    "touchback", "interception", "punt_inside_twenty", "punt_in_endzone", "punt_out_of_bounds",
    "punt_downed", "punt_fair_catch", "kickoff_inside_twenty", "kickoff_in_endzone",
    "kickoff_out_of_bounds", "kickoff_downed", "kickoff_fair_catch", "safety", "penalty",
    "tackled_for_loss", "own_kickoff_recovery", "own_kickoff_recovery_td", "qb_hit", "rush_attempt",
    "pass_attempt", "touchdown", "pass_touchdown", "rush_touchdown", "return_touchdown",
    "extra_point_attempt", "two_point_attempt", "field_goal_attempt", "kickoff_attempt",
    "punt_attempt", "fumble", "complete_pass", "assist_tackle", "lateral_reception", "lateral_rush",
    "lateral_return", "lateral_recovery", "passing_yards", "receiving_yards", "rushing_yards",
    "lateral_receiving_yards", "lateral_rushing_yards", "solo_tackle_1_team", "solo_tackle_2_team",
    "assist_tackle_1_team", "assist_tackle_2_team", "assist_tackle_3_team", "assist_tackle_4_team",
    "tackle_with_assist", "tackle_with_assist_1_team", "tackle_with_assist_2_team",
    "fumbled_1_team", "fumbled_2_team", "fumble_recovery_1_team", "fumble_recovery_1_yards",
    "fumble_recovery_2_team", "fumble_recovery_2_yards", "return_team", "return_yards",
    "penalty_team", "penalty_yards", "replay_or_challenge", "replay_or_challenge_result",
    "penalty_type", "defensive_two_point_attempt", "defensive_two_point_conv",
    "defensive_extra_point_attempt", "defensive_extra_point_conv", "cp", "cpoe", "series",
    "series_success", "series_result", "order_sequence", "weather", "nfl_api_id", "play_clock",
    "play_deleted", "play_type_nfl", "special_teams_play", "st_play_type", "end_clock_time",
    "end_yard_line", "fixed_drive", "fixed_drive_result", "drive_play_count",
    "drive_time_of_possession", "drive_first_downs", "drive_inside20", "drive_ended_with_score",
    "drive_quarter_start", "drive_quarter_end", "drive_yards_penalized", "drive_start_transition",
    "drive_end_transition", "drive_game_clock_start", "drive_game_clock_end", "drive_start_yard_line",
    "drive_end_yard_line", "drive_play_id_started", "drive_play_id_ended", "div_game", "roof",
    "surface", "temp", "wind", "aborted_play", "success", "pass", "rush", "first_down", "special",
    "play", "out_of_bounds", "home_opening_kickoff", "qb_epa", "xyac_epa", "xyac_mean_yardage",
    "xyac_median_yardage", "xyac_success", "xyac_fd", "xpass", "pass_oe"
]

def filter_columns(df):
    """Filter DataFrame to only include the specified columns."""
    # Get the intersection of available columns and columns we want to keep
    available_columns = set(df.columns)
    columns_to_keep = [col for col in KEEP_COLUMNS if col in available_columns]
    return df.select(columns_to_keep)

def fetch_season_data(season: int) -> Optional[Dict[str, Any]]:
    """Fetch all play-by-play data for a specific season."""
    try:
        log.info(f"Fetching data for {season} season...")
        data = nfl.load_pbp(season)
        data = filter_columns(data)

        # Drop columns that are entirely null for this season to reduce JSON size
        try:
            non_null_cols = [c for c in data.columns if not data[c].is_null().all()]
            data = data.select(non_null_cols)
        except Exception:
            # If anything unexpected happens, fall back to unpruned data
            pass

        return data
    except Exception as e:
        log.error(f"Error fetching data for {season}: {str(e)}")
        return None


def fetch_schedule_data(season: int):
    """Fetch schedule data for a specific season."""
    try:
        log.info(f"Fetching schedule for {season} season...")
        return nfl.load_schedules(season)
    except Exception as e:
        log.error(f"Error fetching schedule for {season}: {str(e)}")
        return None

def save_week_data(season: int, week: int, data: Dict[str, Any]) -> None:
    """Save play-by-play data to a JSON file."""
    year_dir = os.path.join(DATA_DIR, str(season))
    ensure_directory_exists(year_dir)
    
    file_path = os.path.join(year_dir, f"{week:02d}.json")
    
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        log.info(f"Saved data to {file_path}")
    except Exception as e:
        log.error(f"Error saving data to {file_path}: {str(e)}")


def save_game_stats(season: int, week: int, games: List[Dict[str, Any]]) -> None:
    """Save per-game meta info to a JSON file."""
    season_dir = os.path.join(GAME_META_DIR, str(season))
    ensure_directory_exists(season_dir)
    out_path = os.path.join(season_dir, f"{week:02d}.json")
    try:
        with open(out_path, "w") as f:
            json.dump(games, f, indent=2)
        log.info(f"Saved game stats to {out_path}")
    except Exception as e:
        log.error(f"Error saving game stats to {out_path}: {str(e)}")


DROP_SCHEDULE_COLUMNS = {
    "espn",
    "ftn",
    "gsis",
    "home_coach",
    "away_coach",
    "away_qb_name",
    "home_qb_name",
    "nfl_detail_id",
    "old_game_id",
    "pff",
    "pfr",
}


def clean_schedule_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Shape schedule row and move results under a nested property."""
    result_fields = {
        "home_score": row.get("home_score"),
        "away_score": row.get("away_score"),
        "overtime": row.get("overtime"),
        "result": row.get("result"),
        "total": row.get("total"),
    }

    cleaned = {k: v for k, v in row.items() if k not in DROP_SCHEDULE_COLUMNS}
    for key in result_fields.keys():
        cleaned.pop(key, None)

    cleaned["results"] = result_fields
    return cleaned

def process_season(
    season: int,
    weeks: List[int],
    force: bool = False,
    season_data=None,
    schedule_data=None,
) -> None:
    """Process a single season's data."""
    if not weeks:
        log.info(f"No weeks specified for season {season}. Skipping.")
        return

    # Check which weeks we need to process
    weeks_to_process = []
    for week in weeks:
        week_file = os.path.join(DATA_DIR, str(season), f"{week:02d}.json")
        if force or not os.path.exists(week_file):
            weeks_to_process.append(week)
    
    if not weeks_to_process:
        log.info(f"All requested weeks for {season} already exist. Use --force to refetch.")
        return
    
    # Fetch the entire season's data once
    if season_data is None:
        season_data = fetch_season_data(season)
    if season_data is None:
        return
    if schedule_data is None:
        schedule_data = fetch_schedule_data(season)
    
    # Process each requested week
    for week in tqdm(weeks_to_process, desc=f"Week Progress - {season}", unit="week"):
        # Use filter() for Polars DataFrame and to_dicts() for conversion
        week_data = season_data.filter(season_data['week'] == week).to_dicts()
        if week_data:
            save_week_data(season, week, week_data)

        if schedule_data is not None:
            try:
                week_schedule = schedule_data.filter(
                    (schedule_data["week"] == week) & (schedule_data["game_type"] == "REG")
                )
                raw_games: List[Dict[str, Any]] = week_schedule.to_dicts()
                games: List[Dict[str, Any]] = [clean_schedule_row(row) for row in raw_games]
                if games:
                    save_game_stats(season, week, games)
            except Exception as exc:
                log.error(f"Error building schedule game stats for season {season} week {week}: {exc}")

def main() -> None:
    args = parse_arguments()
    mode = args.mode

    if mode == "historical":
        start_season, end_season = get_historical_range()
        weeks = resolve_weeks(args.weeks, "HISTORICAL_WEEKS")
        log.info(
            f"[Historical Mode] Processing seasons {start_season}-{end_season}, weeks "
            f"{min(weeks)}-{max(weeks)}"
        )
        for season in range(start_season, end_season + 1):
            process_season(season, weeks, args.force)
        log.info("Historical data fetching completed!")
        return

    current_season = get_current_season()

    if mode == "current":
        weeks = resolve_weeks(args.weeks, "CURRENT_WEEKS")
        log.info(
            f"[Current Mode] Processing season {current_season}, weeks "
            f"{min(weeks)}-{max(weeks)}"
        )
        process_season(current_season, weeks, args.force)
        log.info("Current season data fetching completed!")
        return

    # update-current mode
    log.info(f"[Update Mode] Checking for new weeks in season {current_season}")
    season_data = fetch_season_data(current_season)
    if season_data is None:
        return

    available_weeks = extract_weeks_from_data(season_data)
    if not available_weeks:
        log.warning("No weeks returned in season data; nothing to update.")
        return

    existing_weeks = set(get_existing_weeks(current_season))
    weeks_to_fetch = [week for week in available_weeks if week not in existing_weeks]

    if args.weeks:
        requested_weeks = set(parse_weeks(args.weeks))
        weeks_to_fetch = [week for week in weeks_to_fetch if week in requested_weeks]

    if not weeks_to_fetch:
        latest_local_week = max(existing_weeks) if existing_weeks else 0
        log.info(f"Season {current_season} already up to date through week {latest_local_week}.")
        return

    log.info(
        f"Updating season {current_season} with weeks: {', '.join(str(w) for w in weeks_to_fetch)}"
    )
    process_season(current_season, weeks_to_fetch, args.force, season_data=season_data)
    log.info("Update completed!")

if __name__ == "__main__":
    main()

"""Run the regression model on collated current-season data and store predictions."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[2]
COLLATED_DIR = PROJECT_ROOT / "data" / "collated"
CURRENT_DIR = COLLATED_DIR / "current"
DATA_DIR = PROJECT_ROOT / "data" / "model_runs"
MODEL_PATH = DATA_DIR / "margin_model.json"
PREDICTIONS_JSON = DATA_DIR / "predictions.json"
PREDICTIONS_CSV = DATA_DIR / "predictions.csv"

ID_COLUMN = "meta_game_id"
DEFAULT_FEATURE_COLUMN = "betting_spread_line"

# Configurable columns/prefixes that should be excluded when ingesting CSV rows.
INFERENCE_EXCLUDE_COLUMNS: set[str] = set()
INFERENCE_EXCLUDE_PREFIXES = {"results_"}


def strip_columns(row: dict, exclude_prefixes: Iterable[str], exclude_columns: Iterable[str]) -> dict:
    return {
        key: value
        for key, value in row.items()
        if key not in exclude_columns and not any(key.startswith(prefix) for prefix in exclude_prefixes)
    }


def extract_features(
    row: dict,
    feature_names: List[str],
    exclude_prefixes: Sequence[str],
    exclude_columns: Sequence[str],
) -> List[float]:
    features: Dict[str, float] = {}
    for key, value in row.items():
        if key in exclude_columns:
            continue
        if any(key.startswith(prefix) for prefix in exclude_prefixes):
            continue
        try:
            num = float(value)
        except (TypeError, ValueError):
            continue
        if num != num:  # NaN
            continue
        features[key] = num
    return [features.get(name, 0.0) for name in feature_names]


def load_model() -> Dict[str, float]:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model file not found at {MODEL_PATH}. Run 05_train_margin_model.py first."
        )
    with MODEL_PATH.open() as fp:
        return json.load(fp)


def load_inference_rows(
    feature_names: List[str],
    exclude_prefixes: Sequence[str],
    exclude_columns: Sequence[str],
    week: Optional[int],
) -> List[dict]:
    if not CURRENT_DIR.exists():
        raise FileNotFoundError(f"Current collated directory not found at {CURRENT_DIR}")

    csv_files = sorted(p for p in CURRENT_DIR.glob("*.csv") if p.is_file())
    if week is not None:
        csv_files = [
            p for p in csv_files
            if p.stem.isdigit() and int(p.stem) == week
        ]
    if not csv_files:
        raise FileNotFoundError(
            f"No collated current CSVs found in {CURRENT_DIR}"
            + (f" for week {week}" if week is not None else "")
        )

    rows: List[dict] = []
    for csv_file in csv_files:
        with csv_file.open() as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                filtered = strip_columns(row, exclude_prefixes, exclude_columns)
                feature_vector = extract_features(filtered, feature_names, exclude_prefixes, exclude_columns)
                if not any(feature_vector):
                    continue

                rows.append(
                    {
                        "game_id": row.get(ID_COLUMN, ""),
                        "features": feature_vector,
                    }
                )

    if not rows:
        raise ValueError("No valid inference rows found after filtering; check CSV contents.")

    return rows


def predict_margin(model: Dict[str, float], features: List[float]) -> float:
    intercept = float(model.get("intercept", 0.0))
    coefs = model.get("coefficients") or []
    return intercept + sum(float(c) * f for c, f in zip(coefs, features))


def write_outputs(predictions: List[dict], feature_columns: List[str]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PREDICTIONS_JSON.write_text(json.dumps(predictions, indent=2))

    with PREDICTIONS_CSV.open("w", newline="") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["game_id", "predicted_margin", "feature_columns"])
        for row in predictions:
            writer.writerow(
                [
                    row["game_id"],
                    f"{row['predicted_margin']:.2f}",
                    ";".join(row["feature_columns"]),
                ]
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run margin model on collated current data.")
    parser.add_argument(
        "--week",
        type=int,
        default=None,
        help="Only generate predictions for a specific week (e.g., 5). Defaults to all weeks.",
    )
    args = parser.parse_args()

    model = load_model()
    feature_names = model.get("feature_names") or [DEFAULT_FEATURE_COLUMN]

    inference_rows = load_inference_rows(
        feature_names=feature_names,
        exclude_prefixes=tuple(INFERENCE_EXCLUDE_PREFIXES),
        exclude_columns=tuple(INFERENCE_EXCLUDE_COLUMNS),
        week=args.week,
    )

    predictions: List[dict] = []
    for row in inference_rows:
        margin = predict_margin(model, row["features"])
        predictions.append(
            {
                "game_id": row["game_id"],
                "predicted_margin": margin,
                "feature_columns": feature_names,
            }
        )

    write_outputs(predictions, feature_names)
    print(f"Wrote {len(predictions)} predictions to {PREDICTIONS_JSON}")


if __name__ == "__main__":
    main()

"""Train a tiny regression model using collated historical data."""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from datetime import datetime
import hashlib
import os
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple, Dict


PROJECT_ROOT = Path(__file__).resolve().parents[2]
COLLATED_DIR = PROJECT_ROOT / "data" / "collated"
HISTORICAL_CSV = COLLATED_DIR / "historical.csv"
DATA_DIR = PROJECT_ROOT / "data" / "model_runs"
MODEL_PATH = DATA_DIR / "margin_model.json"
TRAINING_DATA_CSV = DATA_DIR / "training_data.csv"
TRAINING_METRICS_JSON = DATA_DIR / "training_metrics.json"
HISTORY_DIR = DATA_DIR / "history"
HISTORY_JSONL = HISTORY_DIR / "metrics_history.jsonl"
HISTORY_CSV = HISTORY_DIR / "metrics_history.csv"

# Configurable columns/prefixes that should be excluded when ingesting CSV rows.
TRAINING_EXCLUDE_COLUMNS = {"betting_favorite", "betting_underdog"}
TRAINING_EXCLUDE_PREFIXES = set('meta_')  # keep results_* because target lives there

ID_COLUMN = "meta_game_id"
SEASON_COLUMN = "meta_season"
WEEK_COLUMN = "meta_week"
FEATURE_COLUMN = "betting_spread_line"
TARGET_COLUMN = "results_result"
TARGET_PREFIX = "results_"


@dataclass
class TrainingExample:
    game_id: str
    season: int
    week: int
    features: Dict[str, float]
    margin: float
    spread: float
    favorite_covers: bool


def strip_columns(
    row: dict,
    exclude_prefixes: Iterable[str],
    exclude_columns: Iterable[str],
) -> dict:
    return {
        key: value
        for key, value in row.items()
        if key not in exclude_columns and not any(key.startswith(prefix) for prefix in exclude_prefixes)
    }


def extract_features(
    row: dict,
    exclude_prefixes: Sequence[str],
    exclude_columns: Sequence[str],
) -> Dict[str, float]:
    features: Dict[str, float] = {}
    for key, value in row.items():
        if key in exclude_columns:
            continue
        if any(key.startswith(prefix) for prefix in exclude_prefixes):
            continue
        if key.startswith(TARGET_PREFIX):
            continue
        try:
            num = float(value)
        except (TypeError, ValueError):
            continue
        if num != num:  # NaN check
            continue
        features[key] = num
    return features


def load_training_rows(
    csv_path: Path,
    exclude_prefixes: Sequence[str],
    exclude_columns: Sequence[str],
) -> Tuple[List[TrainingExample], List[str]]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Training data not found at {csv_path}")

    examples: List[TrainingExample] = []
    feature_names: List[str] = []
    with csv_path.open() as fp:
        reader = csv.DictReader(fp)
        for row in reader:
            filtered = strip_columns(row, exclude_prefixes, exclude_columns)
            try:
                margin = float(row[TARGET_COLUMN])
                season = int(row[SEASON_COLUMN])
                week = int(row[WEEK_COLUMN])
            except (KeyError, ValueError):
                continue

            feat = extract_features(filtered, exclude_prefixes, exclude_columns)
            if not feat:
                continue
            feature_names.extend(feat.keys())

            game_id = row.get(ID_COLUMN, "")
            spread = float(row.get(FEATURE_COLUMN, 0) or 0)
            cover_favorite = (margin - spread) >= 0  # favorite covers/pushes vs spread
            examples.append(
                TrainingExample(
                    game_id=game_id,
                    season=season,
                    week=week,
                    features=feat,
                    margin=margin,
                    spread=spread,
                    favorite_covers=cover_favorite,
                )
            )

    if not examples:
        raise ValueError("No valid training rows found after filtering; check CSV contents.")

    # Stable unique feature ordering
    seen = set()
    ordered: List[str] = []
    for name in feature_names:
        if name not in seen:
            seen.add(name)
            ordered.append(name)

    return examples, ordered


def solve_linear_system(A: List[List[float]], b: List[float]) -> List[float]:
    n = len(A)
    M = [row[:] for row in A]
    y = b[:]

    for i in range(n):
        pivot = max(range(i, n), key=lambda r: abs(M[r][i]))
        if abs(M[pivot][i]) < 1e-9:
            return [0.0] * n
        if pivot != i:
            M[i], M[pivot] = M[pivot], M[i]
            y[i], y[pivot] = y[pivot], y[i]

        pivot_val = M[i][i]
        for j in range(i, n):
            M[i][j] /= pivot_val
        y[i] /= pivot_val

        for r in range(i + 1, n):
            factor = M[r][i]
            if abs(factor) < 1e-12:
                continue
            for c in range(i, n):
                M[r][c] -= factor * M[i][c]
            y[r] -= factor * y[i]

    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = y[i] - sum(M[i][j] * x[j] for j in range(i + 1, n))
    return x


def fit_linear_regression(
    examples: List[TrainingExample], feature_names: List[str]
) -> Tuple[float, List[float], float]:
    """Return intercept, coefficients, and mean target from OLS on provided features."""
    n = len(examples)
    d = len(feature_names)
    if n == 0 or d == 0:
        return 0.0, [0.0] * d, 0.0

    X: List[List[float]] = []
    y: List[float] = []
    for ex in examples:
        X.append([1.0] + [ex.features.get(name, 0.0) for name in feature_names])
        y.append(ex.margin)

    xtx = [[0.0] * (d + 1) for _ in range(d + 1)]
    xty = [0.0] * (d + 1)
    for row, target in zip(X, y):
        for i in range(d + 1):
            xty[i] += row[i] * target
            for j in range(d + 1):
                xtx[i][j] += row[i] * row[j]

    beta = solve_linear_system(xtx, xty)
    intercept = beta[0]
    coefs = beta[1:]

    mean_y = sum(y) / n
    return intercept, coefs, mean_y


def save_training_data_csv(examples: List[TrainingExample]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with TRAINING_DATA_CSV.open("w", newline="") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["game_id", "season", "week", FEATURE_COLUMN, "margin", "favorite_covers"])
        for row in examples:
            writer.writerow(
                [
                    row.game_id,
                    row.season,
                    row.week,
                    f"{row.spread:.2f}",
                    f"{row.margin:.2f}",
                    int(row.favorite_covers),
                ]
            )


def save_model(
    intercept: float,
    coefs: List[float],
    mean_outcome: float,
    sample_count: int,
    feature_names: List[str],
) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    model = {
        "type": "linear_regression",
        "intercept": intercept,
        "coefficients": coefs,
        "mean_target": mean_outcome,
        "training_samples": sample_count,
        "feature_names": feature_names,
        "target_column": TARGET_COLUMN,
        "note": "Toy regression model fit on collated historical data.",
    }
    MODEL_PATH.write_text(json.dumps(model, indent=2))


def predict_margin(intercept: float, coefs: List[float], features: List[float]) -> float:
    return intercept + sum(c * f for c, f in zip(coefs, features))


def compute_metrics(
    examples: List[TrainingExample],
    intercept: float,
    coefs: List[float],
    feature_names: List[str],
) -> dict:
    n = len(examples)
    if n == 0:
        raise ValueError("No examples to evaluate.")

    preds = []
    actuals = []
    for row in examples:
        vector = [row.features.get(name, 0.0) for name in feature_names]
        preds.append(predict_margin(intercept, coefs, vector))
        actuals.append(row.margin)
    actuals = [row.margin for row in examples]
    errors = [p - a for p, a in zip(preds, actuals)]

    mean_actual = sum(actuals) / n
    mae = sum(abs(e) for e in errors) / n
    rmse = (sum(e * e for e in errors) / n) ** 0.5
    bias = sum(errors) / n

    baseline_pred = mean_actual
    baseline_errors = [baseline_pred - a for a in actuals]
    baseline_mae = sum(abs(e) for e in baseline_errors) / n
    baseline_rmse = (sum(e * e for e in baseline_errors) / n) ** 0.5

    ss_res = sum((a - p) ** 2 for a, p in zip(actuals, preds))
    ss_tot = sum((a - mean_actual) ** 2 for a in actuals)
    r2 = float("nan") if ss_tot == 0 else 1 - ss_res / ss_tot

    return {
        "samples": n,
        "mae": mae,
        "rmse": rmse,
        "bias": bias,
        "r2": r2,
        "mean_actual": mean_actual,
        "baseline_mae": baseline_mae,
        "baseline_rmse": baseline_rmse,
    }


def split_train_validation(
    examples: List[TrainingExample],
) -> Dict[str, List[TrainingExample]]:
    if not examples:
        return {"train": [], "validation": []}

    seasons = sorted({ex.season for ex in examples})
    latest_season = seasons[-1]
    train = [ex for ex in examples if ex.season != latest_season]
    validation = [ex for ex in examples if ex.season == latest_season]

    if not train:
        # Fallback: if only one season available, hold out the latest week for validation.
        max_week = max(ex.week for ex in examples)
        validation = [ex for ex in examples if ex.week == max_week]
        train = [ex for ex in examples if ex.week != max_week]

    # If still empty, put everything into train.
    if not validation:
        validation = []
    if not train:
        train = examples

    return {"train": train, "validation": validation}


def balance_by_cover(examples: List[TrainingExample]) -> List[TrainingExample]:
    fav = [ex for ex in examples if ex.favorite_covers]
    dog = [ex for ex in examples if not ex.favorite_covers]
    if not fav or not dog:
        return examples
    target = min(len(fav), len(dog))
    # Preserve order deterministically.
    return fav[:target] + dog[:target]


def save_training_metrics(metrics: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TRAINING_METRICS_JSON.write_text(json.dumps(metrics, indent=2))


def compute_model_hash() -> str:
    if not MODEL_PATH.exists():
        return "missing"
    digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    return digest[:12]


def persist_history(metrics: dict) -> None:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    run_id = f"train@{os.environ.get('TRAIN_RUN_ID') or datetime.now().isoformat()}"
    record = {
        "run_id": run_id,
        "timestamp": datetime.now().isoformat(),
        "model_hash": compute_model_hash(),
        "metrics": metrics,
    }

    with HISTORY_JSONL.open("a") as fp:
        fp.write(json.dumps(record) + "\n")

    csv_header = (
        "run_id,timestamp,model_hash,samples,mae,rmse,bias,r2,mean_actual,baseline_mae,baseline_rmse"
    )
    csv_row = [
        run_id,
        record["timestamp"],
        record["model_hash"],
        metrics["samples"],
        f"{metrics['mae']:.4f}",
        f"{metrics['rmse']:.4f}",
        f"{metrics['bias']:.4f}",
        "NaN" if (metrics["r2"] != metrics["r2"]) else f"{metrics['r2']:.4f}",
        f"{metrics['mean_actual']:.4f}",
        f"{metrics['baseline_mae']:.4f}",
        f"{metrics['baseline_rmse']:.4f}",
    ]

    if not HISTORY_CSV.exists():
        HISTORY_CSV.write_text(csv_header + "\n")
    with HISTORY_CSV.open("a") as fp:
        fp.write(",".join(str(v) for v in csv_row) + "\n")


def main() -> None:
    examples, feature_names = load_training_rows(
        HISTORICAL_CSV,
        exclude_prefixes=TRAINING_EXCLUDE_PREFIXES,
        exclude_columns=TRAINING_EXCLUDE_COLUMNS,
    )
    splits = split_train_validation(examples)
    balanced_train = balance_by_cover(splits["train"])
    intercept, coefs, mean_outcome = fit_linear_regression(balanced_train, feature_names)
    save_training_data_csv(balanced_train)
    save_model(intercept, coefs, mean_outcome, len(balanced_train), feature_names)
    train_metrics = compute_metrics(balanced_train, intercept, coefs, feature_names)
    val_metrics = (
        compute_metrics(splits["validation"], intercept, coefs, feature_names)
        if splits["validation"]
        else {}
    )
    combined_metrics = {"train": train_metrics, "validation": val_metrics}
    save_training_metrics(combined_metrics)
    persist_history(train_metrics)
    print(f"Model saved to {MODEL_PATH}")
    print(f"Training rows (balanced): {len(balanced_train)}, intercept={intercept:.4f}")
    print(
        f"Training metrics - samples: {train_metrics['samples']}, "
        f"mae: {train_metrics['mae']:.3f}, rmse: {train_metrics['rmse']:.3f}, "
        f"bias: {train_metrics['bias']:.3f}, "
        f"r2: {'NaN' if train_metrics['r2'] != train_metrics['r2'] else train_metrics['r2']:.3f}"
    )
    if val_metrics:
        print(
            f"Validation metrics - samples: {val_metrics['samples']}, "
            f"mae: {val_metrics['mae']:.3f}, rmse: {val_metrics['rmse']:.3f}, "
            f"bias: {val_metrics['bias']:.3f}, "
            f"r2: {'NaN' if val_metrics['r2'] != val_metrics['r2'] else val_metrics['r2']:.3f}"
        )


if __name__ == "__main__":
    main()

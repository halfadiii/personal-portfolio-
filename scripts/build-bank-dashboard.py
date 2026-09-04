"""
Turns the bank marketing project into the data the live dashboard page reads.

This is not a re-analysis. It replays the steps the notebooks in
`project/bank_marketing_strategy-main` actually perform — the same cleaning, the
same normalisation, the same three classifiers — and writes out the results, so
every figure on `/work/bank-marketing/dashboard` traces back to code that was
run rather than to a number someone typed.

Outputs:
  public/data/bank-marketing.bin    columnar rows, fetched by the dashboard
  src/content/data/bank-marketing.json   schema, categories, model metrics

Run:
  python scripts/build-bank-dashboard.py
"""

from __future__ import annotations

import json
import pathlib
import struct

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from scipy.stats import chi2_contingency, ttest_ind

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = (
    ROOT.parent
    / "project"
    / "bank_marketing_strategy-main"
    / "bank_marketing_strategy-main"
    / "bank-full.csv"
)
BIN_OUT = ROOT / "public" / "data" / "bank-marketing.bin"
META_OUT = ROOT / "src" / "content" / "data" / "bank-marketing.json"

MONTHS = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
]


def load_and_clean() -> tuple[pd.DataFrame, dict]:
    """The cleaning from part-1_part-2, step for step."""
    raw = pd.read_csv(SOURCE, sep=";")
    steps = [{"step": "loaded bank-full.csv", "rows": len(raw)}]

    df = raw.copy()
    df["y"] = (df["y"] == "yes").astype(int)

    # part-1: campaign and day showed no useful relationship with y.
    df = df.drop(columns=["campaign", "day"])
    steps.append({"step": "dropped campaign and day", "rows": len(df)})

    before = len(df)
    df = df[df["job"] != "unknown"]
    steps.append(
        {"step": "removed unknown job", "rows": len(df), "removed": before - len(df)}
    )

    before = len(df)
    df = df[df["education"] != "unknown"]
    steps.append(
        {
            "step": "removed unknown education",
            "rows": len(df),
            "removed": before - len(df),
        }
    )

    # part-1: unknown contact is reassigned in proportion to the known split.
    counts = df["contact"].value_counts()
    unknown = int(counts.get("unknown", 0))
    cellular = int(counts.get("cellular", 0))
    telephone = int(counts.get("telephone", 0))
    known = cellular + telephone
    if unknown and known:
        cellular_add = int(round(unknown * cellular / known))
        unknown_index = df.index[df["contact"] == "unknown"]
        df.loc[unknown_index[:cellular_add], "contact"] = "cellular"
        df.loc[unknown_index[cellular_add:], "contact"] = "telephone"
    steps.append(
        {
            "step": "reassigned unknown contact in proportion",
            "rows": len(df),
            "reassigned": unknown,
        }
    )

    df["poutcome"] = df["poutcome"].replace("unknown", "other")
    steps.append({"step": "poutcome unknown folded into other", "rows": len(df)})

    return df.reset_index(drop=True), {"steps": steps, "sourceRows": len(raw)}


def encode(df: pd.DataFrame) -> tuple[bytes, dict]:
    """
    Columnar, fixed-width, little-endian. One buffer the browser can filter over
    without parsing anything — 45k rows of JSON would be several megabytes and
    slow to walk; this is about a megabyte and reads as typed arrays.
    """
    categorical = [
        "job", "marital", "education", "default",
        "housing", "loan", "contact", "poutcome",
    ]
    categories = {}
    codes = {}
    for column in categorical:
        values = sorted(df[column].unique().tolist())
        categories[column] = values
        lookup = {value: index for index, value in enumerate(values)}
        codes[column] = df[column].map(lookup).astype(np.uint8).to_numpy()

    categories["month"] = MONTHS
    month_lookup = {name: index for index, name in enumerate(MONTHS)}
    codes["month"] = df["month"].map(month_lookup).astype(np.uint8).to_numpy()

    columns = [
        ("age", "u1", df["age"].clip(0, 255).astype(np.uint8).to_numpy()),
        ("job", "u1", codes["job"]),
        ("marital", "u1", codes["marital"]),
        ("education", "u1", codes["education"]),
        ("default", "u1", codes["default"]),
        ("housing", "u1", codes["housing"]),
        ("loan", "u1", codes["loan"]),
        ("contact", "u1", codes["contact"]),
        ("month", "u1", codes["month"]),
        ("poutcome", "u1", codes["poutcome"]),
        ("previous", "u1", df["previous"].clip(0, 255).astype(np.uint8).to_numpy()),
        ("y", "u1", df["y"].astype(np.uint8).to_numpy()),
        ("duration", "u2", df["duration"].clip(0, 65535).astype(np.uint16).to_numpy()),
        ("pdays", "i2", df["pdays"].clip(-32768, 32767).astype(np.int16).to_numpy()),
        ("balance", "i4", df["balance"].astype(np.int32).to_numpy()),
    ]

    # One column after another, so the reader can slice each as a typed array.
    payload = b"".join(array.tobytes() for _, _, array in columns)

    layout = []
    offset = 0
    for name, kind, array in columns:
        width = array.dtype.itemsize
        layout.append({"name": name, "type": kind, "offset": offset})
        offset += width * len(array)

    return payload, {
        "rows": len(df),
        "layout": layout,
        "categories": categories,
        "byteLength": len(payload),
    }


def fit_models(df: pd.DataFrame) -> list[dict]:
    """Logistic regression, decision tree, gradient boosting — as in part-5."""
    features = pd.get_dummies(df.drop(columns=["y"]), drop_first=True)
    target = df["y"]

    x_train, x_test, y_train, y_test = train_test_split(
        features, target, test_size=0.2, random_state=42, stratify=target
    )

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_test_scaled = scaler.transform(x_test)

    def score(name: str, note: str, predicted, probability) -> dict:
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_test, predicted, average="binary", zero_division=0
        )
        return {
            "name": name,
            "note": note,
            "accuracy": round(float(accuracy_score(y_test, predicted)), 4),
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1": round(float(f1), 4),
            "rocAuc": round(float(roc_auc_score(y_test, probability)), 4),
            "testRows": int(len(y_test)),
        }

    results = []

    lr = LogisticRegression(max_iter=1000)
    lr.fit(x_train_scaled, y_train)
    results.append(
        score(
            "Logistic regression",
            "Scaled features, 1000 iterations.",
            lr.predict(x_test_scaled),
            lr.predict_proba(x_test_scaled)[:, 1],
        )
    )

    dt = DecisionTreeClassifier(random_state=42)
    dt.fit(x_train, y_train)
    results.append(
        score(
            "Decision tree",
            "Unpruned, on unscaled features.",
            dt.predict(x_test),
            dt.predict_proba(x_test)[:, 1],
        )
    )

    gb = GradientBoostingClassifier(random_state=42)
    gb.fit(x_train_scaled, y_train)
    results.append(
        score(
            "Gradient boosting",
            "Scikit-learn defaults, scaled features.",
            gb.predict(x_test_scaled),
            gb.predict_proba(x_test_scaled)[:, 1],
        )
    )

    # What the boosted model leaned on. Useful, and honest about its own limits.
    importance = sorted(
        zip(features.columns, gb.feature_importances_),
        key=lambda pair: pair[1],
        reverse=True,
    )[:10]
    for result in results:
        if result["name"] == "Gradient boosting":
            result["topFeatures"] = [
                {"feature": name, "importance": round(float(value), 4)}
                for name, value in importance
            ]

    return results


def run_tests(df: pd.DataFrame) -> list[dict]:
    """The hypothesis tests from part-5, reported with their statistics."""
    tests = []

    success = df.loc[df["poutcome"] == "success", "balance"]
    failure = df.loc[df["poutcome"] == "failure", "balance"]
    if len(success) > 1 and len(failure) > 1:
        stat, p = ttest_ind(success, failure, equal_var=False)
        tests.append(
            {
                "name": "Balance by previous outcome",
                "test": "Welch t-test",
                "detail": "Mean balance of contacts whose last campaign succeeded against those where it failed.",
                "statistic": round(float(stat), 4),
                "pValue": float(f"{p:.3e}"),
                "n": int(len(success) + len(failure)),
            }
        )

    for column, label in [
        ("job", "Job"),
        ("education", "Education"),
        ("housing", "Housing loan"),
        ("poutcome", "Previous outcome"),
    ]:
        table = pd.crosstab(df[column], df["y"])
        chi2, p, dof, _ = chi2_contingency(table)
        tests.append(
            {
                "name": f"{label} against subscription",
                "test": "Chi-squared",
                "detail": f"Whether subscription rate is independent of {label.lower()}.",
                "statistic": round(float(chi2), 4),
                "pValue": float(f"{p:.3e}"),
                "dof": int(dof),
                "n": int(table.to_numpy().sum()),
            }
        )

    return tests


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"source dataset not found at {SOURCE}")

    df, cleaning = load_and_clean()
    payload, schema = encode(df)

    BIN_OUT.parent.mkdir(parents=True, exist_ok=True)
    BIN_OUT.write_bytes(payload)

    meta = {
        "source": {
            "name": "UCI Bank Marketing (bank-full.csv)",
            "citation": "Moro, S., Cortez, P. and Rita, P. (2014). A data-driven approach to predict the success of bank telemarketing. Decision Support Systems.",
            "url": "https://archive.ics.uci.edu/dataset/222/bank+marketing",
        },
        "binary": {
            "path": "/data/bank-marketing.bin",
            "rows": schema["rows"],
            "byteLength": schema["byteLength"],
            "layout": schema["layout"],
        },
        "categories": schema["categories"],
        "cleaning": cleaning,
        "overall": {
            "rows": int(len(df)),
            "subscribed": int(df["y"].sum()),
            "subscriptionRate": round(float(df["y"].mean()), 4),
            "meanBalance": round(float(df["balance"].mean()), 2),
            "medianBalance": float(df["balance"].median()),
            "meanDuration": round(float(df["duration"].mean()), 2),
        },
        "models": fit_models(df),
        "tests": run_tests(df),
    }

    META_OUT.parent.mkdir(parents=True, exist_ok=True)
    META_OUT.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    print(f"rows kept          {schema['rows']:,} of {cleaning['sourceRows']:,}")
    print(f"binary             {BIN_OUT} ({schema['byteLength'] / 1024:.0f} KB)")
    print(f"metadata           {META_OUT}")
    for model in meta["models"]:
        print(
            f"  {model['name']:<22} acc {model['accuracy']:.4f}  "
            f"f1 {model['f1']:.4f}  auc {model['rocAuc']:.4f}"
        )


if __name__ == "__main__":
    main()

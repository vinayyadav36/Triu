#!/usr/bin/env python3
"""
data_science_bot.py
Data cleaning + ETL pipeline script.
Loads a CSV, removes duplicates, fills/drops nulls, validates types,
detects outliers via IQR, outputs a clean CSV + quality report JSON.

Usage:
    python data_science_bot.py --input data/raw.csv --output data/clean.csv
    python data_science_bot.py  # uses built-in sample data
"""
import csv
import json
import os
import sys
import io
import math
import argparse
import copy
from datetime import datetime
from collections import defaultdict

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False


# ─────────────────────────────────────────────────────────────────────────────
# Sample CSV data (used when no file provided)
# ─────────────────────────────────────────────────────────────────────────────
SAMPLE_CSV = """order_id,customer_name,email,product,quantity,unit_price,total,order_date,status
ORD001,Alice Johnson,alice@example.com,Laptop,1,45000,45000,2024-01-05,completed
ORD002,Bob Smith,bob@example.com,Mouse,2,800,1600,2024-01-06,completed
ORD003,,,Keyboard,1,1200,,2024-01-07,pending
ORD004,Carol White,carol@example.com,Monitor,1,18000,18000,2024-01-08,completed
ORD002,Bob Smith,bob@example.com,Mouse,2,800,1600,2024-01-06,completed
ORD005,Dave Brown,dave@example.com,Laptop,999,45000,44955000,2024-01-09,completed
ORD006,Eve Davis,eve@example.com,Headphones,1,2500,2500,2024-01-10,completed
ORD007,Frank Green,frank@,Webcam,1,3000,3000,not-a-date,pending
ORD008,Grace Hill,grace@example.com,Chair,2,8500,17000,2024-01-12,completed
ORD009,,invalid-email,Desk,1,12000,12000,2024-01-13,shipped
ORD010,Henry King,henry@example.com,Printer,1,7500,7500,2024-01-14,completed
ORD011,Iris Lane,iris@example.com,Scanner,1,-500,500,2024-01-15,completed
ORD012,Jack Moore,jack@example.com,Tablet,2,22000,44000,2024-01-16,completed
ORD013,Kate Nelson,kate@example.com,Phone,1,35000,35000,,processing
ORD014,Liam Owens,liam@example.com,Cable,10,200,2000,2024-01-18,completed
ORD015,Mia Parker,mia@example.com,Laptop,1,45000,45000,2024-01-19,completed
"""


# ─────────────────────────────────────────────────────────────────────────────
# Pure-Python ETL pipeline
# ─────────────────────────────────────────────────────────────────────────────

def load_csv_pure(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader), list(reader.fieldnames or [])


def load_sample():
    reader = csv.DictReader(io.StringIO(SAMPLE_CSV))
    return list(reader), list(reader.fieldnames or [])


def detect_types(rows, columns):
    """Infer column types: int, float, date, email, text."""
    type_map = {}
    for col in columns:
        values = [r[col] for r in rows if r.get(col, '').strip()]
        ints, floats, dates = 0, 0, 0
        for v in values:
            v = v.strip()
            try:
                int(v); ints += 1; continue
            except ValueError:
                pass
            try:
                float(v); floats += 1; continue
            except ValueError:
                pass
            try:
                datetime.strptime(v, '%Y-%m-%d'); dates += 1; continue
            except ValueError:
                pass
        total = len(values) or 1
        if ints / total > 0.8:
            type_map[col] = 'int'
        elif floats / total > 0.8 or (ints + floats) / total > 0.8:
            type_map[col] = 'float'
        elif dates / total > 0.7:
            type_map[col] = 'date'
        elif 'email' in col.lower():
            type_map[col] = 'email'
        else:
            type_map[col] = 'text'
    return type_map


def validate_email(v):
    return '@' in v and '.' in v.split('@')[-1] and len(v.split('@')[0]) > 0


def is_valid_date(v, fmt='%Y-%m-%d'):
    try:
        datetime.strptime(v.strip(), fmt)
        return True
    except ValueError:
        return False


def remove_duplicates_pure(rows):
    seen = set()
    unique, dupes = [], []
    for row in rows:
        key = tuple(row.values())
        if key in seen:
            dupes.append(row)
        else:
            seen.add(key)
            unique.append(row)
    return unique, dupes


def handle_nulls_pure(rows, type_map):
    """Fill or drop nulls depending on column type and fill-rate."""
    col_values = defaultdict(list)
    for row in rows:
        for col, val in row.items():
            if val and val.strip():
                col_values[col].append(val.strip())

    # Compute fill values
    fill_vals = {}
    for col, vals in col_values.items():
        t = type_map.get(col, 'text')
        if t in ('int', 'float'):
            nums = []
            for v in vals:
                try: nums.append(float(v))
                except: pass
            fill_vals[col] = str(round(sorted(nums)[len(nums)//2], 4)) if nums else '0'
        else:
            # Mode
            counts = defaultdict(int)
            for v in vals: counts[v] += 1
            fill_vals[col] = max(counts, key=counts.get) if counts else ''

    null_fills = []
    cleaned = []
    for row in rows:
        filled_row = dict(row)
        for col, val in row.items():
            if not val or not val.strip():
                fv = fill_vals.get(col, '')
                if fv:
                    filled_row[col] = fv
                    null_fills.append({'row_context': row.get(list(row.keys())[0], '?'), 'column': col, 'filled_with': fv})
        cleaned.append(filled_row)
    return cleaned, null_fills


def detect_outliers_iqr_pure(rows, type_map):
    """IQR-based outlier detection for numeric columns."""
    outlier_rows = []
    outlier_summary = {}
    for col, t in type_map.items():
        if t not in ('int', 'float'):
            continue
        nums = []
        for row in rows:
            try: nums.append((float(row[col]), row))
            except: pass
        if len(nums) < 4:
            continue
        sorted_vals = sorted(v for v, _ in nums)
        q1 = sorted_vals[len(sorted_vals)//4]
        q3 = sorted_vals[3*len(sorted_vals)//4]
        iqr = q3 - q1
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        col_outliers = [(v, row) for v, row in nums if v < lo or v > hi]
        if col_outliers:
            outlier_summary[col] = {
                'q1': round(q1, 4), 'q3': round(q3, 4), 'iqr': round(iqr, 4),
                'lower_fence': round(lo, 4), 'upper_fence': round(hi, 4),
                'outlier_count': len(col_outliers),
                'sample_outlier_values': [round(v, 2) for v, _ in col_outliers[:5]],
            }
            for v, row in col_outliers:
                outlier_rows.append({
                    'column': col,
                    'value': v,
                    'row_id': row.get(list(row.keys())[0], '?'),
                })
    return outlier_rows, outlier_summary


def validate_types_pure(rows, type_map):
    issues = []
    for row in rows:
        for col, t in type_map.items():
            val = row.get(col, '').strip()
            if not val:
                continue
            if t == 'int':
                try: int(val)
                except: issues.append({'column': col, 'value': val, 'expected': 'int', 'row_id': list(row.values())[0]})
            elif t == 'float':
                try: float(val)
                except: issues.append({'column': col, 'value': val, 'expected': 'float', 'row_id': list(row.values())[0]})
            elif t == 'date':
                if not is_valid_date(val):
                    issues.append({'column': col, 'value': val, 'expected': 'YYYY-MM-DD', 'row_id': list(row.values())[0]})
            elif t == 'email':
                if not validate_email(val):
                    issues.append({'column': col, 'value': val, 'expected': 'valid email', 'row_id': list(row.values())[0]})
    return issues


def clamp_negatives(rows, type_map):
    """Set negative values in numeric columns to 0 (e.g., negative prices)."""
    clamped = []
    for row in rows:
        new_row = dict(row)
        for col, t in type_map.items():
            if t in ('int', 'float'):
                try:
                    v = float(row.get(col, '0') or '0')
                    if v < 0:
                        new_row[col] = '0'
                        clamped.append({'column': col, 'original': v, 'row_id': list(row.values())[0]})
                except:
                    pass
        rows[rows.index(row)] = new_row
    return rows, clamped


def write_csv(rows, columns, filepath):
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


# ─────────────────────────────────────────────────────────────────────────────
# Pandas pipeline (when available)
# ─────────────────────────────────────────────────────────────────────────────

def run_pandas_pipeline(filepath, output_csv):
    if filepath and os.path.exists(filepath):
        df = pd.read_csv(filepath)
    else:
        df = pd.read_csv(io.StringIO(SAMPLE_CSV))

    raw_shape = df.shape
    issues    = {}

    # Duplicates
    dup_count = df.duplicated().sum()
    df = df.drop_duplicates()
    issues['duplicates_removed'] = int(dup_count)

    # Nulls
    null_before = df.isnull().sum().to_dict()
    for col in df.columns:
        if df[col].dtype in [float, int]:
            df[col] = df[col].fillna(df[col].median())
        else:
            mode = df[col].mode()
            df[col] = df[col].fillna(mode[0] if not mode.empty else '')
    issues['null_fills'] = {k: int(v) for k, v in null_before.items() if v > 0}

    # Clamp negatives in numeric cols
    neg_clamped = {}
    for col in df.select_dtypes(include='number').columns:
        neg = (df[col] < 0).sum()
        if neg > 0:
            df[col] = df[col].clip(lower=0)
            neg_clamped[col] = int(neg)
    issues['negative_clamped'] = neg_clamped

    # Outliers (IQR)
    outlier_summary = {}
    for col in df.select_dtypes(include='number').columns:
        q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
        iqr = q3 - q1
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outs = ((df[col] < lo) | (df[col] > hi)).sum()
        if outs > 0:
            outlier_summary[col] = {
                'q1': round(float(q1), 4), 'q3': round(float(q3), 4),
                'lower_fence': round(float(lo), 4), 'upper_fence': round(float(hi), 4),
                'outlier_count': int(outs),
            }
    issues['outliers'] = outlier_summary

    df.to_csv(output_csv, index=False)

    return {
        'raw_shape':   {'rows': raw_shape[0], 'cols': raw_shape[1]},
        'clean_shape': {'rows': len(df), 'cols': len(df.columns)},
        'issues':      issues,
        'columns':     list(df.columns),
        'dtypes':      {k: str(v) for k, v in df.dtypes.to_dict().items()},
    }


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Data Science Bot — ETL/Cleaning Pipeline')
    parser.add_argument('--input',         default='data/raw.csv',             help='Input CSV file')
    parser.add_argument('--output',        default='data/clean.csv',           help='Clean CSV output')
    parser.add_argument('--output-report', default='data/quality_report.json', help='Quality report JSON')
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else '.', exist_ok=True)

    print(f"[INFO] Using {'pandas' if HAS_PANDAS else 'pure-Python'} pipeline")

    if HAS_PANDAS:
        summary = run_pandas_pipeline(args.input, args.output)
        report  = {
            'generated_at': datetime.now().isoformat(),
            'engine':       'pandas',
            'input_file':   args.input,
            'output_file':  args.output,
            **summary,
        }
    else:
        if args.input and os.path.exists(args.input):
            rows, columns = load_csv_pure(args.input)
            source = args.input
        else:
            rows, columns = load_sample()
            source = 'sample_data'

        raw_count = len(rows)
        type_map  = detect_types(rows, columns)
        rows, dupes    = remove_duplicates_pure(rows)
        rows, null_info = handle_nulls_pure(rows, type_map)
        rows, neg_info  = clamp_negatives(rows, type_map)
        type_issues     = validate_types_pure(rows, type_map)
        outlier_rows, outlier_summary = detect_outliers_iqr_pure(rows, type_map)

        write_csv(rows, columns, args.output)

        report = {
            'generated_at':      datetime.now().isoformat(),
            'engine':            'pure-python',
            'input_file':        source,
            'output_file':       args.output,
            'raw_row_count':     raw_count,
            'clean_row_count':   len(rows),
            'columns':           columns,
            'inferred_types':    type_map,
            'duplicates_removed': len(dupes),
            'null_fills':        null_info,
            'negatives_clamped': neg_info,
            'type_validation_issues': type_issues,
            'outlier_summary':   outlier_summary,
            'outlier_rows':      outlier_rows[:20],
        }

    with open(args.output_report, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*55}")
    print("  DATA SCIENCE BOT — CLEANING REPORT")
    print(f"{'='*55}")
    if HAS_PANDAS:
        print(f"  Raw rows    : {report['raw_shape']['rows']}")
        print(f"  Clean rows  : {report['clean_shape']['rows']}")
        print(f"  Duplicates  : {report['issues']['duplicates_removed']}")
        print(f"  Null fills  : {sum(report['issues']['null_fills'].values())}")
        print(f"  Outlier cols: {len(report['issues']['outliers'])}")
    else:
        print(f"  Raw rows    : {report['raw_row_count']}")
        print(f"  Clean rows  : {report['clean_row_count']}")
        print(f"  Duplicates  : {report['duplicates_removed']}")
        print(f"  Null fills  : {len(report['null_fills'])}")
        print(f"  Type issues : {len(report['type_validation_issues'])}")
        print(f"  Outlier cols: {len(report['outlier_summary'])}")
    print(f"\n  Clean CSV    → {args.output}")
    print(f"  Quality JSON → {args.output_report}")
    print(f"{'='*55}\n")


if __name__ == '__main__':
    main()

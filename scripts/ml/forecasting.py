#!/usr/bin/env python3
"""
forecasting.py
Time-series forecasting for historical sales data.
Uses ARIMA via statsmodels if available; otherwise uses pure-Python
Simple Moving Average + exponential smoothing extrapolation.
Generates a 90-day forecast with confidence intervals.

Usage:
    python forecasting.py --input data/sales_history.json --days 90
    python forecasting.py  # uses sample data
"""
import json
import os
import sys
import math
import argparse
from datetime import datetime, timedelta
from collections import deque

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from statsmodels.tsa.arima.model import ARIMA
    HAS_ARIMA = True
except ImportError:
    HAS_ARIMA = False


# ─────────────────────────────────────────────────────────────────────────────
# Sample historical data generator
# ─────────────────────────────────────────────────────────────────────────────
def generate_sample_history(days=180):
    """Generate synthetic daily sales with trend + seasonality."""
    import random
    random.seed(7)
    records = []
    base    = 15000.0
    date    = datetime(2024, 1, 1)
    for i in range(days):
        # Trend
        trend = base + i * 50
        # Weekly seasonality (higher on weekends)
        seasonal = 1.2 if date.weekday() >= 5 else 1.0
        # Monthly spike (end-of-month)
        monthly = 1.3 if date.day >= 25 else 1.0
        noise   = random.gauss(0, 1500)
        revenue = max(0, round(trend * seasonal * monthly + noise, 2))
        records.append({
            'date':    date.strftime('%Y-%m-%d'),
            'revenue': revenue,
            'orders':  max(1, int(revenue / random.uniform(800, 1200))),
        })
        date += timedelta(days=1)
    return records


def load_data(filepath):
    if filepath and os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        records = raw if isinstance(raw, list) else raw.get('records', raw.get('data', []))
        print(f"[INFO] Loaded {len(records)} records from {filepath}")
        return records
    print("[INFO] No input file — generating synthetic sales history (180 days)")
    return generate_sample_history(180)


# ─────────────────────────────────────────────────────────────────────────────
# Pure-Python forecasting: Holt-Winters Double Exponential Smoothing
# ─────────────────────────────────────────────────────────────────────────────
def double_exp_smooth(series, alpha=0.3, beta=0.15):
    """Holt's linear (double exponential) smoothing."""
    if len(series) < 2:
        return series[-1] if series else 0, 0
    s    = series[0]
    b    = series[1] - series[0]
    for i in range(1, len(series)):
        s_prev, b_prev = s, b
        s = alpha * series[i] + (1 - alpha) * (s_prev + b_prev)
        b = beta  * (s - s_prev) + (1 - beta) * b_prev
    return s, b  # level, trend


def forecast_pure(series, horizon=90):
    """
    Forecasts future values using:
    1. Holt's double exponential smoothing for level + trend
    2. 7-day seasonal factors computed from history
    3. Confidence intervals via residual standard deviation
    """
    if len(series) < 14:
        mean = sum(series) / len(series)
        return [{'point': round(mean, 2), 'lower': round(mean * 0.85, 2), 'upper': round(mean * 1.15, 2)} for _ in range(horizon)]

    # Deseasonalise using weekly (7-day) factors
    week = 7
    seasonal_factors = []
    for d in range(week):
        vals = [series[i] for i in range(d, len(series), week)]
        overall_mean = sum(series) / len(series) or 1
        seasonal_factors.append(sum(vals) / len(vals) / overall_mean)

    deseasonalised = [series[i] / (seasonal_factors[i % week] or 1) for i in range(len(series))]
    level, trend   = double_exp_smooth(deseasonalised)

    # Residuals for confidence intervals
    fitted    = [deseasonalised[0]]
    s_fit, b_fit = deseasonalised[0], (deseasonalised[1] - deseasonalised[0]) if len(deseasonalised) > 1 else 0
    for i in range(1, len(deseasonalised)):
        s_prev, b_prev = s_fit, b_fit
        s_fit = 0.3 * deseasonalised[i] + 0.7 * (s_prev + b_prev)
        b_fit = 0.15 * (s_fit - s_prev) + 0.85 * b_prev
        fitted.append(s_fit + b_fit)

    residuals = [deseasonalised[i] - fitted[i] for i in range(len(fitted))]
    res_std   = math.sqrt(sum(r**2 for r in residuals) / len(residuals)) if residuals else 1

    # Project
    forecasts = []
    n = len(series)
    for h in range(1, horizon + 1):
        base_point = (level + trend * h) * seasonal_factors[(n + h - 1) % week]
        z          = 1.96  # 95% CI
        margin     = z * res_std * math.sqrt(h) * seasonal_factors[(n + h - 1) % week]
        forecasts.append({
            'point': round(max(0, base_point), 2),
            'lower': round(max(0, base_point - margin), 2),
            'upper': round(base_point + margin, 2),
        })
    return forecasts


def forecast_arima(series, horizon=90):
    """ARIMA(2,1,2) via statsmodels."""
    try:
        if HAS_NUMPY:
            arr = np.array(series, dtype=float)
        else:
            arr = series
        model  = ARIMA(arr, order=(2, 1, 2))
        result = model.fit()
        preds  = result.get_forecast(steps=horizon)
        means  = preds.predicted_mean.tolist()
        ci     = preds.conf_int(alpha=0.05)
        forecasts = []
        for i in range(horizon):
            forecasts.append({
                'point': round(max(0, float(means[i])), 2),
                'lower': round(max(0, float(ci[i][0])), 2),
                'upper': round(float(ci[i][1]), 2),
            })
        return forecasts, "ARIMA(2,1,2)"
    except Exception as e:
        print(f"[WARN] ARIMA failed ({e}), falling back to double-exp-smoothing")
        return forecast_pure(series, horizon), "Holt-DoubleExpSmoothing"


def compute_metrics(series):
    n    = len(series)
    mean = sum(series) / n
    variance = sum((v - mean)**2 for v in series) / n
    std  = math.sqrt(variance)

    # Simple linear trend (least squares)
    xs = list(range(n))
    xm = sum(xs) / n
    ym = mean
    num = sum((xs[i] - xm) * (series[i] - ym) for i in range(n))
    den = sum((xs[i] - xm)**2 for i in range(n))
    slope     = num / den if den else 0
    intercept = ym - slope * xm

    # Rolling 7-day averages at start/end
    r7_start = sum(series[:7]) / 7 if n >= 7 else mean
    r7_end   = sum(series[-7:]) / 7 if n >= 7 else mean

    return {
        'count':    n,
        'mean':     round(mean, 2),
        'std':      round(std, 2),
        'min':      round(min(series), 2),
        'max':      round(max(series), 2),
        'trend_slope_per_day': round(slope, 4),
        'r7_start': round(r7_start, 2),
        'r7_end':   round(r7_end, 2),
        'growth_pct': round((r7_end - r7_start) / r7_start * 100, 2) if r7_start > 0 else 0,
    }


def build_output(records, forecasts, forecast_dates, metrics, method, horizon):
    future_total = sum(f['point'] for f in forecasts)
    hist_total   = sum(r.get('revenue', 0) for r in records[-horizon:]) if len(records) >= horizon else \
                   sum(r.get('revenue', 0) for r in records)

    return {
        'generated_at':   datetime.now().isoformat(),
        'method':         method,
        'horizon_days':   horizon,
        'history_stats':  metrics,
        'forecast': [
            {
                'date':     forecast_dates[i].strftime('%Y-%m-%d'),
                'point':    forecasts[i]['point'],
                'lower_95': forecasts[i]['lower'],
                'upper_95': forecasts[i]['upper'],
            }
            for i in range(len(forecasts))
        ],
        'summary': {
            'forecast_total_revenue':    round(future_total, 2),
            'forecast_daily_avg':        round(future_total / horizon, 2),
            'forecast_vs_hist_growth_pct': round((future_total - hist_total) / hist_total * 100, 2) if hist_total > 0 else 0,
            'peak_forecast_date':         forecast_dates[max(range(len(forecasts)), key=lambda i: forecasts[i]['point'])].strftime('%Y-%m-%d'),
            'trough_forecast_date':       forecast_dates[min(range(len(forecasts)), key=lambda i: forecasts[i]['point'])].strftime('%Y-%m-%d'),
        },
        'recommendations': [
            f"Projected {horizon}-day revenue: ₹{future_total:,.0f}",
            f"Average daily revenue forecast:  ₹{future_total/horizon:,.0f}",
            f"Trend slope: ₹{metrics['trend_slope_per_day']:+.0f}/day — {'growing' if metrics['trend_slope_per_day'] > 0 else 'declining'}",
            "Stock up inventory 2 weeks before projected peak periods.",
            "Review pricing strategy if growth % exceeds 20% — capacity planning needed.",
        ],
    }


def print_summary(output):
    s = output['summary']
    h = output['history_stats']
    print(f"\n{'='*58}")
    print("  FORECASTING BOT — 90-DAY SALES FORECAST")
    print(f"  Method: {output['method']}")
    print(f"{'='*58}")
    print(f"  Historical Data Points : {h['count']}")
    print(f"  Historical Daily Avg   : ₹{h['mean']:,.2f}")
    print(f"  Trend (slope/day)      : ₹{h['trend_slope_per_day']:+.2f}")
    print(f"  7-day Growth           : {h['growth_pct']:+.1f}%")
    print(f"\n  Forecast ({output['horizon_days']} days):")
    print(f"  Total Revenue Forecast : ₹{s['forecast_total_revenue']:,.0f}")
    print(f"  Daily Average Forecast : ₹{s['forecast_daily_avg']:,.0f}")
    print(f"  vs Historical Growth   : {s['forecast_vs_hist_growth_pct']:+.1f}%")
    print(f"  Peak Day               : {s['peak_forecast_date']}")
    print(f"\n  Sample Forecast (first 7 days):")
    for row in output['forecast'][:7]:
        print(f"    {row['date']}  ₹{row['point']:>10,.2f}  "
              f"[₹{row['lower_95']:,.0f} – ₹{row['upper_95']:,.0f}]")
    print(f"{'='*58}\n")


def main():
    parser = argparse.ArgumentParser(description='Forecasting Bot')
    parser.add_argument('--input',  default='data/sales_history.json', help='Input JSON')
    parser.add_argument('--output', default='data/forecast.json',      help='Output JSON')
    parser.add_argument('--days',   type=int, default=90,              help='Forecast horizon (days)')
    args = parser.parse_args()

    records = load_data(args.input)
    series  = [float(r.get('revenue', r.get('value', r.get('sales', 0)))) for r in records]
    if not series:
        print("[ERROR] No numeric data found in input")
        sys.exit(1)

    metrics = compute_metrics(series)

    if HAS_ARIMA:
        forecasts, method = forecast_arima(series, args.days)
    else:
        forecasts = forecast_pure(series, args.days)
        method    = "Holt-DoubleExpSmoothing"

    # Build forecast dates
    last_date_str = records[-1].get('date', datetime.now().strftime('%Y-%m-%d'))
    try:
        last_date = datetime.strptime(last_date_str, '%Y-%m-%d')
    except:
        last_date = datetime.now()
    forecast_dates = [last_date + timedelta(days=i+1) for i in range(args.days)]

    output = build_output(records, forecasts, forecast_dates, metrics, method, args.days)
    print_summary(output)

    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else '.', exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"[INFO] Forecast saved → {args.output}")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
EmporiumVipani — scripts/market_research.py
Sales Backtesting, Price Elasticity & Stock-Market Correlation.
Usage: python3 scripts/market_research.py [--price-change 10] [--window 30]
"""
import json, csv, argparse, sys, os
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

ROOT    = Path(__file__).parent.parent
DB_DIR  = ROOT / "db"
DATA_DIR= ROOT / "data"

def _load(filename):
    for d in [DB_DIR, DATA_DIR]:
        p = d / filename
        if p.exists():
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
    return []


# ── Strategy: Mean Reversion ─────────────────────────────────
# If daily revenue dips below its N-day moving average, "stock up"
# (assume a bounce is coming). Simulate PnL of acting on that signal.

def mean_reversion_backtest(sales, window=7, price_change_pct=0):
    """
    Simulate a Mean-Reversion strategy on daily revenue.

    Returns dict with simulated signals and cumulative PnL.
    """
    daily = defaultdict(float)
    for s in sales:
        d = s.get("date", "")[:10]
        if d:
            rev = s.get("net_total", 0)
            if price_change_pct:
                rev *= (1 + price_change_pct / 100)
            daily[d] += rev

    dates  = sorted(daily.keys())
    values = [daily[d] for d in dates]

    if len(values) < window + 1:
        return None, "Not enough data (need at least %d days of sales)" % (window + 1)

    signals  = []
    cum_pnl  = 0.0
    position = False  # are we "stocked up"?

    for i in range(window, len(values)):
        ma    = sum(values[i - window:i]) / window
        today = values[i]
        pnl   = 0.0

        if not position and today < ma * 0.95:      # dip: buy signal
            position = True
            signal   = "BUY"
        elif position and today > ma:               # mean restored: sell
            pnl      = today - values[i - 1]
            cum_pnl += pnl
            position = False
            signal   = "SELL"
        else:
            signal = "HOLD"

        signals.append({
            "date": dates[i], "revenue": round(today, 2),
            f"ma_{window}d": round(ma, 2),
            "signal": signal, "daily_pnl": round(pnl, 2),
            "cumulative_pnl": round(cum_pnl, 2),
        })

    return signals, None


# ── Price Elasticity ─────────────────────────────────────────
def price_elasticity_model(sales, increments=None):
    """
    Estimate how different price levels would affect total revenue.
    Assumes simple linear demand: each 1% price rise → 0.5% demand drop.
    """
    if increments is None:
        increments = [-20, -10, -5, 0, 5, 10, 20]

    base_revenue = sum(s.get("net_total", 0) for s in sales)
    base_orders  = len(sales)

    results = []
    for pct in increments:
        demand_change  = -pct * 0.5 / 100         # elasticity = -0.5
        adj_orders     = base_orders * (1 + demand_change)
        avg_order_val  = (base_revenue / base_orders) if base_orders else 0
        adj_revenue    = adj_orders * avg_order_val * (1 + pct / 100)
        results.append({
            "price_change_%": pct,
            "est_orders":     round(adj_orders),
            "est_revenue":    round(adj_revenue, 2),
            "revenue_delta":  round(adj_revenue - base_revenue, 2),
        })
    return results


# ── Category Trend ────────────────────────────────────────────
def category_trend(sales, top_n=5):
    cat_stats = defaultdict(lambda: {"revenue": 0, "orders": 0})
    for s in sales:
        for item in s.get("items", []):
            cat = item.get("category", item.get("name", "Unknown"))
            cat_stats[cat]["revenue"] += item.get("lineTotal", item.get("taxable", 0))
            cat_stats[cat]["orders"]  += 1
    return sorted(cat_stats.items(), key=lambda x: -x[1]["revenue"])[:top_n]


# ── Export helper ────────────────────────────────────────────
def write_csv(path, rows, fieldnames):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    print(f"  ✅  Exported → {path}")


def main():
    parser = argparse.ArgumentParser(description="EmporiumVipani Market Research")
    parser.add_argument("--price-change", type=float, default=0,
                        help="Simulate % price change for elasticity model")
    parser.add_argument("--window", type=int, default=7,
                        help="Moving average window for mean-reversion (days)")
    args = parser.parse_args()

    sales = _load("sales_ledger.json")
    if not sales:
        print("⚠️  sales_ledger.json is empty. Add sales via the Admin POS first.")
        sys.exit(0)

    print("=" * 62)
    print("🔬  EMPORIUM VIPANI — MARKET RESEARCH & BACKTESTING")
    print(f"    {datetime.now().strftime('%d %b %Y %H:%M')}  |  {len(sales)} transactions")
    print("=" * 62)

    # 1. Mean Reversion Backtest
    print(f"\n📊  MEAN-REVERSION BACKTEST  (MA window = {args.window} days)")
    signals, err = mean_reversion_backtest(sales, window=args.window,
                                           price_change_pct=args.price_change)
    if err:
        print(f"  ⚠️  {err}")
    else:
        buys  = sum(1 for s in signals if s["signal"] == "BUY")
        sells = sum(1 for s in signals if s["signal"] == "SELL")
        final_pnl = signals[-1]["cumulative_pnl"] if signals else 0
        print(f"  BUY signals  : {buys}")
        print(f"  SELL signals : {sells}")
        print(f"  Simulated PnL: ₹{final_pnl:,.2f}")
        if args.price_change:
            print(f"  (with {args.price_change:+.1f}% price change applied)")
        out = DB_DIR / "backtest_results.csv"
        write_csv(out, signals,
                  ["date", "revenue", f"ma_{args.window}d", "signal", "daily_pnl", "cumulative_pnl"])

    # 2. Price Elasticity
    print("\n💡  PRICE ELASTICITY MODEL")
    print(f"  {'Price Δ':>8}  {'Est Orders':>12}  {'Est Revenue':>13}  {'Revenue Δ':>12}")
    print("  " + "─" * 52)
    for row in price_elasticity_model(sales):
        print(f"  {str(row['price_change_%']) + '%':>8}  {row['est_orders']:>12}  "
              f"₹{row['est_revenue']:>12,.2f}  ₹{row['revenue_delta']:>+11,.2f}")

    # 3. Category Trends
    print("\n🏷️  TOP CATEGORY REVENUE")
    print(f"  {'Category':<24}  {'Orders':>8}  {'Revenue':>12}")
    print("  " + "─" * 48)
    for cat, d in category_trend(sales):
        print(f"  {cat:<24}  {d['orders']:>8}  ₹{d['revenue']:>10,.2f}")

    print("\n" + "=" * 62)
    print("💡  Recommendation:")
    base_rev = sum(s.get("net_total", 0) for s in sales)
    elasticity = price_elasticity_model(sales, [5])
    if elasticity and elasticity[0]["revenue_delta"] > 0:
        print(f"  A +5% price increase is estimated to ADD ₹{elasticity[0]['revenue_delta']:,.0f} in revenue.")
    else:
        print("  Current pricing appears near the optimal point.")
    print("=" * 62)


if __name__ == "__main__":
    main()

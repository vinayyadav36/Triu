#!/usr/bin/env python3
"""
trading_bot.py
Backtesting + signal-generation script using SMA crossover strategy.
Loads OHLCV data from CSV or generates synthetic data if not found.
Outputs: trades log JSON + performance report.

Usage:
    python trading_bot.py --input data/prices.csv --symbol RELIANCE
    python trading_bot.py  # uses synthetic data
"""
import json
import csv
import os
import sys
import math
import random
import argparse
from datetime import datetime, timedelta
from collections import defaultdict

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic OHLCV data generator
# ─────────────────────────────────────────────────────────────────────────────
def generate_synthetic_ohlcv(symbol='SYNTH', days=500, start_price=1000.0, seed=42):
    random.seed(seed)
    data   = []
    price  = start_price
    date   = datetime(2022, 1, 1)
    for _ in range(days):
        if date.weekday() >= 5:
            date += timedelta(days=1)
            continue
        drift     = random.gauss(0.0003, 0.018)
        open_p    = round(price, 2)
        close_p   = round(price * (1 + drift), 2)
        high_p    = round(max(open_p, close_p) * (1 + abs(random.gauss(0, 0.008))), 2)
        low_p     = round(min(open_p, close_p) * (1 - abs(random.gauss(0, 0.008))), 2)
        volume    = int(random.gauss(500000, 150000))
        data.append({
            'date':   date.strftime('%Y-%m-%d'),
            'open':   open_p,
            'high':   high_p,
            'low':    low_p,
            'close':  close_p,
            'volume': max(volume, 10000),
        })
        price = close_p
        date += timedelta(days=1)
    return data


def load_ohlcv(filepath, symbol=''):
    if filepath and os.path.exists(filepath):
        data = []
        with open(filepath, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                data.append({
                    'date':   row.get('date', row.get('Date', '')),
                    'open':   float(row.get('open',   row.get('Open',   0))),
                    'high':   float(row.get('high',   row.get('High',   0))),
                    'low':    float(row.get('low',    row.get('Low',    0))),
                    'close':  float(row.get('close',  row.get('Close',  0))),
                    'volume': int(float(row.get('volume', row.get('Volume', 0)))),
                })
        print(f"[INFO] Loaded {len(data)} candles from {filepath}")
        return data
    print(f"[INFO] No data file found — generating synthetic OHLCV for {symbol or 'SYNTH'}")
    return generate_synthetic_ohlcv(symbol=symbol or 'SYNTH')


# ─────────────────────────────────────────────────────────────────────────────
# Technical indicators (pure Python)
# ─────────────────────────────────────────────────────────────────────────────
def sma(closes, period):
    """Simple Moving Average."""
    result = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        result[i] = round(sum(closes[i - period + 1: i + 1]) / period, 4)
    return result


def ema(closes, period):
    """Exponential Moving Average."""
    k      = 2 / (period + 1)
    result = [None] * len(closes)
    for i in range(len(closes)):
        if i < period - 1:
            continue
        if i == period - 1:
            result[i] = sum(closes[:period]) / period
        else:
            result[i] = closes[i] * k + result[i-1] * (1 - k)
    return [round(v, 4) if v is not None else None for v in result]


def atr(data, period=14):
    """Average True Range."""
    trs = []
    for i in range(1, len(data)):
        h, l, pc = data[i]['high'], data[i]['low'], data[i-1]['close']
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    result = [None] * len(data)
    for i in range(period, len(trs) + 1):
        result[i] = round(sum(trs[i - period: i]) / period, 4)
    return result


def rsi(closes, period=14):
    """Relative Strength Index."""
    result = [None] * len(closes)
    if len(closes) < period + 1:
        return result
    gains, losses = [], []
    for i in range(1, len(closes)):
        delta = closes[i] - closes[i-1]
        gains.append(max(delta, 0))
        losses.append(max(-delta, 0))
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(closes) - 1):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            result[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i + 1] = round(100 - 100 / (1 + rs), 2)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# SMA Crossover backtest engine
# ─────────────────────────────────────────────────────────────────────────────
def backtest_sma_crossover(data, fast=20, slow=50, initial_capital=100000.0,
                            risk_pct=0.02, stop_loss_atr_mult=2.0, take_profit_ratio=2.0):
    closes  = [d['close'] for d in data]
    fast_ma = sma(closes, fast)
    slow_ma = sma(closes, slow)
    atr_vals = atr(data, 14)
    rsi_vals = rsi(closes, 14)

    trades       = []
    capital      = initial_capital
    equity_curve = []
    position     = None  # {'entry_date', 'entry_price', 'qty', 'stop', 'tp', 'direction'}

    for i in range(slow, len(data)):
        date   = data[i]['date']
        price  = data[i]['close']
        fm, sm = fast_ma[i], slow_ma[i]
        fm_prev, sm_prev = fast_ma[i-1], slow_ma[i-1]

        if fm is None or sm is None or fm_prev is None or sm_prev is None:
            equity_curve.append({'date': date, 'equity': round(capital, 2), 'position': 'none'})
            continue

        atr_val = atr_vals[i] or (price * 0.02)

        # ── Exit logic ────────────────────────────────────────────────────────
        if position is not None:
            hit_stop = price <= position['stop'] if position['direction'] == 'long' else price >= position['stop']
            hit_tp   = price >= position['tp']   if position['direction'] == 'long' else price <= position['tp']
            # SMA death cross exit
            cross_exit = (fm < sm) if position['direction'] == 'long' else (fm > sm)

            if hit_stop or hit_tp or cross_exit:
                exit_price = position['stop'] if hit_stop else (position['tp'] if hit_tp else price)
                pnl_per    = (exit_price - position['entry_price']) if position['direction'] == 'long' \
                             else (position['entry_price'] - exit_price)
                pnl        = round(pnl_per * position['qty'], 2)
                pnl_pct    = round(pnl_per / position['entry_price'] * 100, 2)
                capital   += pnl + position['entry_price'] * position['qty']

                exit_reason = 'stop_loss' if hit_stop else ('take_profit' if hit_tp else 'signal')
                trades.append({
                    'trade_id':    len(trades) + 1,
                    'symbol':      position['symbol'],
                    'direction':   position['direction'],
                    'entry_date':  position['entry_date'],
                    'exit_date':   date,
                    'entry_price': position['entry_price'],
                    'exit_price':  round(exit_price, 2),
                    'quantity':    position['qty'],
                    'stop_loss':   round(position['stop'], 2),
                    'take_profit': round(position['tp'], 2),
                    'pnl':         pnl,
                    'pnl_pct':     pnl_pct,
                    'exit_reason': exit_reason,
                    'fast_sma':    round(fm, 2),
                    'slow_sma':    round(sm, 2),
                })
                position = None

        # ── Entry logic (golden/death cross) ─────────────────────────────────
        if position is None:
            golden_cross = (fm_prev <= sm_prev) and (fm > sm)
            death_cross  = (fm_prev >= sm_prev) and (fm < sm)

            if golden_cross or death_cross:
                direction  = 'long' if golden_cross else 'short'
                risk_amt   = capital * risk_pct
                stop_dist  = atr_val * stop_loss_atr_mult
                qty        = max(1, int(risk_amt / stop_dist))
                cost       = price * qty
                if cost > capital:
                    qty  = max(1, int(capital * 0.95 / price))
                    cost = price * qty

                stop  = price - stop_dist if direction == 'long' else price + stop_dist
                tp    = price + stop_dist * take_profit_ratio if direction == 'long' \
                        else price - stop_dist * take_profit_ratio
                capital -= cost

                position = {
                    'symbol':      'SYMBOL',
                    'direction':   direction,
                    'entry_date':  date,
                    'entry_price': price,
                    'qty':         qty,
                    'stop':        stop,
                    'tp':          tp,
                }

        unrealised = 0
        if position is not None:
            unreal_per = (price - position['entry_price']) if position['direction'] == 'long' \
                         else (position['entry_price'] - price)
            unrealised = unreal_per * position['qty']

        equity_curve.append({
            'date':      date,
            'equity':    round(capital + unrealised, 2),
            'position':  position['direction'] if position else 'none',
        })

    # Close open position at last bar
    if position is not None:
        price    = data[-1]['close']
        pnl_per  = (price - position['entry_price']) if position['direction'] == 'long' \
                   else (position['entry_price'] - price)
        pnl      = round(pnl_per * position['qty'], 2)
        pnl_pct  = round(pnl_per / position['entry_price'] * 100, 2)
        capital += pnl + position['entry_price'] * position['qty']
        trades.append({
            'trade_id':    len(trades) + 1,
            'symbol':      position['symbol'],
            'direction':   position['direction'],
            'entry_date':  position['entry_date'],
            'exit_date':   data[-1]['date'],
            'entry_price': position['entry_price'],
            'exit_price':  round(price, 2),
            'quantity':    position['qty'],
            'stop_loss':   round(position['stop'], 2),
            'take_profit': round(position['tp'], 2),
            'pnl':         pnl,
            'pnl_pct':     pnl_pct,
            'exit_reason': 'end_of_data',
            'fast_sma':    round(fast_ma[-1] or 0, 2),
            'slow_sma':    round(slow_ma[-1] or 0, 2),
        })

    return trades, equity_curve, capital


# ─────────────────────────────────────────────────────────────────────────────
# Performance metrics
# ─────────────────────────────────────────────────────────────────────────────
def calc_performance(trades, equity_curve, initial_capital):
    if not trades:
        return {"error": "No trades executed"}

    wins   = [t for t in trades if t['pnl'] > 0]
    losses = [t for t in trades if t['pnl'] <= 0]
    pnls   = [t['pnl'] for t in trades]

    total_pnl   = sum(pnls)
    win_rate    = round(len(wins) / len(trades) * 100, 2)
    avg_win     = round(sum(t['pnl'] for t in wins) / len(wins), 2)   if wins   else 0
    avg_loss    = round(sum(t['pnl'] for t in losses) / len(losses), 2) if losses else 0
    profit_factor = round(-sum(t['pnl'] for t in wins) / sum(t['pnl'] for t in losses), 2) \
                    if losses and sum(t['pnl'] for t in losses) != 0 else float('inf')

    # Max drawdown
    peak  = initial_capital
    max_dd = 0.0
    for bar in equity_curve:
        eq = bar['equity']
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak
        if dd > max_dd:
            max_dd = dd

    # Sharpe ratio (daily returns, annualised)
    equities = [b['equity'] for b in equity_curve]
    if len(equities) > 1:
        daily_rets = [(equities[i] - equities[i-1]) / equities[i-1]
                      for i in range(1, len(equities)) if equities[i-1] > 0]
        n    = len(daily_rets)
        mean = sum(daily_rets) / n
        variance = sum((r - mean) ** 2 for r in daily_rets) / n
        std  = math.sqrt(variance) if variance > 0 else 0.0001
        sharpe = round(mean / std * math.sqrt(252), 3)
    else:
        sharpe = 0.0

    final_equity   = equity_curve[-1]['equity'] if equity_curve else initial_capital
    total_return_pct = round((final_equity - initial_capital) / initial_capital * 100, 2)

    return {
        "total_trades":    len(trades),
        "winning_trades":  len(wins),
        "losing_trades":   len(losses),
        "win_rate_pct":    win_rate,
        "total_pnl":       round(total_pnl, 2),
        "total_return_pct": total_return_pct,
        "avg_win":         avg_win,
        "avg_loss":        avg_loss,
        "profit_factor":   profit_factor,
        "max_drawdown_pct": round(max_dd * 100, 2),
        "sharpe_ratio":    sharpe,
        "initial_capital": initial_capital,
        "final_equity":    round(final_equity, 2),
        "best_trade":      max(pnls),
        "worst_trade":     min(pnls),
    }


def print_report(perf, symbol, fast_period, slow_period):
    p = perf
    print(f"\n{'='*58}")
    print(f"  TRADING BOT — SMA({fast_period}/{slow_period}) BACKTEST RESULTS")
    print(f"  Symbol: {symbol}")
    print(f"{'='*58}")
    print(f"  Total Trades     : {p['total_trades']}")
    print(f"  Win Rate         : {p['win_rate_pct']}%  ({p['winning_trades']}W / {p['losing_trades']}L)")
    print(f"  Total P&L        : ₹{p['total_pnl']:>12,.2f}")
    print(f"  Total Return     : {p['total_return_pct']}%")
    print(f"  Avg Win          : ₹{p['avg_win']:>10,.2f}")
    print(f"  Avg Loss         : ₹{p['avg_loss']:>10,.2f}")
    print(f"  Profit Factor    : {p['profit_factor']}")
    print(f"  Max Drawdown     : {p['max_drawdown_pct']}%")
    print(f"  Sharpe Ratio     : {p['sharpe_ratio']}")
    print(f"  Initial Capital  : ₹{p['initial_capital']:>12,.2f}")
    print(f"  Final Equity     : ₹{p['final_equity']:>12,.2f}")
    print(f"  Best Trade       : ₹{p['best_trade']:>10,.2f}")
    print(f"  Worst Trade      : ₹{p['worst_trade']:>10,.2f}")
    print(f"{'='*58}\n")


def main():
    parser = argparse.ArgumentParser(description='Trading Bot — SMA Crossover Backtest')
    parser.add_argument('--input',         default='data/prices.csv',      help='OHLCV CSV file')
    parser.add_argument('--symbol',        default='STOCK',                 help='Symbol name')
    parser.add_argument('--fast',          type=int, default=20,            help='Fast SMA period')
    parser.add_argument('--slow',          type=int, default=50,            help='Slow SMA period')
    parser.add_argument('--capital',       type=float, default=100000.0,    help='Initial capital')
    parser.add_argument('--output-trades', default='data/trades_log.json',  help='Trades log output')
    parser.add_argument('--output-perf',   default='data/performance.json', help='Performance output')
    args = parser.parse_args()

    data   = load_ohlcv(args.input, args.symbol)
    trades, equity_curve, final_cap = backtest_sma_crossover(
        data, fast=args.fast, slow=args.slow, initial_capital=args.capital
    )
    perf   = calc_performance(trades, equity_curve, args.capital)
    print_report(perf, args.symbol, args.fast, args.slow)

    os.makedirs(os.path.dirname(args.output_trades) if os.path.dirname(args.output_trades) else '.', exist_ok=True)

    output = {
        "generated_at":  datetime.now().isoformat(),
        "symbol":         args.symbol,
        "strategy":       f"SMA Crossover ({args.fast}/{args.slow})",
        "backtest_period": {"start": data[0]['date'], "end": data[-1]['date'], "candles": len(data)},
        "performance":    perf,
        "trades":         trades,
        "equity_curve_sample": equity_curve[::max(1, len(equity_curve)//50)],  # downsample
    }

    with open(args.output_trades, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    with open(args.output_perf, 'w', encoding='utf-8') as f:
        json.dump(perf, f, indent=2, ensure_ascii=False)

    print(f"[INFO] Trades log  → {args.output_trades}")
    print(f"[INFO] Performance → {args.output_perf}")


if __name__ == '__main__':
    main()

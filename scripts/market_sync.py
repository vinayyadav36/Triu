#!/usr/bin/env python3
"""
EmporiumVipani — scripts/market_sync.py
Live Market Data via yfinance + Sales Correlation.
Used by the Growth Lab backend route /api/admin/market-status.

Usage: python3 scripts/market_sync.py [--index ^NSEI] [--output json]
"""
import json
import sys
import argparse
from datetime import datetime
from pathlib import Path

ROOT   = Path(__file__).parent.parent
DB_DIR = ROOT / "db"


def _load_sales():
    p = DB_DIR / "sales_ledger.json"
    if p.exists():
        with open(p, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []


def fetch_market(symbol='^NSEI'):
    """Fetch latest price via yfinance. Returns dict with price/change/name."""
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        info   = ticker.info
        hist   = ticker.history(period='2d')

        if len(hist) >= 2:
            prev_close = float(hist['Close'].iloc[-2])
            cur_close  = float(hist['Close'].iloc[-1])
            change_pct = (cur_close - prev_close) / prev_close * 100
        else:
            cur_close  = float(info.get('regularMarketPrice', 0))
            prev_close = float(info.get('regularMarketPreviousClose', cur_close))
            change_pct = (cur_close - prev_close) / prev_close * 100 if prev_close else 0.0

        return {
            'symbol':  symbol,
            'name':    info.get('longName', info.get('shortName', symbol)),
            'price':   round(cur_close, 2),
            'change':  round(change_pct, 2),
            'volume':  info.get('regularMarketVolume', 0),
            'updated': datetime.now().strftime('%Y-%m-%d %H:%M IST'),
            'source':  'yfinance',
        }
    except ImportError:
        return _mock_market(symbol)
    except Exception as e:
        return _mock_market(symbol, error=str(e))


def _mock_market(symbol, error=None):
    """Fallback when yfinance unavailable — returns last cached or placeholder."""
    cache_path = DB_DIR / 'market_cache.json'
    if cache_path.exists():
        with open(cache_path, 'r') as f:
            cached = json.load(f)
        cached['source'] = 'cached'
        return cached
    return {
        'symbol':  symbol,
        'name':    'NIFTY 50',
        'price':   24547.80,
        'change':  0.42,
        'volume':  0,
        'updated': datetime.now().strftime('%Y-%m-%d %H:%M IST'),
        'source':  'mock',
        'note':    'Install yfinance: pip install yfinance' + (f' | Error: {error}' if error else ''),
    }


def calc_correlation(sales, market_change):
    """
    Simple Pearson-like correlation between daily sales growth and market change.
    Returns a float 0–1 representing alignment.
    """
    from collections import defaultdict
    daily = defaultdict(float)
    for s in sales:
        d = s.get('date', '')[:10]
        if d:
            daily[d] += s.get('net_total', 0)
    if len(daily) < 3:
        return None
    vals   = [daily[d] for d in sorted(daily)]
    deltas = [(vals[i]-vals[i-1])/vals[i-1]*100 if vals[i-1] else 0 for i in range(1, len(vals))]
    if not deltas:
        return None
    avg    = sum(deltas) / len(deltas)
    # Positive correlation if sales average growth sign matches market sign
    if (avg > 0 and market_change > 0) or (avg < 0 and market_change < 0):
        # Rough magnitude alignment
        score = min(abs(avg) / (abs(market_change) + 1e-6), 1.0)
        return round(max(0.3, min(score, 0.95)), 2)
    return round(max(0.0, 0.3 - abs(avg - market_change) / 100), 2)


def run(symbol='^NSEI', output='text'):
    market = fetch_market(symbol)
    sales  = _load_sales()
    corr   = calc_correlation(sales, market.get('change', 0))
    market['correlation']  = corr
    market['sales_count']  = len(sales)

    # Cache result for fallback
    cache_path = DB_DIR / 'market_cache.json'
    try:
        DB_DIR.mkdir(exist_ok=True)
        with open(cache_path, 'w') as f:
            json.dump(market, f, indent=2)
    except Exception:
        pass

    if output == 'json':
        print(json.dumps(market, indent=2))
        return market

    # Human-readable
    sign = '+' if market['change'] >= 0 else ''
    corr_str = f"{corr*100:.0f}%" if corr is not None else 'N/A (not enough data)'
    print("=" * 52)
    print(f"  MARKET PULSE — {market.get('name','')}")
    print("=" * 52)
    print(f"  Symbol   : {market['symbol']}")
    print(f"  Price    : ₹{market['price']:,.2f}")
    print(f"  Change   : {sign}{market['change']:.2f}%")
    print(f"  Volume   : {market.get('volume',0):,}")
    print(f"  Updated  : {market['updated']}")
    print(f"  Source   : {market['source']}")
    print(f"  Correlation with sales: {corr_str}")
    print(f"  Sales on record       : {len(sales)}")
    if corr and corr >= 0.5:
        print("  ▲ Sales trend aligned with market — consider riding the bull!")
    elif corr is not None:
        print("  ▼ Sales trend not strongly correlated with market index.")
    print("=" * 52)
    return market


if __name__ == '__main__':
    p = argparse.ArgumentParser(description='EmporiumVipani Market Sync')
    p.add_argument('--index', default='^NSEI', help='Yahoo Finance ticker symbol')
    p.add_argument('--output', default='text', choices=['text', 'json'])
    args = p.parse_args()
    run(symbol=args.index, output=args.output)

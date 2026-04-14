#!/usr/bin/env python3
"""
digital_marketer_bot.py
Analyzes product engagement data and generates structured campaign suggestions.
Input:  JSON file with product engagement metrics (default: data/engagement.json)
Output: JSON campaign plan  +  console summary
"""
import json
import sys
import os
import argparse
from datetime import datetime, timedelta
from collections import defaultdict

# Optional: pandas/numpy with graceful fallback
try:
    import pandas as pd
    import numpy as np
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

# ─────────────────────────────────────────────
# Sample data used when no input file is given
# ─────────────────────────────────────────────
SAMPLE_ENGAGEMENT = [
    {"product_id": "P001", "name": "Wireless Headphones",  "category": "Electronics", "views": 4200, "add_to_cart": 820,  "purchases": 310, "revenue": 155000, "returns": 12,  "rating": 4.5},
    {"product_id": "P002", "name": "Running Shoes",         "category": "Footwear",    "views": 3800, "add_to_cart": 950,  "purchases": 430, "revenue": 172000, "returns": 18,  "rating": 4.3},
    {"product_id": "P003", "name": "Yoga Mat",              "category": "Fitness",     "views": 2900, "add_to_cart": 560,  "purchases": 240, "revenue":  48000, "returns":  5,  "rating": 4.7},
    {"product_id": "P004", "name": "Coffee Maker",          "category": "Appliances",  "views": 1800, "add_to_cart": 310,  "purchases": 120, "revenue":  84000, "returns": 22,  "rating": 3.9},
    {"product_id": "P005", "name": "Laptop Stand",          "category": "Electronics", "views": 3100, "add_to_cart": 780,  "purchases": 390, "revenue":  78000, "returns":  8,  "rating": 4.6},
    {"product_id": "P006", "name": "Protein Powder",        "category": "Fitness",     "views": 5200, "add_to_cart": 1200, "purchases": 610, "revenue": 183000, "returns": 30,  "rating": 4.2},
    {"product_id": "P007", "name": "Sneakers Classic",      "category": "Footwear",    "views": 2200, "add_to_cart": 440,  "purchases": 190, "revenue":  76000, "returns": 14,  "rating": 4.1},
    {"product_id": "P008", "name": "Smart Watch",           "category": "Electronics", "views": 6100, "add_to_cart": 1400, "purchases": 520, "revenue": 416000, "returns": 45,  "rating": 4.4},
    {"product_id": "P009", "name": "Resistance Bands Set",  "category": "Fitness",     "views": 1900, "add_to_cart": 480,  "purchases": 220, "revenue":  22000, "returns":  3,  "rating": 4.8},
    {"product_id": "P010", "name": "Air Fryer",             "category": "Appliances",  "views": 4500, "add_to_cart": 890,  "purchases": 340, "revenue": 238000, "returns": 28,  "rating": 4.0},
]


def load_data(filepath):
    if filepath and os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"[INFO] Loaded {len(data)} records from {filepath}")
        return data
    print("[INFO] No input file found — using sample engagement data")
    return SAMPLE_ENGAGEMENT


def compute_metrics_pure(products):
    """Pure-Python metric computation (no pandas)."""
    for p in products:
        views       = p.get('views', 1) or 1
        cart        = p.get('add_to_cart', 0)
        purchases   = p.get('purchases', 0)
        revenue     = p.get('revenue', 0)
        returns     = p.get('returns', 0)
        p['ctr']           = round(cart / views * 100, 2)
        p['cvr']           = round(purchases / (cart or 1) * 100, 2)
        p['aov']           = round(revenue / (purchases or 1), 2)
        p['return_rate']   = round(returns / (purchases or 1) * 100, 2)
        p['engagement_score'] = round(
            p['ctr'] * 0.3 + p['cvr'] * 0.4 + p.get('rating', 3) * 6 * 0.3, 2
        )
    return products


def compute_metrics_pandas(products):
    df = pd.DataFrame(products)
    df['views']       = df['views'].replace(0, 1)
    df['ctr']         = (df['add_to_cart'] / df['views'] * 100).round(2)
    df['cvr']         = (df['purchases'] / df['add_to_cart'].replace(0, 1) * 100).round(2)
    df['aov']         = (df['revenue'] / df['purchases'].replace(0, 1)).round(2)
    df['return_rate'] = (df['returns'] / df['purchases'].replace(0, 1) * 100).round(2)
    df['engagement_score'] = (
        df['ctr'] * 0.3 + df['cvr'] * 0.4 + df.get('rating', pd.Series([3]*len(df))) * 6 * 0.3
    ).round(2)
    return df.to_dict(orient='records')


def compute_metrics(products):
    return compute_metrics_pandas(products) if HAS_PANDAS else compute_metrics_pure(products)


def aggregate_by_category(products):
    cats = defaultdict(lambda: {'products': [], 'total_revenue': 0, 'total_views': 0,
                                 'total_purchases': 0, 'avg_rating': 0})
    for p in products:
        cat = p['category']
        cats[cat]['products'].append(p)
        cats[cat]['total_revenue']   += p.get('revenue', 0)
        cats[cat]['total_views']     += p.get('views', 0)
        cats[cat]['total_purchases'] += p.get('purchases', 0)

    for cat, info in cats.items():
        ratings = [p.get('rating', 0) for p in info['products'] if p.get('rating')]
        info['avg_rating']   = round(sum(ratings) / len(ratings), 2) if ratings else 0
        info['avg_eng_score'] = round(
            sum(p.get('engagement_score', 0) for p in info['products']) / len(info['products']), 2
        )
    return cats


def generate_campaigns(products, categories):
    now   = datetime.now()
    campaigns = []

    # Sort categories by total revenue descending
    sorted_cats = sorted(categories.items(), key=lambda x: x[1]['total_revenue'], reverse=True)
    top_cats    = [c[0] for c in sorted_cats[:3]]

    # Top performers → boost campaign
    top_products = sorted(products, key=lambda p: p.get('engagement_score', 0), reverse=True)[:3]
    campaigns.append({
        "campaign_id":   "CMP-001",
        "type":          "Performance Boost",
        "name":          "Top Performers Flash Sale",
        "objective":     "Maximize revenue from high-converting products",
        "channels":      ["email", "push_notification", "social_media"],
        "target_products": [p['product_id'] for p in top_products],
        "suggested_discount_pct": 10,
        "start_date":    (now + timedelta(days=3)).strftime('%Y-%m-%d'),
        "end_date":      (now + timedelta(days=10)).strftime('%Y-%m-%d'),
        "estimated_roi": "18–25%",
        "budget_inr":    50000,
        "creative_idea": f"Highlight top-rated products: {', '.join(p['name'] for p in top_products)}. Use countdown timer.",
    })

    # Underperformers with high views but low CVR → retargeting
    low_cvr = [p for p in products if p.get('ctr', 0) > 15 and p.get('cvr', 0) < 35]
    if low_cvr:
        campaigns.append({
            "campaign_id":   "CMP-002",
            "type":          "Retargeting",
            "name":          "Cart Abandonment Recovery",
            "objective":     "Convert cart adds to purchases",
            "channels":      ["retargeting_ads", "email", "whatsapp"],
            "target_products": [p['product_id'] for p in low_cvr[:4]],
            "suggested_discount_pct": 5,
            "start_date":    (now + timedelta(days=1)).strftime('%Y-%m-%d'),
            "end_date":      (now + timedelta(days=14)).strftime('%Y-%m-%d'),
            "estimated_roi": "12–20%",
            "budget_inr":    30000,
            "creative_idea": "Dynamic retargeting ads with 'Still thinking about it?' copy + 5% coupon.",
        })

    # Category spotlight for top 3 categories
    for idx, cat in enumerate(top_cats[:2], 3):
        info = categories[cat]
        campaigns.append({
            "campaign_id":   f"CMP-00{idx}",
            "type":          "Category Spotlight",
            "name":          f"{cat} Category Week",
            "objective":     f"Drive category awareness and purchase for {cat}",
            "channels":      ["instagram", "facebook", "google_shopping"],
            "target_category": cat,
            "product_count": len(info['products']),
            "suggested_discount_pct": 8,
            "start_date":    (now + timedelta(days=7)).strftime('%Y-%m-%d'),
            "end_date":      (now + timedelta(days=14)).strftime('%Y-%m-%d'),
            "estimated_roi": "15–22%",
            "budget_inr":    40000,
            "creative_idea": f"Curated {cat} collection banner + UGC reviews. Average rating {info['avg_rating']}⭐",
        })

    # High return rate → loyalty campaign
    high_return = [p for p in products if p.get('return_rate', 0) > 8]
    if high_return:
        campaigns.append({
            "campaign_id":   "CMP-005",
            "type":          "Customer Retention",
            "name":          "Quality Assurance + Loyalty Reward",
            "objective":     "Reduce return rate and increase repeat purchase",
            "channels":      ["email", "loyalty_program"],
            "target_products": [p['product_id'] for p in high_return],
            "suggested_discount_pct": 0,
            "loyalty_points_bonus":   200,
            "start_date":    (now + timedelta(days=5)).strftime('%Y-%m-%d'),
            "end_date":      (now + timedelta(days=30)).strftime('%Y-%m-%d'),
            "estimated_roi": "8–14%",
            "budget_inr":    20000,
            "creative_idea": "Post-purchase survey + 200 bonus loyalty points for detailed review.",
        })

    return campaigns


def build_plan(products, categories, campaigns):
    total_rev   = sum(p.get('revenue', 0) for p in products)
    total_views = sum(p.get('views', 0) for p in products)
    avg_cvr     = round(sum(p.get('cvr', 0) for p in products) / len(products), 2)
    avg_ctr     = round(sum(p.get('ctr', 0) for p in products) / len(products), 2)

    return {
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_products_analyzed": len(products),
            "total_revenue_inr":       total_rev,
            "total_views":             total_views,
            "avg_ctr_pct":             avg_ctr,
            "avg_cvr_pct":             avg_cvr,
            "top_category":            max(categories, key=lambda c: categories[c]['total_revenue']),
        },
        "category_breakdown": {
            cat: {
                "total_revenue":   info['total_revenue'],
                "total_views":     info['total_views'],
                "total_purchases": info['total_purchases'],
                "avg_rating":      info['avg_rating'],
                "product_count":   len(info['products']),
            }
            for cat, info in categories.items()
        },
        "top_products": [
            {k: v for k, v in p.items() if k != 'products'}
            for p in sorted(products, key=lambda x: x.get('engagement_score', 0), reverse=True)[:5]
        ],
        "campaigns":    campaigns,
        "total_campaign_budget_inr": sum(c.get('budget_inr', 0) for c in campaigns),
        "recommendations": [
            "Focus 40% of ad spend on Electronics — highest revenue category.",
            "Implement exit-intent popups to recover abandoning visitors.",
            "Use WhatsApp campaigns for cart-abandonment recovery (30–40% open rate).",
            "A/B test discount messaging: 'Save 10%' vs '₹X off today only'.",
            "Schedule email campaigns Tuesday–Thursday 10am–12pm IST for best open rates.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description='Digital Marketer Bot')
    parser.add_argument('--input',  default='data/engagement.json', help='Input JSON file')
    parser.add_argument('--output', default='data/campaign_plan.json', help='Output JSON file')
    args = parser.parse_args()

    raw_products = load_data(args.input)
    products     = compute_metrics(raw_products)
    categories   = aggregate_by_category(products)
    campaigns    = generate_campaigns(products, categories)
    plan         = build_plan(products, categories, campaigns)

    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else '.', exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*55}")
    print("  DIGITAL MARKETER BOT — CAMPAIGN PLAN SUMMARY")
    print(f"{'='*55}")
    s = plan['summary']
    print(f"  Products Analyzed : {s['total_products_analyzed']}")
    print(f"  Total Revenue     : ₹{s['total_revenue_inr']:,.0f}")
    print(f"  Avg CTR           : {s['avg_ctr_pct']}%")
    print(f"  Avg CVR           : {s['avg_cvr_pct']}%")
    print(f"  Top Category      : {s['top_category']}")
    print(f"\n  Campaigns Generated: {len(plan['campaigns'])}")
    for c in plan['campaigns']:
        print(f"   [{c['campaign_id']}] {c['name']}  Budget: ₹{c.get('budget_inr',0):,}")
    print(f"\n  Total Budget      : ₹{plan['total_campaign_budget_inr']:,}")
    print(f"\n  Output saved to: {args.output}")
    print(f"{'='*55}\n")


if __name__ == '__main__':
    main()

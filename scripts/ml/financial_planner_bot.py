#!/usr/bin/env python3
"""
financial_planner_bot.py
Takes income/expenses JSON as input, generates a monthly budget plan using the
50-30-20 rule and custom allocation strategies, suggests savings targets and
emergency fund timeline, and outputs a JSON plan + text report.

Input:  JSON file with income and expense records (default: data/finances.json)
Output: data/financial_plan.json  +  data/financial_report.txt
"""
import json
import sys
import os
import argparse
from datetime import datetime, timedelta
from collections import defaultdict

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

# ──────────────────────────────────────────────────────────────────────────────
# Sample financial data (used when no file provided)
# ──────────────────────────────────────────────────────────────────────────────
SAMPLE_FINANCES = {
    "person": {
        "name":   "Sample User",
        "age":    30,
        "dependents": 1,
        "city":   "Mumbai",
        "monthly_income": 85000,
    },
    "income_sources": [
        {"source": "Salary",         "amount": 75000, "type": "fixed"},
        {"source": "Freelance",      "amount":  8000, "type": "variable"},
        {"source": "Investments",    "amount":  2000, "type": "variable"},
    ],
    "monthly_expenses": [
        {"category": "Housing",      "item": "Rent",         "amount": 18000, "type": "need",  "essential": True},
        {"category": "Food",         "item": "Groceries",    "amount":  6000, "type": "need",  "essential": True},
        {"category": "Food",         "item": "Eating Out",   "amount":  4000, "type": "want",  "essential": False},
        {"category": "Transport",    "item": "Fuel",         "amount":  3500, "type": "need",  "essential": True},
        {"category": "Transport",    "item": "Cab/Uber",     "amount":  2000, "type": "want",  "essential": False},
        {"category": "Utilities",    "item": "Electricity",  "amount":  1500, "type": "need",  "essential": True},
        {"category": "Utilities",    "item": "Internet",     "amount":   999, "type": "need",  "essential": True},
        {"category": "Insurance",    "item": "Health",       "amount":  2000, "type": "need",  "essential": True},
        {"category": "EMI",          "item": "Car Loan",     "amount":  8500, "type": "need",  "essential": True},
        {"category": "Entertainment","item": "OTT/Games",    "amount":  1000, "type": "want",  "essential": False},
        {"category": "Shopping",     "item": "Clothing",     "amount":  3000, "type": "want",  "essential": False},
        {"category": "Healthcare",   "item": "Medical",      "amount":   500, "type": "need",  "essential": True},
        {"category": "Education",    "item": "Online Course","amount":  1500, "type": "savings","essential": False},
        {"category": "Personal",     "item": "Misc",         "amount":  2000, "type": "want",  "essential": False},
    ],
    "existing_savings": {
        "emergency_fund":   25000,
        "fixed_deposit":    50000,
        "mutual_funds":     80000,
        "ppf":              30000,
        "nps":              15000,
        "liquid_cash":       5000,
    },
    "financial_goals": [
        {"goal": "Emergency Fund (6 months)",  "target": 300000, "priority": 1, "horizon_months": 18},
        {"goal": "Europe Vacation",            "target":  80000, "priority": 2, "horizon_months": 12},
        {"goal": "Down Payment for House",     "target": 500000, "priority": 3, "horizon_months": 36},
        {"goal": "Car Upgrade",                "target": 200000, "priority": 4, "horizon_months": 24},
    ],
}


def load_data(filepath):
    if filepath and os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"[INFO] Loaded finances from {filepath}")
        return data
    print("[INFO] No input file found — using sample financial data")
    return SAMPLE_FINANCES


def calc_totals(data):
    income_sources = data.get('income_sources', [])
    expenses       = data.get('monthly_expenses', [])

    total_income  = sum(s.get('amount', 0) for s in income_sources)
    total_expense = sum(e.get('amount', 0) for e in expenses)

    needs   = sum(e['amount'] for e in expenses if e.get('type') == 'need')
    wants   = sum(e['amount'] for e in expenses if e.get('type') == 'want')
    savings_committed = sum(e['amount'] for e in expenses if e.get('type') == 'savings')
    surplus = total_income - total_expense

    return {
        'total_income':       total_income,
        'total_expense':      total_expense,
        'needs':              needs,
        'wants':              wants,
        'savings_committed':  savings_committed,
        'surplus':            surplus,
    }


def apply_50_30_20(total_income, totals):
    """Standard 50-30-20 allocation and gap analysis."""
    target_needs   = round(total_income * 0.50, 2)
    target_wants   = round(total_income * 0.30, 2)
    target_savings = round(total_income * 0.20, 2)

    actual_savings = totals['surplus'] + totals['savings_committed']

    return {
        "rule":    "50-30-20",
        "targets": {
            "needs_50pct":   target_needs,
            "wants_30pct":   target_wants,
            "savings_20pct": target_savings,
        },
        "actuals": {
            "needs":   totals['needs'],
            "wants":   totals['wants'],
            "savings": round(actual_savings, 2),
        },
        "gaps": {
            "needs_gap":   round(totals['needs'] - target_needs, 2),
            "wants_gap":   round(totals['wants'] - target_wants, 2),
            "savings_gap": round(actual_savings - target_savings, 2),
        },
        "status": {
            "needs":   "✅ On target" if totals['needs'] <= target_needs else f"⚠️  Over by ₹{totals['needs']-target_needs:,.0f}",
            "wants":   "✅ On target" if totals['wants'] <= target_wants else f"⚠️  Over by ₹{totals['wants']-target_wants:,.0f}",
            "savings": "✅ On target" if actual_savings >= target_savings else f"❌ Under by ₹{target_savings-actual_savings:,.0f}",
        },
    }


def suggest_savings_allocation(total_income, surplus, goals, existing):
    """Allocate monthly surplus across goals and instruments."""
    investable    = max(0, surplus)
    recommendations = []

    # Emergency fund first
    total_existing = sum(existing.values())
    emergency_needed = total_income * 6  # 6 months
    emergency_current = existing.get('emergency_fund', 0) + existing.get('liquid_cash', 0)
    emergency_gap   = max(0, emergency_needed - emergency_current)
    monthly_emergency = min(investable * 0.4, emergency_gap / 12) if emergency_gap > 0 else 0

    recommendations.append({
        "priority":      1,
        "instrument":    "Emergency Fund (Liquid FD / Savings Account)",
        "monthly_amt":   round(monthly_emergency, 2),
        "reason":        f"Build 6-month buffer. Current: ₹{emergency_current:,.0f}. Need: ₹{emergency_needed:,.0f}",
        "months_to_goal": round(emergency_gap / monthly_emergency) if monthly_emergency > 0 else 999,
    })

    remaining = investable - monthly_emergency

    # Tax-saving instruments (ELSS, PPF, NPS) up to ₹12,500/mo (₹1.5L/yr under 80C)
    tax_saving_monthly = min(remaining * 0.35, 12500)
    recommendations.append({
        "priority":      2,
        "instrument":    "Tax Saving (ELSS / PPF / NPS)",
        "monthly_amt":   round(tax_saving_monthly, 2),
        "reason":        "Reduce tax liability under Section 80C (up to ₹1.5L/year)",
        "annual_tax_saving_approx": round(tax_saving_monthly * 12 * 0.30, 2),
    })

    remaining -= tax_saving_monthly

    # Equity mutual funds for long-term wealth
    equity_monthly = min(remaining * 0.50, remaining)
    recommendations.append({
        "priority":      3,
        "instrument":    "Equity Mutual Funds (SIP - Index/Large-cap)",
        "monthly_amt":   round(equity_monthly, 2),
        "reason":        "Long-term wealth creation. Target 12% CAGR.",
        "10yr_projection": round(equity_monthly * ((1.01**120 - 1) / 0.01), 2),  # ~12% pa
    })

    remaining -= equity_monthly

    # Goal-based allocations
    for goal in sorted(goals, key=lambda g: g.get('priority', 99))[:2]:
        if remaining <= 0:
            break
        monthly_needed = goal['target'] / (goal['horizon_months'] or 1)
        alloc = min(remaining, monthly_needed)
        recommendations.append({
            "priority":      goal.get('priority', 99),
            "instrument":    f"Goal: {goal['goal']}",
            "monthly_amt":   round(alloc, 2),
            "target_amount": goal['target'],
            "horizon_months": goal['horizon_months'],
            "months_to_goal": round(goal['target'] / alloc) if alloc > 0 else 999,
        })
        remaining -= alloc

    return recommendations


def identify_savings_opportunities(expenses):
    """Flag discretionary spends that can be trimmed."""
    opportunities = []
    want_expenses = [e for e in expenses if e.get('type') == 'want']
    for exp in want_expenses:
        if exp['amount'] >= 2000:
            potential_save = round(exp['amount'] * 0.30, 2)
            opportunities.append({
                "category":      exp['category'],
                "item":          exp['item'],
                "current_spend": exp['amount'],
                "suggested_cut_pct": 30,
                "monthly_saving":    potential_save,
                "annual_saving":     round(potential_save * 12, 2),
                "suggestion":    f"Reduce {exp['item']} by 30% → save ₹{potential_save:,.0f}/month",
            })
    return sorted(opportunities, key=lambda x: x['monthly_saving'], reverse=True)


def generate_report(plan):
    lines = []
    lines.append("=" * 60)
    lines.append("       PERSONAL FINANCIAL PLAN — EMPROIUM VIPANI")
    lines.append(f"       Generated: {datetime.now().strftime('%d %b %Y %H:%M')}")
    lines.append("=" * 60)

    p    = plan['person']
    tot  = plan['current_snapshot']
    rule = plan['budget_analysis']['50_30_20']

    lines.append(f"\n  Name  : {p.get('name', 'N/A')}   Age: {p.get('age', '—')}   City: {p.get('city', '—')}")
    lines.append(f"\n  Monthly Income  : ₹{tot['total_income']:>10,.2f}")
    lines.append(f"  Monthly Expenses: ₹{tot['total_expense']:>10,.2f}")
    lines.append(f"  Monthly Surplus : ₹{tot['surplus']:>10,.2f}")
    lines.append(f"\n{'─'*60}")
    lines.append("  50-30-20 RULE ANALYSIS")
    lines.append(f"{'─'*60}")
    for k, v in rule['status'].items():
        tgt = rule['targets'][f"{k}_50pct" if k == 'needs' else f"{k}_30pct" if k == 'wants' else f"{k}_20pct"]
        act = rule['actuals'][k]
        lines.append(f"  {k.upper():<10} Target: ₹{tgt:>9,.0f}  Actual: ₹{act:>9,.0f}  {v}")

    lines.append(f"\n{'─'*60}")
    lines.append("  RECOMMENDED SAVINGS ALLOCATION")
    lines.append(f"{'─'*60}")
    for rec in plan['savings_allocation']:
        lines.append(f"  [{rec['priority']}] {rec['instrument']}")
        lines.append(f"      Monthly: ₹{rec['monthly_amt']:,.2f}  |  {rec.get('reason','')}")

    lines.append(f"\n{'─'*60}")
    lines.append("  COST-CUTTING OPPORTUNITIES")
    lines.append(f"{'─'*60}")
    for opp in plan['savings_opportunities'][:5]:
        lines.append(f"  • {opp['suggestion']}")

    lines.append(f"\n{'─'*60}")
    lines.append("  FINANCIAL GOALS")
    lines.append(f"{'─'*60}")
    for goal in plan.get('goals', []):
        lines.append(f"  [{goal['priority']}] {goal['goal']}")
        lines.append(f"      Target: ₹{goal['target']:,.0f}  |  Horizon: {goal['horizon_months']} months")

    lines.append(f"\n{'─'*60}")
    lines.append("  KEY RECOMMENDATIONS")
    lines.append(f"{'─'*60}")
    for rec in plan['recommendations']:
        lines.append(f"  ➤  {rec}")

    lines.append("\n" + "=" * 60)
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description='Financial Planner Bot')
    parser.add_argument('--input',        default='data/finances.json',       help='Input JSON')
    parser.add_argument('--output-json',  default='data/financial_plan.json', help='Output JSON plan')
    parser.add_argument('--output-report',default='data/financial_report.txt',help='Output text report')
    args = parser.parse_args()

    data    = load_data(args.input)
    person  = data.get('person', {})
    totals  = calc_totals(data)
    ti      = totals['total_income']
    surplus = totals['surplus']

    rule_analysis  = apply_50_30_20(ti, totals)
    savings_alloc  = suggest_savings_allocation(ti, surplus, data.get('financial_goals', []), data.get('existing_savings', {}))
    opp            = identify_savings_opportunities(data.get('monthly_expenses', []))

    plan = {
        "generated_at": datetime.now().isoformat(),
        "person":        person,
        "current_snapshot": totals,
        "budget_analysis": {
            "50_30_20": rule_analysis,
        },
        "savings_allocation":  savings_alloc,
        "savings_opportunities": opp,
        "goals":               data.get('financial_goals', []),
        "existing_savings":    data.get('existing_savings', {}),
        "total_existing_wealth": sum(data.get('existing_savings', {}).values()),
        "recommendations": [
            "Automate savings via SIP on salary day to enforce pay-yourself-first.",
            f"Emergency fund target: ₹{ti*6:,.0f}. Prioritise before other investments.",
            "Cancel/reduce streaming subscriptions to free ₹500–₹1,000/month.",
            "Use tax-harvesting in ELSS/mutual funds to minimise capital gains.",
            "Review insurance coverage; ensure health cover ≥ ₹10L family floater.",
            "Track monthly expenses in a spreadsheet; review every 3 months.",
            "Avoid lifestyle inflation — invest every increment in salary.",
        ],
    }

    os.makedirs(os.path.dirname(args.output_json) if os.path.dirname(args.output_json) else '.', exist_ok=True)
    with open(args.output_json, 'w', encoding='utf-8') as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)

    report = generate_report(plan)
    with open(args.output_report, 'w', encoding='utf-8') as f:
        f.write(report)

    print(report)
    print(f"\n[INFO] JSON plan  → {args.output_json}")
    print(f"[INFO] Text report → {args.output_report}")


if __name__ == '__main__':
    main()

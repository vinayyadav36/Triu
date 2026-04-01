#!/usr/bin/env python3
"""
EmporiumVipani — scripts/business_iq.py
7-Star Business Intelligence: GST Report, Agent Leaderboard, Profit Simulation
Usage: python3 scripts/business_iq.py [--simulate-price-increase 10]
"""
import json
import os
import sys
import csv
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

# ── Resolve paths ─────────────────────────────────────────────
ROOT    = Path(__file__).parent.parent
DB_DIR  = ROOT / "db"
DATA_DIR= ROOT / "data"

def _load(filename):
    """Load from db/ first, then data/ fallback."""
    for d in [DB_DIR, DATA_DIR]:
        p = d / filename
        if p.exists():
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
    return []

def load_data():
    sales    = _load("sales_ledger.json")
    partners = _load("partners_active.json") or _load("partners.json")
    return sales, partners


def run_7_star_analysis(price_increase_pct=0):
    sales, partners = load_data()

    if not sales:
        print("⚠️  sales_ledger.json is empty. Create some sales via the Admin POS first.")
        return

    # ── Normalise nested tax_breakup ─────────────────────────────
    for s in sales:
        if isinstance(s.get("tax_breakup"), dict):
            s["total_gst"]  = s["tax_breakup"].get("total_gst", 0)
            s["cgst"]       = s["tax_breakup"].get("cgst", 0)
            s["sgst"]       = s["tax_breakup"].get("sgst", 0)
            s["igst"]       = s["tax_breakup"].get("igst", 0)
        else:
            s["total_gst"] = s.get("total_gst", 0)

    # ── A: Revenue & GST Totals ───────────────────────────────────
    total_revenue  = sum(s.get("net_total", 0) for s in sales)
    total_gst      = sum(s.get("total_gst", 0) for s in sales)
    total_cgst     = sum(s.get("cgst", 0) for s in sales)
    total_sgst     = sum(s.get("sgst", 0) for s in sales)
    total_igst     = sum(s.get("igst", 0) for s in sales)
    total_commissions = sum(s.get("commission", 0) for s in sales)
    net_profit     = total_revenue - total_gst - total_commissions

    print("=" * 60)
    print("🚀  EMPORIUM VIPANI — BUSINESS INTELLIGENCE REPORT")
    print(f"    Generated: {datetime.now().strftime('%d %b %Y, %H:%M')}")
    print("=" * 60)
    print(f"  Total Sales Transactions : {len(sales)}")
    print(f"  Total Revenue            : ₹{total_revenue:,.2f}")
    print(f"  Total GST Collected      : ₹{total_gst:,.2f}")
    print(f"    ├─ CGST                : ₹{total_cgst:,.2f}")
    print(f"    ├─ SGST                : ₹{total_sgst:,.2f}")
    print(f"    └─ IGST                : ₹{total_igst:,.2f}")
    print(f"  Partner Commissions Paid : ₹{total_commissions:,.2f}")
    print(f"  Net Profit (Approx)      : ₹{net_profit:,.2f}")

    # ── B: Sales Velocity (daily) ────────────────────────────────
    daily = defaultdict(float)
    for s in sales:
        day = s.get("date", "")[:10]
        if day:
            daily[day] += s.get("net_total", 0)

    print("\n📈  SALES VELOCITY (Last 7 Days)")
    print("  Date         Revenue")
    print("  " + "─" * 28)
    for day in sorted(daily)[-7:]:
        bar = "█" * min(int(daily[day] / 500), 20)
        print(f"  {day}   ₹{daily[day]:,.2f}  {bar}")

    # ── C: Marketing ROI ─────────────────────────────────────────
    channels = defaultdict(lambda: {"revenue": 0, "count": 0})
    for s in sales:
        src = s.get("source", "Direct")
        channels[src]["revenue"] += s.get("net_total", 0)
        channels[src]["count"]   += 1

    print("\n📣  MARKETING CHANNEL PERFORMANCE")
    print(f"  {'Channel':<20} {'Orders':>8} {'Revenue':>12} {'Avg Order':>12}")
    print("  " + "─" * 56)
    for ch, d in sorted(channels.items(), key=lambda x: -x[1]["revenue"]):
        avg = d["revenue"] / d["count"] if d["count"] else 0
        print(f"  {ch:<20} {d['count']:>8}  ₹{d['revenue']:>10,.2f}  ₹{avg:>10,.2f}")

    # ── D: Agent Leaderboard ─────────────────────────────────────
    agent_stats = defaultdict(lambda: {"revenue": 0, "commission": 0, "orders": 0})
    for s in sales:
        aid = s.get("agent_id") or "DIRECT"
        agent_stats[aid]["revenue"]    += s.get("net_total", 0)
        agent_stats[aid]["commission"] += s.get("commission", 0)
        agent_stats[aid]["orders"]     += 1

    # Enrich with partner names
    partner_map = {p.get("agentId", ""): p.get("name", p.get("fullName", "Unknown")) for p in partners}

    print("\n🏆  TOP AGENT LEADERBOARD")
    print(f"  {'AgentID':<18} {'Name':<20} {'Orders':>7} {'Revenue':>12} {'Commission':>12}")
    print("  " + "─" * 74)
    for aid, d in sorted(agent_stats.items(), key=lambda x: -x[1]["commission"])[:10]:
        name = partner_map.get(aid, "—")
        print(f"  {aid:<18} {name:<20} {d['orders']:>7}  ₹{d['revenue']:>10,.2f}  ₹{d['commission']:>10,.2f}")

    # ── E: Price Increase Simulation ─────────────────────────────
    if price_increase_pct:
        multiplier   = 1 + price_increase_pct / 100
        sim_revenue  = total_revenue * multiplier
        sim_gst      = total_gst * multiplier
        sim_comm     = total_commissions  # commissions stay same (% of base)
        sim_profit   = sim_revenue - sim_gst - sim_comm
        extra_profit = sim_profit - net_profit

        print(f"\n🔬  SIMULATION: +{price_increase_pct}% Price Increase")
        print(f"  Simulated Revenue  : ₹{sim_revenue:,.2f}  (was ₹{total_revenue:,.2f})")
        print(f"  Simulated GST      : ₹{sim_gst:,.2f}  (was ₹{total_gst:,.2f})")
        print(f"  Simulated Profit   : ₹{sim_profit:,.2f}  (was ₹{net_profit:,.2f})")
        print(f"  Extra Profit       : ₹{extra_profit:,.2f}")

    # ── F: GST Liability Report (GSTR-1 style) ───────────────────
    print("\n📋  GST LIABILITY SUMMARY")
    monthly = defaultdict(lambda: {"cgst": 0, "sgst": 0, "igst": 0, "total": 0, "orders": 0})
    for s in sales:
        ym = s.get("date", "")[:7]
        monthly[ym]["cgst"]   += s.get("cgst", 0)
        monthly[ym]["sgst"]   += s.get("sgst", 0)
        monthly[ym]["igst"]   += s.get("igst", 0)
        monthly[ym]["total"]  += s.get("total_gst", 0)
        monthly[ym]["orders"] += 1

    print(f"  {'Month':<10} {'Orders':>8} {'CGST':>10} {'SGST':>10} {'IGST':>10} {'Total GST':>12}")
    print("  " + "─" * 64)
    for ym in sorted(monthly):
        d = monthly[ym]
        print(f"  {ym:<10} {d['orders']:>8}  ₹{d['cgst']:>8,.2f}  ₹{d['sgst']:>8,.2f}  ₹{d['igst']:>8,.2f}  ₹{d['total']:>10,.2f}")

    # ── G: PowerBI / Excel Export ─────────────────────────────────
    out_path = ROOT / "db" / "powerbi_export.csv"
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=[
            "invoice_no", "date", "agent_id", "source",
            "customer_name", "customer_state",
            "taxable", "cgst", "sgst", "igst", "total_gst",
            "commission", "net_total",
        ])
        writer.writeheader()
        for s in sales:
            tax_taxable = round(s.get("net_total", 0) - s.get("total_gst", 0), 2)
            writer.writerow({
                "invoice_no":     s.get("invoice_no", ""),
                "date":           s.get("date", ""),
                "agent_id":       s.get("agent_id", ""),
                "source":         s.get("source", "Direct"),
                "customer_name":  s.get("customer", {}).get("name", "") if isinstance(s.get("customer"), dict) else "",
                "customer_state": s.get("customer", {}).get("state", "") if isinstance(s.get("customer"), dict) else "",
                "taxable":        tax_taxable,
                "cgst":           s.get("cgst", 0),
                "sgst":           s.get("sgst", 0),
                "igst":           s.get("igst", 0),
                "total_gst":      s.get("total_gst", 0),
                "commission":     s.get("commission", 0),
                "net_total":      s.get("net_total", 0),
            })

    print(f"\n✅  PowerBI-Ready CSV exported → {out_path}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EmporiumVipani Business Intelligence")
    parser.add_argument("--simulate-price-increase", type=float, default=0,
                        metavar="PCT", help="Simulate % price increase (e.g. 10)")
    args = parser.parse_args()
    run_7_star_analysis(price_increase_pct=args.simulate_price_increase)

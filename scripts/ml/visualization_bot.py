#!/usr/bin/env python3
"""
visualization_bot.py
Reads sales/GST data from JSON, generates bar chart (revenue by month),
pie chart (GST breakdown), and line chart (trends).
Falls back to ASCII charts if matplotlib is unavailable.
Outputs an index JSON listing all generated files.

Usage:
    python visualization_bot.py --input data/sales_data.json --output data/charts/
    python visualization_bot.py  # uses sample data, outputs to data/charts/
"""
import json
import os
import sys
import argparse
from datetime import datetime
from collections import defaultdict

try:
    import matplotlib
    matplotlib.use('Agg')  # non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


# ─────────────────────────────────────────────────────────────────────────────
# Sample data
# ─────────────────────────────────────────────────────────────────────────────
SAMPLE_DATA = {
    "monthly_revenue": [
        {"month": "Jan 2024", "revenue": 285000, "gst_collected": 51300, "orders": 142},
        {"month": "Feb 2024", "revenue": 312000, "gst_collected": 56160, "orders": 156},
        {"month": "Mar 2024", "revenue": 398000, "gst_collected": 71640, "orders": 199},
        {"month": "Apr 2024", "revenue": 275000, "gst_collected": 49500, "orders": 138},
        {"month": "May 2024", "revenue": 445000, "gst_collected": 80100, "orders": 223},
        {"month": "Jun 2024", "revenue": 520000, "gst_collected": 93600, "orders": 260},
        {"month": "Jul 2024", "revenue": 490000, "gst_collected": 88200, "orders": 245},
        {"month": "Aug 2024", "revenue": 380000, "gst_collected": 68400, "orders": 190},
        {"month": "Sep 2024", "revenue": 425000, "gst_collected": 76500, "orders": 213},
        {"month": "Oct 2024", "revenue": 610000, "gst_collected": 109800, "orders": 305},
        {"month": "Nov 2024", "revenue": 750000, "gst_collected": 135000, "orders": 375},
        {"month": "Dec 2024", "revenue": 890000, "gst_collected": 160200, "orders": 445},
    ],
    "gst_breakdown": [
        {"rate": "5%",  "label": "Food & Essential", "taxable_value": 250000, "gst_amount": 12500},
        {"rate": "12%", "label": "Electronics",      "taxable_value": 180000, "gst_amount": 21600},
        {"rate": "18%", "label": "General Goods",    "taxable_value": 620000, "gst_amount": 111600},
        {"rate": "28%", "label": "Luxury/Auto",      "taxable_value": 90000,  "gst_amount": 25200},
    ],
    "category_sales": [
        {"category": "Electronics", "revenue": 450000},
        {"category": "Clothing",    "revenue": 280000},
        {"category": "Fitness",     "revenue": 195000},
        {"category": "Appliances",  "revenue": 320000},
        {"category": "Footwear",    "revenue": 185000},
    ],
}


def load_data(filepath):
    if filepath and os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"[INFO] Loaded data from {filepath}")
        return data
    print("[INFO] No input file — using sample sales data")
    return SAMPLE_DATA


# ─────────────────────────────────────────────────────────────────────────────
# Matplotlib chart generators
# ─────────────────────────────────────────────────────────────────────────────

def make_bar_chart(monthly, output_dir):
    months  = [r['month'] for r in monthly]
    revenue = [r['revenue'] / 1000 for r in monthly]  # in thousands

    fig, ax = plt.subplots(figsize=(14, 6))
    bars    = ax.bar(months, revenue, color=['#2ecc71' if r >= max(revenue)*0.8 else '#3498db' for r in revenue],
                     edgecolor='white', linewidth=0.8)

    for bar, val in zip(bars, revenue):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 5,
                f'₹{val:.0f}K', ha='center', va='bottom', fontsize=8, fontweight='bold')

    ax.set_title('Monthly Revenue — 2024', fontsize=16, fontweight='bold', pad=15)
    ax.set_xlabel('Month', fontsize=11)
    ax.set_ylabel('Revenue (₹ Thousands)', fontsize=11)
    ax.tick_params(axis='x', rotation=45, labelsize=9)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x:.0f}K'))
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.set_ylim(0, max(revenue) * 1.15)
    plt.tight_layout()

    path = os.path.join(output_dir, 'bar_revenue_by_month.png')
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  [✓] Bar chart saved: {path}")
    return path


def make_pie_chart(gst_breakdown, output_dir):
    labels = [f"{g['rate']} — {g['label']}" for g in gst_breakdown]
    sizes  = [g['gst_amount'] for g in gst_breakdown]
    colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12']
    explode = [0.05] * len(sizes)

    fig, ax = plt.subplots(figsize=(9, 9))
    wedges, texts, autotexts = ax.pie(
        sizes, labels=labels, autopct='%1.1f%%', colors=colors,
        explode=explode, startangle=140,
        textprops={'fontsize': 10},
        wedgeprops={'linewidth': 1.5, 'edgecolor': 'white'},
    )
    for at in autotexts:
        at.set_fontweight('bold')

    total = sum(sizes)
    ax.set_title(f'GST Collected by Rate\nTotal: ₹{total:,.0f}',
                 fontsize=14, fontweight='bold', pad=20)
    plt.tight_layout()

    path = os.path.join(output_dir, 'pie_gst_breakdown.png')
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  [✓] Pie chart saved: {path}")
    return path


def make_line_chart(monthly, output_dir):
    months  = [r['month'] for r in monthly]
    revenue = [r['revenue'] / 1000 for r in monthly]
    orders  = [r['orders'] for r in monthly]

    fig, ax1 = plt.subplots(figsize=(14, 6))
    color1 = '#3498db'
    ax1.plot(months, revenue, color=color1, marker='o', linewidth=2.5,
             markersize=7, label='Revenue (₹K)', zorder=3)
    ax1.fill_between(range(len(months)), revenue, alpha=0.12, color=color1)
    ax1.set_xlabel('Month', fontsize=11)
    ax1.set_ylabel('Revenue (₹ Thousands)', fontsize=11, color=color1)
    ax1.tick_params(axis='y', labelcolor=color1)
    ax1.tick_params(axis='x', rotation=45, labelsize=9)
    ax1.set_xticks(range(len(months)))
    ax1.set_xticklabels(months)

    ax2 = ax1.twinx()
    color2 = '#e74c3c'
    ax2.plot(months, orders, color=color2, marker='s', linewidth=2,
             markersize=6, linestyle='--', label='Orders', zorder=2)
    ax2.set_ylabel('Order Count', fontsize=11, color=color2)
    ax2.tick_params(axis='y', labelcolor=color2)

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left', fontsize=10)

    ax1.set_title('Revenue & Orders Trend — 2024', fontsize=16, fontweight='bold', pad=15)
    ax1.spines['top'].set_visible(False)
    plt.tight_layout()

    path = os.path.join(output_dir, 'line_revenue_trend.png')
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  [✓] Line chart saved: {path}")
    return path


def make_horizontal_bar_chart(category_sales, output_dir):
    sorted_cats = sorted(category_sales, key=lambda x: x['revenue'])
    cats    = [c['category'] for c in sorted_cats]
    values  = [c['revenue'] / 1000 for c in sorted_cats]
    colors  = ['#9b59b6', '#3498db', '#2ecc71', '#f39c12', '#e74c3c'][:len(cats)]

    fig, ax = plt.subplots(figsize=(10, 6))
    bars = ax.barh(cats, values, color=colors, edgecolor='white', linewidth=0.8)
    for bar, val in zip(bars, values):
        ax.text(val + 3, bar.get_y() + bar.get_height()/2,
                f'₹{val:.0f}K', va='center', fontsize=10, fontweight='bold')

    ax.set_title('Revenue by Category', fontsize=14, fontweight='bold', pad=15)
    ax.set_xlabel('Revenue (₹ Thousands)', fontsize=11)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.set_xlim(0, max(values) * 1.18)
    plt.tight_layout()

    path = os.path.join(output_dir, 'bar_category_revenue.png')
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  [✓] Category chart saved: {path}")
    return path


# ─────────────────────────────────────────────────────────────────────────────
# ASCII fallback charts
# ─────────────────────────────────────────────────────────────────────────────

def ascii_bar_chart(monthly):
    lines = ["", "  MONTHLY REVENUE (ASCII Bar Chart)", "  " + "─"*50]
    mx = max(r['revenue'] for r in monthly) if monthly else 1
    for r in monthly:
        bar_len = int(r['revenue'] / mx * 30)
        bar     = '█' * bar_len
        label   = r['month'][:7].ljust(8)
        val     = f"₹{r['revenue']/1000:.0f}K"
        lines.append(f"  {label} {bar:<30} {val}")
    return "\n".join(lines)


def ascii_pie_chart(gst_breakdown):
    lines = ["", "  GST BREAKDOWN (ASCII Pie)", "  " + "─"*50]
    total = sum(g['gst_amount'] for g in gst_breakdown) or 1
    chars = ['▓', '░', '▒', '█']
    for i, g in enumerate(gst_breakdown):
        pct = g['gst_amount'] / total * 100
        bar = chars[i % len(chars)] * int(pct / 2)
        lines.append(f"  {g['rate']:>4} {g['label']:<22} {bar:<25} {pct:.1f}%  ₹{g['gst_amount']:,}")
    return "\n".join(lines)


def ascii_line_chart(monthly):
    lines = ["", "  REVENUE TREND (ASCII Line Chart)", "  " + "─"*50]
    vals  = [r['revenue'] / 1000 for r in monthly]
    mx, mn = max(vals), min(vals)
    height = 10
    for row in range(height, -1, -1):
        threshold = mn + (mx - mn) * row / height
        line_chars = []
        for v in vals:
            if abs(v - threshold) <= (mx - mn) / height / 2:
                line_chars.append('●')
            elif v >= threshold:
                line_chars.append('│')
            else:
                line_chars.append(' ')
        label = f"  ₹{threshold:>5.0f}K │" if row % 3 == 0 else "         │"
        lines.append(f"{label} {''.join(line_chars)}")
    months_short = [r['month'][:3] for r in monthly]
    lines.append("           └" + "─" * len(monthly) * 2)
    lines.append("            " + "  ".join(m[0] for m in months_short))
    return "\n".join(lines)


def generate_ascii_charts(data, output_dir):
    out_path = os.path.join(output_dir, 'ascii_charts.txt')
    content  = "EMPROIUM VIPANI — SALES VISUALIZATION REPORT\n"
    content += f"Generated: {datetime.now().strftime('%d %b %Y %H:%M')}\n"
    content += "=" * 55 + "\n"
    content += ascii_bar_chart(data.get('monthly_revenue', []))
    content += "\n\n"
    content += ascii_pie_chart(data.get('gst_breakdown', []))
    content += "\n\n"
    content += ascii_line_chart(data.get('monthly_revenue', []))
    content += "\n"
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(content)
    print(f"  [✓] ASCII charts saved: {out_path}")
    return [out_path]


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Visualization Bot')
    parser.add_argument('--input',  default='data/sales_data.json', help='Input JSON')
    parser.add_argument('--output', default='data/charts/',         help='Output directory')
    args = parser.parse_args()

    data = load_data(args.input)
    os.makedirs(args.output, exist_ok=True)

    generated_files = []
    if HAS_MATPLOTLIB:
        print(f"\n[INFO] Generating PNG charts in: {args.output}")
        monthly  = data.get('monthly_revenue', [])
        gst      = data.get('gst_breakdown', [])
        cats     = data.get('category_sales', [])
        if monthly:
            generated_files.append({'type': 'bar',  'title': 'Monthly Revenue', 'path': make_bar_chart(monthly, args.output)})
            generated_files.append({'type': 'line', 'title': 'Revenue Trend',   'path': make_line_chart(monthly, args.output)})
        if gst:
            generated_files.append({'type': 'pie',  'title': 'GST Breakdown',   'path': make_pie_chart(gst, args.output)})
        if cats:
            generated_files.append({'type': 'hbar', 'title': 'Category Revenue','path': make_horizontal_bar_chart(cats, args.output)})
    else:
        print("[INFO] matplotlib not found — generating ASCII charts")
        paths = generate_ascii_charts(data, args.output)
        generated_files = [{'type': 'ascii', 'title': 'ASCII Charts', 'path': p} for p in paths]

    index = {
        'generated_at': datetime.now().isoformat(),
        'engine':       'matplotlib' if HAS_MATPLOTLIB else 'ascii',
        'output_dir':   args.output,
        'files':        generated_files,
        'total_files':  len(generated_files),
    }

    index_path = os.path.join(args.output, 'chart_index.json')
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2)
    print(f"\n[INFO] Chart index → {index_path}")


if __name__ == '__main__':
    main()

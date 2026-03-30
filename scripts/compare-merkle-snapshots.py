#!/usr/bin/env python3
"""
Compare two merkle root snapshots — both gross (pre-claim) and net (merkle tree).

Usage:
  python3 scripts/compare-merkle-snapshots.py <before_timestamp> <after_timestamp>
"""

import json, sys, os, glob

BACKUP_DIR = os.path.join(os.path.dirname(__file__), "..", "merkle-backups")
TOKENS = ["HAI", "KITE", "OP"]


def load_tree(token, timestamp):
    pattern = os.path.join(BACKUP_DIR, f"merkle-tree-{token}-entry*-*-{timestamp}.json")
    matches = glob.glob(pattern)
    if not matches:
        return None, None, {}, {}
    with open(matches[0]) as f:
        data = json.load(f)

    # Net (merkle tree = gross - claimed)
    net = {}
    for v in data["tree"]["values"]:
        addr = v["value"][0].lower()
        net[addr] = int(v["value"][1])

    # Gross (pre-claim, if available)
    gross = {}
    for entry in data.get("grossRewards", []):
        addr = entry["address"].lower()
        gross[addr] = int(entry["earned"])

    return data["root"], data.get("entryCounter"), net, gross


def fmt(raw, decimals=18):
    val = raw / (10 ** decimals)
    if abs(val) >= 1:
        return f"{val:,.4f}"
    elif abs(val) >= 0.0001:
        return f"{val:,.8f}"
    else:
        return f"{val:.2e}"


def fmt_short(raw, decimals=18):
    val = raw / (10 ** decimals)
    if abs(val) >= 1000:
        return f"{val:,.1f}"
    elif abs(val) >= 1:
        return f"{val:,.4f}"
    else:
        return f"{val:.6f}"


def pct(old, new):
    if old == 0:
        return "NEW" if new > 0 else "GONE" if new < 0 else "-"
    return f"{((new - old) / old) * 100:+.2f}%"


def build_layer(addrs_b, addrs_a):
    all_addrs = sorted(set(list(addrs_b.keys()) + list(addrs_a.keys())))
    users = []
    total_inc = 0
    total_dec = 0
    for addr in all_addrs:
        old = addrs_b.get(addr, 0)
        new = addrs_a.get(addr, 0)
        delta = new - old
        if delta > 0:
            total_inc += delta
        else:
            total_dec += delta
        status = "same"
        if addr not in addrs_b:
            status = "new"
        elif addr not in addrs_a:
            status = "gone"
        elif delta > 0:
            status = "increased"
        elif delta < 0:
            status = "decreased"
        users.append({"addr": addr, "old": old, "new": new, "delta": delta, "status": status})
    users.sort(key=lambda u: -u["delta"])
    return users, total_inc, total_dec


def build_comparison(before_ts, after_ts):
    tokens_data = {}
    for token in TOKENS:
        root_b, _, net_b, gross_b = load_tree(token, before_ts)
        root_a, _, net_a, gross_a = load_tree(token, after_ts)
        if root_b is None or root_a is None:
            continue

        has_gross = bool(gross_b) and bool(gross_a)

        net_users, net_inc, net_dec = build_layer(net_b, net_a)
        gross_users, gross_inc, gross_dec = build_layer(gross_b, gross_a) if has_gross else ([], 0, 0)

        tokens_data[token] = {
            "root_before": root_b, "root_after": root_a,
            "changed": root_b != root_a,
            "has_gross": has_gross,
            # Net layer
            "net_users": net_users, "net_inc": net_inc, "net_dec": net_dec,
            "net_total_b": sum(net_b.values()), "net_total_a": sum(net_a.values()),
            "net_count_b": len(net_b), "net_count_a": len(net_a),
            # Gross layer
            "gross_users": gross_users, "gross_inc": gross_inc, "gross_dec": gross_dec,
            "gross_total_b": sum(gross_b.values()), "gross_total_a": sum(gross_a.values()),
            "gross_count_b": len(gross_b), "gross_count_a": len(gross_a),
        }
    return tokens_data


def user_row(u):
    cls = u["status"]
    badge = ""
    if cls == "new":
        badge = '<span class="badge new">NEW</span>'
    elif cls == "gone":
        badge = '<span class="badge gone">REMOVED</span>'
    delta_cls = "pos" if u["delta"] > 0 else "neg" if u["delta"] < 0 else ""
    delta_sign = "+" if u["delta"] > 0 else ""
    return f"""<tr class="row-{cls}">
        <td class="addr">{u['addr']} {badge}</td>
        <td class="num">{fmt(u['old'])}</td>
        <td class="num">{fmt(u['new'])}</td>
        <td class="num delta {delta_cls}">{delta_sign}{fmt(u['delta'])}</td>
        <td class="num">{pct(u['old'], u['new'])}</td>
    </tr>"""


def generate_html(tokens_data, before_ts, after_ts):
    token_tabs = ""
    token_sections = ""

    for i, (token, td) in enumerate(tokens_data.items()):
        active = " active" if i == 0 else ""
        token_tabs += f'<button class="tab{active}" onclick="showToken(\'{token}\')">{token}</button>\n'
        hidden = "" if i == 0 else ' style="display:none"'

        net_change = td["net_total_a"] - td["net_total_b"]
        gross_change = td["gross_total_a"] - td["gross_total_b"] if td["has_gross"] else 0

        # Gross section
        gross_html = ""
        if td["has_gross"]:
            g_inc_count = sum(1 for u in td["gross_users"] if u["status"] in ("increased", "new"))
            g_dec_count = sum(1 for u in td["gross_users"] if u["status"] in ("decreased", "gone"))
            g_same_count = sum(1 for u in td["gross_users"] if u["status"] == "same")

            gross_rows = "\n".join(user_row(u) for u in td["gross_users"] if u["delta"] != 0)

            gross_html = f"""
            <h2>Gross Rewards <span class="h2-sub">(pre-claim — actual redistribution)</span></h2>

            <div class="summary-grid four">
                <div class="card wide-2">
                    <div class="card-label">Gross Total</div>
                    <div class="card-row">
                        <div class="card-col">
                            <div class="card-mini-label">Before</div>
                            <div class="card-value">{fmt_short(td['gross_total_b'])}</div>
                        </div>
                        <div class="card-arrow">&#8594;</div>
                        <div class="card-col">
                            <div class="card-mini-label">After</div>
                            <div class="card-value">{fmt_short(td['gross_total_a'])}</div>
                        </div>
                        <div class="card-col right">
                            <div class="card-mini-label">Change</div>
                            <div class="card-value {'val-pos' if gross_change > 0 else 'val-neg' if gross_change < 0 else ''}">{'+' if gross_change > 0 else ''}{fmt_short(gross_change)}</div>
                            <div class="card-sub">{pct(td['gross_total_b'], td['gross_total_a'])}</div>
                        </div>
                    </div>
                </div>
                <div class="card highlight-green">
                    <div class="card-label">Increases</div>
                    <div class="card-value">+{fmt_short(td['gross_inc'])}</div>
                    <div class="card-sub">{g_inc_count} users</div>
                </div>
                <div class="card highlight-red">
                    <div class="card-label">Decreases</div>
                    <div class="card-value">{fmt_short(td['gross_dec'])}</div>
                    <div class="card-sub">{g_dec_count} users</div>
                </div>
            </div>

            <div class="table-controls">
                <button class="filter-btn active" onclick="filterTable('gross-{token}', 'all', this)">Changed ({g_inc_count + g_dec_count})</button>
                <button class="filter-btn" onclick="filterTable('gross-{token}', 'increased', this)">Increased ({g_inc_count})</button>
                <button class="filter-btn" onclick="filterTable('gross-{token}', 'decreased', this)">Decreased ({g_dec_count})</button>
            </div>
            <table id="table-gross-{token}">
                <thead><tr>
                    <th>Address</th><th class="r">Gross Before</th><th class="r">Gross After</th><th class="r">Delta</th><th class="r">%</th>
                </tr></thead>
                <tbody>{gross_rows}</tbody>
            </table>
            """

        # Net section
        n_inc_count = sum(1 for u in td["net_users"] if u["status"] in ("increased", "new"))
        n_dec_count = sum(1 for u in td["net_users"] if u["status"] in ("decreased", "gone"))
        new_count = sum(1 for u in td["net_users"] if u["status"] == "new")
        gone_count = sum(1 for u in td["net_users"] if u["status"] == "gone")
        n_same_count = sum(1 for u in td["net_users"] if u["status"] == "same")
        net_rows = "\n".join(user_row(u) for u in td["net_users"])

        net_html = f"""
        <h2>Merkle Tree (Net) <span class="h2-sub">(gross - claimed — what goes on-chain)</span></h2>

        <div class="insight-banner banner-info">
            <div class="insight-icon">i</div>
            <div class="insight-text">
                Net values include claim deductions. Users who already claimed may show large swings
                even when their gross barely changed. <strong>Use the gross table above</strong> to
                see the actual redistribution impact.
            </div>
        </div>

        <div class="summary-grid four">
            <div class="card wide-2">
                <div class="card-label">Merkle Total (net)</div>
                <div class="card-row">
                    <div class="card-col">
                        <div class="card-mini-label">Before</div>
                        <div class="card-value">{fmt_short(td['net_total_b'])}</div>
                    </div>
                    <div class="card-arrow">&#8594;</div>
                    <div class="card-col">
                        <div class="card-mini-label">After</div>
                        <div class="card-value">{fmt_short(td['net_total_a'])}</div>
                    </div>
                    <div class="card-col right">
                        <div class="card-mini-label">Change</div>
                        <div class="card-value {'val-pos' if net_change > 0 else 'val-neg' if net_change < 0 else ''}">{'+' if net_change > 0 else ''}{fmt_short(net_change)} {token}</div>
                        <div class="card-sub">{pct(td['net_total_b'], td['net_total_a'])}</div>
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card-label">Recipients</div>
                <div class="card-value">{td['net_count_b']} &#8594; {td['net_count_a']}</div>
                <div class="card-sub">{'+' + str(new_count) if new_count else ''}{', -' + str(gone_count) if gone_count else ''}</div>
            </div>
            <div class="card highlight-amber">
                <div class="card-label">Additional Liability</div>
                <div class="card-value">{fmt_short(net_change)} {token}</div>
                <div class="card-sub">Extra tokens needed</div>
            </div>
        </div>

        <div class="table-controls">
            <button class="filter-btn active" onclick="filterTable('net-{token}', 'all', this)">All ({len(td['net_users'])})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'increased', this)">Increased ({n_inc_count})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'decreased', this)">Decreased ({n_dec_count})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'new', this)">New ({new_count})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'gone', this)">Removed ({gone_count})</button>
        </div>
        <table id="table-net-{token}">
            <thead><tr>
                <th>Address</th><th class="r">Net Before</th><th class="r">Net After</th><th class="r">Delta</th><th class="r">%</th>
            </tr></thead>
            <tbody>{net_rows}</tbody>
        </table>
        """

        token_sections += f"""
        <div class="token-section" id="section-{token}"{hidden}>
            <div class="roots">
                <table class="roots-table">
                    <tr><td class="roots-label">Root Before</td><td><code>{td['root_before']}</code></td></tr>
                    <tr><td class="roots-label">Root After</td><td><code>{td['root_after']}</code></td></tr>
                </table>
            </div>
            {gross_html}
            {net_html}
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Merkle Snapshot Comparison</title>
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #0f1117; color: #e1e4e8; padding: 24px; max-width: 1400px; margin: 0 auto; }}
    h1 {{ font-size: 1.5em; margin-bottom: 4px; }}
    h2 {{ font-size: 1.15em; margin: 32px 0 14px; padding-bottom: 8px; border-bottom: 1px solid #21262d; }}
    .h2-sub {{ font-size: 0.72em; color: #8b949e; font-weight: 400; }}
    .subtitle {{ color: #8b949e; font-size: 0.82em; margin-bottom: 20px; }}
    .tabs {{ display: flex; gap: 4px; margin-bottom: 20px; }}
    .tab {{ padding: 8px 24px; border: 1px solid #30363d; background: #161b22; color: #8b949e;
            border-radius: 6px; cursor: pointer; font-size: 0.9em; font-weight: 600; transition: all .15s; }}
    .tab.active {{ background: #1f6feb; color: #fff; border-color: #1f6feb; }}
    .tab:hover:not(.active) {{ background: #21262d; color: #c9d1d9; }}
    .insight-banner {{ display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px;
                       border-radius: 8px; margin-bottom: 16px; font-size: 0.82em; line-height: 1.5; }}
    .banner-info {{ background: #0d1117; border: 1px solid #30363d; }}
    .insight-icon {{ font-size: 1.2em; font-weight: 800; min-width: 24px; text-align: center; color: #8b949e; }}
    .insight-text {{ color: #8b949e; }}
    .insight-text strong {{ color: #c9d1d9; }}
    .summary-grid {{ display: grid; gap: 12px; margin-bottom: 16px; }}
    .summary-grid.four {{ grid-template-columns: repeat(4, 1fr); }}
    .card {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 16px; }}
    .card.wide-2 {{ grid-column: span 2; }}
    .card-label {{ font-size: 0.7em; color: #8b949e; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }}
    .card-mini-label {{ font-size: 0.68em; color: #6e7681; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }}
    .card-value {{ font-size: 1.1em; font-weight: 700; font-family: 'SF Mono', Monaco, Consolas, monospace; }}
    .card-sub {{ font-size: 0.76em; color: #8b949e; margin-top: 3px; }}
    .card-row {{ display: flex; align-items: center; gap: 20px; }}
    .card-col {{ flex: 1; }}
    .card-col.right {{ text-align: right; }}
    .card-arrow {{ color: #484f58; font-size: 1.3em; }}
    .val-pos {{ color: #3fb950; }}
    .val-neg {{ color: #f85149; }}
    .highlight-green {{ border-color: #238636; }}
    .highlight-green .card-value {{ color: #3fb950; }}
    .highlight-red {{ border-color: #da3633; }}
    .highlight-red .card-value {{ color: #f85149; }}
    .highlight-amber {{ border-color: #d29922; }}
    .highlight-amber .card-value {{ color: #f0883e; }}
    .roots {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }}
    .roots-table {{ width: 100%; border-collapse: collapse; }}
    .roots-table td {{ padding: 3px 0; font-size: 0.78em; }}
    .roots-label {{ color: #8b949e; width: 90px; font-weight: 600; }}
    .roots-table code {{ font-family: 'SF Mono', Monaco, Consolas, monospace; color: #79c0ff; font-size: 0.95em; word-break: break-all; }}
    .table-controls {{ display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }}
    .filter-btn {{ padding: 4px 12px; border: 1px solid #30363d; background: #0d1117; color: #8b949e;
                   border-radius: 20px; cursor: pointer; font-size: 0.76em; font-weight: 500; transition: all .15s; }}
    .filter-btn.active {{ background: #21262d; color: #e1e4e8; border-color: #484f58; }}
    .filter-btn:hover:not(.active) {{ background: #161b22; color: #c9d1d9; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.8em; margin-bottom: 24px; }}
    thead th {{ text-align: left; padding: 7px 12px; border-bottom: 2px solid #30363d;
                color: #8b949e; font-weight: 600; font-size: 0.78em; text-transform: uppercase;
                position: sticky; top: 0; background: #0f1117; z-index: 1; }}
    thead th.r {{ text-align: right; }}
    tbody td {{ padding: 4px 12px; border-bottom: 1px solid #1b1f24; }}
    .addr {{ font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 0.9em; white-space: nowrap; }}
    .num {{ font-family: 'SF Mono', Monaco, Consolas, monospace; text-align: right; white-space: nowrap; }}
    .delta.pos {{ color: #3fb950; }}
    .delta.neg {{ color: #f85149; }}
    .badge {{ font-size: 0.66em; padding: 2px 5px; border-radius: 4px; margin-left: 6px; font-weight: 700; vertical-align: middle; }}
    .badge.new {{ background: #0e4429; color: #3fb950; }}
    .badge.gone {{ background: #3d1114; color: #f85149; }}
    .row-new td {{ background: rgba(14,68,41,0.08); }}
    .row-gone td {{ background: rgba(61,17,20,0.08); }}
    tr:hover td {{ background: #161b22; }}
    @media (max-width: 900px) {{ .summary-grid.four {{ grid-template-columns: repeat(2, 1fr); }} .card.wide-2 {{ grid-column: span 2; }} }}
</style>
</head>
<body>
    <h1>Merkle Snapshot Comparison</h1>
    <div class="subtitle">Before: <strong>{before_ts}</strong> &middot; After: <strong>{after_ts}</strong></div>
    <div class="tabs">{token_tabs}</div>
    {token_sections}
    <script>
    function showToken(token) {{
        document.querySelectorAll('.token-section').forEach(s => s.style.display = 'none');
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.getElementById('section-' + token).style.display = 'block';
        event.target.classList.add('active');
    }}
    function filterTable(id, filter, btn) {{
        const table = document.getElementById('table-' + id);
        table.querySelectorAll('tbody tr').forEach(row => {{
            row.style.display = (filter === 'all' || row.classList.contains('row-' + filter)) ? '' : 'none';
        }});
        btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }}
    </script>
</body>
</html>"""


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 compare-merkle-snapshots.py <before_timestamp> <after_timestamp>")
        print("\nAvailable snapshots:")
        files = sorted(glob.glob(os.path.join(BACKUP_DIR, "merkle-tree-*.json")))
        seen = set()
        for f in files:
            name = os.path.basename(f)
            idx = name.find("2026-")
            if idx > -1:
                rest = name[idx:]
                second = rest.find("2026-", 1)
                if second > -1:
                    ts = rest[second:].replace(".json", "")
                    if ts not in seen:
                        seen.add(ts)
                        print(f"  {ts}")
        sys.exit(1)

    before_ts = sys.argv[1]
    after_ts = sys.argv[2]

    tokens_data = build_comparison(before_ts, after_ts)
    html = generate_html(tokens_data, before_ts, after_ts)

    out_path = os.path.join(os.path.dirname(__file__), "..", "merkle-comparison.html")
    with open(out_path, "w") as f:
        f.write(html)

    print(f"Dashboard: {os.path.abspath(out_path)}")
    print()
    for token, td in tokens_data.items():
        net_change = td["net_total_a"] - td["net_total_b"]
        print(f"=== {token} ===")
        if td["has_gross"]:
            gross_change = td["gross_total_a"] - td["gross_total_b"]
            g_inc = sum(1 for u in td["gross_users"] if u["delta"] > 0)
            g_dec = sum(1 for u in td["gross_users"] if u["delta"] < 0)
            print(f"  Gross: {fmt_short(td['gross_total_b'])} -> {fmt_short(td['gross_total_a'])} (change: {'+' if gross_change>=0 else ''}{fmt_short(gross_change)}, {pct(td['gross_total_b'], td['gross_total_a'])})")
            print(f"         {g_inc} increased, {g_dec} decreased")
        print(f"  Net:   {fmt_short(td['net_total_b'])} -> {fmt_short(td['net_total_a'])} (change: {'+' if net_change>=0 else ''}{fmt_short(net_change)}, {pct(td['net_total_b'], td['net_total_a'])})")
        print(f"         {td['net_count_b']} -> {td['net_count_a']} recipients")
        print()

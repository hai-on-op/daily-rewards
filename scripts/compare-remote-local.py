#!/usr/bin/env python3
"""
Compare the latest remote (VPS) merkle trees against locally generated ones.
Produces an HTML dashboard at remote-comparison.html.

Usage:
  python3 scripts/compare-remote-local.py [--entry N]

Without --entry, compares the latest entry number found in both directories.
"""

import json, sys, os, glob, re
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.join(SCRIPT_DIR, "..")
REMOTE_DIR = os.path.join(PROJECT_DIR, "remote-merkles")
LOCAL_DIR = os.path.join(PROJECT_DIR, "merkle-backups")
TOKENS = ["HAI", "KITE", "OP"]


def find_latest_entry(directory):
    """Find the highest entry number available in a directory."""
    max_entry = -1
    for f in os.listdir(directory):
        m = re.search(r"entry(\d+)", f)
        if m:
            max_entry = max(max_entry, int(m.group(1)))
    return max_entry


def find_file(directory, token, entry_num):
    """Find the latest file for a given token and entry number."""
    pattern = os.path.join(directory, f"merkle-tree-{token}-entry{entry_num}-*.json")
    matches = sorted(glob.glob(pattern))
    return matches[-1] if matches else None


def load_tree(filepath):
    """Load a merkle tree file and return root, entry, net map, gross map."""
    if not filepath:
        return None, None, {}, {}, None
    with open(filepath) as f:
        data = json.load(f)

    net = {}
    for v in data["tree"]["values"]:
        addr = v["value"][0].lower()
        net[addr] = int(v["value"][1])

    gross = {}
    for entry in data.get("grossRewards", []):
        addr = entry["address"].lower()
        gross[addr] = int(entry["earned"])

    return data["root"], data.get("entryCounter"), net, gross, data.get("date")


def fmt(raw, decimals=18):
    val = raw / (10 ** decimals)
    if abs(val) >= 1000:
        return f"{val:,.2f}"
    elif abs(val) >= 1:
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


def build_comparison(remote_entry, local_entry):
    tokens_data = {}
    for token in TOKENS:
        remote_file = find_file(REMOTE_DIR, token, remote_entry)
        local_file = find_file(LOCAL_DIR, token, local_entry)

        if not remote_file and not local_file:
            continue

        r_root, r_entry, r_net, r_gross, r_date = load_tree(remote_file)
        l_root, l_entry, l_net, l_gross, l_date = load_tree(local_file)

        if r_root is None and l_root is None:
            continue

        has_gross = bool(r_gross) and bool(l_gross)

        # Build user diffs for net
        all_net_addrs = sorted(set(list(r_net.keys()) + list(l_net.keys())))
        net_users = []
        net_inc_total = 0
        net_dec_total = 0
        for addr in all_net_addrs:
            remote_val = r_net.get(addr, 0)
            local_val = l_net.get(addr, 0)
            delta = local_val - remote_val
            if delta > 0:
                net_inc_total += delta
            elif delta < 0:
                net_dec_total += delta

            status = "same"
            if addr not in r_net:
                status = "local-only"
            elif addr not in l_net:
                status = "remote-only"
            elif delta > 0:
                status = "local-higher"
            elif delta < 0:
                status = "remote-higher"

            net_users.append({
                "addr": addr,
                "remote": remote_val,
                "local": local_val,
                "delta": delta,
                "status": status,
            })
        net_users.sort(key=lambda u: -abs(u["delta"]))

        # Build user diffs for gross
        gross_users = []
        gross_inc_total = 0
        gross_dec_total = 0
        if has_gross:
            all_gross_addrs = sorted(set(list(r_gross.keys()) + list(l_gross.keys())))
            for addr in all_gross_addrs:
                remote_val = r_gross.get(addr, 0)
                local_val = l_gross.get(addr, 0)
                delta = local_val - remote_val
                if delta > 0:
                    gross_inc_total += delta
                elif delta < 0:
                    gross_dec_total += delta

                status = "same"
                if addr not in r_gross:
                    status = "local-only"
                elif addr not in l_gross:
                    status = "remote-only"
                elif delta > 0:
                    status = "local-higher"
                elif delta < 0:
                    status = "remote-higher"

                gross_users.append({
                    "addr": addr,
                    "remote": remote_val,
                    "local": local_val,
                    "delta": delta,
                    "status": status,
                })
            gross_users.sort(key=lambda u: -abs(u["delta"]))

        tokens_data[token] = {
            "remote_file": os.path.basename(remote_file) if remote_file else "N/A",
            "local_file": os.path.basename(local_file) if local_file else "N/A",
            "remote_root": r_root or "N/A",
            "local_root": l_root or "N/A",
            "roots_match": r_root == l_root,
            "remote_date": r_date or "N/A",
            "local_date": l_date or "N/A",
            "has_gross": has_gross,
            # Net
            "net_users": net_users,
            "net_remote_total": sum(r_net.values()),
            "net_local_total": sum(l_net.values()),
            "net_inc_total": net_inc_total,
            "net_dec_total": net_dec_total,
            "net_remote_count": len(r_net),
            "net_local_count": len(l_net),
            # Gross
            "gross_users": gross_users,
            "gross_remote_total": sum(r_gross.values()),
            "gross_local_total": sum(l_gross.values()),
            "gross_inc_total": gross_inc_total,
            "gross_dec_total": gross_dec_total,
            "gross_remote_count": len(r_gross),
            "gross_local_count": len(l_gross),
        }
    return tokens_data


def user_row(u, layer):
    cls = u["status"]
    badge = ""
    if cls == "local-only":
        badge = '<span class="badge local-only">LOCAL ONLY</span>'
    elif cls == "remote-only":
        badge = '<span class="badge remote-only">REMOTE ONLY</span>'

    delta_cls = ""
    if u["delta"] > 0:
        delta_cls = "pos"
    elif u["delta"] < 0:
        delta_cls = "neg"
    delta_sign = "+" if u["delta"] > 0 else ""

    remote_val = u["remote"]
    local_val = u["local"]

    return f"""<tr class="row-{cls}" data-status="{cls}">
        <td class="addr">{u['addr']} {badge}</td>
        <td class="num">{fmt(remote_val)}</td>
        <td class="num">{fmt(local_val)}</td>
        <td class="num delta {delta_cls}">{delta_sign}{fmt(u['delta'])}</td>
        <td class="num">{pct(remote_val, local_val)}</td>
    </tr>"""


def generate_html(tokens_data, remote_entry, local_entry):
    token_tabs = ""
    token_sections = ""

    for i, (token, td) in enumerate(tokens_data.items()):
        active = " active" if i == 0 else ""
        token_tabs += f'<button class="tab{active}" onclick="showToken(\'{token}\')">{token}</button>\n'
        hidden = "" if i == 0 else ' style="display:none"'

        # Status badge
        match_class = "match-yes" if td["roots_match"] else "match-no"
        match_text = "ROOTS MATCH" if td["roots_match"] else "ROOTS DIFFER"

        # Count statuses
        def count_status(users, *statuses):
            return sum(1 for u in users if u["status"] in statuses)

        n_local_higher = count_status(td["net_users"], "local-higher")
        n_remote_higher = count_status(td["net_users"], "remote-higher")
        n_local_only = count_status(td["net_users"], "local-only")
        n_remote_only = count_status(td["net_users"], "remote-only")
        n_same = count_status(td["net_users"], "same")
        n_changed = len(td["net_users"]) - n_same

        net_diff = td["net_local_total"] - td["net_remote_total"]

        # Gross section
        gross_html = ""
        if td["has_gross"]:
            g_local_higher = count_status(td["gross_users"], "local-higher")
            g_remote_higher = count_status(td["gross_users"], "remote-higher")
            g_local_only = count_status(td["gross_users"], "local-only")
            g_remote_only = count_status(td["gross_users"], "remote-only")
            g_same = count_status(td["gross_users"], "same")
            g_changed = len(td["gross_users"]) - g_same
            gross_diff = td["gross_local_total"] - td["gross_remote_total"]

            gross_rows = "\n".join(user_row(u, "gross") for u in td["gross_users"] if u["delta"] != 0)

            gross_html = f"""
            <h2>Gross Rewards <span class="h2-sub">(pre-claim redistribution)</span></h2>

            <div class="summary-grid four">
                <div class="card wide-2">
                    <div class="card-label">Gross Total</div>
                    <div class="card-row">
                        <div class="card-col">
                            <div class="card-mini-label">Remote (VPS)</div>
                            <div class="card-value">{fmt_short(td['gross_remote_total'])}</div>
                        </div>
                        <div class="card-arrow">vs</div>
                        <div class="card-col">
                            <div class="card-mini-label">Local</div>
                            <div class="card-value">{fmt_short(td['gross_local_total'])}</div>
                        </div>
                        <div class="card-col right">
                            <div class="card-mini-label">Diff (Local - Remote)</div>
                            <div class="card-value {'val-pos' if gross_diff > 0 else 'val-neg' if gross_diff < 0 else ''}">{'+' if gross_diff > 0 else ''}{fmt_short(gross_diff)}</div>
                            <div class="card-sub">{pct(td['gross_remote_total'], td['gross_local_total'])}</div>
                        </div>
                    </div>
                </div>
                <div class="card highlight-green">
                    <div class="card-label">Local Higher</div>
                    <div class="card-value">+{fmt_short(td['gross_inc_total'])}</div>
                    <div class="card-sub">{g_local_higher + g_local_only} users</div>
                </div>
                <div class="card highlight-red">
                    <div class="card-label">Remote Higher</div>
                    <div class="card-value">{fmt_short(td['gross_dec_total'])}</div>
                    <div class="card-sub">{g_remote_higher + g_remote_only} users</div>
                </div>
            </div>

            <div class="table-controls">
                <button class="filter-btn active" onclick="filterTable('gross-{token}', 'all', this)">Changed ({g_changed})</button>
                <button class="filter-btn" onclick="filterTable('gross-{token}', 'local-higher', this)">Local Higher ({g_local_higher})</button>
                <button class="filter-btn" onclick="filterTable('gross-{token}', 'remote-higher', this)">Remote Higher ({g_remote_higher})</button>
                <button class="filter-btn" onclick="filterTable('gross-{token}', 'local-only', this)">Local Only ({g_local_only})</button>
                <button class="filter-btn" onclick="filterTable('gross-{token}', 'remote-only', this)">Remote Only ({g_remote_only})</button>
            </div>
            <table id="table-gross-{token}">
                <thead><tr>
                    <th>Address</th><th class="r">Remote (VPS)</th><th class="r">Local</th><th class="r">Diff</th><th class="r">%</th>
                </tr></thead>
                <tbody>{gross_rows}</tbody>
            </table>
            """

        # Net section
        net_rows = "\n".join(user_row(u, "net") for u in td["net_users"])
        net_html = f"""
        <h2>Merkle Tree (Net) <span class="h2-sub">(on-chain values = gross - claimed)</span></h2>

        <div class="summary-grid four">
            <div class="card wide-2">
                <div class="card-label">Net Total</div>
                <div class="card-row">
                    <div class="card-col">
                        <div class="card-mini-label">Remote (VPS)</div>
                        <div class="card-value">{fmt_short(td['net_remote_total'])}</div>
                    </div>
                    <div class="card-arrow">vs</div>
                    <div class="card-col">
                        <div class="card-mini-label">Local</div>
                        <div class="card-value">{fmt_short(td['net_local_total'])}</div>
                    </div>
                    <div class="card-col right">
                        <div class="card-mini-label">Diff (Local - Remote)</div>
                        <div class="card-value {'val-pos' if net_diff > 0 else 'val-neg' if net_diff < 0 else ''}">{'+' if net_diff > 0 else ''}{fmt_short(net_diff)} {token}</div>
                        <div class="card-sub">{pct(td['net_remote_total'], td['net_local_total'])}</div>
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card-label">Recipients</div>
                <div class="card-value">{td['net_remote_count']} <span class="card-arrow">vs</span> {td['net_local_count']}</div>
                <div class="card-sub">remote vs local</div>
            </div>
            <div class="card {'highlight-green' if n_changed == 0 else 'highlight-amber'}">
                <div class="card-label">Divergence</div>
                <div class="card-value">{n_changed} / {len(td['net_users'])}</div>
                <div class="card-sub">{'All matching' if n_changed == 0 else 'addresses differ'}</div>
            </div>
        </div>

        <div class="table-controls">
            <button class="filter-btn active" onclick="filterTable('net-{token}', 'all', this)">All ({len(td['net_users'])})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'local-higher', this)">Local Higher ({n_local_higher})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'remote-higher', this)">Remote Higher ({n_remote_higher})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'local-only', this)">Local Only ({n_local_only})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'remote-only', this)">Remote Only ({n_remote_only})</button>
            <button class="filter-btn" onclick="filterTable('net-{token}', 'same', this)">Same ({n_same})</button>
        </div>
        <table id="table-net-{token}">
            <thead><tr>
                <th>Address</th><th class="r">Remote (VPS)</th><th class="r">Local</th><th class="r">Diff (L-R)</th><th class="r">%</th>
            </tr></thead>
            <tbody>{net_rows}</tbody>
        </table>
        """

        token_sections += f"""
        <div class="token-section" id="section-{token}"{hidden}>
            <div class="status-bar">
                <span class="match-badge {match_class}">{match_text}</span>
                <span class="file-info">Remote: <code>{td['remote_file']}</code></span>
                <span class="file-info">Local: <code>{td['local_file']}</code></span>
            </div>

            <div class="roots">
                <table class="roots-table">
                    <tr><td class="roots-label">Remote Root</td><td><code>{td['remote_root']}</code></td></tr>
                    <tr><td class="roots-label">Local Root</td><td><code>{td['local_root']}</code></td></tr>
                    <tr><td class="roots-label">Remote Date</td><td><code>{td['remote_date']}</code></td></tr>
                    <tr><td class="roots-label">Local Date</td><td><code>{td['local_date']}</code></td></tr>
                </table>
            </div>

            {gross_html}
            {net_html}
        </div>
        """

    # Overall health summary
    all_match = all(td["roots_match"] for td in tokens_data.values())
    health_class = "health-ok" if all_match else "health-warn"
    health_text = "All merkle roots match between remote and local" if all_match else "Merkle roots differ between remote and local"
    health_icon = "&#10003;" if all_match else "&#9888;"

    token_summary_cards = ""
    for token, td in tokens_data.items():
        mc = "match-yes" if td["roots_match"] else "match-no"
        n_same = sum(1 for u in td["net_users"] if u["status"] == "same")
        n_total = len(td["net_users"])
        net_diff = td["net_local_total"] - td["net_remote_total"]
        token_summary_cards += f"""
        <div class="card {'highlight-green' if td['roots_match'] else 'highlight-red'}">
            <div class="card-label">{token}</div>
            <div class="card-value"><span class="{mc}">{('MATCH' if td['roots_match'] else 'DIFFER')}</span></div>
            <div class="card-sub">{n_same}/{n_total} addresses same | net diff: {'+' if net_diff >= 0 else ''}{fmt_short(net_diff)}</div>
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Remote vs Local Merkle Comparison</title>
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #0f1117; color: #e1e4e8; padding: 24px; max-width: 1400px; margin: 0 auto; }}
    h1 {{ font-size: 1.5em; margin-bottom: 4px; }}
    h2 {{ font-size: 1.15em; margin: 32px 0 14px; padding-bottom: 8px; border-bottom: 1px solid #21262d; }}
    .h2-sub {{ font-size: 0.72em; color: #8b949e; font-weight: 400; }}
    .subtitle {{ color: #8b949e; font-size: 0.82em; margin-bottom: 20px; }}
    .health {{ display: flex; align-items: center; gap: 10px; padding: 12px 16px;
               border-radius: 8px; margin-bottom: 20px; font-size: 0.9em; font-weight: 600; }}
    .health-ok {{ background: #0e4429; border: 1px solid #238636; color: #3fb950; }}
    .health-warn {{ background: #3d1114; border: 1px solid #da3633; color: #f85149; }}
    .health-icon {{ font-size: 1.4em; }}
    .overview-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }}
    .tabs {{ display: flex; gap: 4px; margin-bottom: 20px; }}
    .tab {{ padding: 8px 24px; border: 1px solid #30363d; background: #161b22; color: #8b949e;
            border-radius: 6px; cursor: pointer; font-size: 0.9em; font-weight: 600; transition: all .15s; }}
    .tab.active {{ background: #1f6feb; color: #fff; border-color: #1f6feb; }}
    .tab:hover:not(.active) {{ background: #21262d; color: #c9d1d9; }}
    .status-bar {{ display: flex; align-items: center; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }}
    .match-badge {{ padding: 4px 12px; border-radius: 20px; font-size: 0.76em; font-weight: 700; letter-spacing: 0.04em; }}
    .match-yes {{ background: #0e4429; color: #3fb950; }}
    .match-no {{ background: #3d1114; color: #f85149; }}
    .file-info {{ font-size: 0.75em; color: #6e7681; }}
    .file-info code {{ color: #8b949e; font-size: 0.95em; }}
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
    .roots-label {{ color: #8b949e; width: 110px; font-weight: 600; }}
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
    .badge.local-only {{ background: #0e4429; color: #3fb950; }}
    .badge.remote-only {{ background: #3d1114; color: #f85149; }}
    .row-same td {{ opacity: 0.5; }}
    .row-local-only td {{ background: rgba(14,68,41,0.08); }}
    .row-remote-only td {{ background: rgba(61,17,20,0.08); }}
    tr:hover td {{ background: #161b22; opacity: 1; }}
    .search-box {{ padding: 6px 12px; border: 1px solid #30363d; background: #0d1117; color: #e1e4e8;
                   border-radius: 6px; font-size: 0.82em; width: 300px; margin-bottom: 12px;
                   font-family: 'SF Mono', Monaco, Consolas, monospace; }}
    .search-box::placeholder {{ color: #484f58; }}
    @media (max-width: 900px) {{
        .summary-grid.four {{ grid-template-columns: repeat(2, 1fr); }}
        .card.wide-2 {{ grid-column: span 2; }}
        .overview-grid {{ grid-template-columns: 1fr; }}
    }}
</style>
</head>
<body>
    <h1>Remote vs Local Merkle Comparison</h1>
    <div class="subtitle">Remote entry #{remote_entry} vs Local entry #{local_entry} &middot; Remote = VPS (143.198.123.60) &middot; Local = this machine</div>

    <div class="health {health_class}">
        <span class="health-icon">{health_icon}</span>
        {health_text}
    </div>

    <div class="overview-grid">
        {token_summary_cards}
    </div>

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
            const status = row.dataset.status;
            if (filter === 'all') {{
                row.style.display = '';
            }} else {{
                row.style.display = status === filter ? '' : 'none';
            }}
        }});
        btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }}

    // Address search
    document.querySelectorAll('.search-box').forEach(input => {{
        input.addEventListener('input', function() {{
            const query = this.value.toLowerCase();
            const tableId = this.dataset.table;
            const table = document.getElementById(tableId);
            table.querySelectorAll('tbody tr').forEach(row => {{
                const addr = row.querySelector('.addr')?.textContent.toLowerCase() || '';
                row.style.display = addr.includes(query) ? '' : 'none';
            }});
        }});
    }});
    </script>
</body>
</html>"""


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Compare remote vs local merkle trees")
    parser.add_argument("--remote-entry", type=int, help="Remote entry number (default: latest in remote-merkles)")
    parser.add_argument("--local-entry", type=int, help="Local entry number (default: latest in merkle-backups)")
    parser.add_argument("--entry", type=int, help="Use the same entry number for both remote and local")
    args = parser.parse_args()

    if not os.path.isdir(REMOTE_DIR):
        print(f"Error: remote-merkles directory not found at {REMOTE_DIR}")
        print("Run scripts/sync-remote-merkles.sh first.")
        sys.exit(1)

    remote_max = find_latest_entry(REMOTE_DIR)
    local_max = find_latest_entry(LOCAL_DIR)

    if args.entry:
        remote_entry = args.entry
        local_entry = args.entry
    else:
        remote_entry = args.remote_entry or remote_max
        local_entry = args.local_entry or local_max

    print(f"Remote latest available: entry{remote_max}, Local latest available: entry{local_max}")
    print(f"Comparing: remote entry{remote_entry} vs local entry{local_entry}")

    tokens_data = build_comparison(remote_entry, local_entry)
    if not tokens_data:
        print(f"No data found for remote entry{remote_entry} / local entry{local_entry}")
        sys.exit(1)

    html = generate_html(tokens_data, remote_entry, local_entry)
    out_path = os.path.join(PROJECT_DIR, "remote-comparison.html")
    with open(out_path, "w") as f:
        f.write(html)

    print(f"\nDashboard: {os.path.abspath(out_path)}")
    print()
    for token, td in tokens_data.items():
        net_diff = td["net_local_total"] - td["net_remote_total"]
        n_same = sum(1 for u in td["net_users"] if u["status"] == "same")
        print(f"=== {token} ===")
        print(f"  Roots: {'MATCH' if td['roots_match'] else 'DIFFER'}")
        if td["has_gross"]:
            gross_diff = td["gross_local_total"] - td["gross_remote_total"]
            print(f"  Gross: remote={fmt_short(td['gross_remote_total'])} local={fmt_short(td['gross_local_total'])} diff={'+' if gross_diff>=0 else ''}{fmt_short(gross_diff)}")
        print(f"  Net:   remote={fmt_short(td['net_remote_total'])} local={fmt_short(td['net_local_total'])} diff={'+' if net_diff>=0 else ''}{fmt_short(net_diff)}")
        print(f"  Addrs: {n_same}/{len(td['net_users'])} matching")
        print()

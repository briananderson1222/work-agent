#!/usr/bin/env python3
"""instinct-cli.py — Manage instincts: status, list, create, update, promote, prune, decay."""
import argparse
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path


SOUL_PATH = Path(os.environ.get("SOUL_PATH", os.path.expanduser("~/.soul")))
INSTINCTS_DIR = SOUL_PATH / "knowledge" / "instincts"


def parse_instinct(path: Path) -> dict | None:
    """Parse a markdown instinct file with YAML frontmatter."""
    text = path.read_text()
    if not text.startswith("---"):
        return None
    parts = text.split("---", 2)
    if len(parts) < 3:
        return None
    meta = {}
    for line in parts[1].strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == "confidence":
                v = float(v)
            elif k == "observation_count":
                v = int(v)
            meta[k] = v
    meta["_body"] = parts[2].strip()
    meta["_path"] = str(path)
    return meta


def iter_instincts(scope=None, domain=None, project=None, min_confidence=0.0):
    """Yield all instinct dicts matching filters."""
    dirs = []
    if scope in (None, "global"):
        g = INSTINCTS_DIR / "global"
        if g.is_dir():
            dirs.append(g)
    if scope in (None, "project"):
        projects_dir = INSTINCTS_DIR / "projects"
        if projects_dir.is_dir():
            for p in projects_dir.iterdir():
                if project and p.name != project:
                    continue
                inst_dir = p / "instincts"
                if inst_dir.is_dir():
                    dirs.append(inst_dir)
    for d in dirs:
        for f in d.glob("*.md"):
            inst = parse_instinct(f)
            if not inst:
                continue
            if domain and inst.get("domain") != domain:
                continue
            if inst.get("confidence", 0) < min_confidence:
                continue
            yield inst


def write_instinct(inst: dict, path: Path):
    """Write instinct dict as markdown with YAML frontmatter."""
    body = inst.pop("_body", "")
    inst.pop("_path", None)
    lines = ["---"]
    for k, v in inst.items():
        if k.startswith("_"):
            continue
        lines.append(f"{k}: {json.dumps(v) if isinstance(v, (int, float)) else v}")
    lines.append("---")
    if body:
        lines.append("")
        lines.append(body)
    path.write_text("\n".join(lines) + "\n")


def instinct_path(inst_id: str, scope: str, project_id: str = None) -> Path:
    if scope == "global":
        return INSTINCTS_DIR / "global" / f"{inst_id}.md"
    return INSTINCTS_DIR / "projects" / project_id / "instincts" / f"{inst_id}.md"


def calculate_confidence(observation_count: int, existing: float = 0.0) -> float:
    if existing > 0:
        return min(0.9, existing + (observation_count * 0.05))
    if observation_count <= 2:
        return 0.3
    elif observation_count <= 5:
        return 0.5
    elif observation_count <= 10:
        return 0.7
    return 0.85


def apply_decay(confidence: float, days_since: int) -> float:
    weeks = days_since / 7
    return max(0.1, confidence - (weeks * 0.02))


def cmd_status(_args):
    counts = {"global": 0, "project": 0}
    domains = {}
    tiers = {"tentative": 0, "moderate": 0, "strong": 0, "near-certain": 0}
    for inst in iter_instincts():
        s = inst.get("scope", "global")
        counts[s] = counts.get(s, 0) + 1
        d = inst.get("domain", "unknown")
        domains[d] = domains.get(d, 0) + 1
        c = inst.get("confidence", 0)
        if c >= 0.9:
            tiers["near-certain"] += 1
        elif c >= 0.7:
            tiers["strong"] += 1
        elif c >= 0.5:
            tiers["moderate"] += 1
        else:
            tiers["tentative"] += 1
    total = counts["global"] + counts["project"]
    print(f"Total instincts: {total}")
    print(f"  Global: {counts['global']}, Project: {counts['project']}")
    print(f"  By confidence: {tiers}")
    if domains:
        print(f"  By domain: {dict(sorted(domains.items()))}")


def cmd_list(args):
    for inst in iter_instincts(args.scope, args.domain, args.project, args.min_confidence):
        c = inst.get("confidence", 0)
        print(f"  [{c:.2f}] {inst.get('id', '?')} — {inst.get('trigger', '?')} ({inst.get('scope', '?')})")


def cmd_show(args):
    for inst in iter_instincts():
        if inst.get("id") == args.id:
            print(Path(inst["_path"]).read_text())
            return
    print(f"Instinct '{args.id}' not found.", file=sys.stderr)
    sys.exit(1)


def cmd_create(args):
    today = date.today().isoformat()
    path = instinct_path(args.id, args.scope, args.project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    conf = calculate_confidence(int(args.observation_count or 1))
    if args.confidence:
        conf = float(args.confidence)
    inst = {
        "id": args.id,
        "trigger": args.trigger,
        "confidence": round(conf, 2),
        "domain": args.domain,
        "source": args.source or "session-observation",
        "scope": args.scope,
        "created": today,
        "last_observed": today,
        "observation_count": int(args.observation_count or 1),
    }
    if args.scope == "project":
        inst["project_id"] = args.project_id
        inst["project_name"] = args.project_name or ""
    body = f"# {args.id.replace('-', ' ').title()}\n\n## Action\n{args.action or 'TBD'}\n\n## Evidence\n- {args.evidence or 'Initial observation'}"
    inst["_body"] = body
    write_instinct(inst, path)
    print(f"Created {path}")


def cmd_update(args):
    for inst in iter_instincts():
        if inst.get("id") == args.id:
            path = Path(inst["_path"])
            c = inst.get("confidence", 0.3)
            if args.observe:
                c = min(0.9, c + 0.05)
                inst["observation_count"] = inst.get("observation_count", 0) + 1
            if args.contradict:
                c = max(0.1, c - 0.1)
            inst["confidence"] = round(c, 2)
            inst["last_observed"] = date.today().isoformat()
            write_instinct(inst, path)
            print(f"Updated {inst['id']} → confidence {c:.2f}")
            return
    print(f"Instinct '{args.id}' not found.", file=sys.stderr)
    sys.exit(1)


def cmd_promote(args):
    for inst in iter_instincts(scope="project"):
        if inst.get("id") == args.id:
            src = Path(inst["_path"])
            dest = INSTINCTS_DIR / "global" / f"{args.id}.md"
            dest.parent.mkdir(parents=True, exist_ok=True)
            inst["scope"] = "global"
            inst.pop("project_id", None)
            inst.pop("project_name", None)
            inst["source"] = "promoted"
            write_instinct(inst, dest)
            src.unlink()
            print(f"Promoted {args.id} to global")
            return
    print(f"Project instinct '{args.id}' not found.", file=sys.stderr)
    sys.exit(1)


def cmd_prune(args):
    threshold = float(args.threshold or 0.2)
    removed = 0
    for inst in iter_instincts():
        if inst.get("confidence", 1.0) < threshold:
            Path(inst["_path"]).unlink()
            removed += 1
    print(f"Pruned {removed} instincts below {threshold}")


def cmd_decay(args):
    today = date.today()
    updated = 0
    for inst in iter_instincts():
        last = inst.get("last_observed", "")
        if not last:
            continue
        try:
            last_date = date.fromisoformat(last)
        except ValueError:
            continue
        days = (today - last_date).days
        if days < 7:
            continue
        old_c = inst.get("confidence", 0.5)
        new_c = round(apply_decay(old_c, days), 2)
        if new_c != old_c:
            inst["confidence"] = new_c
            write_instinct(inst, Path(inst["_path"]))
            updated += 1
    print(f"Decayed {updated} instincts")


def main():
    parser = argparse.ArgumentParser(description="Instinct CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status")

    ls = sub.add_parser("list")
    ls.add_argument("--scope", choices=["global", "project"])
    ls.add_argument("--domain")
    ls.add_argument("--project")
    ls.add_argument("--min-confidence", type=float, default=0.0)

    show = sub.add_parser("show")
    show.add_argument("id")

    cr = sub.add_parser("create")
    cr.add_argument("--id", required=True)
    cr.add_argument("--trigger", required=True)
    cr.add_argument("--domain", required=True)
    cr.add_argument("--scope", default="project")
    cr.add_argument("--project-id")
    cr.add_argument("--project-name")
    cr.add_argument("--confidence", type=float)
    cr.add_argument("--observation-count", default="1")
    cr.add_argument("--source")
    cr.add_argument("--action")
    cr.add_argument("--evidence")

    up = sub.add_parser("update")
    up.add_argument("id")
    up.add_argument("--observe", action="store_true")
    up.add_argument("--contradict", action="store_true")

    pr = sub.add_parser("promote")
    pr.add_argument("id")

    pn = sub.add_parser("prune")
    pn.add_argument("--threshold", default="0.2")

    sub.add_parser("decay")

    args = parser.parse_args()
    {
        "status": cmd_status,
        "list": cmd_list,
        "show": cmd_show,
        "create": cmd_create,
        "update": cmd_update,
        "promote": cmd_promote,
        "prune": cmd_prune,
        "decay": cmd_decay,
    }[args.command](args)


if __name__ == "__main__":
    main()

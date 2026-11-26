"""Minimal YAML-subset parser (stdlib only).

Handles exactly the subset pricing.yaml uses: nested mappings by
indentation, flow lists ["a", "b"], ints, floats, booleans,
quoted/plain strings, comments. Anything else raises — fail loudly
rather than silently misreading a price.
"""
from __future__ import annotations


def _strip_comment(line: str) -> str:
    out, quote = [], None
    for i, ch in enumerate(line):
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            out.append(ch)
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            break
        else:
            out.append(ch)
    return "".join(out).rstrip()


def _split_flow(text: str):
    parts, cur, quote, depth = [], "", None, 0
    for ch in text:
        if quote:
            cur += ch
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote, cur = ch, cur + ch
        elif ch == "[":
            depth, cur = depth + 1, cur + ch
        elif ch == "]":
            depth, cur = depth - 1, cur + ch
        elif ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    return parts


def _scalar(text: str):
    text = text.strip()
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1].strip()
        if not inner:
            return []
        return [_scalar(p) for p in _split_flow(inner)]
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    if text in ("true", "True"):
        return True
    if text in ("false", "False"):
        return False
    try:
        return int(text)
    except ValueError:
        pass
    try:
        return float(text)
    except ValueError:
        pass
    return text


def parse_yaml_subset(text: str) -> dict:
    """Parse the pricing.yaml subset into nested dicts."""
    root: dict = {}
    stack: list[tuple[int, dict]] = [(-1, root)]
    for raw in text.splitlines():
        line = _strip_comment(raw)
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        if line.lstrip().startswith("- "):
            raise ValueError(f"Block lists not supported: {raw!r}")
        if ":" not in line:
            raise ValueError(f"Cannot parse line: {raw!r}")
        key, _, value = line.strip().partition(":")
        key, value = key.strip(), value.strip()
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if not isinstance(parent, dict):
            raise ValueError(f"Bad nesting at: {raw!r}")
        if value == "":
            child: dict = {}
            parent[key] = child
            stack.append((indent, child))
        else:
            parent[key] = _scalar(value)
    return root

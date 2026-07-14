#!/usr/bin/env python3
import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
NGINX_TEMPLATE = ROOT / "nginx" / "default.conf.template"
CHART_JS = FRONTEND / "js" / "vendor" / "chart.umd.min.js"
CHART_SHA256 = "48444a82d4edcb5bec0f1965faacdde18d9c17db3063d042abada2f705c9f54a"


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def check_html() -> None:
    patterns = (
        (re.compile(r"<script(?![^>]*\bsrc=)[^>]*>", re.IGNORECASE), "inline script"),
        (
            re.compile(
                r"<script[^>]+\bsrc\s*=\s*['\"](?:https?:)?//",
                re.IGNORECASE,
            ),
            "external script",
        ),
        (re.compile(r"\son[a-z]+\s*=", re.IGNORECASE), "inline event handler"),
        (re.compile(r"\sstyle\s*=", re.IGNORECASE), "inline style"),
        (re.compile(r"<style(?:\s|>)", re.IGNORECASE), "style block"),
        (re.compile(r"\bjavascript\s*:", re.IGNORECASE), "javascript URL"),
    )

    for path in sorted(FRONTEND.rglob("*.html")):
        content = path.read_text(encoding="utf-8")
        for pattern, label in patterns:
            check(not pattern.search(content), f"{label} in {path.relative_to(ROOT)}")


def check_javascript() -> None:
    vendor = FRONTEND / "js" / "vendor"
    patterns = (
        (re.compile(r"\.style\."), "inline style write"),
        (re.compile(r"\.style\s*="), "inline style write"),
        (re.compile(r"setAttribute\(\s*['\"]style['\"]"), "inline style write"),
        (re.compile(r"\.on[a-zA-Z]+\s*="), "event handler property assignment"),
        (
            re.compile(r"setAttribute\(\s*['\"]on[a-zA-Z]+['\"]"),
            "event handler attribute assignment",
        ),
        (re.compile(r"\sstyle\s*=", re.IGNORECASE), "style in generated markup"),
        (re.compile(r"<style(?:\s|>)", re.IGNORECASE), "generated style block"),
        (re.compile(r"\bjavascript\s*:", re.IGNORECASE), "javascript URL"),
        (
            re.compile(
                r"\son(?:click|change|submit|error|load|input|focus|blur|"
                r"keydown|keyup|keypress|mouseover|mouseout)\s*=",
                re.IGNORECASE,
            ),
            "event handler in generated markup",
        ),
    )

    for path in sorted((FRONTEND / "js").rglob("*.js")):
        if vendor in path.parents:
            continue
        content = path.read_text(encoding="utf-8")
        for pattern, label in patterns:
            check(
                not pattern.search(content),
                f"{label} in {path.relative_to(ROOT)}",
            )


def check_chartjs() -> None:
    dashboards = (
        FRONTEND / "pages" / "dashboard" / "admin" / "dashboard.html",
        FRONTEND / "pages" / "dashboard" / "user" / "dashboard.html",
    )

    for path in dashboards:
        content = path.read_text(encoding="utf-8")
        check(
            'src="/js/vendor/chart.umd.min.js"' in content,
            f"vendored Chart.js missing from {path.relative_to(ROOT)}",
        )
        check(
            not re.search(r'<script[^>]+src=["\']https?://', content),
            f"external script in {path.relative_to(ROOT)}",
        )

    digest = hashlib.sha256(CHART_JS.read_bytes()).hexdigest()
    check(digest == CHART_SHA256, "vendored Chart.js SHA-256 changed")
    check(
        (CHART_JS.parent / "Chart.js-LICENSE.md").is_file(),
        "Chart.js license is missing",
    )


def check_nginx() -> None:
    content = NGINX_TEMPLATE.read_text(encoding="utf-8")
    required = (
        "server_tokens off;",
        'Strict-Transport-Security "${NGINX_HSTS_VALUE}"',
        "Permissions-Policy",
        'Cross-Origin-Opener-Policy "same-origin"',
        'Cross-Origin-Resource-Policy "same-origin"',
        'Cross-Origin-Embedder-Policy "require-corp"',
        "default-src 'none'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        "script-src-attr 'none'",
        "style-src 'self'",
        "style-src-attr 'none'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-src 'none'",
        "worker-src 'none'",
        "media-src 'none'",
        "manifest-src 'self'",
        "upgrade-insecure-requests",
    )

    for value in required:
        check(value in content, f"missing Nginx security setting: {value}")

    dockerfile = (ROOT / "nginx" / "Dockerfile").read_text(encoding="utf-8")
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    check(
        "NGINX_ENVSUBST_FILTER=^NGINX_" in dockerfile,
        "Nginx envsubst filter is not restricted",
    )
    check(
        "NGINX_HSTS_VALUE=max-age=0" in dockerfile,
        "Nginx development HSTS default is missing",
    )
    check(
        'NGINX_HSTS_VALUE: "${NGINX_HSTS_VALUE:-max-age=0}"' in compose,
        "Compose HSTS configuration is missing",
    )


def main() -> None:
    check_html()
    check_javascript()
    check_chartjs()
    check_nginx()
    print("Security hardening checks passed.")


if __name__ == "__main__":
    main()

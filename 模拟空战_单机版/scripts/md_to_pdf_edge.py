# -*- coding: utf-8 -*-
"""Render Markdown to HTML, then print to PDF via Microsoft Edge (Chromium) headless."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import markdown


EDGE_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def find_edge() -> Path:
    for p in EDGE_CANDIDATES:
        if p.is_file():
            return p
    raise FileNotFoundError("未找到 msedge.exe，请安装 Microsoft Edge 或将 Chrome 路径加入脚本。")


def md_to_html(md_path: Path) -> str:
    text = md_path.read_text(encoding="utf-8")
    html_body = markdown.markdown(
        text,
        extensions=["extra", "tables", "fenced_code", "sane_lists", "smarty"],
        output_format="html",
    )
    css = """
    @page { margin: 12mm; size: A4; }
    body {
      font-family: "Microsoft YaHei", "SimHei", "PingFang SC", sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #111;
      max-width: 190mm;
      margin: 0 auto;
      padding: 0 4mm;
    }
    h1,h2,h3,h4 { page-break-after: avoid; }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 10pt; }
    th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
    th { background: #f0f0f0; }
    pre {
      background: #f5f5f5;
      border: 1px solid #ddd;
      padding: 10px 12px;
      overflow-x: auto;
      font-size: 9.5pt;
    }
    code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; }
    img { max-width: 100%; height: auto; }
    p { margin: 0.5em 0; }
    blockquote { margin: 0.6em 0; padding-left: 1em; border-left: 4px solid #ccc; color: #333; }
    """
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>{md_path.stem}</title>
<style>
{css}
</style>
</head>
<body>
{html_body}
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("md", type=Path, help="输入 .md 路径")
    ap.add_argument("-o", "--out", type=Path, default=None, help="输出 .pdf 路径（默认同名）")
    args = ap.parse_args()

    md_path = args.md.resolve()
    if not md_path.is_file():
        print(f"找不到文件: {md_path}", file=sys.stderr)
        return 2

    out_pdf = args.out
    if out_pdf is None:
        out_pdf = md_path.with_suffix(".pdf")
    else:
        out_pdf = out_pdf.resolve()

    work_dir = md_path.parent
    html_path = work_dir / f"_{md_path.stem}_print.html"
    html_path.write_text(md_to_html(md_path), encoding="utf-8")

    edge = find_edge()
    html_uri = html_path.as_uri()
    cmd = [
        str(edge),
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={out_pdf}",
        html_uri,
    ]
    r = subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if r.returncode != 0:
        print("Edge 打印失败 (exit=%s)，请确认已安装 Edge。" % r.returncode, file=sys.stderr)
        return r.returncode or 1

    if not out_pdf.is_file() or out_pdf.stat().st_size < 1000:
        print("未生成有效的 PDF 文件。", file=sys.stderr)
        return 1

    print("PDF:", out_pdf.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

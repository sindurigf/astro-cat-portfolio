#!/usr/bin/env python3
"""Finish the tags Chromium writes on a printed talk, so the PDF meets PDF/UA-1.

    python3 scripts/tag-talk-pdf.py <in.pdf> <out.pdf> <page.json> <title>

Run by `npm run publish:talk`. `page.json` holds `links`, `hidden`,
`headings` and `digest` (stored as /SlidesSHA256 for tests/talk-pdf.spec.ts).
Needs pikepdf: `apt install python3-pikepdf`.
What it fixes: docs/DEVELOPMENT.md, "Publishing the PDF".
"""

import json
import sys

import pikepdf
from pikepdf import Array, Dictionary, Name, Operator

PAINT = {"f", "F", "f*", "S", "s", "B", "B*", "b", "b*", "n", "sh"}
PATH = {"m", "l", "c", "v", "y", "h", "re", "W", "W*"}
TEXT = {"BT"}


def fail(message):
    sys.exit(f"tag-talk-pdf: {message}")


def artifact_untagged(pdf, page):
    """Wrap every path and text object drawn outside marked content as an
    /Artifact; returns how many text objects that was."""
    out, depth, open_artifact, closes_on, texts = [], 0, False, None, 0
    for operands, op in pikepdf.parse_content_stream(page):
        name = str(op)
        if name in ("BDC", "BMC"):
            depth += 1
        elif name == "EMC":
            depth -= 1
        elif depth == 0 and not open_artifact and name in PATH | TEXT:
            out.append(([Name.Artifact], Operator("BMC")))
            open_artifact = True
            closes_on = {"ET"} if name in TEXT else PAINT
            texts += name in TEXT
        out.append((operands, op))
        if open_artifact and name in closes_on:
            out.append(([], Operator("EMC")))
            open_artifact = False
    if open_artifact:
        fail(f"page {page.index + 1} ends inside a path or text object")
    page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(out))
    return texts


def parent_tree(pdf):
    """The parent tree as a flat dict: struct-parents key to its array."""
    nums = pdf.Root.StructTreeRoot.ParentTree.get("/Nums")
    if nums is None:
        fail("the parent tree has /Kids, which this script does not handle")
    return {int(nums[i]): nums[i + 1] for i in range(0, len(nums), 2)}


def kids(element):
    k = element.get("/K")
    if k is None:
        return []
    return list(k) if isinstance(k, Array) else [k]


def walk(element):
    yield element
    for kid in kids(element):
        if isinstance(kid, Dictionary) and "/S" in kid:
            yield from walk(kid)


def give_list_items_bodies(pdf):
    """Move whatever sits beside an LI's Lbl into an LBody."""
    tree = parent_tree(pdf)
    by_page = {
        page.objgen: tree[int(page.StructParents)]
        for page in pdf.pages
        if "/StructParents" in page
    }
    for element in list(walk(pdf.Root.StructTreeRoot)):
        if element.get("/S") != Name.LI:
            continue
        is_part = [
            isinstance(k, Dictionary) and k.get("/S") in (Name.Lbl, Name.LBody)
            for k in kids(element)
        ]
        keep = [k for k, part in zip(kids(element), is_part) if part]
        rest = [k for k, part in zip(kids(element), is_part) if not part]
        if not rest:
            continue
        body = pdf.make_indirect(
            Dictionary(Type=Name.StructElem, S=Name.LBody, P=element, K=Array(rest))
        )
        if "/Pg" in element:
            body.Pg = element.Pg
        for kid in rest:
            if isinstance(kid, Dictionary) and "/S" in kid:
                kid.P = body
            elif isinstance(kid, int) or (isinstance(kid, Dictionary) and "/MCID" in kid):
                mcid = int(kid) if isinstance(kid, int) else int(kid.MCID)
                page = kid.Pg if isinstance(kid, Dictionary) and "/Pg" in kid else element.Pg
                by_page[page.objgen][mcid] = body
        element.K = Array(keep + [body])


def describe_links(pdf, links):
    """Give each link annotation the text of its link on the page."""
    text_for = {}
    for href, text in links:
        text_for.setdefault(href, text)
    for page in pdf.pages:
        for annot in page.get("/Annots", []):
            if annot.get("/Subtype") != Name.Link:
                continue
            uri = str(annot.get("/A", {}).get("/URI", ""))
            if uri.startswith("http://127.0.0.1") or uri.startswith("http://localhost"):
                fail(f"page {page.index + 1} links the local server: {uri}")
            text = text_for.get(uri)
            if not text:
                fail(f"page {page.index + 1} links {uri}, which the page does not")
            annot.Contents = pikepdf.String(text)


def title_bookmarks(pdf, headings):
    """Title each bookmark, in document order, with its heading's text."""
    with pdf.open_outline() as outline:
        items = []

        def collect(level):
            for item in level:
                items.append(item)
                collect(item.children)

        collect(outline.root)
        if len(items) != len(headings):
            fail(f"{len(items)} bookmarks for {len(headings)} slide headings")
        for item, heading in zip(items, headings):
            item.title = heading


def main():
    if len(sys.argv) != 5:
        fail("usage: tag-talk-pdf.py <in.pdf> <out.pdf> <page.json> <title>")
    source, target, page_file, title = sys.argv[1:]
    with open(page_file, encoding="utf-8") as handle:
        seen = json.load(handle)

    pdf = pikepdf.open(source)
    if "/StructTreeRoot" not in pdf.Root:
        fail("the PDF has no structure tree; was it printed with tagged: true?")

    hidden = sum(artifact_untagged(pdf, page) for page in pdf.pages)
    if hidden != seen["hidden"]:
        fail(
            f"{hidden} text objects are outside any tag, and the page hides "
            f"{seen['hidden']} elements: some untagged text is content"
        )
    pdf.Root.StructTreeRoot.RoleMap = Dictionary(Strong=Name.Span)
    give_list_items_bodies(pdf)
    describe_links(pdf, seen["links"])
    title_bookmarks(pdf, seen["headings"])

    language = str(pdf.Root.get("/Lang", ""))
    if not language:
        fail("the PDF has no /Lang")
    with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
        meta["dc:title"] = title
        meta["dc:language"] = [language]
        meta["pdfuaid:part"] = "1"
    pdf.docinfo[Name.Title] = title
    pdf.docinfo[Name.SlidesSHA256] = seen["digest"]
    pdf.save(target)


if __name__ == "__main__":
    main()

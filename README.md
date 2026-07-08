# DocEdit — Document Editor & Export Tools

A lightweight web-based document editor with full **RTL/LTR** support (فارسی/عربی + English), **Google Fonts**, **code zones** with syntax highlighting, and export to **PDF, DOCX, Markdown, HTML, TXT, RTF**.

Runs in any modern browser — on the web or locally on Windows. No installation required.

## Run it

**Windows (local):** double-click `run-windows.bat`. It starts a tiny local server (Python or Node, whichever is installed) and opens the editor at `http://localhost:8321`. If neither is installed, it opens `index.html` directly — everything still works.

**Web:** upload the whole folder to any static host (GitHub Pages, Netlify, any web server). No backend needed.

> Internet is required for CDN libraries and Google Fonts.

## Features

**Open files** — `.md`, `.docx`, `.txt`, `.html`, `.pdf` (text extraction) — via the 📂 button or drag & drop onto the page.

**Editing** — headings, bold/italic/underline/strikethrough, colors, highlight, lists, indent, alignment, links, images (URL or embedded local file), tables, horizontal rules, undo/redo.

**RTL / LTR** — per-paragraph direction buttons (LTR/RTL), whole-document direction toggle (¶⇄), and a fully mirrored Persian UI (EN/فا button).

**Google Fonts** — 20+ fonts including Vazirmatn, Noto Naskh Arabic, Amiri, Cairo, Lalezar for RTL and Inter, Lora, Merriweather, Playfair Display for LTR. Fonts load on demand.

**Code zones** — `{ }` button inserts a code block with a language picker (JS, Python, C#, SQL, Bash, …). Code stays LTR even inside RTL documents, highlights automatically when you click away, and Tab inserts spaces.

**Export** (💾 menu):

| Format | Notes |
|---|---|
| PDF (print dialog) | Best quality — real text, perfect RTL shaping. Choose "Save as PDF" in the dialog. |
| PDF (direct download) | One click, rendered as image (RTL renders correctly, text not selectable). |
| DOCX | Opens in Microsoft Word / LibreOffice. |
| Markdown | Code zones become fenced blocks. Tables are simplified. |
| HTML | Standalone styled page with fonts + highlighting. |
| TXT | Plain text. |
| RTF | Basic formatting; RTL paragraphs marked. Images/tables simplified. |

**Extras** — dark mode (◐), autosave to browser storage (your document survives closing the tab), word/character count, shortcuts: `Ctrl+O` open, `Ctrl+S` export HTML, `Ctrl+P` print/PDF.

**Settings (⚙)** — force digits to Persian (۱۲۳) or English (123) everywhere except code zones; page size (A4/A5/Letter/Legal/Wide) applied to editor, print, and PDF exports; toggle TOC in exports.

**Smart table of contents (☰📑)** — auto-detects headings (H1–H6, plus short fully-bold paragraphs), shows a nested sidebar, click to jump, highlights the current section while scrolling. A linked TOC is embedded in PDF/HTML/DOCX exports.

**Code copy** — hover any code zone for a copy button; exported HTML pages get copy buttons too.

**Publish & private share links (🌐)** — publish documents to your own Vercel deployment (admin-password protected, stored in free Upstash Redis). Create per-reader links with a unique-browser limit (e.g. max 5 browsers — or 1, which locks the link to the first person who opens it), optional comments, usage counters, and revocation. See `DEPLOY.md` for the 10-minute setup on GitHub (masood5400) + Vercel, all on free tiers.

## Files

```
index.html        app shell
viewer.html       read-only page for shared links (+ comments)
css/style.css     themes, RTL, print styles
js/i18n.js        English/Persian UI strings
js/editor.js      editing core, code zones, direction
js/settings.js    digit enforcement + page size
js/toc.js         smart table of contents
js/io.js          import (md/docx/txt/html/pdf) + export (pdf/docx/md/html/txt/rtf)
js/publish.js     publish & share-link client
js/viewer.js      shared-document viewer logic
js/app.js         Google Fonts, toolbar, theme, init
api/              Vercel serverless functions (publish/share/doc/comment)
run-windows.bat   local launcher for Windows
DEPLOY.md         راهنمای استقرار روی Vercel (فارسی)
```

## Libraries (CDN)

marked (md→html), turndown (html→md), mammoth (docx→html), html-docx-js (html→docx), html2pdf.js (pdf download), highlight.js (code), pdf.js (pdf text extraction), Google Fonts.

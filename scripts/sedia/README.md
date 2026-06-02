# SEDIA Calls Sync

Pulls EU Funding & Tenders Portal calls into `data/calls/`. Source: SEDIA Search API (the same backend the portal frontend uses), via POST multipart with `apiKey=SEDIA`.

## Usage

```bash
# Default: fetch + extract (no PDFs) for all open + forthcoming calls
node scripts/sedia/sync.js

# Pipeline phases (independent)
node scripts/sedia/sync.js fetch                       # save raw paginated SEDIA pages
node scripts/sedia/sync.js extract                     # parse → per-call dirs + index.csv
node scripts/sedia/sync.js docs                        # download every linked PDF/XLSX/DOCX
node scripts/sedia/sync.js all --with-pdfs             # full pipeline including PDFs

# Filter to programmes (during extract or docs)
node scripts/sedia/sync.js extract --filter=ERASMUS,LIFE
node scripts/sedia/sync.js docs    --filter=ERASMUS

# Smoke-test on a small subset
node scripts/sedia/sync.js extract --max=5 --filter=ERASMUS

# Re-fetch but only open calls
node scripts/sedia/sync.js fetch --status=open

# Dry run
node scripts/sedia/sync.js extract --dry-run
```

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--status=open,forthcoming` | both | Fetch phase. Comma list of `open\|forthcoming\|closed` |
| `--filter=PFX1,PFX2` | none | Extract/docs phase. Match identifier prefix (case-insensitive) |
| `--with-pdfs` | off | Only with `all`. Include docs phase |
| `--concurrency=5` | 5 | Parallel HTTP for PDF download |
| `--force` | off | Re-download existing PDFs |
| `--max=N` | unlimited | Cap calls processed (testing) |
| `--dry-run` | off | Print plan, don't write |

## Output

```
data/calls/
  _meta.json               # extraction timestamp + filters
  _index.csv               # flat catalog: id, programme, status, opening, deadline, budget, url
  _raw/                    # paginated SEDIA responses (regenerated each fetch)
    page-1.json
    page-2.json
    ...
    _meta.json             # fetch timestamp + status filters used
  ERASMUS-EDU-2026-PEX-COVE/
    topic.json             # parsed metadata (status, dates, budget, programme, action, links)
    description.md         # clean markdown of the topic description
    description.html       # original HTML
    conditions.html        # admissibility / eligibility / evaluation HTML
    documents.json         # extracted document URLs ({label, url, ext, is_downloadable})
    documents/             # downloaded files (only after `docs` phase)
      programme-guide-2026_en.pdf
      af_erasmus-bb-lsii_en.pdf
      detailed-budget-table_erasmus-lsii_en.xlsm
      ...
```

## What gets stored per call

`topic.json` keys:

```jsonc
{
  "identifier": "ERASMUS-EDU-2026-PEX-COVE",
  "ccm2Id": "49669831",
  "callIdentifier": "ERASMUS-EDU-2026-PEX-COVE",
  "callTitle": "Centres of Vocational Excellence",
  "title": "Centres of Vocational Excellence",
  "programme": "Erasmus+",
  "programmeCode": "43108390",
  "programmePeriod": "2021 - 2027",
  "status": "open",
  "statusCode": "31094502",
  "opening": "2025-12-04",
  "deadline": "2026-09-03",
  "deadlineModel": "single-stage",
  "actionType": "ERASMUS Lump Sum Grants",
  "actionCode": "ERASMUS-LS",
  "mgaCode": "ERASMUS-AG-LS",
  "budget": {
    "total_eur": 68000000,
    "by_year": { "2026": 68000000 },
    "expected_grants": null,
    "min_contribution_eur": null,
    "max_contribution_eur": null
  },
  "keywords": [...],
  "crossCuttingPriorities": ["AI", "DigitalAgenda"],
  "supportInfoText": "For help related to this call...",
  "submissionUrl": "https://ec.europa.eu/research/.../create-draft/...",
  "topicUrl": "https://ec.europa.eu/info/funding-tenders/.../topic-details/ERASMUS-EDU-2026-PEX-COVE",
  "documents": [
    { "section": "Application form templates", "label": "Standard application form (ERASMUS BB and LSII)", "url": "https://ec.europa.eu/info/.../af_erasmus-bb-lsii_en.pdf", "ext": ".pdf", "is_downloadable": true }
  ],
  "fetchedAt": "2026-05-06T..."
}
```

## Caveats

- The SEDIA search response **does not** populate `expectedGrants` / `minContribution` / `maxContribution` for most lump-sum calls — these come from the call document PDF, not the API. To know "X projects of Y €", you have to read the PDF in `documents/`.
- Some topics appear twice in raw search results (type=1 call + type=2 topic). The extract phase deduplicates by identifier, keeping the entry with the longest description.
- Some documents are linked from `eur-lex.europa.eu` (regulations, official journal call documents). These return HTML pages, not PDFs directly — a follow-up PDF link inside is needed. The current downloader stores the response as-is.
- Decentralised Erasmus+ actions (KA1/KA2/KA3, Sport, Youth managed by National Agencies) **do not appear** in this portal — the API only returns EACEA-managed calls.

## Scheduling

Run from cron / Windows Task Scheduler. Example weekly refresh:

```bash
# Every Monday 03:00 (Linux cron)
0 3 * * 1 cd /path/to/eplus-tools && node scripts/sedia/sync.js all --with-pdfs >> logs/sedia-sync.log 2>&1
```

For Windows: use Task Scheduler with `cmd.exe /c "cd C:\Users\Usuario\eplus-tools && node scripts\sedia\sync.js all --with-pdfs"`.

# BDNS Calls Sync

Pulls Spanish public-grant calls from the **Base de Datos Nacional de Subvenciones** (Ministerio de Hacienda) into `data/bdns/`. Covers Estado + Comunidades Autónomas + Locales + Universidades.

## Usage

```bash
# Default: fetch + detail + extract (last 30 days, only open calls)
node scripts/bdns/sync.js

# Phases independently
node scripts/bdns/sync.js fetch --days=30      # paginate listing
node scripts/bdns/sync.js detail               # fetch full detail per call
node scripts/bdns/sync.js extract              # filter + write per-call dirs

# Filter by region (NUTS code)
node scripts/bdns/sync.js extract --region=ES13   # Cantabria
node scripts/bdns/sync.js extract --region=ES61   # Andalucía

# Include also closed calls
node scripts/bdns/sync.js extract --include-closed

# Smoke test
node scripts/bdns/sync.js all --max=10 --days=7
```

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--days=N` | 30 | Cutoff for listing pagination (stop when `fechaRecepcion < today-N`) |
| `--region=ESxx` | none | NUTS-2 code filter: ES13=Cantabria, ES61=Andalucía, ES11=Galicia, etc. |
| `--only-open` | true | Filter out calls past their `fechaFinSolicitud` |
| `--include-closed` | off | Disable the open-only filter |
| `--max=N` | unlimited | Cap calls processed |
| `--concurrency=N` | 10 | Parallel detail fetches |
| `--skip-existing` | true | Skip already-fetched detail files |
| `--force` | off | Re-fetch / overwrite existing |
| `--dry-run` | off | Print plan, don't write |

## Endpoints used

| Phase | Endpoint |
|---|---|
| `fetch` | `GET https://www.pap.hacienda.gob.es/bdnstrans/api/convocatorias/ultimas?page=N&size=100` |
| `detail` | `GET https://www.pap.hacienda.gob.es/bdnstrans/api/convocatorias?numConv=<id>` |

Sin auth, sin rate-limit aparente. Mirror equivalente: `www.infosubvenciones.es`.

## Output

```
data/bdns/
  _meta.json                  # extractedAt, totals, filters
  _index.csv                  # flat catalog (source_id, level, nuts, title, status, dates, budget, ...)
  _raw/
    page-0.json … page-N.json # paginated listing responses
    _listing_meta.json        # fetch timestamp + totals
    details/
      903967.json             # detail JSON per call (31-field source schema)
      ...
  903967/
    topic.json                # normalized to common shape (cross-source schema)
    raw.json                  # original detail (preserved for re-processing)
```

## Normalized schema (`topic.json`)

Aligned with the cross-source schema agreed with Cantabria Claude. Adds BDNS-specific fields:

```jsonc
{
  "source": "bdns",
  "source_id": "903967",                          // codigoBDNS
  "source_lang": "es",
  "level": "ccaa" | "estado" | "local" | "otros",
  "programme": "Concurrencia competitiva ...",    // tipoConvocatoria
  "publishing_authority_code": "OTROS / UNIVERSIDAD REY JUAN CARLOS / ...",
  "nuts_codes": ["ES30"],
  "nuts_primary": "ES30",
  "title": "...",
  "summary": "...",                               // descripcionFinalidad
  "status": "open" | "closed",
  "publication_date": "2026-05-06",               // fechaRecepcion
  "open_date": "2026-05-07",                      // fechaInicioSolicitud
  "deadline": "2026-06-30",                       // fechaFinSolicitud
  "deadline_model": "single-stage" | "continuous",
  "budget_total_eur": 12000,
  "audience": "...",                              // tiposBeneficiarios join
  "eligible_orgs": [...],
  "eligible_countries": ["ES"],
  "sectores": [...],
  "apply_url": "...",                             // sedeElectronica
  "details_url": "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/903967",
  "documents": [...],
  "bases_reguladoras_url": "...",
  "mrr_flag": false,                              // true = PRTR / Next Generation EU
  "fetchedAt": "..."
}
```

## Caveats

- **Listing endpoint cap:** `totalElements` is capped at 10000 (Spring `findAll` default). Older calls fall off; pagination by `fechaRecepcion` cutoff handles the open-call subset reliably.
- **Listing `pageSize` ignored:** the server returns 50 items per page max regardless of `?size=100`. Default to 50, expect 50.
- **Rate limit IS enforced:** despite earlier reports, the detail endpoint returns HTTP 429 above ~5 req/s. The script defaults to `concurrency=3` + 200ms inter-batch sleep + exponential backoff retry on 429 (2s, 4s, 8s, 16s, 32s).
- **Server-side filters ignored:** `?abierto=true`, `?region=ES13`, `?vpd=...` are silently ignored. Filter post-fetch.
- **`vpd` codes are not what they seem:** `vpd=A07` returns Castilla y León, not Cantabria. Use `regiones[].descripcion` (NUTS-prefixed) instead.
- **Coverage is broad:** includes municipios, mancomunidades, universidades, fundaciones — not just Estado/CC.AA. Most entries are LOCAL.
- **`presupuestoTotal` may be null** for calls where the publishing body doesn't disclose. Don't filter aggressively by `> 0`.
- **`abierto` flag is unreliable:** marks `false` whenever explicit start/end dates aren't both set, even for calls clearly open via textual deadline (`textInicio`/`textFin` like "ÚLTIMO DÍA HÁBIL DEL AÑO"). The script's `isOpen()` uses a layered heuristic: explicit deadline > start-only date > textual signals > API flag.
- **Encoding:** despite earlier reports of UTF-8/Latin-1 corruption, the BDNS response is valid UTF-8. Node's `fetch` decodes it correctly. The bug only manifests in PowerShell 5.1's `Invoke-WebRequest` default text decoding (which assumes Windows-1252 when no charset is specified). No fix needed in Node.

## Refresh strategy

Daily refresh with low cutoff:

```bash
# Cron / Task Scheduler — every day at 03:30 ES
node scripts/bdns/sync.js all --days=7
```

Idempotent: existing detail files are skipped, so daily incremental cost is small (only new `numeroConvocatoria` from the last 7 days).

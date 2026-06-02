# Refresh Pipeline — daily auto-update of funding & training datasets

**Owner:** Local Claude (eplus-tools).
**Status:** v1 · runs on Hetzner VPS host via systemd timer.
**Last update:** 2026-05-07.

---

## What it does

Every day at **06:00 Europe/Madrid**, a systemd timer on the VPS host pulls the
latest snapshots from public sources, rebuilds the unified JSON, and pushes a
commit to the `data-auto` branch on GitHub.

Pipeline orchestrator: `scripts/refresh-all.js`.

| Step | Script | Output | Soft fail? |
|------|--------|--------|------------|
| 1 | `scripts/salto/scrape-salto.js`     | `data/salto/trainings.json` + snapshot/YYYY-MM-DD.json | yes |
| 2 | `scripts/salto/enrich-details.js`   | enriches each training with fee, organiser, contact, description | yes |
| 3 | `scripts/sedia/sync.js`             | `data/calls/` (EU funding calls from F&T Portal)        | yes |
| 4 | `scripts/bdns/sync.js`              | `data/bdns/` (Spanish public subsidies from BDNS)       | yes |
| 5 | `scripts/funding/build-unified.js`  | `data/funding_unified.json` (cross-source merged)       | yes |
| 6a | `scripts/fetch-call-pdfs.js`       | downloads PDF for any NEW SEDIA call → `data/call_pdfs/` | yes |
| 6b | `scripts/extract-call-text.js`     | text-extracts new PDFs → `data/call_extracts/`          | yes |
| 6c | `scripts/structure-call.js`        | Claude LLM extraction (30 fields + FAQ) → `data/call_structured/` (symlinked to volume) | yes |
| 6d | `scripts/embed-calls.js`           | OpenAI embeddings → `data/call_vectors/` (symlinked to volume) | yes |
| 7  | `git commit + push origin data-auto`| only if `data/` diff is non-empty                       | no  |

All 6a-d steps are idempotent (skip what's already on disk). Cost: $0 if no
new calls, ~$0.10 per new call (Anthropic Sonnet + OpenAI embeddings).

**For 6c-d to actually reach the live container**, `data/call_structured/` and
`data/call_vectors/` inside the cron repo MUST be symlinks to the Coolify
volume mount `/data/eplus-shared/...` (see VPS setup below).

"Soft fail" = the orchestrator logs the failure and continues. If ALL scrapers
fail (network outage, etc.) the orchestrator aborts before commit so the
previous good snapshot is preserved.

---

## Branch policy

The cron writes ONLY to the dedicated branch **`data-auto`** — never to
`dev-local` or `main`. This avoids conflicts with the developer's day-to-day
work and respects the absolute rule in `CLAUDE.md` (no direct push to `main`).

To publish the latest snapshots to Live, the developer runs `/merge` from
their local PC, which now includes `git merge origin/data-auto` as part of the
flow. Snapshots accumulate on `data-auto` until merged; if a few days pass
without a merge, all snapshots come together at once.

```
data-auto  ──snapshots day-by-day──┐
dev-local  ──developer's work──────┼──/merge──> main ──Coolify──> Live
dev-vps    ──Claude VPS work───────┘
```

---

## VPS setup (one-time)

The cron lives on the VPS host (NOT inside the Coolify container, since
Coolify redeploys on every push). Files involved:

```
/home/eplusbot/.ssh/id_ed25519       # GitHub deploy key (read+write)
/opt/eplus-tools-cron/                # repo clone, owned by eplusbot
/etc/systemd/system/eplus-data-refresh.service
/etc/systemd/system/eplus-data-refresh.timer
```

### Step-by-step

```bash
# 1. As root: create dedicated user
sudo useradd -m -d /home/eplusbot -s /bin/bash eplusbot
sudo mkdir -p /opt/eplus-tools-cron && sudo chown eplusbot:eplusbot /opt/eplus-tools-cron

# 2. As eplusbot: generate deploy key + show pubkey
sudo -iu eplusbot
ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519 -C 'eplus-refresh-bot@vps'
cat ~/.ssh/id_ed25519.pub
# → copy this to GitHub: repo eplus-tools → Settings → Deploy keys
#   → "Add deploy key" → paste → CHECK "Allow write access" → Add
ssh -o StrictHostKeyChecking=accept-new -T git@github.com   # accept fingerprint

# 3. Still as eplusbot: clone + install + ensure data-auto branch exists
git clone git@github.com:ongpasos-droid/eplus-tools.git /opt/eplus-tools-cron
cd /opt/eplus-tools-cron
npm ci --omit=dev

git fetch origin
if ! git ls-remote --heads origin data-auto | grep -q data-auto; then
  git checkout main
  git checkout -b data-auto
  git push -u origin data-auto
else
  git checkout data-auto
fi

# 4. Wire enrichment outputs to the Coolify volume so the live app sees them
#    (one-time, otherwise the cron writes to its own checkout and the
#     container never picks up new structured/vectors data)
rm -rf data/call_structured data/call_vectors
ln -s /data/eplus-shared/call_structured data/call_structured
ln -s /data/eplus-shared/call_vectors    data/call_vectors

# 4b. Copy the API keys the LLM steps need into .env (gitignored)
cat <<'EOF' > .env
ANTHROPIC_API_KEY=<copia el valor de la .env de la app Coolify>
OPENAI_API_KEY=<copia el valor de la .env de la app Coolify>
EOF
chmod 600 .env

# 5. Smoke test the orchestrator manually
node scripts/refresh-all.js
# Expect: scrapers run, then 6a-d skip everything (nothing new), commit + push if data/ changed.

# 5. As root: install systemd units
sudo cp /opt/eplus-tools-cron/infra/systemd/eplus-data-refresh.service /etc/systemd/system/
sudo cp /opt/eplus-tools-cron/infra/systemd/eplus-data-refresh.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eplus-data-refresh.timer

# 6. Verify timer is active
systemctl list-timers eplus-data-refresh.timer
# Expect: NEXT column showing tomorrow 06:00:xx
```

---

## Operations

### See last run + next scheduled
```bash
systemctl status eplus-data-refresh.timer
systemctl list-timers eplus-data-refresh.timer
```

### Tail logs from last run
```bash
journalctl -u eplus-data-refresh.service -n 200 --no-pager
```

### Trigger a run manually (without waiting for 06:00)
```bash
sudo systemctl start eplus-data-refresh.service
journalctl -u eplus-data-refresh.service -f
```

### Disable temporarily
```bash
sudo systemctl stop eplus-data-refresh.timer
sudo systemctl disable eplus-data-refresh.timer   # also prevent boot
```

### Rotate the GitHub deploy key
```bash
sudo -iu eplusbot
ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519.new -C 'eplus-refresh-bot@vps'
# Add new pubkey to GitHub deploy keys, remove old, rename:
mv ~/.ssh/id_ed25519.new ~/.ssh/id_ed25519
mv ~/.ssh/id_ed25519.new.pub ~/.ssh/id_ed25519.pub
```

---

## Troubleshooting

**`git push` fails with auth error:**
The deploy key is missing or doesn't have write access. Check on GitHub →
repo Settings → Deploy keys → confirm "Allow write access" is checked.

**One scraper fails every day with the same error:**
Probably a source schema change (SALTO/SEDIA/BDNS updated their HTML or API).
Run the failing script manually with debug output:
```bash
sudo -iu eplusbot
cd /opt/eplus-tools-cron
node scripts/salto/scrape-salto.js --max-pages=1
```

**Timer ran but no commit appeared on GitHub:**
Either no data changed (normal — common during weekends) or the push failed
silently. Check the journal: `journalctl -u eplus-data-refresh.service -n 50`.

**Branch `data-auto` got out of sync with `main`:**
After a `/merge` cycle, `data-auto` may diverge cosmetically from `main`. The
orchestrator does `git reset --hard origin/data-auto` on each run, so it
self-recovers. To force-rebase manually:
```bash
sudo -iu eplusbot
cd /opt/eplus-tools-cron
git fetch origin
git checkout data-auto
git reset --hard origin/main      # rebase data-auto on top of latest main
git push --force-with-lease origin data-auto
```

---

## Open questions / future work

- **Alerting on N consecutive failures:** today the only signal is journalctl
  silence. Add a Resend email or Telegram ping when 3 days pass without a
  successful run.
- **Diff summary in commit message:** include `before:after` counts per
  source (e.g. "SALTO 77→81  SEDIA 542→544"). Helps audit growth at a glance.
- **Scope expansion:** TASK-005 phases 3 (BOE) + 4 (BOC Cantabria) + 5
  (SEPIE/INJUVE) bolt onto the same orchestrator with one more `softExec`.

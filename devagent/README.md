# Print@ dev agent

The last stage of the Print@ customer-service loop. Bug reports arrive from the driver and
the site (`/api/bugs`), Jev triages them against the FAQ and auto-replies when it knows the
fix. Whatever is left open lands here.

```
open ticket
  → git worktree on fix/ticket-<id> (from origin/main)
  → Claude Code (`claude -p`) reproduces, fixes, adds test/regress/<slug>.js, commits, writes FIX.md
  → ./test/run.sh
  → three judges in parallel: Astra (openai/gpt-6-astra), Claude Code review, Jev "does this resolve the report?"
  → iMessage to the maintainer: cause, fix, verdicts. "YES <id>" deploys, "NO <id>" drops.
  → merge --no-ff into main, push, `railway up` when network/ or docs/ changed
  → ticket marked fixed, reporter emailed the customer note, worktree removed
```

Anything that fails a judge, has no fix, or needs a decision is marked `needs-human` on the
ticket and texted with the reasons. Nothing is merged or deployed without a human YES.

## Run

```
node devagent/run.js once          # handle new tickets, then check texts for YES/NO
node devagent/run.js watch         # tickets every 10 min, replies every minute
node devagent/run.js approve 12    # same as texting YES 12
node devagent/run.js reject 12
node devagent/run.js status
```

Env, read from `~/.printat.env`: `PRINTAT_ADMIN_SECRET` (the hosted ticket API),
`OPENROUTER_API_KEY` (Astra + Jev), `DEVAGENT_PHONE` (where approvals go, iMessage).
Optional: `DEVAGENT_JEV_MIN` (default 0.6), `DEVAGENT_ASTRA_MODEL`.

Replies are read from `~/Library/Messages/chat.db`, so the process needs Full Disk Access.
Worktrees live in `../printat-fixes/<id>`; logs, FIX.md, diff and the three reviews in
`devagent/runs/<id>/`. State is `devagent/state.json`. Both are git-ignored.

Cost per ticket: Claude Code on the Max plan (no API charge), Astra about a dollar, Jev a
fraction of a cent.

## Hosted side

`network/server.js` exposes, behind `x-printat-admin`:

- `GET /api/admin/tickets?status=open`
- `GET /api/admin/tickets/<id>`
- `POST /api/admin/tickets/<id>` `{ status, notes }`
- `POST /api/admin/tickets/<id>/reply` `{ text, subject? }` emails the reporter from print@printat.co

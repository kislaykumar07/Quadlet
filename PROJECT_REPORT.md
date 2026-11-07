# Quadlet — Project Report

**Live:** https://quadlet.vercel.app
**Repo:** https://github.com/kislaykumar07/Quadlet (public, `main`)
**Current version:** 7.0 — 2026-11-07
**GitHub head at time of writing:** `8f6b51d` (v7.0; updated with every push — see the Maintenance section)

> **Maintenance rule:** this report is updated after every change, and pushed with the change. A version is not "done" until this file says what changed.

## What it is

Quadlet is a trip planner built around four AI agents that work in parallel on one trip goal, plus a synthesizer that merges their outputs into a single final plan, plus Mili, a chatbot that answers from the user's actual trips. It is a portfolio project: planning estimates only — nothing books, charges, or takes payment.

- 🧭 **Scout** — Destination Researcher
- 🪙 **Penny** — Budget Planner
- 🗺️ **Atlas** — Itinerary Builder
- 🛡️ **Pax** — Safety & Packing Checker
- 🤖 **Mili** — chatbot (face avatar, grounded answers, local-rule fallback)

## Architecture

### Frontend (`static/`, Gravity-style, dark cinematic)

| File | Role |
|---|---|
| `index.html` | Home — planner form, plan, live agent arena, weather/map |
| `trips.html` | My Trips — saved browser + cloud plans, Compare checkboxes |
| `dashboard.html` | Dashboard — budget bars, donut, per-day spend, timeline, countdown |
| `agents.html` | Agents — the four agents + how synthesis works + Mili intro |
| `style.css` | All shared styles |
| `app.js` | Main logic (97,001 bytes — at the deploy size cap; see Deployment) |
| `ai.js` | v7.0 AI features (talk, vibe, taste, smart packing, route optimizer) |
| `compare.js` | Compare saved trips |
| `nearby-ics.js` | Nearby-places hint + calendar (.ics) export |
| `manifest.json`, `sw.js` | PWA manifest + service worker |
| `icon-192.png`, `icon-512.png` | PWA icons (blue Q + four agent dots) |
| `mili-face.jpg` | Mili's face avatar |

Pages are generated from a shared shell by `build_pages.py` (source of truth lives in `~/workspace/quadlet-gravity/`). One `app.js` loads everywhere with per-page guards. Clean-URL routes `/trips`, `/dashboard`, `/agents`.

### Backend (`app.py`, `data.py` — FastAPI, deployed on Vercel as `quadlet`)

Key endpoints: `POST /api/plan` (streaming NDJSON), `POST /api/mili`, `POST /api/parse-trip`, `POST /api/vibe`, `POST /api/packing`, `GET /api/nearby`, auth (`/api/auth/register|login|me|logout`), trips (`GET/POST /api/trips`, `DELETE /api/trips/{id}`), shares (`POST/DELETE /api/trips/share`, `GET /api/shared/{share_id}`), groups, expenses.

LLM chain (shared helper `_llm_json`, same providers as `/api/mili`): Gemini 3.6-flash → 3.8-flash first, then Groq, then xAI; keys only from env vars. Working config: no `response_format`, `max_tokens` 2048, 25s timeout, defensive content parse, tolerant JSON extraction. Every AI endpoint falls back to honest rules when no provider answers.

Database (Neon Postgres, project `neon-charcoal-planet`): `quadlet_users`, `quadlet_sessions`, `quadlet_trips`, `quadlet_shares`, `quadlet_group_members`, `quadlet_votes`, `quadlet_expenses`. Without `DATABASE_URL`, cloud endpoints honestly return 503 and the site works browser-local.

## Version history

| Version | Date | What changed |
|---|---|---|
| 1.x | 2026-11-01–03 | Gravity shell, destination chooser, agent arena, PDF, packing checklist |
| 2.x | 2026-11-03–04 | Live weather + day-wise map, Mili chatbot (rule-based, then LLM backend) |
| 3.x | 2026-11-04 | Mili face avatar, Muse-style chat, streaming replies, font reshuffle rejected + reverted |
| 4.0–4.3 | 2026-11-04 | Accounts (email+password, PBKDF2, 30-day sessions), Google sign-in, cloud trips, account deletion |
| 4.4–4.6 | 2026-11-04–05 | 6s loader cap, shareable trip links |
| 4.8 | 2026-11-05 | Multi-city routes (simple design) |
| 4.9 | 2026-11-06 | Group trips (full design: votes, equal split, derived view) |
| 5.0 | 2026-11-06 | Expense tracker (full design: who-owes-whom) |
| 5.1–5.2 | 2026-11-06 | Demo-test fixes: map re-framing, honest unpinned stops, Mili fallback fixes |
| 5.3 | 2026-11-07 | Calendar (.ics) export |
| 5.4 | 2026-11-07 | 5 more destinations → 11 researched total |
| 5.5–5.7 | 2026-11-07 | Nearby places via server-side Wikipedia geosearch |
| 5.8 | 2026-11-07 | Destinations preview (first 6 cards/chips, rest behind "Show all") |
| 5.9 | 2026-11-07 | Hero trim |
| 6.0–6.2 | 2026-11-07 | Multi-page split (Home / My Trips / Dashboard / Agents); Dashboard countdown + skeleton-range fixes |
| 6.3 | 2026-11-07 | Scroll cue removed from hero |
| 6.4 | 2026-11-07 | PWA (manifest, service worker, icons) |
| 6.5 | 2026-11-07 | Install button moved into the header, always visible |
| 6.6 | 2026-11-07 | Compare saved trips |
| **7.0** | **2026-11-07** | **AI release — Plan by talking, Taste learning, Vibe search, Smart packing, Route optimizer** |

## Canonical test values (must not regress)

- Goa, 10–14 Dec 2026, 2 travellers, ₹40,000, Comfort → **₹33,491** (Travel ₹12,000 / Stay ₹4,800 / Food ₹10,000 / Activities ₹0 / Local Transport ₹4,500 / Misc ₹2,191; per-day ₹16,538, ₹4,538 ×3, ₹3,339; 84% of budget used)
- Manali 4-day, 20–23 Dec, 2 travellers, ₹30,000 → **₹29,960**
- Jaipur → ₹24,289 / ₹25,000; Bali $1,289 / $800 (honestly still over); Dubai ₹104,860 / ₹40,000 (honestly still over)
- Multi-city Delhi → Jaipur → Agra, 6 days, ₹40,000, Culture → ₹14,980 partial (Jaipur only)
- Group trip Goa ₹48,899 → dolphin trip voted out → ₹46,973, ₹23,486 each
- Expenses: ₹2,000 + ₹1,000 = ₹3,000, ₹1,500 each, friend owes ₹500
- Nearby: Ujjain 7 places (Mahakaleshwar Jyotirlinga 0.8 km first), Orchha 5; Goa has no nearby section
- Map: 10 of 13 Goa stops pin — the honest ceiling (3 stops can't be located, they stay in the plan unpinned)

## Deployment

- **Vercel project:** `quadlet` (`prj_KEBQz0m1EZxGr3g9JXBHqogyAqrX`). Production deploys only (`target: "production"`, `projectSettings.framework: "fastapi"`). Deploy args are rebuilt from the fresh `refs.json` after every upload — reusing old args silently ships the old build.
- **Deploy size cliff:** the upload passes each file as base64 inside one CLI arg (128 KB kernel cap), so **every deploy file must stay under ~95 KB raw**. `app.js` is 97,001 bytes raw (base64 129,336 — only ~1.7 KB headroom). The next JS addition MUST be another module split like `compare.js` / `ai.js`. Always curl-check the live version pill after a deploy; an upload failure means nothing shipped.
- **GitHub:** push after every change (standing rule). Snapshot pushes carry UTF-8 text files only — binary files cannot go through that route. The three binaries (`icon-192.png`, `icon-512.png`, `mili-face.jpg`) were uploaded via the GitHub web UI on 2026-11-07 (commit `8f6b51d`) and are now in the repo.
- **Live check:** after any change, verify on https://quadlet.vercel.app (pill version, Goa ₹33,491, the changed feature).

## Known limits & open items

- Phone-width rendering needs the owner's own check (browser tool can't emulate it) — header, Mili panel, account modal, nav, aiBox/taste chips/vibe cards.
- Full real Google sign-in (session + cloud trips) still unverified — needs the owner's own tap.
- Groq is parked (three keys all returned 403 while the Playground worked — Groq-side permission restriction, not code). Gemini is the live LLM provider.
- In-browser Mili LLM calls are occasionally flaky (API side verified); the local fallback now behaves correctly.
- After a reload, Home shows "No plan yet" — the plan is safe in My Trips, it just isn't re-opened automatically (owner left this as-is, 2026-11-07).
- Unpicked ideas: flight & hotel search links, shareable trip poster.
- No live flight/hotel booking inside Quadlet — deliberate, by design.

## Maintenance

After every change: update this report (version row, canonical values if they moved, open items if they changed), update the README if the feature list or setup changed, push to GitHub, and verify live.

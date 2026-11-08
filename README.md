# Quadlet — Trip Planner

**Live:** https://quadlet.vercel.app
**Repo:** https://github.com/kislaykumar07/Quadlet
**Current version:** 7.2 (2026-11-08)

One trip goal in. Four separate agents work on four different parts of that trip in parallel, then a Synthesizer merges them into one final, ready-to-use trip plan. Mili, the chatbot, answers questions from your actual trips.

## The 4 agents

- 🧭 **Scout — Destination Researcher:** places, hidden gems, best time to visit, local transport, things to avoid
- 🪙 **Penny — Budget Planner:** travel, stay, food, activities, local transport, miscellaneous vs your budget
- 🗺️ **Atlas — Itinerary Builder:** day-wise Morning / Afternoon / Evening plan, max 3 stops a day
- 🛡️ **Pax — Safety & Packing Checker:** weather, safety tips, documents, health notes, grouped packing list

## Features

- **4 pages:** Home (planner + plan + live agent arena + weather/map), My Trips, Dashboard, Agents
- **16 researched destinations** — Goa, Manali, Jaipur, Kerala, Bali, Dubai, Udaipur, Varanasi, Rishikesh, Singapore, Thailand, Shimla, Darjeeling, Amritsar, Hampi, Maldives — with curated data and photos. Any other destination gets a clearly labelled skeleton plan (ranges only, never invented prices)
- **Multi-city routes:** type "Delhi → Jaipur → Agra", days and budget split per city, honest partial totals
- **Group trips:** friends join via the share link, vote 👍/👎 on ticketed activities (an activity drops only when drop votes beat keep votes), total split equally; the group plan is a derived view, the owner's saved plan is never mutated
- **Expense tracker:** add spending on any saved trip, who-owes-whom table, delete by adder or trip owner
- **Compare saved trips:** tick Compare on any two trips for a side-by-side table (cheaper values highlighted)
- **Calendar (.ics) export:** one event per itinerary slot with real dates and times; **PDF** (final plan only); copy/download
- **Live weather** (Open-Meteo, honestly labelled 16-day limit) and a **day-wise Leaflet/OpenStreetMap map** — stops that can't be located stay in the plan unpinned, never faked
- **Nearby places** for unresearched destinations: real places from Wikipedia geosearch (server-side, 10 km, top 8, no prices)
- **PWA:** installable, works offline for the shell; Install button in the header on every page
- **Accounts:** email + password and Google sign-in, cloud trips (Neon Postgres), shareable trip links (public view, unshare stops it)
- **Flights & stays search links (v7.1):** per-city flight + hotel search links, pre-filled from the plan — Google Flights, Skyscanner (needs a home airport, set once in the section), Booking.com, Google Hotels. Outbound links only, opening in a new tab; nothing books inside Quadlet. Airport codes shown for researched destinations (e.g. fly into GOI for Goa)
- **More destinations (v7.2):** 5 new researched destinations — Shimla, Darjeeling, Amritsar, Hampi, Maldives — 16 researched total, each with curated data, photos and airport codes (SLV, IXB, ATQ, HBX, MLE). The destination list/gallery now lives in its own module (`destinations.js`) because `app.js` hit the deploy size cap.
- **AI features (v7.0):** Plan by talking (one sentence fills the form and plans), Taste learning (like/dislike chips shape which activities get picked and cut first), Vibe search (describe a mood, get ranked destinations), Smart packing (extra items from your real forecast + itinerary), Route optimizer (each day's stops reordered by real map distance)
- **Mili:** face-avatar chatbot, answers grounded only in your current plan, saved trips, packing progress, habits and live weather; never invents prices or places; local rules answer when the LLM is offline

## How the synthesizer handles budget conflicts

If the initial estimate is over budget, it first cuts the priciest activities, then steps the stay down one level, then switches food to local-first options. Every cut is listed openly. If it still does not fit after every safe change, it honestly says so and shows the leanest plan plus the overage — it never fakes a fit. If one agent fails, the other three still complete and the missing section is noted.

## Tech stack

- **Backend:** FastAPI (Python) — `app.py` / `data.py`, streaming plan endpoint, SQLite-free cloud persistence via Neon Postgres
- **Frontend:** static Gravity-style pages (`static/`) — Three.js gravity-field spheres, scroll physics, palette morph, one shared `app.js` plus small modules (`ai.js`, `compare.js`, `nearby-ics.js`, `travel-links.js`, `destinations.js`)
- **Hosting:** Vercel (project `quadlet`)
- **LLM:** Gemini first (3.6-flash, then 3.8-flash), then Groq, then xAI — keys only from environment variables, never stored; every AI endpoint falls back to honest rules when no provider answers
- **Maps & weather:** Leaflet + OpenStreetMap/Nominatim, Open-Meteo

## Run locally in 3 steps

1. `pip install -r requirements.txt`
2. `uvicorn app:app --port 8000`
3. Open http://localhost:8000

Optional environment variables (all read from the environment only, never from users, never stored in the repo):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | LLM for Mili and the AI features (first provider tried) |
| `GROQ_API_KEY` | Fallback LLM provider |
| `GROK_API_KEY` / `XAI_API_KEY` | xAI provider (a `gsk_` value routes to Groq instead) |
| `DATABASE_URL` | Neon Postgres for accounts, cloud trips, groups, expenses. Without it, cloud endpoints honestly return 503 and the site works browser-local |
| `GOOGLE_CLIENT_ID` | Google sign-in client (defaults to the shared "ExpiryEye Web" client) |

## Smoke test

`python tests/smoke_test.py` checks: Goa on ₹40,000 fits, Dubai on ₹40,000 takes the honest over-budget path, an unknown destination gives a labelled skeleton plan, and one failed agent does not stop the other three.

## Data and honest limits

Curated researched data for the 16 destinations is in `data.py`. All prices are planning estimates, not live bookable prices. Nothing here books or charges anything — there is deliberately no live flight/hotel booking inside Quadlet. Destinations outside the researched set get a skeleton plan with ranges only.

## Project report

See [PROJECT_REPORT.md](PROJECT_REPORT.md) — version history, architecture, canonical test values, deployment notes and open items. It is updated after every change.

# Quadlet Trip Planner

Live: https://quadlet.vercel.app

One trip goal in. Four separate agents work on four different parts of that trip in parallel, then a Synthesizer merges them into one final, ready-to-use trip plan.

## The 4 agents

- **Destination Researcher** — places, hidden gems, best time, local transport, things to avoid
- **Budget Planner** — travel, stay, food, activities, local transport, miscellaneous vs your budget
- **Itinerary Builder** — day-wise Morning / Afternoon / Evening plan, max 3 stops a day
- **Safety & Packing Checker** — weather, safety tips, documents, health notes, grouped packing list

## How the synthesizer handles budget conflicts

If the initial estimate is over budget, it first cuts the priciest activities, then steps the stay down one level, then switches food to local-first options. Every cut is listed openly. If it still does not fit after every safe change, it honestly says so and shows the leanest plan plus the overage — it never fakes a fit. If one agent fails, the other three still complete and the missing section is noted.

## Frontend

`static/index.html` is a single-file Gravity-style frontend: Three.js gravity-field spheres, scroll physics, palette morph, Studio Controls drawer, live Agent Arena with Thought → Action → Observation logs, final plan, and an anime.js dashboard with budget bars, per-day spend graph, daily timeline, and a trip countdown timer.

## Run locally in 3 steps

1. `pip install -r requirements.txt`
2. `uvicorn app:app --port 8000`
3. Open http://localhost:8000

Optional wording polish: set `GROQ_API_KEY` or `OPENAI_API_KEY` in your environment before step 2. Structure, budget math, and conflict rules never change, and keys are read from the environment only, never accepted from users or stored.

## Smoke test

`python tests/smoke_test.py` checks: Goa on ₹40,000 fits, Dubai on ₹40,000 takes the honest over-budget path, an unknown destination gives a labelled Skeleton Plan, and one failed agent does not stop the other three.

## Data and honest limits

Curated researched data for Goa, Manali, Jaipur, Kerala, Bali, Dubai is in `data.py`. Any other destination gets a clearly labelled Skeleton Plan — no invented places or prices. All prices are planning estimates, not live bookable prices. Nothing here books or charges anything.

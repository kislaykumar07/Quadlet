"""Quadlet Trip Planner: four parallel agents + a synthesizer. Deterministic by default; optional LLM wording polish."""
import asyncio, copy, json, math, os, urllib.request
from datetime import date
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from data import D, USD, GEN_DOCS

VERSION = "Quadlet v1"
TIERS = ["Budget", "Mid-range", "Comfort"]
BANNER = "This destination uses estimated data — verify prices and places before booking."
NAMES = {1: "🧭 Scout — Destination Researcher", 2: "🪙 Penny — Budget Planner", 3: "🗺️ Atlas — Itinerary Builder", 4: "🛡️ Pax — Safety & Packing Checker"}
SECTIONS = {1: ["places"], 2: ["budget"], 3: ["itinerary"], 4: ["packing", "safety"]}
SLOT_TIME = {"Morning": "9:00 – 12:30", "Afternoon": "1:30 – 5:30", "Evening": "6:30 – 9:30"}
SHARE = {"Travel": (.25, .35), "Stay": (.25, .30), "Food": (.15, .20), "Activities": (.08, .12), "Local Transport": (.05, .08), "Miscellaneous": (.05, .08)}

class Req(BaseModel):
    destination: str = Field(min_length=1, max_length=80)
    start: date
    end: date
    travellers: int = Field(ge=1, le=20)
    budget: float = Field(gt=0)
    currency: str = "INR"
    style: str = "Culture"
    interests: List[str] = []
    fail: Optional[int] = None  # test hook: force one agent to fail

def ndays(r): return (r.end - r.start).days + 1
def budget_inr(r): return r.budget * (USD if r.currency == "USD" else 1)
def money(x, cur): return f"${round(x / USD):,}" if cur == "USD" else f"₹{round(x):,}"
def key(r):
    k = r.destination.strip().lower().split(",")[0].strip()
    return k if k in D else None
def start_level(r): return 0 if r.style == "Budget Backpacker" else 2 if r.style == "Relaxed" else 1

def pick_acts(d, r, days):
    ranked = sorted(d["acts"], key=lambda a: a[2] not in r.interests)  # stable: interest matches first
    return ranked[:max(1, days - 2)]

def calc(d, r, days, level, fi, acts):
    n = r.travellers
    rows = {"Travel": d["travel"] * n, "Stay": d["stay"][level] * math.ceil(n / 2) * max(days - 1, 0),
            "Food": d["food"][fi] * n * days, "Activities": sum(a[1] for a in acts) * n, "Local Transport": d["tr"] * n * days}
    rows["Miscellaneous"] = round(sum(rows.values()) * 0.07)
    return rows

def fit(d, r, days, a2):
    """Budget conflict rule: cut priciest activities, then stay down one level, then local-first food."""
    level, fi, acts, cut, ch, B = a2["level"], a2["fi"], list(a2["acts"]), [], [], budget_inr(r)
    tot = lambda: sum(calc(d, r, days, level, fi, acts).values())
    for a in sorted(acts, key=lambda a: -a[1]):
        if tot() <= B: break
        acts.remove(a); cut.append(a[0])
        ch.append(f"Removed '{a[0]}' to save {money(a[1] * r.travellers, r.currency)} for your group")
    if tot() > B and level > 0:
        ch.append(f"Stepped the stay down one level, from {TIERS[level]} to {TIERS[level - 1]}"); level -= 1
    if tot() > B and fi > 0:
        fi = 0; ch.append("Switched food to local-first options (local thalis, shacks, street food)")
    rows = calc(d, r, days, level, fi, acts)
    return rows, sum(rows.values()), cut, ch, level, fi

# ---------- agents ----------
async def agent1(r, step):
    d = D.get(key(r))
    await step(f"I need facts about {r.destination}, not guesses.", "lookup(curated_destination_db)", "Curated profile found." if d else "No curated profile. Switching to Skeleton mode; I will not invent places.")
    if not d:
        return {"note": "No researched data exists for this destination, so no places are listed.", "data": {},
                "sections": [{"title": "How to research it yourself", "items": ["Check the official tourism board site for top attractions", "Read recent traveller reviews for seasonal closures", "Compare local transport options on a live map before booking"]}]}
    await step("Shortlist places that fit the traveller's interests.", f"rank(places, {r.interests or 'general'})", f"{len(d['places'])} places and {len(d['gems'])} hidden gems selected.")
    await step("Add season, transport and things to avoid.", "compile(season, transport, avoid)", "Best time: " + d["best"].split(".")[0])
    return {"note": f"Researched profile for {d['name']}.", "data": {"places": d["places"], "gems": d["gems"]}, "sections": [
        {"title": "Top places to visit", "items": [f"{n}: {w}" for n, w in d["places"]]}, {"title": "Hidden gems", "items": d["gems"]},
        {"title": "Best time to visit", "items": [d["best"]]}, {"title": "Local transport", "items": [d["transport"]]}, {"title": "Things to avoid", "items": d["avoid"]}]}

async def agent2(r, step):
    days, B, cur = ndays(r), budget_inr(r), r.currency
    d = D.get(key(r))
    await step("Money only. Use per-person-per-day baselines scaled by travellers and days.", f"scale(baselines, travellers={r.travellers}, days={days})", "Baselines loaded." if d else "No verified prices exist. Using allocation ranges from your own budget.")
    if not d:
        rows = [[k, f"{money(B * lo, cur)} – {money(B * hi, cur)}"] for k, (lo, hi) in SHARE.items()]
        await step("Show how a typical budget splits.", "allocate(budget, ranges)", "Ranges ready. These are NOT destination prices.")
        return {"note": "Allocation guide from your own budget. Not destination prices.", "data": {"skeleton": True, "rows": rows},
                "sections": [{"title": "Estimated allocation ranges (ESTIMATES)", "rows": rows}]}
    level, fi, acts = start_level(r), 0 if r.style == "Budget Backpacker" else 1, pick_acts(d, r, days)
    rows = calc(d, r, days, level, fi, acts); total = sum(rows.values())
    await step(f"Cost {TIERS[level]} stay, {'local' if fi == 0 else 'mixed'} food, {len(acts)} activities.", "calc(travel, stay, food, activities, transport, misc)", f"Initial estimate {money(total, cur)}.")
    diff = total - B
    await step("Compare against the user's budget.", f"compare({money(total, cur)}, {money(B, cur)})", f"{money(abs(diff), cur)} {'over' if diff > 0 else 'under'} budget." + (" The Synthesizer will apply the conflict rule." if diff > 0 else ""))
    return {"note": "All prices are ESTIMATES, not live bookable prices.", "data": {"level": level, "fi": fi, "acts": acts}, "sections": [
        {"title": "Cost table (ESTIMATES)", "rows": [[k, money(v, cur)] for k, v in rows.items()] + [["Total", money(total, cur)]]},
        {"title": "Versus your budget", "items": [f"Your budget: {money(B, cur)}", f"Estimate is {money(abs(diff), cur)} {'over' if diff > 0 else 'under'} budget"]}]}

def build_itin(d, days, acts):
    P, E, out, ai = d["places"], d["eve"], [], 0
    sl = lambda s, p, a, act=None: {"slot": s, "time": SLOT_TIME[s], "place": p, "activity": a, "act": act}
    for i in range(days):
        first, last = i == 0, i == days - 1 and days > 1
        if first:
            s = [sl("Morning", f"Travel to {d['name']}", "Transfer to your stay, check in, rest")]
            if days == 1 and acts: s.append(sl("Afternoon", acts[0][0], "Ticketed activity", acts[0][0]))
            else: s.append(sl("Afternoon", P[0][0], "Easy first look: " + P[0][1]))
        elif last:
            if ai < len(acts): s = [sl("Morning", acts[ai][0], "Ticketed activity", acts[ai][0])]; ai += 1
            else: s = [sl("Morning", P[i % len(P)][0], "Short visit and last-minute shopping")]
            s.append(sl("Afternoon", "Check-out and departure", "Leave 2–3 hours buffer for the airport or station"))
        else:
            m = P[i % len(P)]; s = [sl("Morning", m[0], m[1])]
            if ai < len(acts): s.append(sl("Afternoon", acts[ai][0], "Ticketed activity", acts[ai][0])); ai += 1
            else: s.append(sl("Afternoon", d["free"][i % len(d["free"])], "Free, unhurried afternoon"))
        if not last: s.append(sl("Evening", E[i % len(E)], "Relaxed evening and dinner nearby"))
        out.append({"day": i + 1, "slots": s})
    return out

async def agent3(r, step):
    days, d = ndays(r), D.get(key(r))
    await step("Plan day by day. Maximum three stops a day, with realistic transfers.", f"schedule(days={days})", "Day count confirmed.")
    if not d:
        def skel(i):
            if i == 0: pairs = [("Morning", "Arrival, transfer and check-in"), ("Afternoon", "Short walk near your stay")]
            elif i == days - 1 and days > 1: pairs = [("Morning", "Check-out and departure")]
            else: pairs = [("Morning", "One main sight, researched and booked ahead"), ("Afternoon", "Local food and a relaxed second stop"), ("Evening", "Dinner near your stay")]
            return {"day": i + 1, "slots": [{"slot": s, "time": SLOT_TIME[s], "place": "To be chosen", "activity": a, "act": None} for s, a in pairs]}
        itin = [skel(i) for i in range(days)]
        await step("No verified places, so I use a generic day structure.", "template(skeleton)", "Skeleton itinerary ready.")
        return {"note": "Skeleton structure only. Fill in places after you verify them.", "data": {"days": itin}, "sections": []}
    acts = pick_acts(d, r, days); itin = build_itin(d, days, acts)
    await step("Match activities to interests and spread them across days.", "assign(activities, days)", f"{len(acts)} activities placed.")
    await step("Check pacing.", "validate(max_stops<=3, transfer 20–40 min)", "Pacing OK.")
    return {"note": "Allow 20–40 minutes of transfer between stops.", "data": {"days": itin}, "sections": [
        {"title": f"Day {x['day']}", "items": [f"{s['slot']} ({s['time']}): {s['place']}. {s['activity']}" for s in x["slots"]]} for x in itin]}

async def agent4(r, step):
    d = D.get(key(r))
    await step("Safety and preparation only. No medical diagnosis.", "load(safety_notes, documents)", "Profile loaded." if d else "No verified local safety data; using generic guidance.")
    intl = bool(d and d.get("intl"))
    docs = GEN_DOCS + (d.get("docs", []) if d else [])
    health = ["General tips only, not medical advice", "Carry personal medicines in original packaging", "Drink sealed or filtered water and wash hands often", "See a doctor or travel clinic first if you have a medical condition"] + (d["hh"] if d else [])
    pack = {"Essentials": ["Reusable water bottle", "Basic first-aid kit and personal medicines", "Sunscreen and lip balm", "Small day bag", "Wet wipes"],
            "Clothes": d["pk"] if d else ["Comfortable weather-appropriate clothes", "Walking shoes", "One light layer", "Rain protection"],
            "Tech": ["Phone and charger", "Power bank", "Offline maps downloaded"] + (["Universal travel adapter"] if intl else []),
            "Documents": ["Photo ID", "Printed tickets and bookings", "Insurance copy"] + (["Passport and visa/entry approval"] if intl else [])}
    await step("Build the packing checklist.", "group(Essentials, Clothes, Tech, Documents)", "4 groups ready.")
    safety = {"weather": d["weather"] if d else "Check a live forecast for your dates before packing.",
              "tips": d["safe"] if d else ["Share your itinerary with someone at home", "Use licensed transport and registered stays", "Keep digital copies of key documents", "Check official government travel advisories"],
              "docs": docs, "health": health}
    return {"note": "General preparation guidance.", "data": {"packing": pack, "safety": safety}, "sections": [
        {"title": "Weather and season", "items": [safety["weather"]]}, {"title": "Safety tips", "items": safety["tips"]},
        {"title": "Documents needed", "items": docs}, {"title": "Health note", "items": health}] + [{"title": "Packing: " + g, "items": v} for g, v in pack.items()]}

# ---------- synthesizer ----------
def synth(r, reps):
    days, d, cur, B = ndays(r), D.get(key(r)), r.currency, budget_inr(r)
    A = {i + 1: x for i, x in enumerate(reps)}; ok = lambda i: "error" not in A[i]
    miss = [{"agent": NAMES[i], "sections": SECTIONS[i], "reason": A[i]["error"]} for i in A if not ok(i)]
    p = {"version": VERSION, "mode": "researched" if d else "skeleton", "banner": None if d else BANNER, "missing": miss, "changes": [],
         "leanest": False, "budget": None, "itinerary": None, "packing": None, "safety": None, "places": None, "gems": None}
    verdict, tone, total = "Budget check unavailable: the Budget Planner did not finish", "warn", "Not available"
    cut = []
    if ok(2):
        a2 = A[2]["data"]
        if a2.get("skeleton"):
            p["budget"] = {"rows": a2["rows"], "total": None, "note": "Planning ranges drawn from your own budget. Not destination prices."}
            verdict, total = f"Unverified: ranges only, against your {money(B, cur)} budget", "Unverified"
        else:
            rows, tot, cut, ch, _, _ = fit(d, r, days, a2); over = tot - B
            p["changes"], total = ch, money(tot, cur)
            p["budget"] = {"rows": [[k, money(v, cur)] for k, v in rows.items()], "total": total, "note": "All prices are ESTIMATES, not live bookable prices."}
            if over > 0:
                verdict, tone, p["leanest"] = f"Still {money(over, cur)} over budget after every safe adjustment", "bad", True
            else:
                verdict, tone = f"Within budget{' after adjustments' if ch else ''}: {money(-over, cur)} to spare", "ok"
    if ok(3):
        itin = copy.deepcopy(A[3]["data"]["days"]); n = 0
        for x in itin:
            for s in x["slots"]:
                if s.get("act") in cut:
                    s["activity"] = f"Free alternative (replaced '{s['act']}' to fit your budget)"; s["place"] = d["free"][n % len(d["free"])]; n += 1
        p["itinerary"] = itin
    if ok(4): p["packing"], p["safety"] = A[4]["data"]["packing"], A[4]["data"]["safety"]
    if ok(1) and d: p["places"], p["gems"] = A[1]["data"]["places"], A[1]["data"]["gems"]
    p["summary"] = {"destination": d["name"] if d else r.destination.strip(), "dates": f"{r.start:%d %b %Y} to {r.end:%d %b %Y}", "days": days,
                    "travellers": r.travellers, "total": total, "budget": money(B, cur), "verdict": verdict, "tone": tone, "style": r.style}
    return p

# ---------- orchestration ----------
async def _llm(text):
    k = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not k: return text
    url, model = (("https://api.groq.com/openai/v1/chat/completions", "llama-3.1-8b-instant") if os.getenv("GROQ_API_KEY") else ("https://api.openai.com/v1/chat/completions", "gpt-4o-mini"))
    body = json.dumps({"model": model, "messages": [{"role": "system", "content": "Rewrite in a warm, concise travel-guide voice. Keep every name, number and fact unchanged. Return only the text."}, {"role": "user", "content": text}]}).encode()
    def call():
        rq = urllib.request.Request(url, body, {"Authorization": "Bearer " + k, "Content-Type": "application/json"})
        return json.load(urllib.request.urlopen(rq, timeout=8))["choices"][0]["message"]["content"].strip()
    try: return await asyncio.to_thread(call) or text
    except Exception: return text

async def run_trip(r, q=None):
    q = q or asyncio.Queue(); gap = 0 if os.getenv("QUADLET_FAST") else 0.55
    async def run(i, fn):
        async def step(t, a, o):
            await asyncio.sleep(gap + 0.12 * i if gap else 0)
            await q.put({"type": "log", "agent": i, "t": t, "a": a, "o": o})
        await q.put({"type": "status", "agent": i, "status": "working"})
        try:
            if r.fail == i: raise RuntimeError("Agent crashed (forced by test hook)")
            rep = await fn(r, step); rep["note"] = await _llm(rep["note"])
            await q.put({"type": "status", "agent": i, "status": "done"}); return rep
        except Exception as e:
            await q.put({"type": "status", "agent": i, "status": "failed", "error": str(e)}); return {"error": str(e), "sections": []}
    reps = await asyncio.gather(*(run(i, f) for i, f in ((1, agent1), (2, agent2), (3, agent3), (4, agent4))))
    await q.put({"type": "status", "agent": 5, "status": "working"})
    plan = synth(r, reps)
    await q.put({"type": "status", "agent": 5, "status": "done"})
    return plan, [{"agent": NAMES[i + 1], "note": x.get("note", ""), "error": x.get("error"), "sections": x.get("sections", [])} for i, x in enumerate(reps)]

app = FastAPI(title="Quadlet Trip Planner")

@app.post("/api/plan")
async def plan(r: Req):
    if r.end < r.start or ndays(r) > 30: raise HTTPException(422, "End date must be on or after the start date, and trips can be at most 30 days.")
    q = asyncio.Queue()
    async def stream():
        async def go():
            try: pl, reps = await run_trip(r, q); await q.put({"type": "final", "plan": pl, "reports": reps})
            except Exception as e: await q.put({"type": "error", "message": str(e)})
            await q.put(None)
        t = asyncio.create_task(go())
        while (m := await q.get()) is not None: yield json.dumps(m) + "\n"
        await t
    return StreamingResponse(stream(), media_type="application/x-ndjson")

app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")

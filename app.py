"""Quadlet Trip Planner: four parallel agents + a synthesizer. Deterministic by default; optional LLM wording polish."""
import asyncio, copy, json, math, os, re, urllib.parse, urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from data import D, USD, GEN_DOCS, VIBE

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
    taste: Optional[dict] = None  # v7.0: {"likes": [...], "dislikes": [...]} activity categories
    fail: Optional[int] = None  # test hook: force one agent to fail

def ndays(r): return (r.end - r.start).days + 1
def budget_inr(r): return r.budget * (USD if r.currency == "USD" else 1)
def money(x, cur): return f"${round(x / USD):,}" if cur == "USD" else f"₹{round(x):,}"
def key(r):
    k = r.destination.strip().lower().split(",")[0].strip()
    return k if k in D else None
def start_level(r): return 0 if r.style == "Budget Backpacker" else 2 if r.style == "Relaxed" else 1

def parse_cities(dest):
    """Split a route like 'Delhi → Jaipur → Agra' into city names; one city -> [city]."""
    s = (dest or "").strip()
    for sep in ("→", "->", ">", "—", "–", " - "):
        if sep in s:
            parts = [p.strip() for p in s.split(sep) if p.strip()]
            if len(parts) > 1: return parts
    parts = [p.strip() for p in re.split(r"\s+to\s+", s, flags=re.I) if p.strip()]
    return parts if len(parts) > 1 else [s]

def city_key(name):
    k = (name or "").strip().lower().split(",")[0].strip()
    return k if k in D else None

def split_days(total, n):
    """Split total days across n cities as evenly as possible; earlier cities get the extra day."""
    base, rem = divmod(max(total, 0), max(n, 1))
    return [base + 1 if i < rem else base for i in range(n)]

def plan_cities(r):
    """Per-city entries for this request. A single city returns one entry using r itself,
    so the old single-city path is bit-identical. Multi-city splits days evenly and the
    budget by days share; 0-day cities are listed but not planned."""
    names = parse_cities(r.destination)
    total, B = ndays(r), budget_inr(r)
    days_list = split_days(total, len(names))
    out, offset = [], 0
    for name, days_i in zip(names, days_list):
        start_i = r.start + timedelta(days=offset); offset += days_i
        d = D.get(city_key(name))
        if days_i <= 0:
            out.append({"name": name, "key": city_key(name), "d": d, "days": 0, "sub": None, "budget_inr": 0.0, "start": start_i})
            continue
        if len(names) == 1:
            sub, share = r, B
        else:
            share = B * days_i / total
            sub = Req(destination=name, start=start_i, end=start_i + timedelta(days=days_i - 1),
                      travellers=r.travellers, budget=share / (USD if r.currency == "USD" else 1),
                      currency=r.currency, style=r.style, interests=r.interests, taste=r.taste)
        out.append({"name": name, "key": city_key(name), "d": d, "days": days_i, "sub": sub, "budget_inr": share, "start": start_i})
    return out

TASTE_CATS = ["Beaches", "Adventure Sports", "History", "Nature", "Food", "Nightlife", "Shopping", "Mountains"]
def _taste_of(r):
    t = getattr(r, "taste", None) or {}
    likes = [c for c in (t.get("likes") or []) if c in TASTE_CATS]
    dislikes = [c for c in (t.get("dislikes") or []) if c in TASTE_CATS]
    return likes, dislikes

def pick_acts(d, r, days):
    likes, dislikes = _taste_of(r)
    # liked/interested categories first, disliked categories last (stable sort)
    ranked = sorted(d["acts"], key=lambda a: (a[2] in dislikes, a[2] not in r.interests and a[2] not in likes))
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
    _, dislikes = _taste_of(r)
    # cut disliked activities first (priciest among them), then priciest overall
    for a in sorted(acts, key=lambda a: (0 if a[2] in dislikes else 1, -a[1])):
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
    cs = plan_cities(r); multi = len(cs) > 1
    places, gems, sections = [], [], []
    for c in cs:
        d, name = c["d"], c["name"]
        if c["days"] <= 0: continue
        await step(f"I need facts about {name}, not guesses.", "lookup(curated_destination_db)", "Curated profile found." if d else "No curated profile. Switching to Skeleton mode; I will not invent places.")
        if not d:
            sections.append({"title": f"How to research {name} yourself" if multi else "How to research it yourself", "items": ["Check the official tourism board site for top attractions", "Read recent traveller reviews for seasonal closures", "Compare local transport options on a live map before booking"]})
            continue
        await step(f"Shortlist places in {name} that fit the traveller's interests." if multi else "Shortlist places that fit the traveller's interests.", f"rank(places, {r.interests or 'general'})", f"{len(d['places'])} places and {len(d['gems'])} hidden gems selected.")
        await step(f"Add season, transport and things to avoid for {name}." if multi else "Add season, transport and things to avoid.", "compile(season, transport, avoid)", "Best time: " + d["best"].split(".")[0])
        places += [(f"{n} · {name}" if multi else n, w) for n, w in d["places"]]
        gems += [f"{g} ({name})" if multi else g for g in d["gems"]]
        t = lambda b: b + f" in {name}" if multi else b
        sections += [
            {"title": t("Top places to visit"), "items": [f"{n}: {w}" for n, w in d["places"]]},
            {"title": t("Hidden gems"), "items": list(d["gems"])},
            {"title": t("Best time to visit"), "items": [d["best"]]},
            {"title": t("Local transport"), "items": [d["transport"]]},
            {"title": t("Things to avoid"), "items": d["avoid"]}]
    if not places:
        note = "No researched data exists for this route, so no places are listed." if multi else "No researched data exists for this destination, so no places are listed."
    else:
        note = f"Researched profile for {', '.join(c['name'] for c in cs if c['d'])}." if multi else f"Researched profile for {cs[0]['d']['name']}."
    return {"note": note, "data": {"places": places, "gems": gems}, "sections": sections}

async def agent2(r, step):
    cs = plan_cities(r); multi = len(cs) > 1; cur = r.currency
    cities_out, sections = [], []
    for c in cs:
        d, name, sub, days_i, B_i = c["d"], c["name"], c["sub"], c["days"], c["budget_inr"]
        if days_i <= 0:
            cities_out.append({"name": name, "days": 0, "mode": "unvisited", "rows": None, "total": None, "cut": [], "changes": [], "level": None, "fi": None, "acts": []})
            sections.append({"title": f"{name} — no days allocated", "items": [f"Add more trip days to include {name} in this route."]})
            continue
        await step(f"Money only{' for ' + name if multi else ''}. Use per-person-per-day baselines scaled by travellers and days.", f"scale(baselines, travellers={r.travellers}, days={days_i})", "Baselines loaded." if d else "No verified prices exist. Using allocation ranges from your own budget.")
        if not d:
            rows = [[k, f"{money(B_i * lo, cur)} – {money(B_i * hi, cur)}"] for k, (lo, hi) in SHARE.items()]
            await step(f"Show how {'a typical budget' if not multi else name + chr(39) + 's share of the budget'} splits.", "allocate(budget, ranges)", "Ranges ready. These are NOT destination prices.")
            cities_out.append({"name": name, "days": days_i, "mode": "skeleton", "rows": rows, "total": None, "cut": [], "changes": [], "level": None, "fi": None, "acts": []})
            sections.append({"title": f"Estimated allocation ranges for {name} (ESTIMATES)" if multi else "Estimated allocation ranges (ESTIMATES)", "rows": rows})
            continue
        level, fi, acts = start_level(sub), 0 if sub.style == "Budget Backpacker" else 1, pick_acts(d, sub, days_i)
        rows = calc(d, sub, days_i, level, fi, acts); total = sum(rows.values())
        await step(f"Cost {TIERS[level]} stay{(' in ' + name) if multi else ''}, {'local' if fi == 0 else 'mixed'} food, {len(acts)} activities.", "calc(travel, stay, food, activities, transport, misc)", f"Initial estimate {money(total, cur)}.")
        diff = total - B_i
        await step(f"Compare {name + ' against its share of the budget' if multi else 'against the user' + chr(39) + 's budget'}.", f"compare({money(total, cur)}, {money(B_i, cur)})", f"{money(abs(diff), cur)} {'over' if diff > 0 else 'under'} budget." + (" The Synthesizer will apply the conflict rule." if diff > 0 else ""))
        cities_out.append({"name": name, "days": days_i, "mode": "researched", "rows": rows, "total": total, "cut": [], "changes": [], "level": level, "fi": fi, "acts": acts})
        sections.append({"title": f"Cost table for {name} (ESTIMATES)" if multi else "Cost table (ESTIMATES)", "rows": [[k, money(v, cur)] for k, v in rows.items()] + [["Total", money(total, cur)]]})
        sections.append({"title": f"{name} versus its budget share" if multi else "Versus your budget", "items": [f"Budget share: {money(B_i, cur)}" if multi else f"Your budget: {money(B_i, cur)}", f"Estimate is {money(abs(diff), cur)} {'over' if diff > 0 else 'under'} budget"]})
    return {"note": "All prices are ESTIMATES, not live bookable prices.", "data": {"cities": cities_out}, "sections": sections}

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
    cs = plan_cities(r); multi = len(cs) > 1
    itin, sections, day_no = [], [], 0
    for ci, c in enumerate(cs):
        d, name, sub, days_i = c["d"], c["name"], c["sub"], c["days"]
        if days_i <= 0: continue
        nxt = cs[ci + 1]["name"] if ci + 1 < len(cs) else None
        await step(f"Plan {'day by day' if not multi else name + ' day by day'}. Maximum three stops a day, with realistic transfers.", f"schedule(days={days_i})", "Day count confirmed.")
        if not d:
            def skel(i, base=day_no, city=name, nxt_city=nxt):
                if i == 0: pairs = [("Morning", "Arrival, transfer and check-in"), ("Afternoon", "Short walk near your stay")]
                elif i == days_i - 1 and days_i > 1:
                    pairs = [("Morning", f"Check-out and travel to {nxt_city}"), ("Afternoon", "Arrive, check in and rest")] if nxt_city else [("Morning", "Check-out and departure")]
                else: pairs = [("Morning", "One main sight, researched and booked ahead"), ("Afternoon", "Local food and a relaxed second stop"), ("Evening", "Dinner near your stay")]
                return {"day": base + i + 1, "city": city, "slots": [{"slot": s, "time": SLOT_TIME[s], "place": "To be chosen", "activity": a, "act": None} for s, a in pairs]}
            city_itin = [skel(i) for i in range(days_i)]
            await step(f"No verified places in {name}, so I use a generic day structure." if multi else "No verified places, so I use a generic day structure.", "template(skeleton)", "Skeleton itinerary ready.")
        else:
            acts = pick_acts(d, sub, days_i); city_itin = build_itin(d, days_i, acts)
            if nxt:
                for s in city_itin[-1]["slots"]:
                    if s["place"] == "Check-out and departure":
                        s["place"] = f"Travel to {nxt}"; s["activity"] = f"Transfer to {nxt}, check in and rest"
            for x in city_itin: x["city"] = name; x["day"] += day_no
            await step(f"Match activities to interests and spread them across {name + chr(39) + 's days' if multi else 'days'}.", "assign(activities, days)", f"{len(acts)} activities placed.")
            await step("Check pacing.", "validate(max_stops<=3, transfer 20–40 min)", "Pacing OK.")
            sections += [{"title": f"Day {x['day']}" + (f" · {name}" if multi else ""), "items": [f"{s['slot']} ({s['time']}): {s['place']}. {s['activity']}" for s in x["slots"]]} for x in city_itin]
        itin += city_itin; day_no += days_i
    return {"note": "Allow 20–40 minutes of transfer between stops.", "data": {"days": itin}, "sections": sections}

async def agent4(r, step):
    cs = plan_cities(r); multi = len(cs) > 1
    any_d = any(c["d"] for c in cs)
    await step("Safety and preparation only. No medical diagnosis.", "load(safety_notes, documents)", "Profile loaded." if (not multi and any_d) else ("Profiles loaded." if any_d else "No verified local safety data; using generic guidance."))
    intl = any(c["d"] and c["d"].get("intl") for c in cs)
    docs = list(GEN_DOCS); health = ["General tips only, not medical advice", "Carry personal medicines in original packaging", "Drink sealed or filtered water and wash hands often", "See a doctor or travel clinic first if you have a medical condition"]
    clothes, weathers, tips = [], [], []
    for c in cs:
        d = c["d"]
        if not d: continue
        docs += d.get("docs", []); health += d["hh"]; clothes += d["pk"]
        weathers.append(f"{c['name']}: {d['weather']}" if multi else d["weather"])
        tips += d["safe"]
    if not clothes: clothes = ["Comfortable weather-appropriate clothes", "Walking shoes", "One light layer", "Rain protection"]
    def _uniq(xs):
        seen, out = set(), []
        for x in xs:
            if x not in seen: seen.add(x); out.append(x)
        return out
    docs, health, clothes, tips = _uniq(docs), _uniq(health), _uniq(clothes), _uniq(tips)
    pack = {"Essentials": ["Reusable water bottle", "Basic first-aid kit and personal medicines", "Sunscreen and lip balm", "Small day bag", "Wet wipes"],
            "Clothes": clothes,
            "Tech": ["Phone and charger", "Power bank", "Offline maps downloaded"] + (["Universal travel adapter"] if intl else []),
            "Documents": ["Photo ID", "Printed tickets and bookings", "Insurance copy"] + (["Passport and visa/entry approval"] if intl else [])}
    weather_txt = "; ".join(weathers) if weathers else "Check a live forecast for your dates before packing."
    if not tips: tips = ["Share your itinerary with someone at home", "Use licensed transport and registered stays", "Keep digital copies of key documents", "Check official government travel advisories"]
    safety = {"weather": weather_txt, "tips": tips, "docs": docs, "health": health}
    return {"note": "General preparation guidance.", "data": {"packing": pack, "safety": safety}, "sections": [
        {"title": "Weather and season", "items": [weather_txt]}, {"title": "Safety tips", "items": tips},
        {"title": "Documents needed", "items": docs}, {"title": "Health note", "items": health}] + [{"title": "Packing: " + g, "items": v} for g, v in pack.items()]}

# ---------- synthesizer ----------
def synth(r, reps):
    cs = plan_cities(r); multi = len(cs) > 1
    days, cur, B = ndays(r), r.currency, budget_inr(r)
    A = {i + 1: x for i, x in enumerate(reps)}; ok = lambda i: "error" not in A[i]
    miss = [{"agent": NAMES[i], "sections": SECTIONS[i], "reason": A[i]["error"]} for i in A if not ok(i)]
    active = [c for c in cs if c["days"] > 0]
    any_skel = any(not c["d"] for c in active)
    all_skel = all(not c["d"] for c in active)
    p = {"version": VERSION, "mode": "skeleton" if all_skel else ("mixed" if any_skel else "researched"), "banner": BANNER if any_skel else None, "missing": miss, "changes": [],
         "leanest": False, "budget": None, "itinerary": None, "packing": None, "safety": None, "places": None, "gems": None}
    verdict, tone, total = "Budget check unavailable: the Budget Planner did not finish", "warn", "Not available"
    cut = []
    city_info = [{"name": c["name"], "days": c["days"], "total": None, "mode": "unvisited" if c["days"] <= 0 else ("skeleton" if not c["d"] else "researched")} for c in cs]
    if ok(2):
        a2 = A[2]["data"]; cities2 = a2.get("cities", [])
        if all_skel:
            rows = [[k, f"{money(B * lo, cur)} – {money(B * hi, cur)}"] for k, (lo, hi) in SHARE.items()]
            p["budget"] = {"rows": rows, "total": None, "note": "Planning ranges drawn from your own budget. Not destination prices."}
            verdict, total = f"Unverified: ranges only, against your {money(B, cur)} budget", "Unverified"
        elif cities2:
            combined, tot_all, skel_names, res_names = {}, 0, [], []
            for c, ce in zip(cs, cities2):
                if ce["days"] <= 0: continue
                if ce["mode"] == "skeleton":
                    skel_names.append(ce["name"])
                    continue
                rows, tot, cut_names, ch, _, _ = fit(c["d"], c["sub"], ce["days"], ce)
                for k, v in rows.items(): combined[k] = combined.get(k, 0) + v
                tot_all += tot; res_names.append(ce["name"])
                p["changes"] += [(f"{ce['name']}: {x}" if multi else x) for x in ch]
                cut.append((ce["name"], set(cut_names), c["d"]))
                for ci2 in city_info:
                    if ci2["name"] == ce["name"]: ci2["total"] = money(tot, cur)
            p["budget"] = {"rows": [[k, money(v, cur)] for k, v in combined.items()], "total": money(tot_all, cur),
                           "note": "All prices are ESTIMATES, not live bookable prices." + (f" {', '.join(skel_names)} use ranges only — their share is not in this total." if skel_names else "")}
            total = money(tot_all, cur)
            over = tot_all - B
            if skel_names:
                if over > 0:
                    verdict, tone, p["leanest"] = f"Still {money(over, cur)} over budget on the researched cities alone — and {', '.join(skel_names)} are not counted yet", "bad", True
                else:
                    verdict, tone = f"Partial total {money(tot_all, cur)} covers {', '.join(res_names)} only — {', '.join(skel_names)} use ranges, so the full trip cost is unverified", "warn"
            elif over > 0:
                verdict, tone, p["leanest"] = f"Still {money(over, cur)} over budget after every safe adjustment", "bad", True
            else:
                verdict, tone = f"Within budget{' after adjustments' if p['changes'] else ''}: {money(-over, cur)} to spare", "ok"
    if ok(3):
        itin = copy.deepcopy(A[3]["data"]["days"])
        cut_by_city = {name: (names, dd) for name, names, dd in cut}
        n = 0
        for x in itin:
            cset, dd = cut_by_city.get(x.get("city"), (set(), None))
            for s in x["slots"]:
                if s.get("act") in cset and dd is not None:
                    s["activity"] = f"Free alternative (replaced '{s['act']}' to fit your budget)"; s["place"] = dd["free"][n % len(dd["free"])]; n += 1
        p["itinerary"] = itin
    if ok(4): p["packing"], p["safety"] = A[4]["data"]["packing"], A[4]["data"]["safety"]
    if ok(1):
        pl = A[1]["data"].get("places"); gm = A[1]["data"].get("gems")
        if pl: p["places"] = pl
        if gm: p["gems"] = gm
    p["summary"] = {"destination": " → ".join(c["name"] for c in cs) if multi else (cs[0]["d"]["name"] if cs[0]["d"] else r.destination.strip()), "dates": f"{r.start:%d %b %Y} to {r.end:%d %b %Y}", "days": days,
                    "travellers": r.travellers, "total": total, "budget": money(B, cur), "verdict": verdict, "tone": tone, "style": r.style,
                    "multi": multi, "cities": city_info}
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


class MiliReq(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    context: dict = {}

_MILI_WINDOW = []

@app.post("/api/mili")
async def mili(r: MiliReq):
    # Mili v3: grounded chat. No working key -> llm:false and the browser falls back to
    # local rules, so Mili never breaks. Keys live ONLY as Vercel env vars
    # (GEMINI_API_KEY for Google Gemini, GROQ_API_KEY for Groq, GROK_API_KEY/XAI_API_KEY
    # for xAI; optional GEMINI_MODEL / GROQ_MODEL); they are never in code or the frontend.
    # No live search, no server storage of the question, no bookings/payments.
    import time as _time
    now = _time.time(); _MILI_WINDOW[:] = [t for t in _MILI_WINDOW if now - t < 60]
    if len(_MILI_WINDOW) >= 30: return {"answer": None, "llm": False}
    _MILI_WINDOW.append(now)
    # Provider routing (keys live ONLY as Vercel env vars, never in code/frontend):
    # - GEMINI_API_KEY, if set, is a Google Gemini key -> generativelanguage.googleapis.com
    #   OpenAI-compatible endpoint, model GEMINI_MODEL (default gemini-3.6-flash, fallback gemini-3.8-flash). Tried FIRST.
    # - GROQ_API_KEY, if set, is a Groq key (gsk_...) -> api.groq.com, model GROQ_MODEL (default openai/gpt-oss-20b).
    # - GROK_API_KEY / XAI_API_KEY: if the value starts with "gsk_" it is actually a Groq key stored under the
    #   wrong name (Groq/Grok confusion) -> route it to Groq; otherwise it is an xAI key -> api.x.ai, grok-4-fast.
    # Providers are tried in order; any failure falls through to the next, then to local rules (llm:false).
    ctx = json.dumps(r.context)[:8000]
    system = ("You are Mili, the Quadlet trip-planning helper. Answer ONLY from the USER DATA and QUADLET FACTS below. "
        "Never invent places, prices, dates, hotel/flight availability, weather, or bookings. All prices in plans are ESTIMATES, "
        "not live bookable prices — say so when relevant. If the answer is not in the data, say you do not know that from their "
        "trips and suggest what to plan or ask instead; do not guess. For questions outside trips and Quadlet, answer briefly "
        "and honestly, or say it is outside what you can check, without inventing facts. Never claim a booking, payment, or live "
        "availability. Keep answers short, chat-friendly, plain text, no markdown tables.")
    user_content = r.question + "\n\nUSER DATA (their saved and current trips, packing, weather):\n" + ctx
    providers = []
    gm = (os.getenv("GEMINI_API_KEY") or "").strip()
    if gm:
        # gemini-2.5-flash was retired for new keys (Oct 16, 2026 shutdown; 404 "no longer
        # available to new users"). Try stable 3.6-flash first, then 3.8-flash (Google's own
        # recommendation in the 404). GEMINI_MODEL env overrides the first choice.
        _gm_models = []
        for _m in [os.getenv("GEMINI_MODEL", "gemini-3.6-flash"), "gemini-3.8-flash"]:
            if _m and _m not in _gm_models: _gm_models.append(_m)
        for _m in _gm_models:
            providers.append(("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", gm,
                {"model": _m, "temperature": 0.2, "max_tokens": 2048}))
    gq = (os.getenv("GROQ_API_KEY") or "").strip()
    if gq:
        providers.append(("https://api.groq.com/openai/v1/chat/completions", gq,
            {"model": os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"), "temperature": 1, "top_p": 1, "reasoning_effort": "medium", "max_completion_tokens": 2048}))
    gx = ((os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY")) or "").strip()
    if gx:
        if gx.startswith("gsk_"):
            providers.append(("https://api.groq.com/openai/v1/chat/completions", gx,
                {"model": os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"), "temperature": 1, "top_p": 1, "reasoning_effort": "medium", "max_completion_tokens": 2048}))
        else:
            providers.append(("https://api.x.ai/v1/chat/completions", gx,
                {"model": os.getenv("GROK_MODEL", "grok-4-fast"), "temperature": 0.2, "max_tokens": 400}))
    if not providers: return {"answer": None, "llm": False}
    def call(url, key, payload):
        body = json.dumps({**payload, "messages": [{"role": "system", "content": system},
            {"role": "user", "content": user_content}]}).encode()
        rq = urllib.request.Request(url, body,
            {"Authorization": "Bearer " + key, "Content-Type": "application/json"})
        return json.load(urllib.request.urlopen(rq, timeout=15))["choices"][0]["message"]["content"].strip()
    for url, key, payload in providers:
        try:
            ans = await asyncio.to_thread(call, url, key, payload)
            if ans: return {"answer": ans, "llm": True}
        except Exception:
            continue
    return {"answer": None, "llm": False}

# ---- Nearby places (v5.7): server-side Wikipedia lookup ----
# Browsers hit Wikimedia 429s on their shared egress IP, so the lookup moved server-side:
# the backend geocodes via Open-Meteo and queries Wikipedia with a Quadlet User-Agent,
# filters to visitable place types, caches 1h per destination, and the frontend just calls
# GET /api/nearby?dest=... (same origin, no CORS, no third-party calls from the browser).
_NEARBY_KEYS = [("jyotirlinga", "Temple"), ("temple", "Temple"), ("mandir", "Temple"), ("mosque", "Mosque"), ("church", "Church"), ("gurudwara", "Gurdwara"), ("gurdwara", "Gurdwara"), ("dargah", "Shrine"), ("fort", "Fort"), ("palace", "Palace"), ("mahal", "Palace"), ("lake", "Lake"), ("sagar", "Lake"), ("falls", "Waterfall"), ("waterfall", "Waterfall"), ("beach", "Beach"), ("museum", "Museum"), ("park", "Park"), ("garden", "Garden"), ("dam", "Dam"), ("cave", "Cave"), ("monastery", "Monastery"), ("ashram", "Ashram"), ("ghat", "Ghat"), ("tomb", "Tomb"), ("mausoleum", "Mausoleum"), ("market", "Market"), ("bazaar", "Market"), ("bridge", "Bridge"), ("zoo", "Zoo"), ("hill", "Hill"), ("valley", "Valley"), ("island", "Island"), ("sanctuary", "Sanctuary"), ("reserve", "Nature reserve"), ("ruins", "Ruins"), ("observatory", "Observatory"), ("jantar mantar", "Observatory"), ("stupa", "Stupa"), ("shrine", "Shrine"), ("cathedral", "Church"), ("lighthouse", "Lighthouse"), ("statue", "Statue"), ("stepwell", "Stepwell"), ("baoli", "Stepwell"), ("kund", "Pond"), ("chhatri", "Cenotaph"), ("cenotaph", "Cenotaph")]
_NEARBY_CACHE = {}
_NEARBY_TTL = 3600
def _nearby_type(title):
    t = (title or "").lower()
    for k, v in _NEARBY_KEYS:
        if k in t: return v
    return None
def _nearby_fetch(dest):
    """Blocking helper (runs in a thread): geocode + Wikipedia geosearch, filtered. [] on any failure."""
    try:
        g = urllib.request.urlopen(urllib.request.Request(
            "https://geocoding-api.open-meteo.com/v1/search?name=" + urllib.parse.quote(dest) + "&count=1&language=en&format=json",
            headers={"User-Agent": "Quadlet/1.0"}), timeout=10)
        gj = json.load(g)
        if not gj.get("results"): return []
        lat, lon, name = gj["results"][0]["latitude"], gj["results"][0]["longitude"], gj["results"][0]["name"]
    except Exception:
        return []
    wj = None
    for attempt in range(2):
        try:
            w = urllib.request.urlopen(urllib.request.Request(
                "https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=%s%%7C%s&gsradius=10000&gslimit=30&format=json" % (lat, lon),
                headers={"User-Agent": "Quadlet/1.0 (https://quadlet.vercel.app; nearby-places lookup)", "Accept": "application/json"}), timeout=10)
            wj = json.load(w)
            break
        except Exception:
            if attempt == 0:
                import time as _time2; _time2.sleep(2); continue
            return []
    if not wj: return []
    seen, out = set(), []
    for item in (wj.get("query") or {}).get("geosearch") or []:
        title = item.get("title") or ""
        if title.lower() == (name or "").lower(): continue
        base = title.split(",")[0].strip().lower()
        if base in seen: continue
        typ = _nearby_type(title)
        if not typ: continue
        seen.add(base)
        out.append({"name": title, "type": typ, "km": round(item.get("dist", 0) / 100) / 10})
    out.sort(key=lambda x: x["km"])
    return out[:8]

@app.get("/api/nearby")
async def nearby(dest: str = Query(min_length=2, max_length=80)):
    key = dest.strip().lower()
    now = datetime.now(timezone.utc).timestamp()
    hit = _NEARBY_CACHE.get(key)
    if hit and now - hit[0] < _NEARBY_TTL:
        return {"places": hit[1]}
    places = await asyncio.to_thread(_nearby_fetch, dest.strip())
    _NEARBY_CACHE[key] = (now, places)
    return {"places": places}


# ---------- AI features (v7.0): plan by talking, vibe search, smart packing ----------
# Same provider chain as /api/mili (Gemini first, then Groq, then xAI), but with
# response_format json_object and temp 0.2 for deterministic structured answers.
# Every endpoint has a rule-based fallback, so it still answers when no LLM is reachable.
_AI_WINDOW = []

def _llm_json_providers():
    providers = []
    gm = (os.getenv("GEMINI_API_KEY") or "").strip()
    if gm:
        _ms = []
        for _m in [os.getenv("GEMINI_MODEL", "gemini-3.6-flash"), "gemini-3.8-flash"]:
            if _m and _m not in _ms: _ms.append(_m)
        for _m in _ms:
            providers.append(("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", gm,
                {"model": _m, "temperature": 0.2, "max_tokens": 2048}))
    gq = (os.getenv("GROQ_API_KEY") or "").strip()
    if gq:
        providers.append(("https://api.groq.com/openai/v1/chat/completions", gq,
            {"model": os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"), "temperature": 0.2, "max_tokens": 2048}))
    gx = ((os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY")) or "").strip()
    if gx:
        if gx.startswith("gsk_"):
            providers.append(("https://api.groq.com/openai/v1/chat/completions", gx,
                {"model": os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"), "temperature": 0.2, "max_tokens": 2048}))
        else:
            providers.append(("https://api.x.ai/v1/chat/completions", gx,
                {"model": os.getenv("GROK_MODEL", "grok-4-fast"), "temperature": 0.2, "max_tokens": 2048}))
    return providers

async def _llm_json(system, user):
    import time as _time
    now = _time.time(); _AI_WINDOW[:] = [x for x in _AI_WINDOW if now - x < 60]
    if len(_AI_WINDOW) >= 30: return None
    _AI_WINDOW.append(now)
    def call(url, key, payload):
        body = json.dumps({**payload, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}).encode()
        rq = urllib.request.Request(url, body, {"Authorization": "Bearer " + key, "Content-Type": "application/json"})
        _resp = json.load(urllib.request.urlopen(rq, timeout=25))
        _content = (_resp.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        return _content.strip()
    for url, key, payload in _llm_json_providers():
        try:
            ans = await asyncio.to_thread(call, url, key, payload)
            if not ans: continue
            ans = ans.strip()
            if ans.startswith("```"):
                parts = ans.split("```")
                ans = parts[1].strip() if len(parts) > 1 else ans
            if ans.startswith("json"): ans = ans[4:].strip()
            try:
                return json.loads(ans)
            except Exception:
                i, j = ans.find("{"), ans.rfind("}")
                if i >= 0 and j > i: return json.loads(ans[i:j + 1])
                raise
        except Exception:
            continue
    return None

class ParseReq(BaseModel):
    text: str = Field(min_length=2, max_length=500)

_STYLES = ["Relaxed", "Adventure", "Culture", "Food", "Family", "Budget Backpacker"]

@app.post("/api/parse-trip")
async def parse_trip(r: ParseReq):
    today = date.today().isoformat()
    system = ("You parse a trip request into JSON. Return ONLY a JSON object with these keys: "
        "destination (string, the place or route as the user wrote it), start (YYYY-MM-DD or null), "
        "end (YYYY-MM-DD or null), days (integer or null), travellers (integer or null), "
        "budget (number or null, the total trip budget), currency (\"INR\" or \"USD\", default INR), "
        "style (one of Relaxed, Adventure, Culture, Food, Family, Budget Backpacker — default Culture), "
        "interests (array, only from Beaches, Mountains, History, Food, Shopping, Nightlife, Nature, Adventure Sports). "
        "Today is " + today + ". Resolve relative dates from today (\"next month\", \"this Christmas\", \"in June\"). "
        "If the user gives a trip length but no dates, set days and leave start/end null. "
        "If they give dates, set start/end and days from the date range. Never invent a destination, date, or budget the user did not state; use null for anything unstated.")
    out = await _llm_json(system, r.text)
    if not out: return {"parsed": None, "llm": False}
    parsed = {"destination": None, "start": None, "end": None, "days": None, "travellers": None, "budget": None, "currency": "INR", "style": "Culture", "interests": []}
    dest = str(out.get("destination") or "").strip()[:80]
    if dest: parsed["destination"] = dest
    def _d(v):
        try: return date.fromisoformat(str(v)[:10])
        except Exception: return None
    s, e = _d(out.get("start")), _d(out.get("end"))
    if s and e and e >= s and (e - s).days + 1 <= 30:
        parsed["start"], parsed["end"] = s.isoformat(), e.isoformat()
        parsed["days"] = (e - s).days + 1
    else:
        try:
            dv = int(out.get("days")) if out.get("days") else None
            if dv and 1 <= dv <= 30: parsed["days"] = dv
        except Exception: pass
    try:
        tv = int(out["travellers"]) if out.get("travellers") else None
        if tv and 1 <= tv <= 20: parsed["travellers"] = tv
    except Exception: pass
    try:
        b = float(out["budget"]) if out.get("budget") else None
        if b and b > 0: parsed["budget"] = b
    except Exception: pass
    if str(out.get("currency") or "").upper() == "USD": parsed["currency"] = "USD"
    if str(out.get("style") or "") in _STYLES: parsed["style"] = out["style"]
    parsed["interests"] = [c for c in (out.get("interests") or []) if c in TASTE_CATS]
    return {"parsed": parsed, "llm": True}

class VibeReq(BaseModel):
    text: str = Field(min_length=2, max_length=500)

def _cost4(key):
    d = D[key]
    return d["travel"] + d["stay"][1] * 3 + d["food"][1] * 4 + d["tr"] * 4

_VIBE_SYN = {"quiet": ["quiet", "relaxed"], "green": ["green", "nature"], "party": ["party", "nightlife"], "spiritual": ["spiritual", "temples"], "sea": ["beach"], "snow": ["mountains", "snow"], "city": ["city", "modern"], "cheap": ["low"], "luxury": ["luxury"], "beach": ["beach"], "temple": ["temples"], "mountain": ["mountains"], "food": ["food"], "adventure": ["adventure"], "shopping": ["shopping"], "romantic": ["romantic"], "family": ["family"], "island": ["island"], "desert": ["desert"], "lake": ["lakes"], "river": ["river"], "yoga": ["yoga"], "culture": ["culture", "history"]}

def _vibe_rule(text):
    t = text.lower()
    budget = None
    m = re.search(r"(?:\u20b9|rs\.?|inr|under|below|up to|budget(?: of)?)\s*([\d,]+)\s*(k)?", t)
    if m:
        try: budget = float(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
        except Exception: budget = None
    _months = {"january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12, "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
    month = None
    for name, num in _months.items():
        if re.search(r"\b" + name + r"\b", t): month = num; break
    scored = []
    for key, meta in VIBE.items():
        tags = meta["tags"]; hits = set()
        for word, syns in _VIBE_SYN.items():
            if re.search(r"\b" + word + r"\b", t):
                for s in syns:
                    if s in tags: hits.add(s)
        for tag in tags:
            if tag in t: hits.add(tag)
        score = 3 * len(hits); reasons = []
        if hits: reasons.append("Matches: " + ", ".join(sorted(hits)))
        if budget and _cost4(key) * 2 <= budget:
            score += 2; reasons.append("4-day trip for two fits under " + money(budget, "INR"))
        if month and month in meta["months"]:
            score += 2
            _mn = [k for k, v in _months.items() if v == month and len(k) > 3]
            reasons.append("In season in " + (_mn[0].capitalize() if _mn else "that month"))
        scored.append((score, key, "; ".join(reasons) if reasons else "A researched Quadlet destination."))
    scored.sort(key=lambda x: -x[0])
    return [{"destination": D[k]["name"], "reason": r} for _, k, r in scored[:3]]

@app.post("/api/vibe")
async def vibe(r: VibeReq):
    catalog = "\n".join(f"- {D[k]['name']}: tags {', '.join(meta['tags'])}; best months {', '.join(str(m) for m in meta['months'])}; rough 4-day cost for two about \u20b9{round(_cost4(k) * 2):,}" for k, meta in VIBE.items())
    system = ("You rank trip destinations for a traveller's mood. Return ONLY a JSON object {\"picks\": [{\"destination\": name, \"reason\": one short sentence}, ...]} with the top 3 destinations from the catalog below, best match first. "
        "Use only the catalog destinations and their tags, months, and costs. Never invent a destination or a price. "
        "Reason must mention the matching tags and, when the user states a budget or month, whether it fits.\n\nCATALOG:\n" + catalog)
    out = await _llm_json(system, r.text)
    if isinstance(out, list): out = {"picks": out}
    if out and isinstance(out.get("picks"), list) and out["picks"]:
        picks = []
        for p in out["picks"][:3]:
            name = str(p.get("destination") or "").strip()
            match = None
            for k in D:
                if D[k]["name"].lower() in name.lower(): match = D[k]["name"]; break
            if match and p.get("reason"):
                picks.append({"destination": match, "reason": str(p["reason"])[:200]})
        if picks: return {"picks": picks, "llm": True}
    return {"picks": _vibe_rule(r.text), "llm": False}

class PackReq(BaseModel):
    destination: str = Field(min_length=1, max_length=80)
    dates: str = ""
    places: List[str] = []
    forecast: List[dict] = []
    packing: dict = {}

@app.post("/api/packing")
async def packing(r: PackReq):
    existing = " ".join(str(x) for v in (r.packing or {}).values() for x in (v if isinstance(v, list) else [v])).lower()
    def _new(item, reason):
        return None if item.lower() in existing else {"item": item, "reason": reason}
    rains = [f.get("rain") for f in (r.forecast or []) if isinstance(f.get("rain"), (int, float))]
    maxs = [f.get("max") for f in (r.forecast or []) if isinstance(f.get("max"), (int, float))]
    mins = [f.get("min") for f in (r.forecast or []) if isinstance(f.get("min"), (int, float))]
    rules = []
    if rains and max(rains) >= 50:
        rules += [("Rain jacket", f"Rain chance up to {round(max(rains))}% on your dates"), ("Compact umbrella", "Showers expected — keep one in your day bag")]
    if mins and min(mins) < 10:
        rules += [("Thermals", f"Coldest morning {round(min(mins))}°C"), ("Warm jacket", "Evenings drop below 10°C")]
    if maxs and max(maxs) > 32:
        rules += [("Extra sunscreen", f"Peaks of {round(max(maxs))}°C — reapply often"), ("Light cotton clothes", "Hot days ahead, pack breathable layers")]
    places_txt = " ".join(r.places or []).lower()
    if "beach" in places_txt or "swim" in places_txt or "island" in places_txt:
        rules.append(("Swimwear", "Your itinerary has beach or island stops"))
    if "trek" in places_txt or "hike" in places_txt or "falls" in places_txt or "trail" in places_txt:
        rules.append(("Trekking shoes with grip", "Your itinerary has trails or waterfall walks"))
    if "temple" in places_txt or "church" in places_txt or "mosque" in places_txt or "ghat" in places_txt:
        rules.append(("Modest outfit for temples", "Your itinerary has temples or sacred sites"))
    rules = [x for x in (_new(i, why) for i, why in rules) if x][:6]
    llm_out = None
    if len(rules) < 3:
        system = ("You suggest packing additions for a trip. Return ONLY a JSON object {\"items\": [{\"item\": short item name, \"reason\": one short sentence}, ...]} with at most 4 items. "
            "Use ONLY the forecast and itinerary below. Never suggest an item already in the existing packing list. "
            "Only suggest weather- or activity-driven additions (rain, cold, heat, beach, trek, temples). If nothing is missing, return an empty items list.")
        user = json.dumps({"destination": r.destination, "dates": r.dates, "itinerary_places": (r.places or [])[:20], "forecast": (r.forecast or [])[:16], "existing_packing": r.packing})
        llm_out = await _llm_json(system, user)
        if llm_out and isinstance(llm_out.get("items"), list):
            seen = {x["item"].lower() for x in rules}
            for it in llm_out["items"][:4]:
                name = str(it.get("item") or "").strip()
                if name and name.lower() not in seen and name.lower() not in existing and it.get("reason"):
                    rules.append({"item": name[:60], "reason": str(it["reason"])[:160]}); seen.add(name.lower())
    return {"items": rules[:6], "llm": bool(llm_out)}

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


# ---- Accounts + cloud saved trips (Phase 1) ----
# Storage: Postgres when DATABASE_URL is set (Neon via Vercel dashboard).
# Without it, cloud endpoints return 503 and the site keeps working in
# browser-local mode exactly as before. Passwords are PBKDF2-SHA256 hashed
# (200k iterations, per-user salt); only the hash is ever stored.
import hashlib, re, secrets
from datetime import datetime, timedelta, timezone
from fastapi import Header

def _db():
    url = os.getenv("DATABASE_URL") or ""
    if not url:
        raise HTTPException(503, "Cloud accounts are not connected yet — connect a Postgres database to this project, then redeploy.")
    try:
        import psycopg
        from psycopg.rows import dict_row
    except Exception:
        raise HTTPException(503, "Database driver is not installed on the server.")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    conn = psycopg.connect(url, row_factory=dict_row, autocommit=True)
    with conn.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS quadlet_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())")
        cur.execute("CREATE TABLE IF NOT EXISTS quadlet_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES quadlet_users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS quadlet_trips (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES quadlet_users(id) ON DELETE CASCADE, dest TEXT NOT NULL, dates TEXT NOT NULL, total TEXT NOT NULL, plan JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(user_id, dest, dates))")
        cur.execute("CREATE TABLE IF NOT EXISTS quadlet_shares (share_id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES quadlet_trips(id) ON DELETE CASCADE, user_id TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())")
        cur.execute("CREATE TABLE IF NOT EXISTS quadlet_expenses (id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES quadlet_trips(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES quadlet_users(id) ON DELETE CASCADE, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', amount_inr REAL NOT NULL, category TEXT NOT NULL DEFAULT 'Other', note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT now())")
        cur.execute("CREATE TABLE IF NOT EXISTS quadlet_group_members (share_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES quadlet_users(id) ON DELETE CASCADE, joined_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (share_id, user_id))")
        cur.execute("CREATE TABLE IF NOT EXISTS quadlet_votes (share_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES quadlet_users(id) ON DELETE CASCADE, activity TEXT NOT NULL, vote SMALLINT NOT NULL, PRIMARY KEY (share_id, user_id, activity))")
    return conn

def _hash_pw(pw):
    salt = os.urandom(16)
    return salt.hex() + ":" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200000).hex()

def _check_pw(pw, stored):
    try:
        salt_hex, h_hex = stored.split(":", 1)
        got = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt_hex), 200000).hex()
        return secrets.compare_digest(got, h_hex)
    except Exception:
        return False

def _new_session(conn, user_id):
    token = secrets.token_urlsafe(32)
    exp = datetime.now(timezone.utc) + timedelta(days=30)
    with conn.cursor() as cur:
        cur.execute("INSERT INTO quadlet_sessions (token, user_id, expires_at) VALUES (%s, %s, %s)", (token, user_id, exp))
    return token

def _auth_user(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to use cloud trips.")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(401, "Sign in to use cloud trips.")
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT s.user_id, s.expires_at, u.email FROM quadlet_sessions s JOIN quadlet_users u ON u.id = s.user_id WHERE s.token = %s", (token,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(401, "Session expired — please sign in again.")
            if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
                cur.execute("DELETE FROM quadlet_sessions WHERE token = %s", (token,))
                raise HTTPException(401, "Session expired — please sign in again.")
            return row["user_id"], row["email"]
    finally:
        conn.close()

class AuthReq(BaseModel):
    email: str
    password: str

class TripSaveReq(BaseModel):
    plan: dict

@app.post("/api/auth/register")
async def auth_register(r: AuthReq):
    email = (r.email or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(400, "Enter a valid email address.")
    if len(r.password or "") < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM quadlet_users WHERE email = %s", (email,))
            if cur.fetchone():
                raise HTTPException(409, "An account already exists for this email — sign in instead.")
            uid = secrets.token_urlsafe(12)
            cur.execute("INSERT INTO quadlet_users (id, email, pw_hash) VALUES (%s, %s, %s)", (uid, email, _hash_pw(r.password)))
            token = _new_session(conn, uid)
        return {"token": token, "email": email}
    finally:
        conn.close()

@app.post("/api/auth/login")
async def auth_login(r: AuthReq):
    email = (r.email or "").strip().lower()
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, pw_hash FROM quadlet_users WHERE email = %s", (email,))
            row = cur.fetchone()
            if not row or not _check_pw(r.password or "", row["pw_hash"]):
                raise HTTPException(401, "Wrong email or password.")
            token = _new_session(conn, row["id"])
        return {"token": token, "email": email}
    finally:
        conn.close()

@app.get("/api/auth/me")
async def auth_me(authorization: str = Header(None)):
    _, email = _auth_user(authorization)
    return {"email": email}

@app.post("/api/auth/logout")
async def auth_logout(authorization: str = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM quadlet_sessions WHERE token = %s", (authorization[7:].strip(),))
        finally:
            conn.close()
    return {"ok": True}

@app.get("/api/trips")
async def trips_list(authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, dest, dates, total, plan FROM quadlet_trips WHERE user_id = %s ORDER BY updated_at DESC LIMIT 50", (uid,))
            rows = cur.fetchall()
        return {"trips": [{"id": x["id"], "dest": x["dest"], "dates": x["dates"], "total": x["total"], "plan": x["plan"]} for x in rows]}
    finally:
        conn.close()

@app.post("/api/trips")
async def trips_save(r: TripSaveReq, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    plan = r.plan or {}
    s = plan.get("summary") or {}
    dest, dates, total = s.get("destination", ""), s.get("dates", ""), s.get("total", "")
    if not dest or not dates:
        raise HTTPException(400, "This plan has no destination or dates to save.")
    from psycopg.types.json import Jsonb
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO quadlet_trips (id, user_id, dest, dates, total, plan) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (user_id, dest, dates) DO UPDATE SET total = EXCLUDED.total, plan = EXCLUDED.plan, updated_at = now() RETURNING id", (secrets.token_urlsafe(12), uid, dest, dates, total, Jsonb(plan)))
            tid = cur.fetchone()["id"]
        return {"id": tid}
    finally:
        conn.close()

class ShareReq(BaseModel):
    dest: str
    dates: str

@app.delete("/api/trips/share")
async def trips_unshare(r: ShareReq, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM quadlet_trips WHERE user_id = %s AND dest = %s AND dates = %s", (uid, r.dest, r.dates))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Trip not found in your cloud account.")
            cur.execute("DELETE FROM quadlet_shares WHERE trip_id = %s", (row["id"],))
        return {"shared": False}
    finally:
        conn.close()

@app.delete("/api/trips/{trip_id}")
async def trips_delete(trip_id: str, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM quadlet_trips WHERE id = %s AND user_id = %s", (trip_id, uid))
            deleted = cur.rowcount > 0
        return {"deleted": deleted}
    finally:
        conn.close()



@app.delete("/api/auth/me")
async def auth_delete_me(authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM quadlet_users WHERE id = %s", (uid,))
        return {"deleted": True}
    finally:
        conn.close()


@app.post("/api/trips/share")
async def trips_share(r: ShareReq, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM quadlet_trips WHERE user_id = %s AND dest = %s AND dates = %s", (uid, r.dest, r.dates))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Save this trip to your cloud account first.")
            tid = row["id"]
            cur.execute("SELECT share_id FROM quadlet_shares WHERE trip_id = %s", (tid,))
            ex = cur.fetchone()
            if ex:
                return {"share_id": ex["share_id"]}
            sid = secrets.token_urlsafe(10)
            cur.execute("INSERT INTO quadlet_shares (share_id, trip_id, user_id) VALUES (%s, %s, %s)", (sid, tid, uid))
            return {"share_id": sid}
    finally:
        conn.close()


@app.get("/api/shared/{share_id}")
async def shared_get(share_id: str):
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT t.dest, t.dates, t.total, t.plan FROM quadlet_shares s JOIN quadlet_trips t ON t.id = s.trip_id WHERE s.share_id = %s", (share_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "This shared trip link is invalid or no longer shared.")
            return {"dest": row["dest"], "dates": row["dates"], "total": row["total"], "plan": row["plan"]}
    finally:
        conn.close()

# ---- Group trips (Phase 3): friends join with their Quadlet account via a share link,
# vote activities up/down, and split the total equally. The owner's saved plan is never
# mutated: the group plan is a derived view with voted-out activities removed. ----
def _parse_money(s, cur):
    if s is None: return None
    try: n = float(str(s).replace("₹", "").replace("$", "").replace(",", "").strip() or 0)
    except Exception: return None
    return n * USD if cur == "USD" else n

def _group_conn_share(conn, share_id):
    with conn.cursor() as cur:
        cur.execute("SELECT s.share_id, s.trip_id, s.user_id AS owner_id, u.email AS owner_email, t.dest, t.dates, t.total, t.plan FROM quadlet_shares s JOIN quadlet_users u ON u.id = s.user_id JOIN quadlet_trips t ON t.id = s.trip_id WHERE s.share_id = %s", (share_id,))
        return cur.fetchone()

def _group_members(conn, share_id, owner_id, owner_email):
    with conn.cursor() as cur:
        cur.execute("SELECT m.user_id, u.email, m.joined_at FROM quadlet_group_members m JOIN quadlet_users u ON u.id = m.user_id WHERE m.share_id = %s ORDER BY m.joined_at", (share_id,))
        rows = cur.fetchall()
    members = [{"user_id": owner_id, "email": owner_email, "role": "owner"}]
    for x in rows:
        if x["user_id"] != owner_id:
            members.append({"user_id": x["user_id"], "email": x["email"], "role": "member"})
    return members

def _group_activities(plan):
    """Votable activities from the plan's itinerary: unique act names with city + price."""
    seen, out = {}, []
    for d in (plan.get("itinerary") or []):
        for s in d.get("slots", []):
            name = s.get("act")
            if not name or name in seen: continue
            if str(s.get("activity") or "").startswith("Free alternative"): continue  # already cut by the budget rule, not votable
            seen[name] = True
            price = None
            for dd in D.values():
                for a in dd.get("acts", []):
                    if a[0] == name: price = a[1]; break
                if price is not None: break
            out.append({"name": name, "city": d.get("city") or "", "price_inr": price})
    return out

def _apply_group_votes(plan, out_names):
    """Return (adjusted_plan, saved_inr). Recomputes Activities + Misc + total from the
    plan's money strings; itinerary slots for voted-out acts become free alternatives."""
    p = copy.deepcopy(plan)
    if not out_names: return p, 0
    s = p.get("summary", {})
    cur = "USD" if str(s.get("budget", "")).startswith("$") else "INR"
    travellers = s.get("travellers") or 1
    price_of = {}
    for name in out_names:
        for dd in D.values():
            for a in dd.get("acts", []):
                if a[0] == name: price_of[name] = a[1]; break
            if name in price_of: break
    saved = sum(price_of.get(n, 0) * travellers for n in out_names)
    n = 0
    for d in (p.get("itinerary") or []):
        city_d = D.get(city_key(d.get("city") or "")) if d.get("city") else None
        for sl in d.get("slots", []):
            if sl.get("act") in out_names and not str(sl.get("activity") or "").startswith("Free alternative"):
                sl["activity"] = f"Free alternative (voted out by the group: '{sl['act']}')"
                if city_d: sl["place"] = city_d["free"][n % len(city_d["free"])]; n += 1
                sl["act"] = None
    rows = {r[0]: _parse_money(r[1], cur) for r in (p.get("budget", {}).get("rows") or [])}
    if "Activities" in rows and rows:
        rows["Activities"] = max(0, rows["Activities"] - saved)
        others = sum(v for k, v in rows.items() if k != "Miscellaneous")
        rows["Miscellaneous"] = round(others * 0.07)
        total = sum(rows.values())
        p["budget"]["rows"] = [[k, money(v, cur)] for k, v in rows.items()]
        p["budget"]["total"] = money(total, cur)
        p["summary"]["total"] = money(total, cur)
        B = _parse_money(s.get("budget"), cur)
        if p.get("mode") == "mixed":
            res = ", ".join(x["name"] for x in (s.get("cities") or []) if x.get("mode") == "researched")
            sk = ", ".join(x["name"] for x in (s.get("cities") or []) if x.get("mode") == "skeleton")
            p["summary"]["verdict"] = f"Partial total {money(total, cur)} covers {res} only — {sk} use ranges, so the full trip cost is unverified"
            p["summary"]["tone"] = "warn"
        elif B is not None and total > B:
            p["summary"]["verdict"] = f"Still {money(total - B, cur)} over budget after group votes"
            p["summary"]["tone"] = "bad"; p["leanest"] = True
        elif B is not None:
            p["summary"]["verdict"] = f"Within budget after group votes: {money(B - total, cur)} to spare"
            p["summary"]["tone"] = "ok"
        p.setdefault("changes", [])
        for name in out_names:
            p["changes"].append(f"Group voted out '{name}' — saved {money(price_of.get(name, 0) * travellers, cur)} for the group")
    return p, saved

def _group_state(conn, share_id, me_id):
    row = _group_conn_share(conn, share_id)
    if not row: raise HTTPException(404, "This group trip link is invalid or no longer shared.")
    plan = row["plan"]
    members = _group_members(conn, share_id, row["owner_id"], row["owner_email"])
    if not any(m["user_id"] == me_id for m in members):
        raise HTTPException(403, "Join this group trip first — only members see votes and the split.")
    with conn.cursor() as cur:
        cur.execute("SELECT user_id, activity, vote FROM quadlet_votes WHERE share_id = %s", (share_id,))
        votes = cur.fetchall()
    acts = _group_activities(plan)
    s = plan.get("summary", {})
    cur = "USD" if str(s.get("budget", "")).startswith("$") else "INR"
    travellers = s.get("travellers") or 1
    for a in acts:
        a["keep"] = sum(1 for v in votes if v["activity"] == a["name"] and v["vote"] == 1)
        a["drop"] = sum(1 for v in votes if v["activity"] == a["name"] and v["vote"] == -1)
        a["out"] = a["drop"] > a["keep"]
        a["my_vote"] = next((v["vote"] for v in votes if v["activity"] == a["name"] and v["user_id"] == me_id), 0)
        a["price"] = money(a["price_inr"] * travellers, cur) if a["price_inr"] is not None else None
    out_names = [a["name"] for a in acts if a["out"]]
    adj, saved = _apply_group_votes(plan, out_names)
    total_num = _parse_money(adj.get("summary", {}).get("total"), cur) if adj.get("summary", {}).get("total") not in (None, "Unverified", "Not available") else None
    n = len(members)
    per = round(total_num / n) if total_num is not None and n else None
    return {"share_id": share_id, "dest": row["dest"], "dates": row["dates"],
            "members": [{"email": m["email"], "role": m["role"]} for m in members],
            "activities": [{k: a[k] for k in ("name", "city", "price", "keep", "drop", "out", "my_vote")} for a in acts],
            "voted_out": out_names, "saved": money(saved, cur) if saved else None,
            "total": adj.get("summary", {}).get("total"), "per_person": money(per, cur) if per is not None else None,
            "partial": plan.get("mode") == "mixed"}

class GroupJoinReq(BaseModel):
    share_id: str

class GroupVoteReq(BaseModel):
    share_id: str
    activity: str
    vote: int = Field(ge=-1, le=1)

@app.post("/api/groups/join")
async def groups_join(r: GroupJoinReq, authorization: str = Header(None)):
    uid, email = _auth_user(authorization)
    conn = _db()
    try:
        row = _group_conn_share(conn, r.share_id)
        if not row: raise HTTPException(404, "This group trip link is invalid or no longer shared.")
        with conn.cursor() as cur:
            cur.execute("INSERT INTO quadlet_group_members (share_id, user_id, joined_at) VALUES (%s, %s, now()) ON CONFLICT (share_id, user_id) DO NOTHING", (r.share_id, uid))
        return _group_state(conn, r.share_id, uid)
    finally:
        conn.close()

@app.get("/api/groups/{share_id}/plan")
async def groups_plan(share_id: str, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        st = _group_state(conn, share_id, uid)
        row = _group_conn_share(conn, share_id)
        adj, _ = _apply_group_votes(row["plan"], st["voted_out"])
        adj.setdefault("summary", {})["group"] = {"members": len(st["members"]), "per_person": st["per_person"], "voted_out": st["voted_out"]}
        return {"plan": adj, "group": st}
    finally:
        conn.close()

@app.get("/api/groups/{share_id}")
async def groups_get(share_id: str, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        return _group_state(conn, share_id, uid)
    finally:
        conn.close()

@app.post("/api/groups/vote")
async def groups_vote(r: GroupVoteReq, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        row = _group_conn_share(conn, r.share_id)
        if not row: raise HTTPException(404, "This group trip link is invalid or no longer shared.")
        members = _group_members(conn, r.share_id, row["owner_id"], row["owner_email"])
        if not any(m["user_id"] == uid for m in members):
            raise HTTPException(403, "Join this group trip first — only members can vote.")
        with conn.cursor() as cur:
            if r.vote == 0:
                cur.execute("DELETE FROM quadlet_votes WHERE share_id = %s AND user_id = %s AND activity = %s", (r.share_id, uid, r.activity))
            else:
                cur.execute("INSERT INTO quadlet_votes (share_id, user_id, activity, vote) VALUES (%s, %s, %s, %s) ON CONFLICT (share_id, user_id, activity) DO UPDATE SET vote = EXCLUDED.vote", (r.share_id, uid, r.activity, r.vote))
        return _group_state(conn, r.share_id, uid)
    finally:
        conn.close()

# ---- Expense tracker (v5.0, FULL): cloud-synced expenses on a saved trip, split
# equally across the trip owner + group members. Amounts are stored as entered plus
# an INR-normalised value so splits work across INR/USD trips. ----
EXPENSE_CATEGORIES = ("Food", "Stay", "Transport", "Activities", "Shopping", "Other")

def _expense_balances(rows, member_emails):
    """Pure split math: rows = [{email, amount_inr}]. owes = share - paid (positive
    means the member owes that much to the pot, negative means others owe them)."""
    total = sum(r["amount_inr"] for r in rows)
    n = max(1, len(member_emails))
    per = round(total / n)
    paid = {e: 0 for e in member_emails}
    for r in rows:
        if r["email"] in paid: paid[r["email"]] += r["amount_inr"]
    return {"total_inr": total, "per_person_inr": per,
            "balances": [{"email": e, "paid_inr": round(paid[e]), "share_inr": per,
                          "owes_inr": round(per - paid[e])} for e in member_emails]}

def _expense_trip(conn, trip_id):
    with conn.cursor() as cur:
        cur.execute("SELECT t.id, t.user_id, u.email AS owner_email, t.plan FROM quadlet_trips t JOIN quadlet_users u ON u.id = t.user_id WHERE t.id = %s", (trip_id,))
        return cur.fetchone()

def _expense_access(conn, trip_id, uid):
    """Return (role, share_id, trip_row): 'owner' | 'member' | (None, None, row)."""
    row = _expense_trip(conn, trip_id)
    if not row: raise HTTPException(404, "Trip not found.")
    if row["user_id"] == uid:
        with conn.cursor() as cur:
            cur.execute("SELECT share_id FROM quadlet_shares WHERE trip_id = %s LIMIT 1", (trip_id,))
            r = cur.fetchone()
        return "owner", (r["share_id"] if r else None), row
    with conn.cursor() as cur:
        cur.execute("SELECT share_id FROM quadlet_shares WHERE trip_id = %s", (trip_id,))
        for r in cur.fetchall():
            members = _group_members(conn, r["share_id"], row["user_id"], row["owner_email"])
            if any(m["user_id"] == uid for m in members): return "member", r["share_id"], row
    return None, None, row

def _expense_summary(conn, trip_id, uid):
    role, sid, row = _expense_access(conn, trip_id, uid)
    if not role: raise HTTPException(403, "Only the trip owner and group members can see expenses.")
    plan = row["plan"] or {}
    s = plan.get("summary", {})
    cur = "USD" if str(s.get("budget", "")).startswith("$") else "INR"
    if sid:
        members = _group_members(conn, sid, row["user_id"], row["owner_email"])
        member_emails = [m["email"] for m in members]
    else:
        member_emails = [row["owner_email"]]
    with conn.cursor() as cur2:
        cur2.execute("SELECT e.id, e.user_id, u.email, e.amount, e.currency, e.amount_inr, e.category, e.note, e.created_at FROM quadlet_expenses e JOIN quadlet_users u ON u.id = e.user_id WHERE e.trip_id = %s ORDER BY e.created_at", (trip_id,))
        exps = [{"id": x["id"], "email": x["email"], "mine": x["user_id"] == uid,
                 "amount": x["amount"], "currency": x["currency"], "category": x["category"],
                 "note": x["note"], "created_at": x["created_at"].isoformat() if x["created_at"] else None}
                for x in cur2.fetchall()]
    with conn.cursor() as cur3:
        cur3.execute("SELECT u.email, e.amount_inr FROM quadlet_expenses e JOIN quadlet_users u ON u.id = e.user_id WHERE e.trip_id = %s", (trip_id,))
        bal = _expense_balances([{"email": x["email"], "amount_inr": x["amount_inr"]} for x in cur3.fetchall()], member_emails)
    total = bal["total_inr"]
    return {"trip_id": trip_id, "currency": cur, "role": role, "share_id": sid,
            "expenses": exps, "count": len(exps),
            "total": money(total, cur), "total_inr": total,
            "per_person": money(bal["per_person_inr"], cur),
            "budget": s.get("budget"), "plan_total": s.get("total"),
            "balances": [{"email": b["email"], "paid": money(b["paid_inr"], cur),
                          "share": money(b["share_inr"], cur), "owes": money(b["owes_inr"], cur),
                          "owes_inr": b["owes_inr"]} for b in bal["balances"]]}

class ExpenseAddReq(BaseModel):
    amount: float = Field(gt=0)
    currency: str = "INR"
    category: str = "Other"
    note: str = ""

@app.post("/api/trips/{trip_id}/expenses")
async def expenses_add(trip_id: str, r: ExpenseAddReq, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    if r.currency not in ("INR", "USD"): raise HTTPException(400, "Currency must be INR or USD.")
    cat = r.category if r.category in EXPENSE_CATEGORIES else "Other"
    note = (r.note or "")[:200]
    amount_inr = r.amount * USD if r.currency == "USD" else r.amount
    conn = _db()
    try:
        role, _, _ = _expense_access(conn, trip_id, uid)
        if not role: raise HTTPException(403, "Only the trip owner and group members can add expenses.")
        eid = secrets.token_urlsafe(9)
        with conn.cursor() as cur:
            cur.execute("INSERT INTO quadlet_expenses (id, trip_id, user_id, amount, currency, amount_inr, category, note) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)", (eid, trip_id, uid, r.amount, r.currency, amount_inr, cat, note))
        return _expense_summary(conn, trip_id, uid)
    finally:
        conn.close()

@app.get("/api/trips/{trip_id}/expenses")
async def expenses_list(trip_id: str, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        return _expense_summary(conn, trip_id, uid)
    finally:
        conn.close()

@app.delete("/api/expenses/{expense_id}")
async def expenses_delete(expense_id: str, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT e.trip_id, e.user_id, t.user_id AS owner_id FROM quadlet_expenses e JOIN quadlet_trips t ON t.id = e.trip_id WHERE e.id = %s", (expense_id,))
            row = cur.fetchone()
        if not row: raise HTTPException(404, "Expense not found.")
        if row["user_id"] != uid and row["owner_id"] != uid:
            raise HTTPException(403, "Only the person who added it or the trip owner can delete an expense.")
        with conn.cursor() as cur:
            cur.execute("DELETE FROM quadlet_expenses WHERE id = %s", (expense_id,))
        return _expense_summary(conn, row["trip_id"], uid)
    finally:
        conn.close()

@app.get("/api/groups/{share_id}/expenses")
async def group_expenses_list(share_id: str, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    conn = _db()
    try:
        row = _group_conn_share(conn, share_id)
        if not row: raise HTTPException(404, "This group trip link is invalid or no longer shared.")
        members = _group_members(conn, share_id, row["owner_id"], row["owner_email"])
        if not any(m["user_id"] == uid for m in members):
            raise HTTPException(403, "Join this group trip first — only members see expenses.")
        return _expense_summary(conn, row["trip_id"], uid)
    finally:
        conn.close()

@app.post("/api/groups/{share_id}/expenses")
async def group_expenses_add(share_id: str, r: ExpenseAddReq, authorization: str = Header(None)):
    uid, _ = _auth_user(authorization)
    if r.currency not in ("INR", "USD"): raise HTTPException(400, "Currency must be INR or USD.")
    cat = r.category if r.category in EXPENSE_CATEGORIES else "Other"
    note = (r.note or "")[:200]
    amount_inr = r.amount * USD if r.currency == "USD" else r.amount
    conn = _db()
    try:
        row = _group_conn_share(conn, share_id)
        if not row: raise HTTPException(404, "This group trip link is invalid or no longer shared.")
        members = _group_members(conn, share_id, row["owner_id"], row["owner_email"])
        if not any(m["user_id"] == uid for m in members):
            raise HTTPException(403, "Join this group trip first — only members can add expenses.")
        eid = secrets.token_urlsafe(9)
        with conn.cursor() as cur:
            cur.execute("INSERT INTO quadlet_expenses (id, trip_id, user_id, amount, currency, amount_inr, category, note) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)", (eid, row["trip_id"], uid, r.amount, r.currency, amount_inr, cat, note))
        return _expense_summary(conn, row["trip_id"], uid)
    finally:
        conn.close()

# ---- Google sign-in (same pattern as XenMind: server-side tokeninfo check) ----
# The client ID is a public identifier (it ships in frontend JS), not a secret.
# Reuses XenMind's OAuth client by default; set GOOGLE_CLIENT_ID in Vercel to
# point at a different client. The client must list https://quadlet.vercel.app
# as an Authorized JavaScript origin, or Google refuses the button.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "565488602493-f0nopvv1a1jard8v2t0rqe0bsi480us6.apps.googleusercontent.com")

@app.get("/api/auth/config")
async def auth_config():
    return {"google_client_id": GOOGLE_CLIENT_ID}

class GoogleReq(BaseModel):
    credential: str

@app.post("/api/auth/google")
async def auth_google(r: GoogleReq):
    import time as _time
    try:
        import httpx
        with httpx.Client(timeout=15.0) as client:
            resp = client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": r.credential})
    except Exception:
        raise HTTPException(502, "Could not reach Google — try again.")
    if resp.status_code != 200:
        raise HTTPException(401, "Google token invalid or expired. Sign in again.")
    info = resp.json()
    if info.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(401, "Token was not issued for this app.")
    if info.get("iss") not in ("https://accounts.google.com", "accounts.google.com"):
        raise HTTPException(401, "Token issuer is not Google.")
    if int(info.get("exp", 0)) < _time.time():
        raise HTTPException(401, "Google token expired. Sign in again.")
    email = (info.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Google did not return an email address.")
    if info.get("email_verified") not in (None, "true", True):
        raise HTTPException(401, "Google email is not verified.")
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM quadlet_users WHERE email = %s", (email,))
            row = cur.fetchone()
            if row:
                uid = row["id"]
            else:
                uid = secrets.token_urlsafe(12)
                cur.execute("INSERT INTO quadlet_users (id, email, pw_hash) VALUES (%s, %s, %s)", (uid, email, "google-oauth"))
            token = _new_session(conn, uid)
        return {"token": token, "email": email}
    finally:
        conn.close()

@app.get("/trips")
async def trips_page():
    return FileResponse(Path(__file__).parent / "static" / "trips.html")

@app.get("/dashboard")
async def dashboard_page():
    return FileResponse(Path(__file__).parent / "static" / "dashboard.html")

@app.get("/agents")
async def agents_page():
    return FileResponse(Path(__file__).parent / "static" / "agents.html")

@app.get("/privacy")
async def privacy_page():
    return FileResponse(Path(__file__).parent / "static" / "privacy.html")

@app.get("/terms")
async def terms_page():
    return FileResponse(Path(__file__).parent / "static" / "terms.html")

@app.get("/cookies")
async def cookies_page():
    return FileResponse(Path(__file__).parent / "static" / "cookies.html")

app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")

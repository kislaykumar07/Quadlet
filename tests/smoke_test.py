"""Run: python tests/smoke_test.py"""
import asyncio, os, sys
os.environ["QUADLET_FAST"] = "1"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from datetime import date
from app import Req, run_trip

def trip(dest, days, n=2, budget=40000, **kw):
    r = Req(destination=dest, start=date(2026, 12, 10), end=date(2026, 12, 9 + days), travellers=n, budget=budget, style="Culture", interests=["Beaches", "Food"], **kw)
    return asyncio.run(run_trip(r))[0]

def total(p): return int(p["budget"]["total"].replace("₹", "").replace(",", ""))

p = trip("Goa", 5)
assert p["mode"] == "researched" and p["summary"]["tone"] == "ok" and total(p) <= 40000, p["summary"]
print("1. Goa fits:", p["budget"]["total"], "|", p["summary"]["verdict"], "| changes:", len(p["changes"]))

p = trip("Dubai", 5)
assert p["summary"]["tone"] == "bad" and p["leanest"] and "after every safe adjustment" in p["summary"]["verdict"]
print("2. Dubai honest path:", p["summary"]["verdict"])

p = trip("Lisbon", 4)
assert p["mode"] == "skeleton" and "verify prices and places" in p["banner"] and p["places"] is None
print("3. Skeleton plan:", p["banner"])

p = trip("Goa", 5, fail=3)
assert p["itinerary"] is None and p["budget"] and p["safety"] and p["places"] and p["missing"][0]["agent"] == "Itinerary Builder"
print("4. One agent failed, other three completed:", p["missing"][0]["agent"])
print("All smoke tests passed.")

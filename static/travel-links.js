// Flights & stays search links (v7.1): outbound, pre-filled search links built from the plan.
// No booking inside Quadlet — every link opens the travel site in a new tab.
// Providers verified live 2026-11-07: Google Flights (q param), Skyscanner (path format, needs an
// origin airport), Booking.com (ss + checkin/checkout), Google Hotels (q + checkin/checkout).
// NOT included: MakeMyTrip (unreachable from the sandbox, city codes unverified),
// Agoda (needs numeric city IDs, unverified). Do not add a provider without verifying its URL format.
// Deps passed in by app.js: esc.
export function initTravel(deps) {
  const { esc } = deps;
  const AIRPORTS = {
    Goa: ["GOI", "Dabolim Airport"],
    Manali: ["KUU", "Bhuntar Airport (Kullu) — nearest"],
    Jaipur: ["JAI", "Jaipur International"],
    Kerala: ["COK", "Cochin International"],
    Bali: ["DPS", "Ngurah Rai International"],
    Dubai: ["DXB", "Dubai International"],
    Delhi: ["DEL", "Indira Gandhi International"],
    Udaipur: ["UDR", "Maharana Pratap Airport"],
    Varanasi: ["VNS", "Lal Bahadur Shastri International"],
    Rishikesh: ["DED", "Jolly Grant Airport (Dehradun) — nearest"],
    Singapore: ["SIN", "Changi Airport"],
    Thailand: ["BKK", "Suvarnabhumi Airport"],
    Shimla: ["SLV", "Shimla Airport — limited flights"],
    Darjeeling: ["IXB", "Bagdogra Airport — nearest"],
    Amritsar: ["ATQ", "Sri Guru Ram Dass Jee International"],
    Hampi: ["HBX", "Hubli Airport — nearest (140 km)"],
    Maldives: ["MLE", "Velana International Airport"]
  };
  const HOME_CITIES = { Bhopal: "BHO", Delhi: "DEL", Mumbai: "BOM", Bengaluru: "BLR", Chennai: "MAA", Kolkata: "CCU", Hyderabad: "HYD", Pune: "PNQ", Ahmedabad: "AMD", Indore: "IDR", Jaipur: "JAI", Lucknow: "LKO", Kochi: "COK", Chandigarh: "IXC", Nagpur: "NAG", Patna: "PAT", Bhubaneswar: "BBI", Guwahati: "GAU", Dehradun: "DED", Varanasi: "VNS", Udaipur: "UDR", Goa: "GOI" };
  const HOME_KEY = "quadlet_home_airport";
  const MO = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function parseStart(datesStr) {
    const m = String(datesStr || "").match(/(\d{1,2}) ([A-Za-z]{3}) (\d{4})/);
    if (!m || MO[m[2]] === undefined) return null;
    return new Date(+m[3], MO[m[2]], +m[1]);
  }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function yymmdd(d) { return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); }
  function nice(d) { return MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); }
  function niceRange(a, b) { return MON[a.getMonth()] + " " + a.getDate() + " – " + MON[b.getMonth()] + " " + b.getDate() + ", " + b.getFullYear(); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function homeAirport() {
    let raw = "";
    try { raw = (localStorage.getItem(HOME_KEY) || "").trim(); } catch (e) {}
    if (!raw) return null;
    if (/^[A-Za-z]{3}$/.test(raw)) return { code: raw.toUpperCase(), label: raw.toUpperCase() };
    const key = Object.keys(HOME_CITIES).find(k => k.toLowerCase() === raw.toLowerCase());
    if (key) return { code: HOME_CITIES[key], label: key + " (" + HOME_CITIES[key] + ")" };
    return null;
  }
  function saveHome(v) { try { localStorage.setItem(HOME_KEY, v); } catch (e) {} }

  // Per-city stays: [{name, checkin: Date|null, checkout: Date|null, travellers, airport: [code, name]|null}]
  // Hotel nights = days - 1: the trip's last day is the departure day (no night).
  // So the last city's checkout is the trip end date, not checkin + days.
  function cityStays(p) {
    const s = p.summary || {};
    const start = parseStart(s.dates);
    const days = parseInt(s.days, 10) || 0;
    const travellers = parseInt(s.travellers, 10) || 2;
    const end = start && days > 0 ? addDays(start, days - 1) : null;
    const cities = (s.cities && s.cities.length > 1)
      ? s.cities.filter(c => (parseInt(c.days, 10) || 0) > 0)
      : [{ name: s.destination || "", days }];
    let cursor = start;
    return cities.map(c => {
      const n = parseInt(c.days, 10) || 0;
      const ci = cursor, rawCo = cursor ? addDays(cursor, n) : null;
      const co = (rawCo && end && rawCo > end) ? end : rawCo;
      if (cursor) cursor = rawCo;
      return { name: c.name, checkin: ci, checkout: co, travellers, airport: AIRPORTS[c.name] || null };
    }).filter(c => c.name);
  }

  function googleFlights(city, ci, co, travellers) {
    let q = "Flights to " + city;
    if (ci && co) q += " " + nice(ci) + " to " + nice(co);
    if (travellers > 1) q += " for " + travellers + " adults";
    return "https://www.google.com/travel/flights?q=" + encodeURIComponent(q);
  }
  function skyscanner(from, to, ci, co, travellers) {
    return "https://www.skyscanner.co.in/transport/flights/" + from.toLowerCase() + "/" + to.toLowerCase() + "/" + yymmdd(ci) + "/" + yymmdd(co) + "/?adultsv2=" + travellers + "&cabinclass=economy&rtn=1";
  }
  function booking(city, ci, co, travellers) {
    let u = "https://www.booking.com/searchresults.html?ss=" + encodeURIComponent(city) + "&group_adults=" + travellers + "&no_rooms=1";
    if (ci && co) u += "&checkin=" + iso(ci) + "&checkout=" + iso(co);
    return u;
  }
  function googleHotels(city, ci, co, travellers) {
    let u = "https://www.google.com/travel/hotels?q=" + encodeURIComponent(city) + "&adults=" + travellers;
    if (ci && co) u += "&checkin=" + iso(ci) + "&checkout=" + iso(co);
    return u;
  }

  let curPlan = null;
  function renderForPlan(p) {
    curPlan = p;
    const box = document.getElementById("travelBox");
    if (!box) return;
    const stays = cityStays(p);
    if (!stays.length) { box.innerHTML = ""; return; }
    const home = homeAirport();
    let homeVal = "";
    try { homeVal = localStorage.getItem(HOME_KEY) || ""; } catch (e) {}
    let html = `<h3>✈ Flights &amp; stays</h3><p class="fine">Search links, pre-filled from this plan — they open the travel site in a new tab. Quadlet doesn't book anything; prices on those sites are live.</p>`;
    html += `<div class="travel-home"><label for="travelHome">Flying from (optional)</label> <input id="travelHome" type="text" placeholder="e.g. BHO or Bhopal" value="${esc(homeVal)}" style="width:170px"> <span class="fine">Add your home airport to pre-fill Skyscanner.</span></div>`;
    html += stays.map(st => {
      const range = (st.checkin && st.checkout) ? niceRange(st.checkin, st.checkout) : "dates not set";
      const ap = st.airport ? `<div class="fine">Fly into ${esc(st.airport[0])} · ${esc(st.airport[1])}</div>` : "";
      const sky = (home && st.airport && st.checkin && st.checkout)
        ? `<a class="btn2" target="_blank" rel="noopener" href="${skyscanner(home.code, st.airport[0], st.checkin, st.checkout, st.travellers)}">Skyscanner</a>`
        : `<span class="btn2 travel-off" title="Add your home airport above to pre-fill Skyscanner">Skyscanner</span>`;
      return `<div class="travel-city"><strong>${esc(st.name)}</strong> · ${esc(range)} · ${st.travellers} traveller${st.travellers === 1 ? "" : "s"}${ap}<div class="travel-links"><span class="fine">Flights:</span><a class="btn2" target="_blank" rel="noopener" href="${googleFlights(st.name, st.checkin, st.checkout, st.travellers)}">Google Flights</a>${sky}</div><div class="travel-links"><span class="fine">Hotels:</span><a class="btn2" target="_blank" rel="noopener" href="${booking(st.name, st.checkin, st.checkout, st.travellers)}">Booking.com</a><a class="btn2" target="_blank" rel="noopener" href="${googleHotels(st.name, st.checkin, st.checkout, st.travellers)}">Google Hotels</a></div></div>`;
    }).join("");
    box.innerHTML = html;
    const inp = document.getElementById("travelHome");
    if (inp) inp.addEventListener("change", () => { saveHome(inp.value.trim()); renderForPlan(curPlan); });
  }

  function textForPlan(p) {
    const stays = cityStays(p);
    if (!stays.length) return "";
    const home = homeAirport();
    let out = `\nFlights & stays (search links — Quadlet doesn't book):\n`;
    stays.forEach(st => {
      out += `  ${st.name}${st.checkin && st.checkout ? " (" + iso(st.checkin) + " to " + iso(st.checkout) + ")" : ""}\n`;
      out += `    Flights: ${googleFlights(st.name, st.checkin, st.checkout, st.travellers)}\n`;
      if (home && st.airport && st.checkin && st.checkout) out += `    Flights: ${skyscanner(home.code, st.airport[0], st.checkin, st.checkout, st.travellers)}\n`;
      out += `    Hotels: ${booking(st.name, st.checkin, st.checkout, st.travellers)}\n`;
      out += `    Hotels: ${googleHotels(st.name, st.checkin, st.checkout, st.travellers)}\n`;
    });
    return out;
  }

  return { renderForPlan, textForPlan };
}

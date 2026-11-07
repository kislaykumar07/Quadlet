// AI features (v7.0): plan by talking, vibe search, taste learning, smart packing, route optimizer.
// Deps passed in by app.js: esc, setDestination, getPlan, getForecast, getGeo, saveCurrentPlan.
export function initAI(deps) {
  const { esc, setDestination, getPlan, getForecast, getGeo, saveCurrentPlan } = deps;
  const TASTE_CATS = [["Beaches", "Beaches"], ["Adventure Sports", "Adventure"], ["History", "History"], ["Nature", "Nature"], ["Food", "Food"], ["Nightlife", "Nightlife"], ["Shopping", "Shopping"], ["Mountains", "Mountains"]];
  const TASTE_KEY = "quadlet_taste";
  let taste = { likes: [], dislikes: [] };
  try { const t = JSON.parse(localStorage.getItem(TASTE_KEY) || "null"); if (t && Array.isArray(t.likes) && Array.isArray(t.dislikes)) taste = t; } catch (e) {}
  function saveTaste() { try { localStorage.setItem(TASTE_KEY, JSON.stringify(taste)); } catch (e) {} }
  function getTaste() { return { likes: [...taste.likes], dislikes: [...taste.dislikes] }; }

  // ---- taste chips (in the form): tap once = love it, twice = not for me, three times = clear ----
  function buildTaste() {
    const box = document.getElementById("taste");
    if (!box) return;
    box.innerHTML = "";
    TASTE_CATS.forEach(([val, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill taste-chip" + (taste.likes.includes(val) ? " taste-like" : taste.dislikes.includes(val) ? " taste-dislike" : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        if (taste.likes.includes(val)) { taste.likes = taste.likes.filter(x => x !== val); taste.dislikes.push(val); }
        else if (taste.dislikes.includes(val)) { taste.dislikes = taste.dislikes.filter(x => x !== val); }
        else taste.likes.push(val);
        saveTaste();
        b.className = "pill taste-chip" + (taste.likes.includes(val) ? " taste-like" : taste.dislikes.includes(val) ? " taste-dislike" : "");
      });
      box.appendChild(b);
    });
  }

  // ---- plan by talking ----
  function setField(id, v) { const el = document.getElementById(id); if (el && v !== null && v !== undefined && v !== "") el.value = v; }
  function setInterests(list) {
    document.querySelectorAll("#interests .pill").forEach(b => {
      const want = list.includes(b.textContent);
      const has = b.classList.contains("active");
      if (want !== has) b.click();
    });
  }
  function applyParsed(p) {
    if (!p) return false;
    if (p.destination) setDestination(p.destination);
    if (p.start) setField("start", p.start);
    if (p.end) setField("end", p.end);
    else if (p.start && p.days) {
      const d = new Date(p.start + "T00:00:00"); d.setDate(d.getDate() + p.days - 1);
      setField("end", d.toISOString().slice(0, 10));
    }
    if (p.travellers) setField("travellers", p.travellers);
    if (p.budget) setField("budget", p.budget);
    if (p.currency) setField("currency", p.currency);
    if (p.style) setField("style", p.style);
    if (p.interests && p.interests.length) setInterests(p.interests);
    const f = document.getElementById("tripForm");
    if (f) f.requestSubmit();
    return true;
  }
  function wireTalk() {
    const inp = document.getElementById("talkInput"), btn = document.getElementById("talkBtn"), msg = document.getElementById("talkMsg");
    if (!inp || !btn) return;
    const go = async () => {
      const text = inp.value.trim();
      if (text.length < 3) { if (msg) msg.textContent = "Type your trip in one line — destination, days, budget, who is going."; return; }
      btn.disabled = true; btn.textContent = "Mili is listening…";
      if (msg) msg.textContent = "";
      try {
        const res = await fetch("/api/parse-trip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        const d = await res.json();
        if (d && d.parsed && d.parsed.destination) {
          if (msg) msg.textContent = "Got it — planning " + d.parsed.destination + (d.parsed.start ? " · " + d.parsed.start : "") + (d.parsed.days ? " · " + d.parsed.days + " days" : "") + ".";
          applyParsed(d.parsed);
        } else {
          if (msg) msg.textContent = "Mili couldn't understand that one — try the form below, or rephrase with a place and dates.";
        }
      } catch (e) {
        if (msg) msg.textContent = "Could not reach Mili right now — try the form below.";
      }
      btn.disabled = false; btn.textContent = "Plan it";
    };
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    document.querySelectorAll("[data-talk]").forEach(ch => ch.addEventListener("click", () => { inp.value = ch.dataset.talk; go(); }));
  }

  // ---- vibe search ----
  function wireVibe() {
    const inp = document.getElementById("vibeInput"), btn = document.getElementById("vibeBtn"), out = document.getElementById("vibeOut");
    if (!inp || !btn || !out) return;
    const go = async () => {
      const text = inp.value.trim();
      if (text.length < 3) { out.innerHTML = '<p class="fine">Describe a mood — "quiet and green", "beach party", "temples and food".</p>'; return; }
      btn.disabled = true; btn.textContent = "Finding your vibe…";
      out.innerHTML = '<p class="fine">Mili is matching your vibe…</p>';
      try {
        const res = await fetch("/api/vibe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        const d = await res.json();
        if (d && d.picks && d.picks.length) {
          out.innerHTML = d.picks.map(p => `<div class="card vibe-card"><strong>${esc(p.destination)}</strong><p class="fine" style="margin:6px 0">${esc(p.reason)}</p><button class="btn2" type="button" data-vibe="${esc(p.destination)}">Plan this →</button></div>`).join("") + (d.llm ? "" : '<p class="fine">Picked by keyword match — the AI was offline, so these are best-effort.</p>');
          out.querySelectorAll("[data-vibe]").forEach(b => b.addEventListener("click", () => {
            setDestination(b.dataset.vibe);
            const f = document.getElementById("tripForm");
            if (f) f.scrollIntoView({ behavior: "smooth" });
          }));
        } else {
          out.innerHTML = '<p class="fine">No match found — try different words, like "beach", "mountains", or "quiet".</p>';
        }
      } catch (e) {
        out.innerHTML = '<p class="fine">Could not reach Mili right now — try again in a moment.</p>';
      }
      btn.disabled = false; btn.textContent = "Find my vibe";
    };
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  }

  // ---- smart packing ----
  let _packDoneFor = "";
  function planKey(p) { return p && p.summary ? p.summary.destination + "|" + p.summary.dates : ""; }
  async function enhancePacking() {
    const plan = getPlan();
    const box = document.getElementById("smartPack");
    if (!plan || !box || !plan.packing) return;
    const key = planKey(plan);
    if (_packDoneFor === key) return;
    const w = getForecast();
    if (!w || !w.days || !w.days.length) return; // forecast not loaded yet; onForecast retries
    _packDoneFor = key;
    const places = [];
    (plan.itinerary || []).forEach(d => (d.slots || []).forEach(s => { if (s.place && !places.includes(s.place)) places.push(s.place); }));
    try {
      const res = await fetch("/api/packing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: plan.summary.destination, dates: plan.summary.dates, places, forecast: w.days, packing: plan.packing }) });
      const d = await res.json();
      if (d && d.items && d.items.length) {
        box.innerHTML = `<h3>Packed for your weather — 🤖 Mili's additions</h3><ul>${d.items.map(x => `<li><strong>${esc(x.item)}</strong> — ${esc(x.reason)}</li>`).join("")}</ul><p class="fine">From your trip forecast${d.llm ? "" : " (rule-based — the AI was offline)"}.</p>`;
      }
    } catch (e) {}
  }
  function onForecast() { enhancePacking(); }
  function afterPlan() {
    _packDoneFor = "";
    enhancePacking(); // forecast may already be loaded (saved plan); otherwise onForecast retries
  }

  // ---- route optimizer (nearest-neighbour over the map's pinned stops) ----
  function hav(a, b) {
    const R = 6371, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180;
    const la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function wireOptimize() {
    const btn = document.getElementById("optBtn");
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener("click", () => {
      const plan = getPlan();
      if (!plan || !plan.itinerary) return;
      const geo = getGeo() || {};
      const start = geo["__dest__"] || null;
      let optimized = 0, used = 0;
      const SLOT_ORDER = ["Morning", "Afternoon", "Evening"];
      plan.itinerary.forEach(day => {
        const slots = day.slots || [];
        const pinned = slots.map((s, i) => ({ s, i, c: geo[s.place] })).filter(x => x.c);
        if (pinned.length < 2) return;
        let cur = start || pinned[0].c;
        const order = [];
        const rest = [...pinned];
        while (rest.length) {
          let bi = 0, bd = Infinity;
          rest.forEach((x, i) => { const d = hav(cur, x.c); if (d < bd) { bd = d; bi = i; } });
          const next = rest.splice(bi, 1)[0];
          order.push(next); cur = next.c;
        }
        if (order.some((x, i) => x.i !== pinned[i].i) === false) return;
        const pinnedSet = new Set(pinned.map(x => x.i));
        const labels = slots.map(s => ({ slot: s.slot, time: s.time })).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
        const newSlots = slots.map((s, i) => pinnedSet.has(i) ? null : s);
        order.forEach((x, k) => { newSlots[pinned[k].i] = x.s; });
        newSlots.forEach((s, i) => { if (s) { s.slot = labels[i].slot; s.time = labels[i].time; } });
        day.slots = newSlots;
        optimized++; used += pinned.length;
      });
      if (!optimized) {
        btn.textContent = "Not enough pinned stops yet";
        setTimeout(() => { btn.textContent = "Optimize route"; }, 4000);
        return;
      }
      // re-render just the itinerary section in place (avoids a full re-geocode)
      const h3s = [...document.querySelectorAll("#planOut h3")];
      const h = h3s.find(x => x.textContent.trim().startsWith("Day-wise itinerary"));
      if (h) {
        let node = h.nextElementSibling;
        const frag = document.createElement("div");
        frag.innerHTML = plan.itinerary.map(d => `<div><strong>Day ${d.day}${d.city ? " · " + esc(d.city) : ""}</strong><ul>${d.slots.map(s => `<li>${esc(s.slot)} (${esc(s.time)}): ${esc(s.place)} — ${esc(s.activity)}</li>`).join("")}</ul></div>`).join("");
        while (node && node.tagName !== "H3") { const nx = node.nextElementSibling; node.remove(); node = nx; }
        h.after(...frag.childNodes);
      }
      if (saveCurrentPlan) saveCurrentPlan();
      btn.textContent = `Route optimized ✓ (${optimized} day${optimized === 1 ? "" : "s"}, ${used} stops)`;
      setTimeout(() => { btn.textContent = "Optimize route"; }, 6000);
    });
  }

  buildTaste();
  wireTalk();
  wireVibe();
  // the Optimize button appears whenever a plan renders (submit, saved trip, share link)
  const po = document.getElementById("planOut");
  if (po && window.MutationObserver) new MutationObserver(() => wireOptimize()).observe(po, { childList: true });
  return { getTaste, afterPlan, onForecast };
}

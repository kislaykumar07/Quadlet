// Compare saved trips (v6.6). Deps are passed in by app.js: getAllTrips, esc, parseMoney.
// Selection lives here so it survives renderSaved() re-renders.
export function initCompare(deps) {
  const { getAllTrips, esc, parseMoney } = deps;
  const sel = new Set(); // keys "dest|dates"

  function keyOf(x) { return (x.dest || '') + '|' + (x.dates || ''); }
  function curOf(s) { const m = String(s || '').match(/^\D+/); return m ? m[0].trim() : '₹'; }
  function isRangePlan(p) { return !parseMoney(p && p.summary ? p.summary.total : ''); }
  function rowsOf(p) {
    const m = {};
    if (p && p.budget && p.budget.rows) p.budget.rows.forEach(r => { m[r[0]] = r[1]; });
    return m;
  }
  function placesOf(p) {
    const out = [];
    if (p && p.itinerary) for (const d of p.itinerary) {
      for (const s of (d.slots || [])) {
        if (s.place && !out.includes(s.place)) out.push(s.place);
        if (out.length >= 3) return out;
      }
    }
    return out;
  }
  function fmt(n, cur) { return cur + Math.round(n).toLocaleString('en-IN'); }

  function render() {
    const out = document.getElementById('compareOut');
    const bar = document.getElementById('compareBar');
    const cnt = document.getElementById('compareCount');
    const clr = document.getElementById('compareClear');
    if (!out) return;
    if (cnt) cnt.textContent = sel.size === 0 ? 'Pick any 2 trips to compare'
      : sel.size === 1 ? '1 trip selected — pick one more' : '2 trips selected';
    if (clr) clr.style.display = sel.size ? '' : 'none';
    if (bar) bar.style.display = '';
    const trips = getAllTrips().filter(x => sel.has(keyOf(x)));
    if (trips.length !== 2) { out.innerHTML = ''; return; }
    const [A, B] = trips;
    const pa = A.plan, pb = B.plan;
    const ra = isRangePlan(pa), rb = isRangePlan(pb);
    const ta = parseMoney(pa.summary ? pa.summary.total : '');
    const tb = parseMoney(pb.summary ? pb.summary.total : '');
    const ba = parseMoney(pa.summary ? pa.summary.budget : '');
    const bb = parseMoney(pb.summary ? pb.summary.budget : '');
    const da = (pa.summary && pa.summary.days) || (pa.itinerary ? pa.itinerary.length : 0) || 1;
    const db = (pb.summary && pb.summary.days) || (pb.itinerary ? pb.itinerary.length : 0) || 1;
    const ca = curOf(pa.summary ? pa.summary.total : ''), cb = curOf(pb.summary ? pb.summary.total : '');
    const pda = ra ? null : ta / da, pdb = rb ? null : tb / db;
    const ua = (!ra && ba) ? Math.round(ta / ba * 100) : null;
    const ub = (!rb && bb) ? Math.round(tb / bb * 100) : null;
    const rwa = rowsOf(pa), rwb = rowsOf(pb);

    function cell(v, cheap) { return `<td${cheap ? ' class="cmp-cheap"' : ''}>${v}</td>`; }
    function textRow(label, a, b) {
      return `<tr><td>${label}</td>${cell(esc(a), false)}${cell(esc(b), false)}</tr>`;
    }
    function numRow(label, va, vb, fmtFn) {
      if (va == null || vb == null) {
        return `<tr><td>${label}</td>${cell(va == null ? '—' : fmtFn(va), false)}${cell(vb == null ? '—' : fmtFn(vb), false)}</tr>`;
      }
      return `<tr><td>${label}</td>${cell(fmtFn(va), va < vb)}${cell(fmtFn(vb), vb < va)}</tr>`;
    }
    let rows = '';
    rows += textRow('Destination', pa.summary ? pa.summary.destination : A.dest, pb.summary ? pb.summary.destination : B.dest);
    rows += textRow('Dates', pa.summary ? pa.summary.dates : A.dates, pb.summary ? pb.summary.dates : B.dates);
    rows += numRow('Days', da, db, n => String(n));
    rows += numRow('Travellers', pa.summary ? pa.summary.travellers : 0, pb.summary ? pb.summary.travellers : 0, n => String(n));
    rows += numRow('Total', ra ? null : ta, rb ? null : tb, n => fmt(n, n === ta ? ca : cb));
    rows += textRow('Budget', pa.summary ? pa.summary.budget : '—', pb.summary ? pb.summary.budget : '—');
    rows += numRow('Budget used', ua, ub, n => n + '%');
    rows += numRow('Per-day spend', pda, pdb, n => fmt(n, n === pda ? ca : cb));
    rows += textRow('First stops', placesOf(pa).join(' · ') || '—', placesOf(pb).join(' · ') || '—');
    ['Travel', 'Stay', 'Food', 'Activities', 'Local Transport', 'Miscellaneous'].forEach(k => {
      rows += textRow(k, rwa[k] || '—', rwb[k] || '—');
    });
    out.innerHTML = `<div class="card" style="padding:18px;overflow-x:auto"><h3 style="margin-top:0">Comparing trips</h3>`
      + `<table class="cmp-table"><thead><tr><th></th><th>${esc(A.dest)}</th><th>${esc(B.dest)}</th></tr></thead><tbody>${rows}</tbody></table>`
      + `<p class="fine" style="margin:10px 0 0">Green = lower cost. Ranges mean that trip has no fixed total, so no per-day or budget-used figure is shown for it.</p></div>`;
  }

  function wire() {
    const out = document.getElementById('compareOut');
    if (!out) return;
    document.querySelectorAll('#savedList .cmpick').forEach(sp => {
      sp.addEventListener('click', e => e.stopPropagation());
    });
    document.querySelectorAll('#savedList [data-cmp]').forEach(cb => {
      cb.checked = sel.has(cb.dataset.key);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (sel.size >= 2) { cb.checked = false; return; }
          sel.add(cb.dataset.key);
          if (sel.size === 2) {
            render();
            const o = document.getElementById('compareOut');
            if (o) o.scrollIntoView({ behavior: 'smooth' });
            return;
          }
        } else {
          sel.delete(cb.dataset.key);
        }
        render();
      });
    });
    const clr = document.getElementById('compareClear');
    if (clr && !clr._wired) {
      clr._wired = true;
      clr.addEventListener('click', () => { sel.clear(); wire(); render(); });
    }
    render();
  }

  return { wire, render };
}

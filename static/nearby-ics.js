// Quadlet: calendar export (.ics) + nearby places. ES module imported by app.js.
// Dependencies (lastReq, geoSearch, esc) are passed in so this file stays independent.
// ---- Calendar export (.ics, v5.3): pure functions, no DOM except downloadICS ----
const _ICS_MONTHS={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
function parsePlanStart(p,lastReq){
  if(lastReq&&lastReq.start)return lastReq.start;
  const m=String((p&&p.summary&&p.summary.dates)||'').match(/(\d{1,2}) ([A-Za-z]{3}) (\d{4})/);
  if(!m||_ICS_MONTHS[m[2]]===undefined)return null;
  const d=new Date(Date.UTC(+m[3],_ICS_MONTHS[m[2]],+m[1]));
  return d.toISOString().slice(0,10);
}
function parseSlotTimes(slot,timeStr){
  const m=String(timeStr||'').match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
  if(!m){
    if(slot==='Afternoon')return {sh:13,sm:30,eh:17,em:30};
    if(slot==='Evening')return {sh:18,sm:30,eh:21,em:30};
    return {sh:9,sm:0,eh:12,em:30};
  }
  let sh=+m[1],sm=+m[2],eh=+m[3],em=+m[4];
  if(slot==='Afternoon'||slot==='Evening'){if(sh<12)sh+=12;if(eh<12)eh+=12;}
  if(eh*60+em<=sh*60+sm)eh+=12;
  return {sh,sm,eh,em};
}
function icsEscape(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');}
function icsFold(line){if(line.length<=75)return line;let out=line.slice(0,75);for(let i=75;i<line.length;i+=74)out+='\r\n '+line.slice(i,i+74);return out;}
function icsDateTime(dateStr,hh,mm){const p2=n=>String(n).padStart(2,'0');const[y,mo,d]=dateStr.split('-').map(Number);return `${y}${p2(mo)}${p2(d)}T${p2(hh)}${p2(mm)}00`;}
export function buildICS(p,lastReq){
  const start=parsePlanStart(p,lastReq);
  if(!start||!p.itinerary)return null;
  const dest=(p.summary&&p.summary.destination)||'Trip';
  const slug=dest.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'trip';
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const base=new Date(start+'T00:00:00Z');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Quadlet//Trip Plan//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+icsEscape('Quadlet — '+dest)];
  let n=0;
  for(const d of p.itinerary){
    const dd=new Date(base.getTime()+((d.day||1)-1)*86400000);
    const ds=dd.toISOString().slice(0,10);
    for(const s of (d.slots||[])){
      n++;
      const t=parseSlotTimes(s.slot,s.time);
      const summary=`Day ${d.day}${d.city?' · '+d.city:''} — ${s.place}`;
      const desc=(s.activity||'')+` (Quadlet trip: ${dest}, ${p.summary.dates||''} · Total ${p.summary.total||''})`;
      const generic=/^(travel to|check-?out|transfer to|departure)/i.test(s.place||'');
      lines.push('BEGIN:VEVENT',`UID:quadlet-${slug}-${ds}-${d.day}-${n}@quadlet.vercel.app`,'DTSTAMP:'+stamp,'DTSTART:'+icsDateTime(ds,t.sh,t.sm),'DTEND:'+icsDateTime(ds,t.eh,t.em),'SUMMARY:'+icsEscape(summary),'DESCRIPTION:'+icsEscape(desc));
      if(!generic)lines.push('LOCATION:'+icsEscape(s.place));
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n')+'\r\n';
}
export function downloadICS(p,lastReq){
  const msg=document.getElementById('icsMsg');
  const text=buildICS(p,lastReq);
  if(!text){if(msg)msg.textContent='Could not build the calendar file — trip dates are missing.';return;}
  const start=parsePlanStart(p,lastReq);
  const slug=String((p.summary&&p.summary.destination)||'trip').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'trip';
  const blob=new Blob([text],{type:'text/calendar'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`quadlet-${slug}-${start}.ics`;a.click();URL.revokeObjectURL(a.href);
  if(msg)msg.textContent='Calendar file downloaded — open it to add the trip to your calendar.';
}
// ---- Nearby places (v5.7): the lookup now runs on the backend (GET /api/nearby) ----
const _nearbyCache={};
export async function fetchNearbyPlaces(destName){
  const key=String(destName||'').trim();
  if(!key)return [];
  if(_nearbyCache[key])return _nearbyCache[key];
  const p=(async()=>{
    const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),15000);
    try{
      const r=await fetch('/api/nearby?dest='+encodeURIComponent(key),{signal:ctrl.signal,headers:{'Accept':'application/json'}});
      const j=await r.json();
      return Array.isArray(j.places)?j.places:[];
    }catch(e){return [];}
    finally{clearTimeout(to);}
  })();
  _nearbyCache[key]=p;
  return p;
}
export async function renderNearbyForPlan(p,esc,fetchNearby){
  const box=document.getElementById('nearbyBox');if(!box)return;
  const cities=(p.summary&&p.summary.cities)||[];
  const skel=cities.find(c=>c.mode==='skeleton');
  if(!skel){box.innerHTML='';return;}
  box.innerHTML=`<h3>Nearby places around ${esc(skel.name)}</h3><p class="fine">Live suggestions from Wikipedia — real notable places near ${esc(skel.name)}, within 10 km. No prices here: verify entry and timings before you go.</p><p class="fine">Looking up nearby places…</p>`;
  const items=await fetchNearby(skel.name);
  if(!document.getElementById('nearbyBox'))return;
  if(!items.length){box.innerHTML=`<h3>Nearby places around ${esc(skel.name)}</h3><p class="fine">No notable nearby places found on Wikipedia within 10 km.</p>`;return;}
  p._nearby=items;
  box.innerHTML=`<h3>Nearby places around ${esc(skel.name)}</h3><p class="fine">Live suggestions from Wikipedia — real notable places near ${esc(skel.name)}, within 10 km. No prices here: verify entry and timings before you go.</p><ul>${items.map(x=>`<li><strong>${esc(x.name)}</strong> — ${esc(x.type)}, ${x.km} km away</li>`).join('')}</ul>`;
}

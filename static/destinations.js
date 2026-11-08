// Quadlet researched destinations — data + gallery/chips UI.
// Split out of app.js in v7.2: app.js hit the deploy size cap (~95KB raw per file),
// so the destination list and the card/chip builders live here. app.js imports
// RESEARCHED + buildDestinations and passes its setDestination in.
export const RESEARCHED=['Goa','Manali','Jaipur','Kerala','Bali','Dubai','Udaipur','Varanasi','Rishikesh','Singapore','Thailand','Shimla','Darjeeling','Amritsar','Hampi','Maldives'];
export const GALLERY=[
['Goa','Beaches, food & sunsets','https://images.pexels.com/photos/1078983/pexels-photo-1078983.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Manali','Mountains & adventure','https://images.pexels.com/photos/1624496/pexels-photo-1624496.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Jaipur','Palaces & history','https://images.pexels.com/photos/1603650/pexels-photo-1603650.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Kerala','Backwaters & nature','https://images.pexels.com/photos/962464/pexels-photo-962464.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Bali','Temples & rice terraces','https://images.pexels.com/photos/2166559/pexels-photo-2166559.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Dubai','Skyline & shopping','https://images.pexels.com/photos/3787839/pexels-photo-3787839.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Udaipur','Lakes & palaces','https://images.pexels.com/photos/33658452/pexels-photo-33658452.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Varanasi','Ghats & the Ganges','https://images.pexels.com/photos/16542333/pexels-photo-16542333.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Rishikesh','Yoga & rafting','https://images.pexels.com/photos/15896015/pexels-photo-15896015.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Singapore','Skyline & hawker food','https://images.pexels.com/photos/8176859/pexels-photo-8176859.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Thailand','Temples & street food','https://images.pexels.com/photos/5264079/pexels-photo-5264079.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Shimla','Colonial hills & toy train','https://images.pexels.com/photos/13545201/pexels-photo-13545201.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Darjeeling','Toy train & tea gardens','https://images.pexels.com/photos/3878609/pexels-photo-3878609.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Amritsar','Golden Temple & Punjabi food','https://images.pexels.com/photos/15669533/pexels-photo-15669533.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Hampi','Ruins & boulder landscapes','https://images.pexels.com/photos/28868115/pexels-photo-28868115.jpeg?auto=compress&cs=tinysrgb&w=800'],
['Maldives','Turquoise lagoons & islands','https://images.pexels.com/photos/28859950/pexels-photo-28859950.jpeg?auto=compress&cs=tinysrgb&w=800']];
export function buildDestinations(setDestination){
  const chipsEl=document.getElementById('chips');
  if(chipsEl){
    RESEARCHED.forEach(c=>{const b=document.createElement('button');b.type='button';b.className='chip'+(c==='Goa'?' active':'');b.textContent=c;b.addEventListener('click',()=>{setDestination(c);if(window.anime)anime({targets:b,scale:[1,1.12,1],duration:350,easing:'easeOutExpo'});});chipsEl.appendChild(b);});
    const routeChip=document.createElement('button');routeChip.type='button';routeChip.className='chip';routeChip.textContent='Delhi → Jaipur → Agra';routeChip.title='Multi-city route — days split evenly across the cities';routeChip.addEventListener('click',()=>{setDestination('Delhi → Jaipur → Agra');if(window.anime)anime({targets:routeChip,scale:[1,1.12,1],duration:350,easing:'easeOutExpo'});});chipsEl.appendChild(routeChip);
  }
  const destGallery=document.getElementById('destGallery');
  if(destGallery)GALLERY.forEach(([name,tag,img])=>{
    const b=document.createElement('button');b.type='button';b.className='dest-card'+(name==='Goa'?' active':'');b.dataset.dest=name;
    b.innerHTML=`<img src="${img}" alt="${name}" loading="lazy" onerror="this.style.display='none'"><div class="dest-meta"><strong>${name}</strong><span>${tag}</span></div>`;
    b.addEventListener('click',()=>{setDestination(name);if(window.anime)anime({targets:b,scale:[1,1.04,1],duration:400,easing:'easeOutExpo'});});
    destGallery.appendChild(b);});
}

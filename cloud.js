/* Meghalaya Together: optional Supabase sync layer. No secret keys belong in this file. */
'use strict';
const MT_PREFIX='meghalaya-together-cloud-v1';
let mtClient=null,mtUser=null,mtTrip=null,mtChannel=null,mtRemote={},mtPending={},mtBusy=false;
let mtStatus='Local only',mtPrev={},mtLoadStarted=false,mtLegacySnapshot=structuredClone(state);
let mtInvitation=(()=>{const m=location.hash.match(/(?:^#|&)join=([0-9a-f-]{36})/i);try{
 if(m){sessionStorage.setItem(MT_PREFIX+':join',m[1]);history.replaceState(null,'',location.pathname+location.search)}
 return sessionStorage.getItem(MT_PREFIX+':join')||'';
}catch(e){return m?.[1]||''}})();
const mtSave=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const mtRead=(k,d)=>{try{let v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
let mtDraft=mtRead(MT_PREFIX+':draft',{});
const mtKey=()=>MT_PREFIX+':pending:'+mtTrip?.id;
const mtCacheKey=()=>MT_PREFIX+':cache:'+mtTrip?.id;
const mtClone=x=>JSON.parse(JSON.stringify(x));
function mtFlatten(s){
 const out={};
 for(const d of s.days||[]){out['day|'+d.date+'|notes']=d.notes||'';for(const i of d.items||[])out['day|'+d.date+'|item|'+i.id]=i}
 for(const p of s.places||[])out['place|'+p.id]=p;
 for(const p of s.packing||[]){let {checked,...meta}=p;out['pack|'+p.id+'|meta']=meta;for(const o of ['me','wife','shared'])out['pack|'+p.id+'|check|'+o]=!!(checked||{})[o]}
 for(const s0 of s.stays||[])out['stay|'+s0.id]=s0;
 for(const e of s.expenses||[])out['expense|'+e.id]=e;
 for(const [k,v] of Object.entries(s.budgets||{}))out['budget|'+encodeURIComponent(k)]=v;
 out['trip|notes']=s.tripNotes||'';
 return out;
}
function mtApply(s,key,value){
 const p=key.split('|');let list,item;
 if(p[0]==='day'){
  const d=s.days.find(x=>x.date===p[1]);if(!d)return;
  if(p[2]==='notes'){d.notes=value===null?'':String(value);return}
  if(p[2]==='item'){list=d.items;item=list.findIndex(x=>x.id===p[3]);if(value===null){if(item>=0)list.splice(item,1)}else if(item>=0)list[item]=mtClone(value);else list.push(mtClone(value));return}
 }
 if(['place','stay','expense'].includes(p[0])){
  list=p[0]==='place'?s.places:p[0]==='stay'?s.stays:s.expenses;
  item=list.findIndex(x=>x.id===p[1]);if(value===null){if(item>=0)list.splice(item,1)}else if(item>=0)list[item]=mtClone(value);else list.push(mtClone(value));return;
 }
 if(p[0]==='pack'){
  list=s.packing;item=list.findIndex(x=>x.id===p[1]);
  if(p[2]==='meta'){
   if(value===null){if(item>=0)list.splice(item,1)}
   else if(item>=0){let old=list[item];list[item]={...mtClone(value),checked:old.checked||{me:false,wife:false,shared:false}}}
   else list.push({...mtClone(value),checked:{me:false,wife:false,shared:false}});
  }else if(p[2]==='check'&&item>=0){list[item].checked[p[3]]=!!value}return;
 }
 if(p[0]==='budget'){s.budgets[decodeURIComponent(p[1])]=value===null?0:Number(value)||0;return}
 if(key==='trip|notes'){s.tripNotes=value===null?'':String(value)}
}
function mtRebuild(redraw=true){
 let newState=structuredClone(SEED);
 const ops={...mtRemote,...mtPending};
 // Packing metadata before ownership checkmarks, otherwise a new pack item might not exist yet.
 for(const [k,v] of Object.entries(ops).filter(([k])=>!k.includes('|check|')))mtApply(newState,k,v);
 for(const [k,v] of Object.entries(ops).filter(([k])=>k.includes('|check|')))mtApply(newState,k,v);
 state=newState;mtPrev=mtFlatten(state);
 mtSave(KEY,state);
 mtDrawStatus();if(redraw){let f=document.activeElement;if(f&&(['TEXTAREA','INPUT'].includes(f.tagName)||f.closest?.('#modal'))){return;}render()}
}
function mtChanges(before,after){let diff={};for(let k of new Set([...Object.keys(before),...Object.keys(after)])){
 if(JSON.stringify(before[k])!==JSON.stringify(after[k]))diff[k]=Object.prototype.hasOwnProperty.call(after,k)?mtClone(after[k]):null;
 }return diff}
function mtOnPersist(){
 let flat=mtFlatten(state),changes=mtChanges(mtPrev,flat);mtPrev=flat;
 if(Object.keys(changes).length){
  if(mtTrip){Object.assign(mtPending,changes);mtSave(mtKey(),mtPending);mtDrawStatus();mtScheduleSync()}
  else{Object.assign(mtDraft,changes);mtSave(MT_PREFIX+':draft',mtDraft)}
 }
}
window.mtOnPersist=mtOnPersist;
function mtDrawStatus(){let el=document.getElementById('savedmsg');if(!el)return;
 if(!mtClient)el.textContent='● Saved on this device';
 else if(!mtUser)el.textContent='● Local · Sign in to sync';
 else if(!mtTrip)el.textContent='● Signed in · Choose trip';
 else el.textContent=Object.keys(mtPending).length?'◌ '+Object.keys(mtPending).length+' pending · '+mtStatus:'● '+mtStatus;
}
function mtConfig(){let c=window.MEGHALAYA_CLOUD||{};let local=mtRead(MT_PREFIX+':settings',{});return {url:local.url||c.url||'',key:local.key||c.publishableKey||c.anonKey||''}}
function mtConfigured(){let c=mtConfig();return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.url)&&c.key.length>15}
function mtCloudTab(){
 let c=mtConfig(), configured=mtConfigured(), p=Object.keys(mtPending).length;
 let info=`<div class="card"><div class="section-title">Cloud status <span class="pill">${esc(mtStatus)}</span></div><p class="muted">The dashboard works without a server. Connect Supabase for live shared progress. Changes made offline are stored locally and queued for upload.</p><p class="small muted">${navigator.onLine?'Internet appears available':'Offline'} · ${p} queued updates</p></div>`;
 if(!configured)return h('Together · cloud setup','Configure your private shared trip once, then sign in on both phones.')+info+`<div class="card"><div class="section-title">1. Connect Supabase</div><p class="muted">Create a Supabase project, run <code>supabase/schema.sql</code>, and copy its Project URL and <b>publishable key</b>. Never paste a service_role or secret key.</p><form id="mtSettings" class="field"><label class="inputlabel">Project URL</label><input required type="url" name="url" placeholder="https://abc.supabase.co" value="${attr(c.url)}"><label class="inputlabel">Publishable / anon key</label><input required name="key" type="text" autocomplete="off" placeholder="sb_publishable_..." value="${attr(c.key)}"><button class="btn dark">Save configuration on this device</button></form><p class="small muted">For both phones automatically, put the URL and publishable key in the public <code>config.js</code> before deploying. The database remains protected by RLS and login.</p></div>`;
 if(!mtUser)return h('Together · sign in','Two accounts, one shared trip. Log in by email magic link.')+info+`<div class="card"><div class="section-title">2. Email sign-in</div><p class="muted">Open the login email on the same phone or browser. Enable Email login in Supabase Auth and allow your GitHub Pages URL as a redirect URL.</p><form id="mtLogin" class="formrow"><input type="email" name="email" autocomplete="email" required placeholder="you@example.com" style="flex:1;min-width:180px"><button class="btn dark">Send magic link</button></form>${mtInvitation?'<div class="notice">An invitation link was detected. Sign in and then use Join trip below.</div>':''}</div>`;
 let logged=`<div class="card"><div class="section-title">Signed in</div><p class="muted">${esc(mtUser.email||'Account')} · <button type="button" class="btn small" data-mt="signout">Sign out</button></p></div>`;
 if(!mtTrip)return h('Together · create or join','Start the shared trip on one phone, then invite the other.')+info+logged+`<div class="grid2"><div class="card"><div class="section-title">Create our trip</div><form id="mtCreate"><input name="title" placeholder="Our Meghalaya adventure" value="Meghalaya Together · October 2026" required><button class="btn dark" style="margin-top:12px">Create shared trip</button></form></div><div class="card"><div class="section-title">Join your partner</div><form id="mtJoin"><input name="code" value="${attr(mtInvitation)}" placeholder="Invitation code (UUID)" required><button class="btn dark" style="margin-top:12px">Join shared trip</button></form></div></div>`;
 let invitation=location.origin+location.pathname+'#join='+mtTrip.invite_token;
 let legacyDiff=mtChanges(mtFlatten(SEED),mtFlatten(mtLegacySnapshot));let pendingDraft=Object.keys(mtDraft).length;
 return h('Together · shared trip','Packing, places, edits and expenses sync between your devices when online.')+info+logged+
 `<div class="grid2"><div class="card"><div class="section-title">Invite your partner</div><p class="muted">Only two logged-in people can join this trip. Treat the invitation as private.</p><input id="mtInviteLink" readonly value="${attr(invitation)}"><button class="btn dark" data-mt="copy" style="margin-top:11px">Copy invitation link</button></div><div class="card"><div class="section-title">Synchronization</div><p class="muted">${p?`${p} update(s) waiting to upload.`:'All locally queued changes have been uploaded.'} Edits to separate checklist items sync independently.</p><button class="btn dark" data-mt="sync">Sync now</button><button class="btn" data-mt="refresh" style="margin-left:6px">Refresh from cloud</button></div></div>`+
 ((pendingDraft||Object.keys(legacyDiff).length)?`<div class="section card"><div class="section-title">Import existing local progress</div><p class="muted">This device has edits from the earlier offline dashboard. Upload only fields changed from the original itinerary. <b>May overwrite the corresponding changes your partner made</b>; export a backup first.</p><button class="btn" data-mt="migrate">Upload original local edits</button></div>`:'')+
 `<div class="section notice">Cloud data is restricted to the two signed-in trip members by Supabase Row Level Security. Public website files are not private; do not put passwords, booking codes or personal documents in the repository.</div>`;
}
function mtShow(message,err=false){mtStatus=message;mtDrawStatus();if(tab==='together'){render()}if(err){console.error('[Meghalaya Together]',message);toast(message)}}
async function mtLoadTrip(id){
 mtTrip=null;
 let {data,error}=await mtClient.from('trips').select('id,title,invite_token').eq('id',id).single();
 if(error)throw error;mtTrip=data;localStorage.setItem(MT_PREFIX+':trip-id',id);mtSave(MT_PREFIX+':trip-meta',data);
 mtRemote=mtRead(mtCacheKey(),{});mtPending=mtRead(mtKey(),{});mtRebuild();
 await mtFetchAll();mtSubscribe();await mtFlush();
}
async function mtFetchAll(){
 if(!mtTrip||!navigator.onLine)return;
 let remote={},start=0;
 while(true){let {data,error}=await mtClient.from('trip_kv').select('key,value').eq('trip_id',mtTrip.id).order('key').range(start,start+499);if(error)throw error;
 for(let r of data)remote[r.key]=r.value;
 if(data.length<500)break;start+=500;
 }
 mtRemote=remote;mtSave(mtCacheKey(),mtRemote);mtStatus='Synced';mtRebuild();
}
function mtSubscribe(){
 if(mtChannel){mtClient.removeChannel(mtChannel)}
 mtChannel=mtClient.channel('meghalaya-trip-'+mtTrip.id).on('postgres_changes',
  {event:'*',schema:'public',table:'trip_kv',filter:'trip_id=eq.'+mtTrip.id},payload=>{
   let row=payload.new||payload.old;if(!row?.key)return;
   if(payload.eventType==='DELETE')delete mtRemote[row.key];else mtRemote[row.key]=row.value;
   mtSave(mtCacheKey(),mtRemote);mtRebuild();
  }).subscribe(status=>{if(status==='SUBSCRIBED')mtShow('Live sync connected');});
}
let mtTimer=null;
function mtScheduleSync(){if(mtTimer)clearTimeout(mtTimer);mtTimer=setTimeout(()=>{mtTimer=null;mtFlush()},650)}
async function mtFlush(){
 if(!mtClient||!mtUser||!mtTrip||!navigator.onLine||mtBusy)return;
 mtBusy=true;
 try{while(Object.keys(mtPending).length){
   const entries=Object.entries(mtPending).slice(0,75);
   let {error}=await mtClient.from('trip_kv').upsert(entries.map(([key,value])=>({trip_id:mtTrip.id,key,value,updated_by:mtUser.id})),{onConflict:'trip_id,key'});
   if(error)throw error;
   for(const [key,value] of entries){mtRemote[key]=value;if(JSON.stringify(mtPending[key])===JSON.stringify(value))delete mtPending[key]}
   mtSave(mtKey(),mtPending);mtSave(mtCacheKey(),mtRemote);
  }
  mtStatus='Synced';mtDrawStatus();if(tab==='together')render();
 }catch(e){mtStatus='Queued offline / retry';mtDrawStatus();console.warn('Sync failed; updates retained:',e.message)}finally{mtBusy=false}
}
function mtResumeOffline(){
 const cached=mtRead(MT_PREFIX+':trip-meta',null);if(!cached?.id)return false;
 mtTrip=cached;mtRemote=mtRead(mtCacheKey(),{});mtPending=mtRead(mtKey(),{});mtStatus='Offline · edits queued';mtRebuild();return true;
}
async function mtSelectDefaultTrip(){
 const preferred=localStorage.getItem(MT_PREFIX+':trip-id');
 if(preferred){try{await mtLoadTrip(preferred);return}catch(e){console.warn('Previous trip unavailable:',e.message);if(!navigator.onLine){mtResumeOffline();return}}}
 const {data,error}=await mtClient.from('trip_members').select('trip_id').eq('user_id',mtUser.id).limit(1);
 if(error)throw error;if(data?.length){await mtLoadTrip(data[0].trip_id)}else{mtTrip=null;mtShow('Ready to create / join')}
}
async function mtOnSession(session){
 let user=session?.user||null;
 if(mtUser?.id===user?.id&&mtLoadStarted)return;
 mtUser=user;mtLoadStarted=!!user;
 if(!user){mtTrip=null;mtRemote={};mtPending={};mtStatus='Sign in to sync';mtDrawStatus();if(tab==='together')render();return}
 try{mtStatus='Connecting';mtDrawStatus();await mtSelectDefaultTrip()}catch(e){mtShow('Connection unavailable: '+e.message,true)}
}
async function mtInit(){
 mtPrev=mtFlatten(state);
 if(!mtConfigured()){mtDrawStatus();return}
 if(!window.supabase?.createClient){if(!mtResumeOffline())mtShow('Supabase library unavailable; local mode');return}
 let c=mtConfig();mtClient=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 mtClient.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>mtOnSession(session),0)});
 const {data,error}=await mtClient.auth.getSession();if(error){mtShow(error.message,true);return}await mtOnSession(data.session);
}
document.addEventListener('submit',async e=>{
 let form=e.target,id=form.id;if(!['mtSettings','mtLogin','mtCreate','mtJoin'].includes(id))return;
 e.preventDefault();let f=Object.fromEntries(new FormData(form));
 try{
  if(id==='mtSettings'){
   if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(f.url)||!f.key||f.key.length<16)throw Error('Enter a valid Supabase URL and publishable key.');
   if(/service.role|sb_secret_|secret_key/i.test(f.key))throw Error('Do not use a secret/service_role key.');
   mtSave(MT_PREFIX+':settings',{url:f.url.trim().replace(/\/$/,''),key:f.key.trim()});location.reload();return;
  }
  if(!mtClient)throw Error('Configure Supabase first');
  if(id==='mtLogin'){const {error}=await mtClient.auth.signInWithOtp({email:f.email.trim(),options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;alert('Login link sent. Open the email on this device.');return}
  if(!mtUser)throw Error('Please sign in first');
  if(id==='mtCreate'){const {data,error}=await mtClient.rpc('create_trip',{p_title:f.title});if(error)throw error;await mtLoadTrip(data);mtShow('Your trip is ready');return}
  if(id==='mtJoin'){let code=f.code.trim();if(!/^[0-9a-f-]{36}$/i.test(code))throw Error('Invalid invitation code');const {data,error}=await mtClient.rpc('join_trip',{p_token:code});if(error)throw error;sessionStorage.removeItem(MT_PREFIX+':join');mtInvitation='';await mtLoadTrip(data);mtShow('Joined shared trip');return}
 }catch(err){alert('Unable to complete: '+err.message)}
});
document.addEventListener('click',async e=>{
 let el=e.target.closest('[data-mt]');if(!el)return;
 const action=el.dataset.mt;
 try{
  if(action==='signout'){const {error}=await mtClient.auth.signOut();if(error)throw error;mtLoadStarted=false;mtUser=null;mtTrip=null;mtStatus='Signed out';render();return}
  if(action==='copy'){let link=document.getElementById('mtInviteLink')?.value;if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(link);toast('Private invitation copied')}else{prompt('Copy this invitation link:',link)}return}
  if(action==='sync'){await mtFlush();if(tab==='together')render();return}
  if(action==='refresh'){await mtFetchAll();return}
  if(action==='migrate'){
   if(!confirm('Upload local changes from the original offline dashboard? This may replace the same fields edited on the other phone. Export a backup first.'))return;
   const changed={...mtChanges(mtFlatten(SEED),mtFlatten(mtLegacySnapshot)),...mtDraft};
   Object.assign(mtPending,changed);mtSave(mtKey(),mtPending);mtDraft={};mtSave(MT_PREFIX+':draft',{});mtLegacySnapshot=structuredClone(SEED);mtRebuild();await mtFlush();toast('Local progress queued for sync');return;
  }
 }catch(err){mtShow('Action failed: '+err.message,true)}
});
window.addEventListener('online',()=>{mtStatus='Reconnecting';mtDrawStatus();if(!mtClient&&mtConfigured()){location.reload();return}mtFetchAll().then(mtFlush).catch(err=>mtShow('Offline changes kept: '+err.message))});
window.addEventListener('offline',()=>{mtStatus='Offline · local saves';mtDrawStatus()});
setInterval(()=>{if(navigator.onLine&&mtTrip&&Object.keys(mtPending).length)mtFlush()},14000);
mtInit().catch(e=>mtShow('Cloud setup failed: '+e.message,true));

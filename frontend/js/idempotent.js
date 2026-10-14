// Idempotent client actions: the key is generated once per intent, hidden from the user, and REUSED on Retry.
// ---- idempotent actions: key is generated automatically & hidden; Retry reuses it ----
async function run(k,url,body,okMsg){const p=pend[k]=pend[k]||{key:crypto.randomUUID()};p.state='busy';go(tab);
 try{const r=await api('POST',url,body,{'Idempotency-Key':p.key});delete pend[k];toast(r.s<300?'✅ '+(r.j.replayed?'Already confirmed — ':'')+okMsg(r.j):'❌ '+r.j.message)}catch{p.state='lost'}
 await go(tab);bell()}
const reg=c=>run('c'+c,'/api/registrations',{courseCode:c},j=>`Registered! Reference ${j.ref}`);
function sub(id){const p=pend['a'+id],text=p?.text||$('#t'+id)?.value.trim();if(!text)return toast('Write your answer first');pend['a'+id]=p||{key:crypto.randomUUID(),text};run('a'+id,`/api/assignments/${id}/submit`,{text},j=>`${j.message} Reference ${j.ref}`)}


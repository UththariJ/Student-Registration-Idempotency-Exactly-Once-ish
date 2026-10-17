// HTTP helper + small UI utilities.
const toast=t=>{$('#toast').textContent=t;$('#toast').className='s';setTimeout(()=>$('#toast').className='',3200)};
const api=async(m,u,b,h={})=>{const r=await fetch(u,{method:m,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(S?.token||''),...h},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(r.status===401&&S){sessionStorage.clear();location.href=`/${P}/login`}return{s:r.status,j}};
const post=async(u,b,ok)=>{const r=await api('POST',u,b);toast(r.s<300?ok||r.j.message:'Error: '+r.j.message);return r};
const writeKeys={};
const write=async(m,u,b)=>{const identity=m+':'+u+':'+JSON.stringify(b||{});writeKeys[identity]=writeKeys[identity]||crypto.randomUUID();return api(m,u,b,{'Idempotency-Key':writeKeys[identity]})};
const del=async u=>{const r=await write('DELETE',u);toast(r.s<300?r.j.message:'Error: '+r.j.message);go(tab)};
const chips=a=>a.map(x=>`<span class="pill c">${E(x)}</span>`).join(' ');
const act=async(m,u,b)=>{const r=await write(m,u,b);toast(r.s<300?(r.j.replayed?'Already saved — ':'')+r.j.message:'Error: '+r.j.message);go(tab)};
const val=ids=>Object.fromEntries(ids.map(i=>[i,$('#'+i).value]));

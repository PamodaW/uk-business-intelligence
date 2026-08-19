const state={items:[],selected:null};
const app=document.querySelector("#app");
app.innerHTML=`
<div class="shell">
<header class="top"><div class="brand"><div class="logo">UK</div><div><b>Business Intelligence</b><span>New company prospecting</span></div></div><div class="actions"><button class="btn" id="presentation">Presentation</button><button class="btn" id="export">Export CSV</button><button class="btn primary" id="sync">Sync Companies</button></div></header>
<main class="main">
<section class="hero"><div><div class="eyebrow">Executive prospecting dashboard</div><h1>Find the next UK business opportunity.</h1><p>Discover newly incorporated companies, enrich public contact details, score potential opportunities and present the strongest leads without opening a spreadsheet.</p></div></section>
<section class="stats">
<div class="stat"><span>Companies in workspace</span><strong id="sTotal">—</strong></div>
<div class="stat"><span>Technology leads</span><strong id="sTech">—</strong></div>
<div class="stat"><span>Public emails</span><strong id="sEmails">—</strong></div>
<div class="stat"><span>High-potential leads</span><strong id="sHigh">—</strong></div>
</section>
<section class="toolbar">
<input class="input" id="search" placeholder="Search company or business description...">
<select class="select" id="category"><option value="">All industries</option><option>Technology</option><option>Professional Services</option><option>Retail / E-commerce</option><option>Property</option><option>Health / Beauty</option><option>Travel / Hospitality</option><option>Logistics</option><option>Other</option></select>
<input class="input" id="from" type="date" aria-label="From date">
<input class="input" id="to" type="date" aria-label="To date">
</section>
<section class="panel"><table class="table"><thead><tr><th>Company</th><th>Business</th><th>Industry</th><th>Contact</th><th>Score</th><th>Status</th></tr></thead><tbody id="rows"><tr><td colspan="6" class="loading">Loading...</td></tr></tbody></table></section>
</main><div class="detailBackdrop" id="detailBackdrop"></div><aside class="detail" id="detail"></aside><div class="toast" id="toast"></div></div>`;

const $=s=>document.querySelector(s);
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3000)}
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||"Request failed");return data}
function score(x){if(x.lead_score)return x.lead_score;let n=35;if(x.category==="Technology")n+=35;if(x.website)n+=15;if(x.email)n+=15;return Math.min(99,n)}
function render(){
 const q=$("#search").value.toLowerCase(),cat=$("#category").value,from=$("#from").value,to=$("#to").value;
 const items=state.items.filter(x=>(!q||`${x.company_name} ${x.notes}`.toLowerCase().includes(q))&&(!cat||x.category===cat)&&(!from||x.incorporation_date>=from)&&(!to||x.incorporation_date<=to));
 $("#rows").innerHTML=items.length?items.map(x=>`<tr><td><button class="rowbtn" data-company="${x.company_number}"><div class="company">${x.company_name}</div><div class="sub">${x.company_number} · ${x.incorporation_date||"—"}</div></button></td><td>${x.notes||"Business profile not yet enriched."}</td><td><span class="badge">${x.category||"Other"}</span></td><td>${x.email?`<span class="email">✉ ${x.email}</span>`:"<span class=\"muted\">No public email</span>"}</td><td class="score">${score(x)}</td><td><span class="badge">${x.lead_status||"new"}</span></td></tr>`).join(""):`<tr><td colspan="6" class="empty">No companies match your filters.</td></tr>`;
 $("#sTotal").textContent=state.items.length;
 $("#sTech").textContent=state.items.filter(x=>x.category==="Technology").length;
 $("#sEmails").textContent=state.items.filter(x=>x.email).length;
 $("#sHigh").textContent=state.items.filter(x=>score(x)>=75).length;
 document.querySelectorAll("[data-company]").forEach(b=>b.addEventListener("click",()=>openDetail(b.dataset.company)));
}
async function load(){state.items=(await api("/api/companies?limit=500")).items;render()}
function closeDetail(){$("#detail").classList.remove("open");$("#detailBackdrop").classList.remove("show");document.body.classList.remove("detail-open")}
async function openDetail(num){
 const x=await api(`/api/companies/${encodeURIComponent(num)}`);
 state.selected=x;
 $("#detail").classList.add("open");
 $("#detailBackdrop").classList.add("show");
 document.body.classList.add("detail-open");
 $("#detail").innerHTML=`<button class="detailClose" id="detailClose" aria-label="Close">✕</button><div class="detailGrid"><div class="detailPanel"><div class="eyebrow">Company profile</div><h2>${x.company_name}</h2><p class="muted">${x.notes||"No detailed public business description yet."}</p><div class="kv"><b>Company number</b><span>${x.company_number}</span></div><div class="kv"><b>Incorporated</b><span>${x.incorporation_date||"—"}</span></div><div class="kv"><b>Industry</b><span>${x.category||"Other"}</span></div><div class="kv"><b>Location</b><span>${x.address||"—"}</span></div><div class="kv"><b>Website</b><span>${x.website?`<a href="${x.website}" target="_blank" rel="noreferrer">${x.website}</a>`:"Not discovered"}</span></div><div class="kv"><b>Public email</b><span>${x.email||"No public email found"}</span></div><div class="kv"><b>Email source</b><span>${x.email_source?`<a href="${x.email_source}" target="_blank" rel="noreferrer">View source page</a>`:"—"}</span></div></div><div class="detailPanel"><div class="eyebrow">Prospecting</div><h2>${score(x)} / 100</h2><p class="muted">Lead score based on available business signals. Review before outreach.</p><button class="btn primary" id="enrich">Find public email</button><button class="btn" id="ch" style="margin-left:8px">Companies House</button><div style="margin-top:18px"><label class="muted">Lead status</label><select class="select" id="leadStatus"><option ${x.lead_status==="new"?"selected":""}>new</option><option ${x.lead_status==="qualified"?"selected":""}>qualified</option><option ${x.lead_status==="contacted"?"selected":""}>contacted</option><option ${x.lead_status==="won"?"selected":""}>won</option><option ${x.lead_status==="dismissed"?"selected":""}>dismissed</option></select></div></div></div>`;
 $("#detailClose").addEventListener("click",closeDetail);
 $("#enrich").addEventListener("click",async()=>{try{$("#enrich").disabled=true;$("#enrich").textContent="Finding public email...";const r=await api(`/api/companies/${num}/enrich`,{method:"POST",body:JSON.stringify({})});state.items=state.items.map(i=>i.company_number===num?r:i);toast(r.email?`Public email found: ${r.email}`:"No public email found");openDetail(num);render()}catch(e){toast(e.message)}finally{$("#enrich").disabled=false;$("#enrich").textContent="Find public email"}});
 $("#ch").addEventListener("click",()=>window.open(`https://find-and-update.company-information.service.gov.uk/company/${num}`,"_blank"));
 $("#leadStatus").addEventListener("change",async e=>{await api(`/api/leads/${num}`,{method:"PATCH",body:JSON.stringify({lead_status:e.target.value})});toast("Lead status updated");load()});
}
$("#search").addEventListener("input",render);$("#category").addEventListener("change",render);$("#from").addEventListener("change",render);$("#to").addEventListener("change",render);
$("#export").addEventListener("click",()=>window.open("/api/export.csv","_blank"));
$("#sync").addEventListener("click",async()=>{try{const from=$("#from").value||new Date(Date.now()-7*864e5).toISOString().slice(0,10);const to=$("#to").value||new Date().toISOString().slice(0,10);const r=await api("/api/companies/sync",{method:"POST",body:JSON.stringify({from,to,limit:100})});toast(`${r.imported} companies synced`);load()}catch(e){toast(e.message)}});
$("#presentation").addEventListener("click",()=>document.body.classList.toggle("presentation"));
$("#detailBackdrop").addEventListener("click",closeDetail);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail()});
load();

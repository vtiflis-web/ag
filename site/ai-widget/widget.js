
/* ---------- agro AI chat ----------
   Two backends: CONFIG.aiEndpoint (Supabase edge function agro-chat, streams text/plain)
   or, inside a claude.ai viewer, the artifact `sample` capability. Neither → the button stays hidden.
   Replies may end with [[add:ID|size]] [[bundle:ID|BLOOM]] [[plan:key]] [[viber]] tags, rendered as buttons. */
const AI_RULES = __AI_RULES__;
const AI_CHIPS = ["ვიოლეტას რა სასუქი სჭირდება?","პომიდორს ქვედა ფოთლები უყვითლდება","50 გ რამდენ ხანს მეყოფა?","სათბურში კიტრი მაქვს, რა დოზით?"];
const AI = {open:false,busy:false,turns:[],img:null,ctl:null,sample:null,caps:null,ready:false,sid:""};
try{AI.sid=sessionStorage.getItem("am_ai_sid")||"";if(!AI.sid){AI.sid=Math.random().toString(36).slice(2)+Date.now().toString(36);sessionStorage.setItem("am_ai_sid",AI.sid)}}catch(e){}

function aiKB(){
  const L=["მონაცემები (agromart.ge, ცოცხალი კატალოგი):","პროდუქცია: Green House Feeding, ევროპული ფხვნილოვანი მინერალური სასუქი, წყალში სრულად ხსნადი. 1 გ ≈ 1–2 ლ ხსნარი, 1 საზომი კოვზი ≈ 10 გ."];
  ORDER.forEach(id=>{const p=byId[id],g=GHF[id];L.push(`- ${nm(id)} [id ${id}]: NPK ${g.npk}, EC ${g.ec} (1 გ/ლ). ${LINE[id].role}: ${LINE[id].crops}. ${p.desc} შეფუთვები: ${p.v.map(v=>`${v.size} ${v.price} ₾${!v.stock?" (ამოწურულია)":v.stock<=5?` (ბოლო ${v.stock})`:""}`).join("; ")}.`)});
  L.push("ნაკრებები: Grow + ყვავილობის სასუქი (GHF-SF ან GHF-HYB) + Booster PK+:");
  BUNDLES.forEach(b=>L.push(`- ${b.name} [id ${b.id}]: თითო ${b.items[0][1]}, ${b.price} ₾${b.freeShip?", თბილისში მიწოდება უფასო":""}`));
  L.push("კვების გეგმები (დოზა გ / 10 ლ წყალზე, ნიადაგში ყოველ მეორე მორწყვაზე):");
  SEG.forEach(s=>L.push(`- ${s.n} [plan ${s.k}] (${s.ex}): ${s.ph.map(p=>`${p.n}${p.s?` (${p.s})`:""}, ${p.w} კვ.: ${ORDER.filter(pid=>p.d[pid]).map(pid=>`${nm(pid)} ${p.d[pid]} გ`).join(" + ")}, ${freq(p.f)}`).join("; ")}. ${s.u==="ჩითილი"?"ჩითილს":s.u==="ძირი"?"ძირს":"ქოთანს"} ≈ ${fl(s.L)} ხსნარი.`));
  L.push("სიმპტომები:");
  DOC.forEach(d=>L.push(`- ${d.n}: ${d.cause}. ჯერ: ${d.first} რა უშველის: ${d.fix}`));
  L.push("ტექნიკა: pH ნიადაგი 6.0–7.0, ქოქოსი და ჰიდრო 5.5–6.5; ხსნარი 18–22 °C. ქოქოსი/ჰიდრო: ხსნარი ყოველ მორწყვაზე, ავზი იცვლება კვირაში ერთხელ. ოსმოსური წყალი: ჯერ კალციუმი EC 0.3–0.4-მდე. გამორეცხვა მოსავლამდე 7–10 დღე. ფოთლოვანი კვება: 100 მლ ხსნარი 900 მლ წყალზე. მარაგის ხსნარი 30 გ/ლ. ხსნარი ბნელ ჭურჭელში 10 დღემდე ინახება.");
  const D=CONFIG.delivery;
  L.push(`მაღაზია: ყოველ 500 გ შეფუთვაზე 50 გ საჩუქრად. მიწოდება: ${D.tbilisi.name}, ${D.tbilisi.fee} ₾, უფასო ${D.tbilisi.free} ₾-დან; ${D.region.name}, ${D.region.fee} ₾, უფასო ${D.region.free} ₾-დან; აწვდის ${CONFIG.fulfillment}. გადახდა: კურიერთან (თბილისი), საბანკო გადარიცხვა${CONFIG.cardEnabled?", ბარათი ონლაინ":""}. დაბრუნება: გაუხსნელი 14 დღეში. კონტაქტი: ${CONFIG.email}, Viber/WhatsApp, ${CONFIG.hours}.`);
  return L.join("\n");
}

const AI_TAG=/\[\[(add|bundle|plan|viber)(?::([^\]]*))?\]\]/g;
function aiInline(s){return s.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>")}
function aiAct(k,v){
  v=(v||"").trim();
  if(k==="add"){const [pid,size]=v.split("|").map(s=>s.trim()),x=byId[pid]&&variant(pid,size);return x&&x.stock?`<button class="btn" type="button" data-addsz="${esc(pid)}|${esc(size)}">${esc(nm(pid))} ${esc(size)}, ${fmt(x.price)}</button>`:""}
  if(k==="bundle"){const [id,bl]=v.split("|").map(s=>s.trim()),b=BUNDLES.find(b=>b.id===id),bloom=bl==="GHF-HYB"?"GHF-HYB":"GHF-SF";return b?`<button class="btn" type="button" data-bundle="${b.id}" data-bloom="${bloom}">${esc(b.name)}, ${esc(nm(bloom))}, ${fmt(b.price)}</button>`:""}
  if(k==="plan"){const s=SEG.find(s=>s.k===v);return s?`<button class="btn ghost" type="button" data-aiplan="${s.k}">გეგმა: ${esc(s.n)}</button>`:""}
  if(k==="viber")return `<button class="btn ghost" type="button" data-contact="viber">ფოტოს გაგზავნა Viber-ში</button>`;
  return "";
}
function aiMd(t){
  t=t.replace(/\[\[[^\]]*\]?$/,"");
  const acts=[];t=t.replace(AI_TAG,(m,k,v)=>{const h=aiAct(k,v);if(h&&!acts.includes(h))acts.push(h);return ""}).trim();
  const body=esc(t).split(/\n{2,}/).map(par=>{const ls=par.split("\n").filter(l=>l.trim());if(!ls.length)return "";
    const bul=l=>/^\s*[-•*]\s+/.test(l);
    if(ls.every(bul))return `<ul>${ls.map(l=>`<li>${aiInline(l.replace(/^\s*[-•*]\s+/,""))}</li>`).join("")}</ul>`;
    return `<p>${ls.map(l=>bul(l)?"• "+aiInline(l.replace(/^\s*[-•*]\s+/,"")):aiInline(l)).join("<br>")}</p>`}).join("");
  return body+(acts.length?`<div class="aiacts">${acts.slice(0,3).join("")}</div>`:"");
}
function aiScroll(){const l=$("#aiLog");l.scrollTop=l.scrollHeight}
function aiBubble(role,html,cls){const d=document.createElement("div");d.className=`aim ${role}${cls?" "+cls:""}`;d.innerHTML=html;$("#aiLog").appendChild(d);aiScroll();return d}
function aiWelcome(){
  $("#aiLog").innerHTML="";
  aiBubble("a",`<p>გამარჯობა! მე ვარ აგრო AI. გეტყვით, რომელი სასუქი სჭირდება თქვენს მცენარეს, რა დოზით და რამდენი დაჯდება.${AI.caps?" ფოტოც შეგიძლიათ გამოგზავნოთ.":""}</p><div class="aichips" style="margin-top:10px">${AI_CHIPS.map(q=>`<button type="button" data-aiq="${esc(q)}">${esc(q)}</button>`).join("")}</div>`);
}
function aiToggle(open){
  AI.open=open;$("#aiPanel").hidden=!open;$("#aiFab").hidden=open||!AI.ready;$("#aiFab").setAttribute("aria-expanded",String(open));
  if(open){if(!$("#aiLog").children.length)aiWelcome();setTimeout(()=>$("#aiText").focus(),50)}else $("#aiFab").focus();
}
function aiSetImg(file){
  AI.img=file||null;const p=$("#aiPrev");
  if(!file){p.hidden=true;p.innerHTML="";return}
  const url=URL.createObjectURL(file);
  p.innerHTML=`<img src="${url}" alt="არჩეული ფოტო"><span>ფოტო დაემატა</span><button class="aiib" type="button" id="aiImgX" aria-label="ფოტოს მოხსნა" style="width:32px;height:32px">×</button>`;p.hidden=false;
}
async function aiShrink(file){
  const bmp=await createImageBitmap(file),k=Math.min(1,1024/Math.max(bmp.width,bmp.height));
  const c=document.createElement("canvas");c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
  c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
  return await new Promise(r=>c.toBlob(r,"image/jpeg",0.85));
}
const aiB64=blob=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(",")[1]);r.onerror=no;r.readAsDataURL(blob)});
function aiHistory(){
  // last 12 turns, starting on a user turn
  let h=AI.turns.slice(-12);while(h.length&&h[0].role!=="user")h=h.slice(1);return h;
}
async function aiAsk(text){
  text=(text||"").trim();if(AI.busy||(!text&&!AI.img))return;
  if(!text)text="რა სჭირს ამ მცენარეს?";
  const img=AI.img;aiSetImg(null);$("#aiText").value="";aiGrow();
  const chips=document.querySelector("#aiLog .aichips");if(chips)chips.remove();
  aiBubble("u",(img?`<img class="uimg" src="${URL.createObjectURL(img)}" alt="გაგზავნილი ფოტო">`:"")+`<p>${esc(text)}</p>`);
  AI.turns.push({role:"user",content:img?`[ფოტო მიმაგრებულია] ${text}`:text});
  const out=aiBubble("a",`<span class="aithink" aria-label="ფიქრობს"><i></i><i></i><i></i></span>`);
  AI.busy=true;$("#aiSend").disabled=true;AI.ctl=new AbortController();
  const show=t=>{const i=t.lastIndexOf("\u001e");if(i>=0)t=t.slice(i+1);if(t.trim()){out.innerHTML=aiMd(t);aiScroll()}};
  let text2="";
  try{
    if(CONFIG.aiEndpoint){
      const body={session:AI.sid,messages:aiHistory()};
      if(img){const j=await aiShrink(img);body.image={media_type:"image/jpeg",data:await aiB64(j)}}
      const r=await fetch(CONFIG.aiEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AI.ctl.signal});
      if(!r.ok||!r.body)throw {code:r.status===429?"rate_limited":"upstream_error"};
      const rd=r.body.getReader(),dec=new TextDecoder();
      for(;;){const {done,value}=await rd.read();if(done)break;text2+=dec.decode(value,{stream:true});show(text2)}
    }else{
      const input=[{role:"user",content:AI_RULES+"\n\n"+aiKB()+"\n\nქვემოთ მომხმარებლის საუბარია. უპასუხე ბოლო შეტყობინებას."},...aiHistory()];
      const res=await AI.sample(input,{cache:false,signal:AI.ctl.signal,modelTier:img?"default":"quick",images:img?[await aiShrink(img)]:undefined,onText:({text})=>{text2=text;show(text)}});
      text2=res.text;show(text2);
    }
    const i=text2.lastIndexOf("\u001e");if(i>=0)text2=text2.slice(i+1);
    if(!text2.trim())throw {code:"empty_completion"};
    AI.turns.push({role:"assistant",content:text2});
  }catch(e){
    const code=e&&e.code;
    if(code==="cancelled"||(e&&e.name==="AbortError")){if(!text2.trim())out.remove()}
    else{
      const msg=code==="not_granted"?"AI ასისტენტი ამ ბრაუზერში არ არის ჩართული. მოგვწერეთ Viber-ში, უპასუხებს კონსულტანტი.":code==="rate_limited"?"ახლა ბევრი კითხვაა. სცადეთ ერთ წუთში.":code==="prompt_too_large"?"საუბარი ძალიან გრძელია. დახურეთ ჩატი და დაიწყეთ თავიდან.":code==="image_rejected"||code==="images_unavailable"?"ფოტო ვერ მივიღეთ. სცადეთ JPG ან PNG, ან გამოგვიგზავნეთ Viber-ში.":"პასუხი ვერ მივიღეთ. სცადეთ თავიდან ან მოგვწერეთ Viber-ში.";
      out.classList.add("err");out.innerHTML=aiMd(msg+"\n[[viber]]");
    }
  }finally{AI.busy=false;$("#aiSend").disabled=false;AI.ctl=null;aiScroll()}
}
function aiGrow(){const t=$("#aiText");t.style.height="auto";t.style.height=Math.min(120,t.scrollHeight)+"px"}
async function aiInit(){
  if(CONFIG.aiEndpoint){AI.caps=true}
  else{
    const c=window.claude;if(!c||typeof c.use!=="function")return;
    try{AI.sample=await c.use("sample")}catch(e){AI.sample=null}
    if(!AI.sample)return;
    try{const l=await AI.sample.limits();AI.caps=!!(l&&l.images)}catch(e){AI.caps=false}
  }
  $("#aiPhoto").hidden=!AI.caps;AI.ready=true;$("#aiFab").hidden=AI.open;
}
$("#aiFab").addEventListener("click",()=>aiToggle(true));
$("#aiClose").addEventListener("click",()=>{if(AI.ctl)AI.ctl.abort();aiToggle(false)});
$("#aiPhoto").addEventListener("click",()=>$("#aiFile").click());
$("#aiFile").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];e.target.value="";if(!f)return;if(f.size>15e6){flash("ფოტო ძალიან დიდია");return}aiSetImg(f);$("#aiText").focus()});
$("#aiForm").addEventListener("submit",e=>{e.preventDefault();aiAsk($("#aiText").value)});
$("#aiText").addEventListener("input",aiGrow);
$("#aiText").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();aiAsk(e.target.value)}});
$("#aiPanel").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
  if(b.dataset.aiq){aiAsk(b.dataset.aiq);return}
  if(b.id==="aiImgX"){aiSetImg(null);return}
  if(b.dataset.aiplan){setSeg(b.dataset.aiplan,true);if(innerWidth<760)aiToggle(false);return}
  if((b.dataset.bundle||b.dataset.addsz)&&innerWidth<760)aiToggle(false);
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&AI.open){if(AI.ctl)AI.ctl.abort();aiToggle(false)}});

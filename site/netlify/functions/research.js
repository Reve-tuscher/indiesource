const MODEL="claude-haiku-4-5-20251001";
function strip(h){ return (h||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&[a-z#0-9]+;/gi," ").replace(/\s+/g," ").trim(); }
async function licenseOk(license){
  if(!license) return false;
  const owner=process.env.OWNER_UNLOCK_CODE;
  if(owner && license===owner) return true;
  try{ const r=await fetch("https://api.lemonsqueezy.com/v1/licenses/validate",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({license_key:license})}); const d=await r.json(); return !!(d && d.valid===true); }catch(e){ return false; }
}
exports.handler=async function(event){
  const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Content-Type":"application/json"};
  if(event.httpMethod==="OPTIONS") return {statusCode:200,headers,body:"{}"};
  let name="",source="",license="";
  try{ const b=JSON.parse(event.body||"{}"); name=(b.name||"").toString().slice(0,200); source=(b.source||"").toString().slice(0,300); license=(b.license||"").toString().slice(0,200).trim(); }catch(e){}
  const ok=await licenseOk(license);
  if(!ok) return {statusCode:200,headers,body:JSON.stringify({needsPro:true})};
  const apiKey=process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return {statusCode:200,headers,body:JSON.stringify({error:"AI is not configured yet (add ANTHROPIC_API_KEY in Netlify)."})};
  let pageText="";
  if(source){
    try{ const ctrl=new AbortController(); const to=setTimeout(function(){ctrl.abort();},8000); const resp=await fetch(source,{headers:{"User-Agent":"Mozilla/5.0 (IndieSource research bot)"},signal:ctrl.signal}); const html=await resp.text(); clearTimeout(to); pageText=strip(html).slice(0,9000); }catch(e){ pageText=""; }
  }
  const SYS="You are a sourcing analyst helping indie beauty founders vet a supplier. Write an extensive but practical research brief using ONLY the provided website text plus clearly-flagged general industry knowledge. Be honest: if the website text does not state something (exact MOQ, pricing, certifications, lead times), write 'not stated on their site - confirm directly' rather than guessing. Never invent specifics. Use short markdown headings in this order: ## Overview, ## What they make, ## Minimums & pricing signals, ## Certifications & compliance, ## Best fit for, ## Strengths, ## Watch-outs, ## Questions to ask them, ## Suggested first email. Keep it skimmable, about 350-400 words. The 'Suggested first email' should be 3-4 sentences a founder can copy.";
  const USER="Supplier: "+name+"\nWebsite: "+source+"\n\nWEBSITE TEXT (may be partial):\n"+(pageText || "(could not load the page - rely on the name and URL plus general guidance, and tell the founder to open the site themselves)");
  try{
    const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":apiKey,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:MODEL,max_tokens:1100,system:SYS,messages:[{role:"user",content:USER}]})});
    const data=await resp.json();
    const text=(data&&data.content&&data.content[0]&&data.content[0].text)?data.content[0].text:"";
    if(!text) return {statusCode:200,headers,body:JSON.stringify({error:"The AI had trouble generating the brief. Try again."})};
    return {statusCode:200,headers,body:JSON.stringify({brief:text,name:name,source:source})};
  }catch(err){ return {statusCode:500,headers,body:JSON.stringify({error:"Error reaching the AI. Please try again."})}; }
};

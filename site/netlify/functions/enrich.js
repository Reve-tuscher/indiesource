const MODEL="claude-haiku-4-5-20251001";
function strip(h){ return (h||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&[a-z#0-9]+;/gi," ").replace(/\s+/g," ").trim(); }
function jsonFrom(t){ try{ return JSON.parse(t); }catch(e){} const m=t&&t.match(/\{[\s\S]*\}/); if(m){ try{ return JSON.parse(m[0]); }catch(e){} } return null; }

exports.handler = async function(event){
  const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Content-Type":"application/json"};
  if(event.httpMethod==="OPTIONS") return {statusCode:200,headers,body:"{}"};
  let name="",url="",text="";
  try{ const b=JSON.parse(event.body||"{}"); name=(b.name||"").toString().slice(0,200); url=(b.url||"").toString().slice(0,300); text=(b.text||"").toString().slice(0,12000); }catch(e){}
  let pageText=text;
  if(url && pageText.length<40){
    try{
      const ctrl=new AbortController(); const to=setTimeout(function(){ctrl.abort();},8000);
      const resp=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (IndieSource enrichment bot)"},signal:ctrl.signal});
      const html=await resp.text(); clearTimeout(to);
      pageText=strip(html).slice(0,8000);
    }catch(e){ pageText=""; }
  }
  const apiKey=process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return {statusCode:200,headers,body:JSON.stringify({error:"Add ANTHROPIC_API_KEY in Netlify to use the enrichment tool."})};
  if(!pageText && !name) return {statusCode:200,headers,body:JSON.stringify({error:"Give me a company name, a website URL, or pasted text."})};
  const SYS="You extract structured directory data about a cosmetics supplier for indie beauty brands, from the provided website text. Output ONLY valid JSON (no markdown) with keys: name, type, region, hq, categories, moq, certs, low_min, summary. Rules: type is one of 'Manufacturer','Manufacturer / Lab','Packaging','Ingredient'. region is one of 'US','UK','EU','Canada','Korea','Asia','Australia','Other'. categories = short comma-separated list of what they make or sell. moq = the stated minimum order, or 'Check with supplier' if not stated. certs = stated certifications (vegan, cruelty-free, COSMOS, GMP, ISO 22716, etc.) or 'Check with supplier'. low_min = 'Yes' if they clearly offer low or no minimums, 'No' if clearly high, otherwise 'Check with supplier'. hq = country, or 'Other' if unclear. summary = one factual sentence. Never invent facts that are not supported by the text; when unsure use 'Check with supplier'.";
  const USER="Company name (may be blank): "+name+"\nURL: "+url+"\n\nWEBSITE TEXT:\n"+(pageText||"(none provided)");
  try{
    const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":apiKey,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:MODEL,max_tokens:500,system:SYS,messages:[{role:"user",content:USER}]})});
    const data=await resp.json();
    const t=(data&&data.content&&data.content[0]&&data.content[0].text)?data.content[0].text:"";
    const row=jsonFrom(t);
    if(!row) return {statusCode:200,headers,body:JSON.stringify({error:"Could not parse a result.",raw:t})};
    row.source=url||"";
    return {statusCode:200,headers,body:JSON.stringify({row:row})};
  }catch(err){ return {statusCode:500,headers,body:JSON.stringify({error:"Error reaching the AI. Try again."})}; }
};

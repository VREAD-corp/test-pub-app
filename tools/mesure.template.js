/*! __BRAND__ anonymous audience: no cookie, no identifier, no IP stored, nothing typed is read. Same pattern as octave-checkout gas/web/mesure.js (v:2) */
((n,l,d)=>{let q=new URLSearchParams(l.search),A=(k,f)=>d.addEventListener(k,f,!0),K='octave_notrack',b,t,x='',s,go;
window.mTrack=()=>{};
if(n.doNotTrack=='1'||n.globalPrivacyControl||l.hostname!='__HOST__')return;
// Not a visit (counted apart as "excluded"): our tests (?octave_notrack=1, kept in this browser, =0 clears), automated browsers, crawlers. The user agent is read here only, never sent.
try{s=localStorage;q.has(K)&&(q.get(K)=='1'?s.setItem(K,'1'):s.removeItem(K));s.getItem(K)=='1'&&(x='notrack')}catch{}
x=x||(q.get(K)=='1'?'notrack':n.webdriver?'webdriver':/bot\b|crawl|spider|slurp|headless|lighthouse|pagespeed|inspectiontool|googleother|mediapartners|bingpreview|phantom|puppeteer|playwright|selenium/i.test(n.userAgent||'')?'bot':'');
b={v:2,site:'__SITE__',page:l.pathname,ref_domain:d.referrer.split('/')[2],device:innerWidth<768?'mobile':'desktop'};
for(let g of['source','medium','campaign'])b['utm_'+g]=q.get('utm_'+g);
if(x)b.excluded=x;
// detail: a short slug only (score or result bucket, offer id), never what the visitor typed.
t=(v,det)=>{b.event=v;b.detail=/^[a-z0-9.-]{0,24}$/.test(det||'')?det||'':'';b.variant=(window.octaveCro&&octaveCro.v('__XP__'))||'';b.ts=Date.now();try{fetch('__API__?action=track',{method:'POST',keepalive:!0,credentials:'omit',redirect:'manual',body:JSON.stringify(b)}).catch(e=>0)}catch{}};
window.mTrack=t;
// A prerendered or prefetched page counts only once the visitor actually opens it.
go=()=>t('view');
if(d.prerendering)d.addEventListener('prerenderingchange',go,{once:!0});
else if(d.visibilityState=='prerender'){let v=()=>{if(d.visibilityState!='prerender'){d.removeEventListener('visibilitychange',v);go()}};d.addEventListener('visibilitychange',v)}
else go();
A('click',e=>{let a=e.target.closest?.('a,button'),h=a?.dataset.mesure;h&&t(h,a.dataset.detail)})})(navigator,location,document)

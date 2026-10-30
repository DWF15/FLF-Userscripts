const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
let browser;
try{
const launch={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};if(process.env.CHROMIUM_PATH)launch.executablePath=process.env.CHROMIUM_PATH;browser=await chromium.launch(launch);const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('http://localhost/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto('http://localhost/');
await page.evaluate(()=>{
  document.body.replaceChildren();window.saved={};window.GM_getValue=(k,d)=>saved[k]??d;window.GM_setValue=(k,v)=>saved[k]=v;window.GM_registerMenuCommand=()=>{};
  window.opens=0;window.packets=[];window.alerts=[];window.alert=x=>alerts.push(x);
  const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){const r=attach.call(this,o);window.testShadow=r;return r;};
  const frame=document.createElement('iframe');document.body.append(frame);window.testPopup=frame.contentWindow;testPopup.postMessage=payload=>packets.push(payload);window.open=()=>{opens++;return testPopup;};
  window.addEmail=(id,doc,caseNumber,hearing='',hidden=false)=>{
    const body=document.createElement('div');body.id=id;body.className='a3s';body.style.cssText=hidden?'display:none':'padding:8px;margin:6px;border:1px solid #ccc';
    const heading=document.createElement('div');heading.textContent='Filing Accepted';body.append(heading);
    const table=document.createElement('table');for(const [key,value] of [['Case Number',caseNumber],['Filing Description',doc.includes('Complaint')?'Complaint':'Summons'],['Lead Document',doc],['Hearing Details',hearing]]){const tr=document.createElement('tr');for(const value2 of [key,value]){const td=document.createElement('td');td.textContent=value2;tr.append(td);}table.append(tr);}body.append(table);if(hearing){const row=document.createElement('div');row.textContent=hearing;body.append(row);}document.body.append(body);return body;
  };
  addEmail('complaint','Complaint and Exhibit.pdf','2026EV001001');
  addEmail('summons','Summons (Tenant A).pdf','2026EV001001','Hearing 11/12/2026 at 9:00 AM');
  addEmail('other','Summons (Tenant B).pdf','2026EV002002','Hearing 12/15/2026 at 2:30 PM');
  addEmail('hidden','Hidden email.pdf','2026EV009999','',true);
});
await page.addScriptTag({path:path.resolve(__dirname,'../mail-to-clio.user.js')});
const labels=await page.evaluate(()=>[...testShadow.querySelector('select').options].map(o=>o.textContent));
assert.match(labels[1],/Complaint and Exhibit.pdf/);assert.match(labels[2],/Summons \(Tenant A\).pdf/);assert.match(labels[3],/Summons \(Tenant B\).pdf/);assert.equal(labels.length,4);
await page.evaluate(()=>testShadow.querySelector('.toolbar button:not(.move)').click());assert.equal(await page.evaluate(()=>opens),0);assert.equal(await page.evaluate(()=>alerts.length),0);
async function choose(index){await page.evaluate(index=>{const select=testShadow.querySelector('select');select.value=select.options[index].value;select.dispatchEvent(new Event('change'));},index);}
async function review(){const count=await page.evaluate(()=>{const before=packets.length;testShadow.querySelector('.toolbar button:not(.move)').click();window.dispatchEvent(new MessageEvent('message',{origin:'https://foulk-mail-to-clio-production.up.railway.app',source:testPopup,data:{type:'FLF_READY'}}));return before;});await page.waitForFunction(n=>packets.length>n,count);return page.evaluate(()=>packets.at(-1).packet);}
await choose(2);const first=await review();assert.equal(first.fields['Case Number'],'2026EV001001');assert.match(first.fields['Hearing Details'],/11\/12\/2026/);assert(!JSON.stringify(first).includes('2026EV002002'));assert(!JSON.stringify(first).includes('12/15/2026'));
await choose(3);const second=await review();assert.equal(second.fields['Case Number'],'2026EV002002');assert.match(second.fields['Hearing Details'],/12\/15\/2026/);assert.notEqual(second.fingerprint,first.fingerprint);
await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://foulk-mail-to-clio-production.up.railway.app',source:testPopup,data:{type:'FLF_RESULT',status:'verified',fingerprint:packets.at(-1).packet.fingerprint}})));
await page.waitForFunction(()=>document.querySelector('#other').previousElementSibling?.textContent.includes('Clio update verified'));
assert(!await page.evaluate(()=>document.querySelector('#complaint').previousElementSibling?.classList.contains('flf-processing-mark')));
// A new message must not change the explicitly selected source.
await page.evaluate(()=>addEmail('fourth','New document.pdf','2026EV003003'));await page.waitForTimeout(700);const again=await review();assert.equal(again.fingerprint,second.fingerprint);
// Replacing the thread must clear the old selection; no auto-choosing an unrelated email.
await page.evaluate(()=>{for(const body of [...document.querySelectorAll('.a3s')])body.remove();addEmail('new-a','New summons.pdf','2026EV004004');addEmail('new-b','Other new summons.pdf','2026EV005005');});await page.waitForTimeout(700);const before=await page.evaluate(()=>opens);await page.evaluate(()=>testShadow.querySelector('.toolbar button:not(.move)').click());assert.equal(await page.evaluate(()=>opens),before);assert.equal(await page.evaluate(()=>testShadow.querySelector('select').value),'');
// Normal one-email review continues to work, including forwarded nested bodies.
await page.evaluate(()=>{document.querySelector('#new-b').remove();const nested=document.createElement('div');nested.className='a3s gmail_quote';nested.textContent='Forwarded reference';document.querySelector('#new-a').append(nested);});await page.waitForTimeout(700);const single=await review();assert.equal(single.fields['Case Number'],'2026EV004004');assert.equal(await page.evaluate(()=>testShadow.querySelector('.message-picker').hidden),true);
assert.deepEqual(errors,[]);console.log('Thread picker passed: document labels, explicit choice, isolated fields/fingerprints, per-message badges, retained choice, thread-change reset, hidden/nested body filtering, and single-email review.');
}finally{if(browser)await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// ==UserScript==
// @name         Foulk Law Firm • Mail to Clio
// @namespace    foulklawfirm.mail-to-clio
// @version      1.2.3
// @updateURL    https://raw.githubusercontent.com/DWF15/FLF-Userscripts/main/mail-to-clio.user.js
// @downloadURL  https://raw.githubusercontent.com/DWF15/FLF-Userscripts/main/mail-to-clio.user.js
// @homepageURL  https://github.com/DWF15/FLF-Userscripts
// @description  Local keyword detection and reviewed court-notification extraction.
// @match        https://mail.google.com/mail/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  const defaults = ['hearing', 'scheduled for', 'continued', 'judgment', 'writ', 'filing accepted', 'summons', 'electronic notice of entry', 'enotice', 'judge assigned', 'case number', 'case.net'];
  function extract(text, keywords = defaults) {
    const fields = {}, warnings = [];
    const hits = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
    const aliases = {
      'Case Number': ['case number', 'case no\\.?', 'case #'],
      'Ticket Number': ['ticket number', 'ticket no\\.?', 'ticket #'],
      'Court Name': ['court name', 'court'],
      'Court Division': ['court division', 'division'],
      'Court Location': ['court location'], 'Court Level': ['court level'], 'Judicial Circuit': ['judicial circuit'], 'County': ['county'],
      'Plaintiff': ['plaintiff'], 'Defendant': ['defendant', 'tenant']
    };
    for (const [name, labels] of Object.entries(aliases)) {
      const pattern = new RegExp('^\\s*(?:'+labels.join('|')+')\\s*(?::|\\t| {2,})\\s*(.+?)\\s*$', 'gmi');
      let values = [...text.matchAll(pattern)].map(m => m[1].trim());
      if (name === 'Ticket Number') values = values.flatMap(v => v.match(/\b\d{9}\b/g) || []);
      values = [...new Set(values)];
      if (name === 'Ticket Number' && values.length) fields[name] = values.join(', ');
      else if (values.length === 1) fields[name] = values[0];
      else if (values.length > 1) warnings.push('Multiple '+name+' values found. Choose the correct value manually.');
    }
    // The court notice may place its division code in the Judge Assigned row.
    const divisions=[...new Set([...text.matchAll(/\bJudge Assigned\s+(\d{1,3}[A-Z]{0,2})(?=\s|$)/gi)].map(m=>m[1].toUpperCase()))];
    if(!fields['Court Division']&&divisions.length===1){fields['Court Division']=divisions[0];warnings.push('Court Division read from the Judge Assigned row; verify the code against the notice.');}
    else if(divisions.length>1)warnings.push('Multiple Judge Assigned division codes; select the current division manually.');
    // Typical Missouri and Illinois formats; labeled values remain the preferred source.
    const cases = [...new Set((text.match(/\b(?:\d{2}[A-Z]{2}-[A-Z]{2}\d{5}(?:-\d{2})?|20\d{2}[- ](?:LM|EV|CH|L)[- ]\d+)\b/gi) || []).map(v=>v.toUpperCase()))];
    if (cases.length > 1) { delete fields['Case Number']; warnings.push('Multiple case numbers detected; manual selection required.'); }
    else if (cases.length === 1) fields['Case Number'] = cases[0];
    // Case.net's CASE NO line contains both the identifier and caption.
    const caption = text.match(/^\s*CASE\s+NO\.?\s*:\s*([A-Z0-9-]+)\s*-\s*(.+?)\s+V\.?\s+(.+?)\s*$/mi);
    if (caption && cases.length <= 1) {
      fields['Case Number'] = caption[1].toUpperCase();
      if (!fields.Plaintiff) fields.Plaintiff = caption[2].trim();
      if (!fields.Defendant) fields.Defendant = caption[3].trim();
    }
    const courts = [...new Set(text.split('\n').map(x=>x.trim()).filter(x=>/^[A-Za-z .()'-]+ - (?:Circuit|Associate Circuit|Municipal) Court$/i.test(x)))];
    if (!fields['Court Name'] && courts.length === 1) fields['Court Name'] = courts[0];
    if(courts.length===1){
      const court= courts[0].match(/^(.+?) - ((?:Associate )?Circuit|Municipal) Court$/i);
      if(court){if(!fields.County)fields.County=court[1].trim();if(!fields['Court Level'])fields['Court Level']=court[2]+' Court';}
    }
    const lines = text.split('\n').map(x=>x.trim());
    const timePattern = /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i;
    const datePattern = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
    const scheduled = [];
    for (let i=0;i<lines.length;i++) {
      const marker = lines[i].match(/\bscheduled for\b/i);
      if (!marker) continue;
      let tail=lines[i].slice(marker.index+marker[0].length).replace(/^\s*:?\s*/, '').trim();
      // Do not use the filing/activity timestamp preceding Scheduled For.
      if (!tail) {
        let joined='';
        for (let j=i+1, count=0;j<lines.length && count<3;j++) {
          if (!lines[j]) continue;
          count++;
          // Only consume an immediately following schedule date/time, never a later event row.
          if (count===1 && !/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(lines[j])) break;
          if (count>1 && !/^\d{1,2}:\d{2}\s*(?:AM|PM)\b/i.test(lines[j])) break;
          joined+=(joined?' ':'')+lines[j];
          if (datePattern.test(joined)&&timePattern.test(joined)) { tail=joined; break; }
        }
      }
      if(datePattern.test(tail)&&timePattern.test(tail)) scheduled.push('Scheduled For '+tail);
    }
    const direct = lines.filter(line=>/^hearing(?:\s+scheduled)?\s*:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i.test(line)&&timePattern.test(line));
    const hearings = [...new Set(scheduled.length ? scheduled : direct)];
    if (hearings.length === 1) fields['Hearing Details'] = hearings[0];
    else if (hearings.length > 1) warnings.push('Multiple hearing rows detected; choose one manually.');
    if (!fields['Case Number'] && !(fields.Plaintiff && fields.Defendant)) warnings.push('An exact case number or both party names are needed for matter matching.');
    warnings.push('Confirm all extracted values against the opened notification.');
    const notice_flags=[];
    if(/\b(cancelled|canceled|vacated|dismissed)\b/i.test(text)){notice_flags.push('cancellation');warnings.push('Possible cancellation or dismissal. Review calendar changes directly in Clio.');}
    if(/\b(continued|rescheduled)\b/i.test(text)){notice_flags.push('continuance');warnings.push('Possible continuance. A new hearing entry will preserve earlier hearing dates.');}
    if(hearings.length>1)notice_flags.push('multiple_hearings');
    return { fields, keywords: hits, warnings, notice_flags };
  }
  function readBody(el) {
    const clone=el.cloneNode(true);
    // A forwarded court notice may itself be inside gmail_quote. Keep it;
    // extract() rejects ambiguous case numbers and hearing rows.
    clone.querySelectorAll('.gmail_signature, script, style').forEach(n=>n.remove());
    const blocks=new Set(['DIV','P','TR','TABLE','BLOCKQUOTE','LI','H1','H2','H3','H4','PRE']);
    function text(node) {
      if(node.nodeType===3)return node.nodeValue;
      if(node.nodeType!==1)return '';
      if(node.tagName==='BR')return '\n';
      const value=[...node.childNodes].map(text).join('');
      if(node.tagName==='TD'||node.tagName==='TH')return value+'\t';
      return blocks.has(node.tagName)?'\n'+value+'\n':value;
    }
    return text(clone).replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').trim();
  }
  if (typeof module !== 'undefined') module.exports = { extract, defaults, readBody };
  if (typeof document === 'undefined') return;
  if (document.getElementById('flf-mail-assistant')) return;
  let handoffListener = null;
  let config = GM_getValue('flf-config-v1', { url:'https://foulk-mail-to-clio-production.up.railway.app', keywords:defaults, enabled:true });
  const host = document.createElement('div'); host.id='flf-mail-assistant';
  host.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483000;width:300px;max-width:calc(100vw - 16px)';
  const shadow=host.attachShadow({mode:'closed'});
  // Build nodes without HTML assignment: compatible with Trusted Types enforcement.
  const style=document.createElement('style');
  style.textContent='button{border:0;border-radius:12px;background:#123b46;color:white;font:600 14px system-ui;padding:13px 18px;box-shadow:0 4px 20px #0003;cursor:pointer}button:disabled{opacity:.6}small{display:block;background:white;color:#263e48;padding:6px 10px;font:12px system-ui;max-width:280px;border-radius:6px;margin-top:6px}';
  const button=document.createElement('button');button.type='button';button.textContent='Review for Clio';
  const note=document.createElement('small');note.textContent='Mail to Clio 1.2.3 • Open one notification.';
  const move=document.createElement('button');move.type='button';move.textContent='⋮⋮ Move';move.className='move';move.title='Drag to move. Arrow keys move the button; Shift moves farther.';move.setAttribute('aria-label','Move Mail to Clio panel');
  style.textContent+='.toolbar{display:flex;align-items:center;gap:6px}.move{display:block;margin:0;padding:4px 10px;border-radius:6px;background:#eef3f4;color:#38535a;font:12px system-ui;box-shadow:0 1px 4px #0002;cursor:grab;touch-action:none;user-select:none}.move:active{cursor:grabbing}';
  const toolbar=document.createElement('div');toolbar.className='toolbar';toolbar.append(button,move);
  shadow.append(style,toolbar,note);
  function mount() { if(!host.isConnected && document.body) document.body.append(host); }
  mount();
  const positionKey='flf-panel-position-v1';
  let position=GM_getValue(positionKey,null),drag=null;
  if(!position||!Number.isFinite(position.left)||!Number.isFinite(position.top))position=null;
  function place(left,top){
    const rect=host.getBoundingClientRect(),margin=8;
    const x=Math.max(margin,Math.min(left,Math.max(margin,window.innerWidth-rect.width-margin)));
    const y=Math.max(margin,Math.min(top,Math.max(margin,window.innerHeight-rect.height-margin)));
    host.style.left=x+'px';host.style.top=y+'px';host.style.right='auto';host.style.bottom='auto';
    return {left:x,top:y};
  }
  function keepVisible(){
    if(position){place(position.left,position.top);return;}
    const rect=host.getBoundingClientRect();
    // Retain the bottom-right default until the user moves the panel.
    if(rect.left<8||rect.top<8)place(rect.left,rect.top);
  }
  function finishDrag(cancel=false){
    if(!drag)return;
    const ended=drag;drag=null;
    if(cancel){position=ended.previous;if(position)place(position.left,position.top);else{host.style.left='auto';host.style.top='auto';host.style.right='24px';host.style.bottom='24px';}}
    else{const rect=host.getBoundingClientRect();position=place(rect.left,rect.top);GM_setValue(positionKey,position);}
    if(move.hasPointerCapture(ended.id))move.releasePointerCapture(ended.id);
  }
  move.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||drag)return;
    const rect=host.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,previous:position};
    move.setPointerCapture(event.pointerId);event.preventDefault();
  });
  move.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    place(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);
  });
  move.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.id)finishDrag();});
  move.addEventListener('pointercancel',()=>finishDrag(true));
  move.addEventListener('lostpointercapture',()=>finishDrag(true));
  move.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){finishDrag(true);event.preventDefault();return;}
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const direction=directions[event.key];if(!direction||drag)return;
    event.preventDefault();const rect=host.getBoundingClientRect(),step=event.shiftKey?40:10;
    position=place(rect.left+direction[0]*step,rect.top+direction[1]*step);GM_setValue(positionKey,position);
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag)finishDrag(true);});
  window.addEventListener('resize',keepVisible);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(!drag)keepVisible();}).observe(host);
  keepVisible();
  GM_registerMenuCommand('Mail to Clio: Reset button position',()=>{finishDrag(true);position=null;GM_setValue(positionKey,null);host.style.left='auto';host.style.top='auto';host.style.right='24px';host.style.bottom='24px';keepVisible();});
  GM_registerMenuCommand('Mail to Clio: Show review button',()=>{mount();host.scrollIntoView({block:'nearest'});});
  function visible(el) { return el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; }
  function opened() {
    // Gmail DOM is deliberately treated as an untrusted, changeable source.
    return [...document.querySelectorAll('.a3s')].filter(visible);
  }
  function setNote(text) { if(note.textContent!==text) note.textContent=text; }
  const marksKey='flf-message-marks-v1';
  function fingerprint(body){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.replace(/\s+/g,' ').trim())).then(buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join(''));}
  function marks(){return GM_getValue(marksKey,{});}
  function mark(hash,status){
    const saved=marks();
    if(status==='opened' && saved[hash]?.status==='verified')return;
    saved[hash]={status,at:Date.now()};
    const recent=Object.fromEntries(Object.entries(saved).sort((a,b)=>b[1].at-a[1].at).slice(0,1000));
    GM_setValue(marksKey,recent);scan();
  }
  async function showMark(body){
    const text=readBody(body),hash=await fingerprint(text);
    if(!body.isConnected || readBody(body)!==text)return;
    const saved=marks()[hash];
    let badge=body.previousElementSibling;
    if(!badge?.classList.contains('flf-processing-mark'))badge=null;
    if(!saved){if(badge)badge.remove();return;}
    if(!badge){badge=document.createElement('div');badge.className='flf-processing-mark';badge.style.cssText='padding:8px 12px;margin:8px 0;border:1px solid #abc6ba;border-radius:6px;background:#eff8f3;color:#183e2c;font:600 13px system-ui';body.before(badge);}
    const label=saved.status==='verified'?'Mail to Clio: Clio update verified':'Mail to Clio: Opened for review — update not yet verified';
    if(badge.textContent!==label)badge.textContent=label;
    badge.title='This browser’s Mail to Clio record. '+new Date(saved.at).toLocaleString()+'. A verified update can cover selected fields or a calendar action; check the review for remaining actions.';
  }
  function scan() {
    if (!config.enabled) { setNote('Keyword detection is paused. Manual review is available.'); return; }
    const bodies=opened();
    if (bodies.length!==1) { setNote(bodies.length?'Collapse the thread to one opened message.':'Open one notification to extract.'); return; }
    showMark(bodies[0]).catch(()=>{});
    const hits=extract(readBody(bodies[0]),config.keywords).keywords;
    setNote(hits.length?'Detected: '+hits.slice(0,4).join(', '):'No configured keywords found. Manual review is available.');
  }
  GM_registerMenuCommand('Mail to Clio: Settings',()=>{
    const entered=prompt('Review app URL (localhost for demo; HTTPS for live):',config.url);
    if(entered===null) return;
    let url;
    try { url=new URL(entered); } catch { alert('Invalid URL'); return; }
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.port==='8765'))) { alert('Use an HTTPS origin or http://localhost:8765'); return; }
    const words=prompt('Keywords, separated by commas:',config.keywords.join(', '));
    if(words===null) return;
    config={...config,url:url.origin,keywords:words.split(',').map(w=>w.trim()).filter(Boolean).slice(0,30)};
    GM_setValue('flf-config-v1',config); scan();
  });
  GM_registerMenuCommand('Mail to Clio: Pause/resume keyword detection',()=>{config.enabled=!config.enabled;GM_setValue('flf-config-v1',config);scan();});
  button.addEventListener('click',()=>{
    const bodies=opened();
    if(bodies.length!==1) { alert('Open exactly one expanded email. Collapse any other messages in the conversation.'); return; }
    const body=readBody(bodies[0]);
    if(body.length>100000) { alert('Notification is too large. Use a shorter single message.'); return; }
    // Open during the user gesture; no tokens or third-party APIs inside Gmail.
    if(handoffListener) window.removeEventListener('message',handoffListener);
    const popup=window.open(config.url,'flf-review','width=1000,height=850');
    if(!popup) { alert('Allow popups for Gmail, then try again.'); return; }
    const packet=extract(body,config.keywords);
    if(bodies[0].querySelector('.gmail_quote'))packet.warnings.unshift('Quoted or forwarded content included. Verify which notice and hearing you intend to process.');
    if(!Object.keys(packet.fields).length)packet.warnings.unshift('No fields recognized from '+body.length+' characters of email text. Check that the notice is text in this email, rather than an image or attachment.');
    const fingerprintPromise=fingerprint(body);
    fingerprintPromise.then(hash=>mark(hash,'opened')).catch(()=>{});
    const target=new URL(config.url).origin;
    const openedAt=Date.now();
    const listener=async event=>{
      if(event.origin!==target||event.source!==popup) return;
      if(event.data?.type==='FLF_READY' && Date.now()-openedAt<300000){
        popup.postMessage({type:'FLF_PACKET',packet:{...packet,fingerprint:await fingerprintPromise}},target);
      }else if(event.data?.type==='FLF_RESULT' && event.data.status==='verified' && event.data.fingerprint===await fingerprintPromise){
        mark(event.data.fingerprint,'verified');
      }
    };
    handoffListener=listener;
    window.addEventListener('message',listener);
    setTimeout(()=>window.removeEventListener('message',listener),86400000);
  });
  let timer;
  new MutationObserver(()=>{mount();clearTimeout(timer);timer=setTimeout(scan,500);}).observe(document.body,{childList:true,subtree:true});
  scan();
})();

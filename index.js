// ==UserScript==
// @name        Pekoramons Trading Extension
// @namespace   arz/ami
// @version     4.4
// @description Inserts item values into trades and collectibles page with anchored overlays
// @match       *://*.pekora.zip/*
// @icon        https://pekora.zip/favicon.ico
// @grant       GM_xmlhttpRequest
// @run-at      document-idle
// @downloadURL  https://raw.githubusercontent.com/AR-Z/pekoramons-extension/main/index.js
// @updateURL    https://raw.githubusercontent.com/AR-Z/pekoramons-extension/main/index.js
// ==/UserScript==

(async function(){
  "use strict";
  const LOG = "[PekoraEnhancer]";
  function log(...a){ console.log(LOG, ...a); }

  function cleanName(name){
    if(!name || typeof name !== "string") return "";
    return name.replace(/[\u200B-\u200F\uFEFF]/g,"").replace(/[^a-zA-Z0-9 ]/g," ").replace(/\s+/g," ").trim().toLowerCase();
  }

  function formatNumber(n){
    if(!isFinite(n)) return "N/A";
    if(n >= 1000000) return (n/1000000).toFixed(1) + "M";
    if(n >= 1000) return (n/1000).toFixed(1) + "K";
    return n.toLocaleString();
  }

  async function fetchItems(url){
    if(typeof GM_xmlhttpRequest === "function"){
      return new Promise((res, rej)=>{
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { Accept: "application/json" },
          onload: r => { try{ res(JSON.parse(r.responseText)); } catch(e){ rej(e); } },
          onerror: e => rej(e)
        });
      });
    } else if(window.fetch){
      const r = await fetch(url, { headers:{ Accept: "application/json" }});
      if(!r.ok) throw new Error("fetch failed " + r.status);
      return r.json();
    } else throw new Error("no http available");
  }

  let raw = [];
  try{
    raw = await fetchItems("https://pekoramons.xyz/api/items");
    if(!Array.isArray(raw)) raw = [];
  }catch(e){
    raw = [];
  }

  const valueMap = new Map();
  raw.forEach(it=>{
    const n = (it.Name ?? it.name ?? "").toString();
    if(!n) return;
    valueMap.set(cleanName(n), Number(it.Value ?? it.value ?? 0) || 0);
  });

  const css = `
.pekora-overlay{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483600;overflow:visible}
.custom-value-tag{font-family:Arial,sans-serif;display:inline-block;gap:6px;font-size:13px;padding:4px 8px;border-radius:6px;background:rgba(10,10,10,0.92);color:#e6ffed;white-space:nowrap;pointer-events:auto;user-select:none;line-height:1;position:absolute;z-index:2147483650;transform:translateX(-50%);max-width:calc(100% - 12px);box-sizing:border-box;overflow:hidden;text-overflow:ellipsis}
.custom-value-tag.small{padding:3px 6px;font-size:12px;border-radius:5px;box-shadow:none !important}
.custom-value-tag .value{color:#00e676;font-weight:700;font-size:13px}
.custom-overpay-summary{font-family:Arial,sans-serif;position:absolute;pointer-events:auto;padding:8px 10px;border-radius:8px;min-width:140px;text-align:left;font-weight:700;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,0.5);background:rgba(12,12,12,0.96);color:#ffffff;line-height:1.1;z-index:2147483650;left:8px;bottom:10px;top:auto;right:auto;transform:none;max-width:calc(100% - 16px);box-sizing:border-box}
.custom-overpay-summary .title{font-weight:800;margin-bottom:6px;font-size:14px}
.custom-overpay-summary .line{margin-top:4px;font-size:13px;display:flex;justify-content:space-between;gap:8px;font-weight:600}
.custom-overpay-summary .numbers{font-weight:900;margin-left:8px}
.custom-overpay-summary .pos{color:#7ef39a!important}
.custom-overpay-summary .neg{color:#ff7f7f!important}
.custom-overpay-summary .line>span:first-child{color:#ffffff!important}
.collectible-value-inline{position:absolute;left:50%;transform:translateX(-50%);bottom:6px;pointer-events:auto;font-weight:700;font-size:12px;padding:3px 6px;border-radius:6px;background:rgba(8,8,8,0.85);color:#bfffd6;z-index:2147483650;white-space:nowrap}
.total-value-added{color:#7ef39a;font-weight:800;margin-top:6px}
`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function ensureOverlayFor(parent){
    if(!parent) return null;
    try { const cs = window.getComputedStyle(parent); if(cs.position === "static") parent.style.position = "relative"; } catch(e){}
    if(parent._pekora_overlay && parent._pekora_overlay instanceof Element) return parent._pekora_overlay;
    const ov = document.createElement("div");
    ov.className = "pekora-overlay";
    ov.style.pointerEvents = "none";
    ov.style.position = "absolute";
    ov.style.top = "0";
    ov.style.left = "0";
    ov.style.width = "100%";
    ov.style.height = "100%";
    ov.style.overflow = "visible";
    try{ parent.appendChild(ov); }catch(e){ document.body.appendChild(ov); }
    parent._pekora_overlay = ov;
    return ov;
  }

  function createValueTagElement(text){
    const el = document.createElement("div");
    el.className = "custom-value-tag small";
    el.style.display = "none";
    el.style.position = "absolute";
    const v = document.createElement("div");
    v.className = "value";
    v.textContent = text;
    el.appendChild(v);
    return el;
  }

  function createSummaryElement(){
    const el = document.createElement("div");
    el.className = "custom-overpay-summary";
    el.style.display = "none";
    el.style.position = "absolute";
    return el;
  }

  function positionTagForBox(tagEl, boxEl, modalEl){
    if(!tagEl || !boxEl || !modalEl) return;
    const rect = boxEl.getBoundingClientRect();
    const modalRect = modalEl.getBoundingClientRect();
    if(rect.width === 0 && rect.height === 0){ tagEl.style.display = "none"; return; }
    tagEl.style.display = "";
    const leftCenter = (rect.left - modalRect.left) + rect.width/2;
    const top = (rect.bottom - modalRect.top) + 6;
    tagEl.style.left = `${Math.round(leftCenter)}px`;
    tagEl.style.top = `${Math.round(top)}px`;
    tagEl.style.maxWidth = `${Math.max(80, Math.min(260, Math.round(rect.width * 1.2)))}px`;
    tagEl.style.overflow = "hidden";
    tagEl.style.textOverflow = "ellipsis";
    tagEl.style.whiteSpace = "nowrap";
  }

  const SUMMARY_LEFT_INSET = 8;
  const SUMMARY_BOTTOM_INSET = 12;

  function positionSummaryForModal(summaryEl, modalEl){
    if(!summaryEl || !modalEl) return;
    const modalRect = modalEl.getBoundingClientRect();
    if(modalRect.width === 0 && modalRect.height === 0){ summaryEl.style.display='none'; return; }
    summaryEl.style.display = "";

    let sW = summaryEl.offsetWidth || 160;
    let sH = summaryEl.offsetHeight || 64;

    const minViewportX = 6 + window.scrollX;
    const outsideLeftCandidateViewport = modalRect.left - sW - 12 + window.scrollX;

    const preferredInsideLeftRelative = SUMMARY_LEFT_INSET;

    let finalLeftRelative;
    if(outsideLeftCandidateViewport >= minViewportX){
      finalLeftRelative = -sW - 12;
    } else {
      finalLeftRelative = preferredInsideLeftRelative;
    }

    let finalTopRelative = Math.round(modalRect.height - SUMMARY_BOTTOM_INSET - sH);
    if(finalTopRelative < 6) finalTopRelative = 6;
    summaryEl.style.left = `${finalLeftRelative}px`;
    summaryEl.style.top = `${finalTopRelative}px`;
    summaryEl.style.right = "unset";
    summaryEl.style.bottom = "unset";
    summaryEl.style.position = "absolute";
    summaryEl.style.transform = "none";

    if(summaryEl.offsetWidth === 0 || summaryEl.offsetHeight === 0){
      requestAnimationFrame(()=> positionSummaryForModal(summaryEl, modalEl));
    }
  }

  function lookupValueForName(rawName){
    if(!rawName) return undefined;
    const name = rawName.trim();
    const cleaned = cleanName(name);
    if(valueMap.has(cleaned)) return valueMap.get(cleaned);
    const parts = name.split(/[:\-–—|]/).map(s=>s.trim()).filter(Boolean);
    for(const p of parts.reverse()){
      const c = cleanName(p);
      if(valueMap.has(c)) return valueMap.get(c);
    }
    const stripped = name.replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, "").trim();
    const cs = cleanName(stripped);
    if(valueMap.has(cs)) return valueMap.get(cs);
    let best = {k:null,len:0};
    for(const k of valueMap.keys()){
      if(cleaned.includes(k) || k.includes(cleaned)){
        if(k.length > best.len) best = {k,len:k.length};
      }
    }
    if(best.k) return valueMap.get(best.k);
    const nameTokens = new Set(cleaned.split(/\s+/).filter(Boolean));
    let bestScore = 0, bestKey = null;
    for(const k of valueMap.keys()){
      const kt = k.split(/\s+/).filter(Boolean);
      let score = 0;
      for(const t of kt) if(nameTokens.has(t)) score++;
      if(score > bestScore){ bestScore = score; bestKey = k; }
    }
    if(bestScore > 0 && bestKey) return valueMap.get(bestKey);
    return undefined;
  }

  function findTradeModal(){
    const candidates = [".col-9", ".TradeRequest", ".innerSection-0-2-123", ".trade-modal", ".trade-window", ".modal", '[role="dialog"]'];
    for(const s of candidates){
      const el = document.querySelector(s);
      if(el && el.querySelector && el.querySelector("img")) return el;
    }
    const maybe = Array.from(document.querySelectorAll('[role="dialog"], .modal, .panel, .popup'));
    for(const c of maybe){
      try{
        const txt = (c.textContent||"").toLowerCase();
        if(txt.includes("items you gave") || txt.includes("trade request") || c.querySelector("img")) return c;
      }catch(e){}
    }
    return null;
  }

  function gatherItemBoxes(modal){
    const strict = (() => {
      const rows = Array.from(modal.querySelectorAll(".row.ms-1.mb-4"));
      const boxes = [];
      for(const row of rows){
        const found = Array.from(row.querySelectorAll(".col-0-2-133"));
        if(found.length) found.forEach(f => boxes.push(f));
      }
      return boxes;
    })();
    if(strict.length) return strict;
    const boxes = [];
    const imgs = Array.from(modal.querySelectorAll("img"));
    for(const img of imgs){
      try{
        const src = (img.src||"").toLowerCase();
        const nw = img.naturalWidth || img.width || 0;
        const nh = img.naturalHeight || img.height || 0;
        if(Math.max(nw,nh) < 16) continue;
        if(src.includes("avatar") || src.includes("profile")) continue;
        if(!(src.includes("thumbnail") || src.includes("thumbnails") || src.includes("/catalog/") || src.includes("asset") || img.offsetParent !== null)) continue;
        const box = img.closest(".col-0-2-133") || img.closest(".card") || img.closest(".item") || img.closest("a") || img.parentElement;
        if(box && !boxes.includes(box)) boxes.push(box);
      }catch(e){}
    }
    const anchors = Array.from(modal.querySelectorAll('a[href*="/catalog/"], a[href*="/catalog"]'));
    for(const a of anchors){
      const box = a.closest(".col-0-2-133") || a.closest(".card") || a.parentElement;
      if(box && !boxes.includes(box)) boxes.push(box);
    }
    return boxes;
  }

  function findNameInBox(box){
    if(!box) return "";
    const isLabelish = txt => {
      if(!txt) return true;
      const low = txt.toLowerCase();
      if(low.startsWith("value") || low.startsWith("items you") || low.includes("none")) return true;
      return false;
    };
    const tries = ["a[href*='/catalog/']", ".itemName-0-2-135 a", ".itemName a", ".item-name a", ".itemTitle a", "p.fw-bolder", "p", "div"];
    for(const s of tries){
      try{
        const el = box.querySelector(s);
        if(el && el.textContent){
          const t = el.textContent.trim();
          if(t.length && !isLabelish(t)) return t;
        }
      }catch(e){}
    }
    const img = box.querySelector && box.querySelector("img");
    if(img){
      if(img.alt && img.alt.trim() && !isLabelish(img.alt)) return img.alt.trim();
      if(img.title && img.title.trim() && !isLabelish(img.title)) return img.title.trim();
    }
    const full = (box.textContent||"").trim();
    if(!full) return "";
    const lines = full.split('\n').map(l=>l.trim()).filter(Boolean);
    for(const line of lines) if(!isLabelish(line)) return line;
    return "";
  }

  function clearModalMarkers(modal){
    if(!modal) return;
    const ov = modal._pekora_overlay;
    if(ov && ov instanceof Element){
      Array.from(ov.children).forEach(c=>{ try{ if(c.dataset?.pekoraSrcType) c.remove(); }catch(e){} });
    }
    modal.querySelectorAll("[data-pekora-enhanced]").forEach(n=>n.removeAttribute("data-pekora-enhanced"));
    modal.querySelectorAll("[data-pekora-value]").forEach(n=>n.removeAttribute("data-pekora-value"));
  }

  function createValueTag(valText){
    const el = document.createElement("div");
    el.className = "custom-value-tag small";
    el.style.position = "absolute";
    el.style.display = "none";
    const v = document.createElement("div");
    v.className = "value";
    v.textContent = valText;
    el.appendChild(v);
    return el;
  }

  function createSummaryForOverlay(){
    const el = document.createElement("div");
    el.className = "custom-overpay-summary";
    el.style.position = "absolute";
    el.style.display = "none";
    return el;
  }

  function enhanceModal(modal){
    if(!modal) return 0;
    const overlay = ensureOverlayFor(modal);
    if(!overlay) return 0;
    modal.querySelectorAll('[data-pekora-enhanced]').forEach(n => n.removeAttribute('data-pekora-enhanced'));
    modal.querySelectorAll('[data-pekora-value]').forEach(n => n.removeAttribute('data-pekora-value'));
    Array.from(overlay.children).forEach(c => { if(c.dataset?.pekoraModal === (modal._pekora_id || '') && c.dataset?.pekoraSrcType === 'modal-summary') c.remove(); });

    const boxes = gatherItemBoxes(modal);
    log("candidate boxes:", boxes.length);
    let inserted = 0;
    for(const box of boxes){
      try {
        if(box.dataset && box.dataset.pekoraEnhanced === "1") continue;
        const name = findNameInBox(box);
        if(!name){ log("no name found for a box, skipping"); continue; }
        const value = lookupValueForName(name);
        if(value === undefined || value === null){ log("no value for", name); continue; }
        const tag = createValueTag(formatNumber(value));
        Object.defineProperty(tag, "_pekora_src_element", { value: box, configurable:true });
        tag.dataset.pekoraSrcType = "box";
        try { box.dataset.pekoraEnhanced = "1"; box.dataset.pekoraValue = String(Number(value)); } catch(e){}
        overlay.appendChild(tag);
        positionTagForBox(tag, box, modal);
        inserted++;
      } catch(err){ console.error(LOG,"enhanceModal error", err); }
    }

    const enhancedBoxes = Array.from(modal.querySelectorAll('[data-pekora-value]'));
    let giveTotal = 0, receiveTotal = 0;
    const rows = Array.from(modal.querySelectorAll(".row.ms-1.mb-4"));
    enhancedBoxes.forEach((b, i) => {
      const v = Number(b.dataset.pekoraValue) || 0;
      const contRow = b.closest(".row.ms-1.mb-4");
      if(contRow){
        const idx = rows.indexOf(contRow);
        if(idx > 0) receiveTotal += v; else giveTotal += v;
      } else giveTotal += v;
    });
    if(rows.length === 0 && enhancedBoxes.length > 1){
      giveTotal = 0; receiveTotal = 0;
      enhancedBoxes.forEach((b,i)=>{ const v=Number(b.dataset.pekoraValue)||0; if(i < enhancedBoxes.length/2) giveTotal += v; else receiveTotal += v; });
    }

    const overpay = receiveTotal - giveTotal;
    const summary = createSummaryForOverlay();
    summary.innerHTML = '';
    const title = document.createElement('div'); title.className = 'title';
    title.textContent = overpay === 0 ? 'Fair Trade' : (overpay > 0 ? `+${formatNumber(overpay)}` : `${formatNumber(overpay)}`);
    if(overpay > 0) title.classList.add('pos'); else if(overpay < 0) title.classList.add('neg');
    summary.appendChild(title);
    const youLine = document.createElement('div'); youLine.className = 'line';
    youLine.innerHTML = `<span>You're offering</span><span class="numbers">${formatNumber(giveTotal)}</span>`;
    if(overpay < 0) youLine.querySelector('.numbers').classList.add('neg'); else if(overpay > 0) youLine.querySelector('.numbers').classList.add('pos');
    summary.appendChild(youLine);
    const themLine = document.createElement('div'); themLine.className = 'line';
    themLine.innerHTML = `<span>They're offering</span><span class="numbers">${formatNumber(receiveTotal)}</span>`;
    if(overpay > 0) themLine.querySelector('.numbers').classList.add('pos'); else if(overpay < 0) themLine.querySelector('.numbers').classList.add('neg');
    summary.appendChild(themLine);
    Object.defineProperty(summary, "_pekora_src_element", { value: modal, configurable:true });
    summary.dataset.pekoraSrcType = 'modal-summary';
    summary.dataset.pekoraModal = (modal._pekora_id || '');
    overlay.appendChild(summary);
    positionSummaryForModal(summary, modal);
    requestReposition();
    log("inserted tags:", inserted, "giveTotal:", giveTotal, "receiveTotal:", receiveTotal, "overpay:", overpay);
    return inserted;
  }

  function requestRepositionFactory(){
    let pending = false;
    return function requestReposition(){
      if(pending) return;
      pending = true;
      requestAnimationFrame(()=>{ pending = false; repositionAll(); });
    };
  }
  const requestReposition = requestRepositionFactory();
  window.addEventListener('resize', requestReposition, { passive:true });
  window.addEventListener('scroll', requestReposition, { passive:true });
  const repositionInterval = setInterval(requestReposition, 800);

  function repositionAll(){
    const overlays = Array.from(document.querySelectorAll('.pekora-overlay'));
    for(const ov of overlays){
      const parent = ov.parentElement;
      if(!parent) continue;
      for(const child of Array.from(ov.children)){
        try {
          const type = child.dataset.pekoraSrcType;
          const src = child._pekora_src_element;
          if(!src) continue;
          if(type === 'box'){
            positionTagForBox(child, src, parent);
          } else if(type === 'modal-summary'){
            positionSummaryForModal(child, parent);
          }
        } catch(e){}
      }
    }
  }

  function enhanceCollectiblesPage(){
    try {
      if(!location.pathname.includes('/internal/collectibles')) return;
      const container = document.querySelector('.container') || document.body;
      ensureOverlayFor(container);
      const cards = Array.from(document.querySelectorAll('.col-6.col-md-4.col-lg-2.mb-2, .col-6.col-md-4.col-lg-2'));
      let totalValue = 0;
      let seen = 0;
      for(const col of cards){
        try {
          const card = col.querySelector('.card') || col;
          const body = card && card.querySelector('.card-body');
          if(!body) continue;
          try { const cs = window.getComputedStyle(card); if(cs.position === 'static') card.style.position = 'relative'; } catch(e){}
          const nameEl = body.querySelector('p.fw-bolder') || body.querySelector('p');
          const name = nameEl ? (nameEl.textContent || '').trim() : '';
          if(!name) continue;
          const value = lookupValueForName(name);
          const valueText = (typeof value === 'number' && isFinite(value)) ? formatNumber(value) : 'N/A';
          let existing = card.querySelector('.collectible-value-inline');
          if(existing) existing.remove();
          const inline = document.createElement('div');
          inline.className = 'collectible-value-inline';
          inline.textContent = valueText;
          inline.setAttribute('aria-hidden','true');
          inline.dataset.pekoraValue = String(Number(value) || 0);
          card.appendChild(inline);
          if(typeof value === 'number' && isFinite(value)){
            totalValue += Number(value);
            seen++;
          }
        } catch(e){}
      }
      const totalRapEl = document.querySelector('.col-12.col-lg-3 p.fw-bolder') || Array.from(document.querySelectorAll('p.fw-bolder')).find(p=>/total rap/i.test(p.textContent||''));
      if(totalRapEl){
        const prev = totalRapEl.parentElement && totalRapEl.parentElement.querySelector('.total-value-added');
        if(prev) prev.remove();
        const totalValueEl = document.createElement('p');
        totalValueEl.className = 'total-value-added';
        totalValueEl.textContent = `Total Value: ${formatNumber(totalValue)}`;
        totalRapEl.parentElement.appendChild(totalValueEl);
      }
    } catch(e){ console.error(LOG, "enhanceCollectiblesPage err", e); }
  }

  function scheduleEnhanceOnViewDetails(){
    document.body.addEventListener("click", (e)=>{
      try {
        if(e.target && e.target.textContent && e.target.textContent.trim().toLowerCase() === "view details"){
          setTimeout(()=>{
            let tries = 0;
            const id = setInterval(()=>{
              const modal = findTradeModal();
              if(modal && modal.querySelector("img")){
                clearInterval(id);
                enhanceModal(modal);
              }
              if(++tries > 12) clearInterval(id);
            }, 300);
          }, 220);
        }
      } catch(e){}
    });
  }

  const mo = new MutationObserver((muts)=>{
    let added = 0;
    for(const m of muts) if(m.addedNodes && m.addedNodes.length) added += m.addedNodes.length;
    if(added>0){
      if(window.__pekoraDeb) clearTimeout(window.__pekoraDeb);
      window.__pekoraDeb = setTimeout(()=>{
        const modal = findTradeModal();
        if(modal) enhanceModal(modal);
        enhanceCollectiblesPage();
      }, 180);
    }
  });
  mo.observe(document, { childList: true, subtree: true });

  setTimeout(()=>{ const m = findTradeModal(); if(m) enhanceModal(m); enhanceCollectiblesPage(); }, 700);
  setTimeout(()=>{ const m = findTradeModal(); if(m) enhanceModal(m); enhanceCollectiblesPage(); }, 1500);
  scheduleEnhanceOnViewDetails();

  window.__pekoraEnhancer = {
    reScan: ()=>{ const m=findTradeModal(); if(m) clearModalMarkers(m); const mm = findTradeModal(); if(mm) enhanceModal(mm); enhanceCollectiblesPage(); },
    dataCount: ()=> valueMap.size,
    sample: ()=> Array.from(valueMap.entries()).slice(0,12)
  };

  window.addEventListener("beforeunload", ()=>{ try{ if(repositionInterval) clearInterval(repositionInterval); mo.disconnect(); }catch(e){} });

  log("PekoraEnhancer ready");
})();

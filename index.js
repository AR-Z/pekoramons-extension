// ==UserScript==
// @name        Pekoramons Trading Extension.
// @namespace   arz/ami
// @version     1.5
// @description hi description
// @match       *://pekora.zip/*
// @match       *://www.pekora.zip/*
// @match       *://*.pekora.zip/*
// @icon        https://pekora.zip/favicon.ico
// @grant       GM_xmlhttpRequest
// @run-at      document-idle
// ==/UserScript==

(async function(){
  "use strict";
  const LOG = "[PekoraEnhancer]";
  function log(...args){ console.log(LOG, ...args); }


  function cleanName(name){
    if(!name || typeof name !== "string") return "";
    return name.replace(/[\u200B-\u200F\uFEFF]/g,"")
               .replace(/[^a-zA-Z0-9 ]/g," ")
               .replace(/\s+/g," ")
               .trim()
               .toLowerCase();
  }
  function formatNumber(n){
    if(n === null || n === undefined || !isFinite(Number(n))) return "N/A";
    n = Number(n);
    if(n >= 1000000) return (n/1000000).toFixed(1) + "M";
    if(n >= 1000) return (n/1000).toFixed(1) + "K";
    return n.toLocaleString();
  }
  async function fetchJSON(url){
    if(typeof GM_xmlhttpRequest === "function"){
      return new Promise((resolve,reject)=>{
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { Accept: "application/json" },
          onload: r => { try{ resolve(JSON.parse(r.responseText)); } catch(e){ reject(e); } },
          onerror: e => reject(e)
        });
      });
    } else {
      const r = await fetch(url, { headers: { Accept: "application/json" }});
      if(!r.ok) throw new Error("fetch failed " + r.status);
      return r.json();
    }
  }

  let valueMap = new Map();
  async function loadValues(){
    try{
      const raw = await fetchJSON("https://pekoramons.xyz/api/items");
      if(Array.isArray(raw)){
        valueMap = new Map();
        raw.forEach(it=>{
          const n = (it.Name ?? it.name ?? "").toString();
          if(!n) return;
          valueMap.set(cleanName(n), Number(it.Value ?? it.value ?? 0) || 0);
        });
      }
      log("value map loaded ->", valueMap.size, "entries");
    }catch(e){
      log("couldn't fetch items API:", e && e.message ? e.message : e);
      valueMap = new Map();
    }
  }
  await loadValues();

  function lookupValueForName(rawName){
    if(!rawName) return undefined;
    const name = rawName.trim();
    const cleaned = cleanName(name);
    if(valueMap.has(cleaned)) return valueMap.get(cleaned);
    const stripped = name.replace(/\(.*?\)|\[.*?\]|\{.*?\}/g,"").trim();
    const cleanedStripped = cleanName(stripped);
    if(cleanedStripped && valueMap.has(cleanedStripped)) return valueMap.get(cleanedStripped);
    return undefined;
  }

  const css = `
.pekora-value-num{font-weight:800;color:#7ef39a}
.pekora-value-icon{margin-left:6px;vertical-align:middle;display:inline-block}
`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const VALUE_WRAPPER_ID = "pekora-catalog-value-only";
  const VALUE_P_ID = "pekora-catalog-value-only-p";
  const NAME_SELECTORS = [
    ".itemHeaderContainer-0-2-45 h2",
    ".itemHeaderContainer-0-2-45 .title",
    "h1",
    ".fw-bolder",
    ".item-title",
    'meta[property="og:title"]'
  ];
  function findNameOnPage(){
    for(const s of NAME_SELECTORS){
      try{
        if(s.startsWith("meta")){
          const m = document.querySelector(s);
          if(m && m.content) return m.content.trim();
        } else {
          const el = document.querySelector(s);
          if(el && (el.textContent||"").trim()) return el.textContent.trim();
        }
      }catch(e){}
    }
    return document.title || "";
  }
  function isCatalogPage(){
    return /^https?:\/\/(?:www\.)?pekora\.zip\/catalog\/\d+\/?.*/.test(location.href);
  }

  function findImageInsertionPoint(){
    const preferred = [".item-image", ".item-media", ".itemImage-0-2-36", ".itemDisplay-0-2-20", ".itemVisualizer-0-2-55", ".thumbnail-0-2-1", ".image"];
    for(const s of preferred){
      try{
        const el = document.querySelector(s);
        if(el) return el;
      }catch(e){}
    }

    const imgs = Array.from(document.querySelectorAll("img")).filter(img => {
      try{
        if(img.offsetParent === null) return false;
        const nw = img.naturalWidth || img.width || 0;
        const nh = img.naturalHeight || img.height || 0;
        return Math.max(nw, nh) >= 60;
      }catch(e){ return false; }
    });

    if(imgs.length === 0) return document.body;

    const candidates = imgs.map(img=>{
      const r = img.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      const centerX = r.left + r.width/2;
      const leftBias = centerX < (window.innerWidth * 0.55) ? 1 : 0;
      return { img, area, leftBias, r };
    });

    candidates.sort((a,b) => {
      if(a.leftBias !== b.leftBias) return b.leftBias - a.leftBias;
      return b.area - a.area;
    });

    const chosen = candidates[0].img;
    const parent = chosen.closest("figure, .card, .thumbnail, .image, .item, .col, .item-media, .item-image") || chosen.parentElement || chosen;
    return parent;
  }

  function ensureVisibleUpchain(el, levels = 6){
    let cur = el;
    let depth = 0;
    while(cur && cur !== document.body && depth < levels){
      try{
        const cs = window.getComputedStyle(cur);
        if(cs.overflow && cs.overflow !== 'visible') cur.style.setProperty('overflow','visible','important');
        if(cs.visibility && cs.visibility !== 'visible') cur.style.setProperty('visibility','visible','important');
        if(cs.display && cs.display === 'none') cur.style.setProperty('display','block','important');
      }catch(e){}
      cur = cur.parentElement;
      depth++;
    }
  }

  function buildValuePill(valueText, rawVal){
    const wrapper = document.createElement("div");
    wrapper.id = VALUE_WRAPPER_ID;
    wrapper.className = "pekora-inserted-value-only";
    wrapper.style.setProperty('display','block','important');
    wrapper.style.setProperty('margin-top','8px','important');
    wrapper.style.setProperty('z-index','999999','important');

    const p = document.createElement("p");
    p.id = VALUE_P_ID;
    p.className = "pekora-value-clamp";
    p.dataset.pekoraCatalogValue = String(rawVal ?? "");
    p.innerHTML = `<b>Value</b> <span class="pekora-value-num">${valueText}</span> <span class="icon-robux priceIcon-0-2-218 pekora-value-icon" aria-hidden="true"></span>`;

    p.style.setProperty('display','inline-block','important');
    p.style.setProperty('background','rgba(74,74,74,0.92)','important');
    p.style.setProperty('color','#ffffff','important');
    p.style.setProperty('padding','6px 10px','important');
    p.style.setProperty('border-radius','8px','important');
    p.style.setProperty('font-weight','600','important');
    p.style.setProperty('margin-top','6px','important');
    p.style.setProperty('line-height','1.1','important');

    wrapper.appendChild(p);
    return wrapper;
  }

  async function insertValueUnderImageOnce(){
    try{
      if(!isCatalogPage()) return false;

      const name = findNameOnPage();
      const rawVal = lookupValueForName(name);
      const valueText = rawVal === undefined || rawVal === null ? "N/A" : formatNumber(rawVal);

      const existingWrapper = document.getElementById(VALUE_WRAPPER_ID);
      if(existingWrapper){
        const p = document.getElementById(VALUE_P_ID);
        if(p){
          p.dataset.pekoraCatalogValue = String(rawVal ?? "");
          const num = p.querySelector('.pekora-value-num');
          if(num) num.textContent = valueText;
          p.style.setProperty('background','rgba(74,74,74,0.92)','important');
          p.style.setProperty('color','#ffffff','important');
          ensureVisibleUpchain(existingWrapper, 6);
          log("updated value pill under image for:", name, "->", valueText);
          return true;
        }
      }

      const imageContainer = findImageInsertionPoint();
      if(!imageContainer){
        log("no image container found - aborting insertion");
        return false;
      }

      const legacy = document.getElementById("pekora-catalog-value-insert");
      if(legacy) legacy.remove();

      const wrapper = buildValuePill(valueText, rawVal);

      try{
        imageContainer.appendChild(wrapper);
      }catch(e){
        try{ (imageContainer.parentElement || document.body).appendChild(wrapper); }catch(e2){ document.body.appendChild(wrapper); }
      }

      // ensure visible
      ensureVisibleUpchain(wrapper, 6);

      log("inserted value for:", name, "->", valueText, "parent:", imageContainer && (imageContainer.tagName + (imageContainer.className ? " " + imageContainer.className : "")));
      return true;
    }catch(e){
      console.error(LOG, "insertValueUnderImageOnce error", e);
      return false;
    }
  }

  function tryInsertValueWithRetries(maxAttempts = 12, intervalMs = 450){
    let attempts = 0;
    const id = setInterval(async ()=>{
      attempts++;
      try{
        const ok = await insertValueUnderImageOnce();
        if(ok || attempts >= maxAttempts){ clearInterval(id); if(!ok) log("value insertion gave up after", attempts, "attempts"); }
      }catch(e){ console.error(LOG, "tryInsertValueWithRetries err", e); if(attempts >= maxAttempts) clearInterval(id); }
    }, intervalMs);
    return ()=> clearInterval(id);
  }

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
  function createValueTag(text){
    const el = document.createElement("div");
    el.className = "custom-value-tag small";
    el.style.position = "absolute";
    el.style.display = "none";
    const v = document.createElement("div"); v.className = "value"; v.textContent = text; el.appendChild(v);
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
        if(value === undefined || value === null){ log("no exact value for", name); continue; }
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
    const summary = document.createElement("div");
    summary.className = "custom-overpay-summary";
    summary.style.position = "absolute";
    summary.style.display = "none";
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
    requestReposition();
    log("inserted tags:", inserted, "giveTotal:", giveTotal, "receiveTotal:", receiveTotal, "overpay:", overpay);
    return inserted;
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
            positionTagForBox(child, src, parent);
          }
        } catch(e){}
      }
    }
  }

  (function hijackHistory(){
    const _push = history.pushState;
    history.pushState = function(){
      _push.apply(this, arguments);
      window.dispatchEvent(new Event("locationchange"));
    };
    window.addEventListener("popstate", ()=> window.dispatchEvent(new Event("locationchange")));
    window.addEventListener("locationchange", () => {
      log("location changed ->", location.href);
      setTimeout(()=> {
        tryInsertValueWithRetries(12, 400);
        const modal = findTradeModal(); if(modal) enhanceModal(modal);
        enhanceCollectiblesPage();
      }, 350);
    });
  })();

  const mo = new MutationObserver((muts)=>{
    let added = 0;
    for(const m of muts) if(m.addedNodes && m.addedNodes.length) added += m.addedNodes.length;
    if(added>0){
      if(window.__pekoraDeb) clearTimeout(window.__pekoraDeb);
      window.__pekoraDeb = setTimeout(()=>{
        const modal = findTradeModal();
        if(modal) enhanceModal(modal);
        enhanceCollectiblesPage();
        tryInsertValueWithRetries(8, 400);
      }, 160);
    }
  });
  mo.observe(document, { childList: true, subtree: true });

  setTimeout(()=>{ tryInsertValueWithRetries(12, 400); const m=findTradeModal(); if(m) enhanceModal(m); enhanceCollectiblesPage(); }, 700);
  setTimeout(()=>{ tryInsertValueWithRetries(8, 600); const m=findTradeModal(); if(m) enhanceModal(m); enhanceCollectiblesPage(); }, 1600);
  setTimeout(()=>{ tryInsertValueWithRetries(4, 1000); }, 4000);

  window.__pekoraEnhancer = {
    reScan: ()=> { tryInsertValueWithRetries(8, 400); },
    reloadValues: async ()=> { await loadValues(); tryInsertValueWithRetries(8,400); },
    dataCount: ()=> valueMap.size,
    sample: ()=> Array.from(valueMap.entries()).slice(0,12)
  };

  window.addEventListener("beforeunload", ()=>{ try{ if(repositionInterval) clearInterval(repositionInterval); mo.disconnect(); }catch(e){} });

  log("PekoraEnhancer ready");
})();

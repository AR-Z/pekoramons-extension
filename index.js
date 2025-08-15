// ==UserScript==
// @name        Pekoramons Trading Extension
// @namespace   arz/ami
// @version     2.0
// @description AHHHHHHHHHHHHHHHHHH
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
.pekora-value-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;white-space:normal;margin-top:6px;font-weight:300;font-family:"HCo Gotham SSm","Helvetica Neue",Helvetica,Arial,sans-serif;}
.pekora-value-clamp b{font-weight:700;margin-right:6px}
.pekora-inserted-value{margin-top:8px;z-index:99999}
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
.collectible-value-inline{position:absolute;left:50%;transform:translateX(-50%);bottom:6px;pointer-events:auto;font-weight:700;font-size:12px;padding:3px 6px;border-radius:6px;background:rgba(8,8,8,0.85);color:#bfffd6;z-index:2147483650;white-space:nowrap}
.total-value-added{color:#7ef39a;font-weight:800;margin-top:6px}
.pekora-inserted-value-only{display:block;margin-top:8px;z-index:999999}
.pekora-inserted-value-only p{display:inline-block;background:rgba(74,74,74,0.92);color:#fff;padding:6px 10px;border-radius:8px;font-weight:600;margin-top:6px;line-height:1.1}
.pekora-value-num{font-weight:800;color:#7ef39a}
.pekora-value-icon{margin-left:6px;vertical-align:middle;display:inline-block}
`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const NAME_SELECTORS = [
    ".itemHeaderContainer-0-2-45 h2",
    ".itemHeaderContainer-0-2-45 .title",
    ".item-title",
    ".item-name",
    ".detailTitle",
    ".fw-bolder",
    ".product-title",
    ".title",
  ];

  function nameFromMeta(){
    try{
      const og = document.querySelector('meta[property="og:title"]');
      if(og && og.content) return og.content.trim();
      const tw = document.querySelector('meta[name="twitter:title"]');
      if(tw && tw.content) return tw.content.trim();
      const t = document.querySelector('meta[name="title"]');
      if(t && t.content) return t.content.trim();
    }catch(e){}
    return null;
  }

  function nameFromJSONLD(){
    try{
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for(const s of scripts){
        try{
          const parsed = JSON.parse(s.textContent || "{}");
          if(parsed){
            if(Array.isArray(parsed)){
              for(const p of parsed) if(p && (p.name || (p["@type"] && p["@type"].toLowerCase().includes("product")))) return (p.name || p.title || "").toString().trim();
            } else {
              if(parsed.name && parsed.name.toString().trim()) return parsed.name.toString().trim();
              if(parsed["@type"] && parsed["@type"].toLowerCase().includes("product") && parsed.name) return parsed.name.toString().trim();
            }
          }
        }catch(e){}
      }
    }catch(e){}
    return null;
  }

  function findNameOnPage(){
    const m = nameFromMeta();
    if(m) return m;
    const jl = nameFromJSONLD();
    if(jl) return jl;
    for(const s of NAME_SELECTORS){
      try{
        const el = document.querySelector(s);
        if(el){
          const text = (el.textContent || el.content || el.value || "").trim();
          if(text) return text;
        }
      }catch(e){}
    }
    const headings = Array.from(document.querySelectorAll("h1,h2"));
    for(const h of headings){
      const t = (h.textContent || "").trim();
      if(t && t.length > 2 && t.length < 120) return t;
    }
    if(document.title && document.title.trim()) return document.title.trim();
    return "";
  }

  function findImageInsertionPoint(){
    const preferred = [".item-image", ".item-media", ".itemImage-0-2-36", ".itemDisplay-0-2-20", ".itemVisualizer-0-2-55", ".thumbnail-0-2-1", ".image", ".item__media"];
    for(const s of preferred){
      try{ const el = document.querySelector(s); if(el) return el; } catch(e){}
    }
    const imgs = Array.from(document.querySelectorAll("img")).filter(img => {
      try{ if(img.offsetParent === null) return false; const nw = img.naturalWidth || img.width || 0; const nh = img.naturalHeight || img.height || 0; return Math.max(nw, nh) >= 60; }catch(e){ return false; }
    });
    if(imgs.length){
      const sorted = imgs.map(img=>{
        try{ const r = img.getBoundingClientRect(); const area = Math.max(0, r.width) * Math.max(0, r.height); const centerX = r.left + r.width/2; const leftBias = centerX < (window.innerWidth * 0.6) ? 1 : 0; return { img, area, leftBias, r }; }catch(e){ return { img, area:0, leftBias:0 }; }
      }).sort((a,b)=> (b.leftBias - a.leftBias) || (b.area - a.area));
      const cand = sorted[0];
      if(cand && cand.img){
        const parent = cand.img.closest("figure, .card, .thumbnail, .image, .item, .col, .item-media, .item-image") || cand.img.parentElement || cand.img;
        return parent;
      }
    }
    return null;
  }

  function findTitleInsertionPoint(){
    const titleSelectors = [".itemHeaderContainer-0-2-45", ".itemHeader", ".item-title", ".product-title", ".detailTitle", ".title"];
    for(const s of titleSelectors){
      try{ const el = document.querySelector(s); if(el) return el; }catch(e){}
    }
    const h = document.querySelector("h1") || document.querySelector("h2");
    if(h) return h;
    return document.querySelector("main") || document.querySelector(".page") || document.body;
  }

  function ensureVisibleUpchain(el, levels = 6){
    let cur = el; let depth = 0;
    while(cur && cur !== document.body && depth < levels){
      try{
        const cs = window.getComputedStyle(cur);
        if(cs.overflow && cs.overflow !== 'visible') cur.style.setProperty('overflow','visible','important');
        if(cs.visibility && cs.visibility !== 'visible') cur.style.setProperty('visibility','visible','important');
        if(cs.display && cs.display === 'none') cur.style.setProperty('display','block','important');
      }catch(e){}
      cur = cur.parentElement; depth++;
    }
  }

  function isCatalogPage(){
    return /\/catalog\/\d+(?:\/|$|\?)/i.test(location.pathname);
  }

  const VALUE_WRAPPER_ID = "pekora-catalog-value-only";
  const VALUE_P_ID = "pekora-catalog-value-only-p";

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

  function removeStrayCatalogPill(){
    if(isCatalogPage()) return;
    const stray = document.getElementById(VALUE_WRAPPER_ID);
    if(stray) {
      log("removing stray catalog pill because current page is not a catalog item");
      stray.remove();
    }
  }

  async function insertValueUnderImageOnce(){
    try{
      if(!isCatalogPage()){
        removeStrayCatalogPill();
        return false;
      }

      const name = findNameOnPage();
      if(!name || !name.trim()){ log("no item name detected — aborting catalog insert"); return false; }
      const rawVal = lookupValueForName(name);
      const valueText = rawVal === undefined || rawVal === null ? "N/A" : formatNumber(rawVal);

      const existingWrapper = document.getElementById(VALUE_WRAPPER_ID);
      if(existingWrapper){
        const p = document.getElementById(VALUE_P_ID);
        if(p){
          p.dataset.pekoraCatalogValue = String(rawVal ?? "");
          const num = p.querySelector('.pekora-value-num');
          if(num) num.textContent = valueText;
          ensureVisibleUpchain(existingWrapper, 6);
          log("updated catalog value pill for:", name, "->", valueText);
          return true;
        } else {
          existingWrapper.remove();
        }
      }

      const imageContainer = findImageInsertionPoint();
      const titleContainer = findTitleInsertionPoint();
      if(!imageContainer && !titleContainer){
        log("no image or title container found — aborting insert for:", name);
        return false;
      }

      const wrapper = buildValuePill(valueText, rawVal);

      try{
        if(imageContainer){
          const tagName = (imageContainer.tagName || "").toLowerCase();
          if(tagName === "img") (imageContainer.parentElement || document.body).appendChild(wrapper);
          else imageContainer.appendChild(wrapper);
          ensureVisibleUpchain(wrapper, 6);
          log("inserted catalog value under image for:", name, "->", valueText);
        } else {
          if(titleContainer && titleContainer.parentElement) titleContainer.insertAdjacentElement("afterend", wrapper);
          else (document.querySelector("main") || document.body).insertAdjacentElement("afterbegin", wrapper);
          ensureVisibleUpchain(wrapper, 6);
          log("inserted catalog value near title for:", name, "->", valueText);
        }
      }catch(e){
        try{ document.body.appendChild(wrapper); ensureVisibleUpchain(wrapper, 6); }catch(e){}
        log("fallback inserted catalog value for:", name, "->", valueText);
      }

      return true;
    }catch(e){
      console.error(LOG, "insertValueUnderImageOnce error", e);
      return false;
    }
  }

  function tryInsertValueWithRetries(maxAttempts = 14, intervalMs = 450){
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

  function ensureModalId(modal){
    if(!modal) return "";
    if(modal._pekora_id) return modal._pekora_id;
    if(!window.__pekora_modal_counter) window.__pekora_modal_counter = 1;
    modal._pekora_id = `pekora_modal_${Date.now()}_${(window.__pekora_modal_counter++)}`;
    return modal._pekora_id;
  }

  function clearOverlayForModal(overlay, modalId){
    if(!overlay || !modalId) return;
    const toRemove = Array.from(overlay.children).filter(c => c.dataset && c.dataset.pekoraModal === modalId);
    toRemove.forEach(n => n.remove());
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
    if(!modal) return [];
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
    modal.querySelectorAll("[data-pekora-enhanced-for]").forEach(n=>n.removeAttribute("data-pekora-enhanced-for"));
    modal.querySelectorAll("[data-pekora-value]").forEach(n=>n.removeAttribute("data-pekora-value"));
  }

  function enhanceModal(modal){
    if(!modal) return 0;
    ensureModalId(modal);
    const overlay = ensureOverlayFor(modal);
    modal._pekora_overlay = overlay;
    clearOverlayForModal(overlay, modal._pekora_id);

    const boxes = gatherItemBoxes(modal);
    log("candidate boxes for modal:", boxes.length);
    let inserted = 0;

    for(const box of boxes){
      try {
        if(box.dataset && box.dataset.pekoraEnhancedFor === modal._pekora_id) continue;

        const name = findNameInBox(box);
        if(!name){ log("no name found for a box, skipping"); continue; }
        const value = lookupValueForName(name);
        if(value === undefined || value === null){ log("no exact value for", name); continue; }

        const tag = createValueTag(formatNumber(value));
        tag.dataset.pekoraModal = modal._pekora_id;
        tag.dataset.pekoraSrcType = "box";
        Object.defineProperty(tag, "_pekora_src_element", { value: box, configurable:true });

        try { box.dataset.pekoraEnhancedFor = modal._pekora_id; box.dataset.pekoraValue = String(Number(value)); } catch(e){}

        overlay.appendChild(tag);
        positionTagForBox(tag, box, modal);
        inserted++;
      } catch(err){ console.error(LOG,"enhanceModal error", err); }
    }

    const modalBoxes = Array.from(modal.querySelectorAll('[data-pekora-enhanced-for]')).filter(b => b.dataset.pekoraEnhancedFor === modal._pekora_id);
    let giveTotal = 0, receiveTotal = 0;
    const rows = Array.from(modal.querySelectorAll(".row.ms-1.mb-4"));
    modalBoxes.forEach((b, i) => {
      const v = Number(b.dataset.pekoraValue) || 0;
      const contRow = b.closest(".row.ms-1.mb-4");
      if(contRow){
        const idx = rows.indexOf(contRow);
        if(idx > 0) receiveTotal += v; else giveTotal += v;
      } else giveTotal += v;
    });
    if(rows.length === 0 && modalBoxes.length > 1){
      giveTotal = 0; receiveTotal = 0;
      modalBoxes.forEach((b,i)=>{ const v=Number(b.dataset.pekoraValue)||0; if(i < modalBoxes.length/2) giveTotal += v; else receiveTotal += v; });
    }

    const oldSummary = Array.from(overlay.children).find(c => c.dataset && c.dataset.pekoraModal === modal._pekora_id && c.dataset.pekoraSrcType === 'modal-summary');
    if(oldSummary) oldSummary.remove();

    const overpay = receiveTotal - giveTotal;
    const summary = document.createElement("div");
    summary.className = "custom-overpay-summary";
    summary.style.position = "absolute";
    summary.style.display = "none";
    summary.dataset.pekoraModal = modal._pekora_id;
    summary.dataset.pekoraSrcType = 'modal-summary';
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

    overlay.appendChild(summary);

    requestReposition();
    log("enhanceModal inserted tags:", inserted, "giveTotal:", giveTotal, "receiveTotal:", receiveTotal, "overpay:", overpay);
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

          const stray = card.querySelector('#' + VALUE_WRAPPER_ID);
          if(stray) stray.remove();

          const prev = card.querySelector('.collectible-value-inline');
          if(prev) prev.remove();

          const value = lookupValueForName(name);

          if(typeof value === 'number' && isFinite(value)){
            const valueText = formatNumber(value);
            const inline = document.createElement('div');
            inline.className = 'collectible-value-inline';
            inline.textContent = valueText;
            inline.setAttribute('aria-hidden','true');
            inline.dataset.pekoraValue = String(Number(value) || 0);
            card.appendChild(inline);
            totalValue += Number(value);
            seen++;
          }
        } catch(e){}
      }
      const totalRapEl = document.querySelector('.col-12.col-lg-3 p.fw-bolder') || Array.from(document.querySelectorAll('p.fw-bolder')).find(p=>/total rap/i.test(p.textContent||''));
      if(totalRapEl){
        const prevTotal = totalRapEl.parentElement && totalRapEl.parentElement.querySelector('.total-value-added');
        if(prevTotal) prevTotal.remove();
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

            const modalRect = parent.getBoundingClientRect();
            if(modalRect.width === 0 && modalRect.height === 0){ child.style.display='none'; continue; }
            child.style.display = "";
            let sW = child.offsetWidth || 160;
            let sH = child.offsetHeight || 64;
            const minViewportX = 6 + window.scrollX;
            const outsideLeftCandidateViewport = modalRect.left - sW - 12 + window.scrollX;
            const preferredInsideLeftRelative = 8;
            let finalLeftRelative;
            if(outsideLeftCandidateViewport >= minViewportX){
              finalLeftRelative = -sW - 12;
            } else {
              finalLeftRelative = preferredInsideLeftRelative;
            }
            let finalTopRelative = Math.round(modalRect.height - 12 - sH);
            if(finalTopRelative < 6) finalTopRelative = 6;
            child.style.left = `${finalLeftRelative}px`;
            child.style.top = `${finalTopRelative}px`;
            child.style.right = "unset";
            child.style.bottom = "unset";
            child.style.position = "absolute";
            child.style.transform = "none";
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
        if(isCatalogPage()) tryInsertValueWithRetries(12, 400);
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
        if(isCatalogPage()) tryInsertValueWithRetries(8, 400);
      }, 160);
    }
  });
  mo.observe(document, { childList: true, subtree: true });

  setTimeout(()=>{ if(isCatalogPage()) tryInsertValueWithRetries(12, 400); const m=findTradeModal(); if(m) enhanceModal(m); enhanceCollectiblesPage(); }, 700);
  setTimeout(()=>{ if(isCatalogPage()) tryInsertValueWithRetries(8, 600); const m=findTradeModal(); if(m) enhanceModal(m); enhanceCollectiblesPage(); }, 1600);
  setTimeout(()=>{ if(isCatalogPage()) tryInsertValueWithRetries(4, 1000); }, 4000);

  window.__pekoraEnhancer = {
    reScan: ()=> { if(isCatalogPage()) tryInsertValueWithRetries(8, 400); const m = findTradeModal(); if(m) { clearModalMarkers(m); enhanceModal(m); } enhanceCollectiblesPage(); },
    reloadValues: async ()=> { await loadValues(); if(isCatalogPage()) tryInsertValueWithRetries(8,400); },
    dataCount: ()=> valueMap.size,
    sample: ()=> Array.from(valueMap.entries()).slice(0,12)
  };

  window.addEventListener("beforeunload", ()=>{ try{ if(repositionInterval) clearInterval(repositionInterval); mo.disconnect(); }catch(e){} });

  setInterval(removeStrayCatalogPill, 2500);

  log("PekoraEnhancer ready — catalog pill only on item pages, collectibles no N/A, trade modal dedupe enabled");
})();

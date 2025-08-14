// ==UserScript==
// @name        Pekoramons Trading Extension
// @namespace    arz/ami
// @version      2.5
// @description  Inserts pekoramons item values into trades.
// @match        *://*.pekora.zip/*
// @icon         https://pekora.zip/favicon.ico
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/AR-Z/pekoramons-extension/main/index.js
// @updateURL    https://raw.githubusercontent.com/AR-Z/pekoramons-extension/main/index.js
// ==/UserScript==


(async function () {
  "use strict";
  const LOG = "[PekoraEnhancer]";
  function log(...a){ console.log(LOG, ...a); }

  function cleanName(name){
    if(!name || typeof name !== "string") return "";
    return name.replace(/[\u200B-\u200F\uFEFF]/g, "")
               .replace(/[^a-zA-Z0-9 ]/g," ")
               .replace(/\s+/g," ")
               .trim()
               .toLowerCase();
  }
  function formatNumber(n){
    if(!isFinite(n)) return "N/A";
    if(n >= 1_000_000) return (n/1_000_000).toFixed(1) + "M";
    if(n >= 1_000) return (n/1_000).toFixed(1) + "K";
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
  try {
    raw = await fetchItems("https://pekoramons.xyz/api/items");
    if(!Array.isArray(raw)){ log("items API returned unexpected shape, using empty array"); raw = []; }
  } catch(err){
    console.error(LOG, "fetch error:", err);
    raw = [];
  }
  log("loaded items:", raw.length);

  const valueMap = new Map();
  raw.forEach(it=>{
    const n = (it.Name ?? it.name ?? "").toString();
    if(!n) return;
    valueMap.set(cleanName(n), Number(it.Value ?? it.value ?? 0) || 0);
  });


  const css = `
    /* Overlay container that sits above the page and doesn't affect layout */
    #pekora-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none; /* don't block normal page interactions */
      z-index: 2147483647; /* top-most */
    }

    .custom-value-tag{
      font-family: Arial, sans-serif;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 13px;
      padding: 4px 8px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
      background: rgba(10,10,10,0.88);
      color: #e6ffed;
      transform: translate(-50%, 0); /* center horizontally relative to left pos */
      white-space: nowrap;
      pointer-events: auto; /* tags can be hovered if needed */
      user-select: none;
      line-height: 1;
    }
    .custom-value-tag .value{ color:#00e676; font-weight:700; font-size:13px; }

    /* Slightly more compact style so it fits under item boxes */
    .custom-value-tag.small { padding: 3px 6px; font-size: 12px; border-radius: 5px; }

    /* Summary: dark background with white default text for contrast */
    .custom-overpay-summary{
      font-family: Arial, sans-serif;
      position: absolute;
      pointer-events: auto;
      padding: 8px 10px;
      border-radius: 8px;
      min-width: 140px;
      text-align: left;
      font-weight: 700;
      font-size: 13px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.6);
      background: rgba(12,12,12,0.96);
      color: #ffffff; /* default white text for dark background */
      transform: none;
      line-height: 1.1;
    }
    .custom-overpay-summary .title { font-weight:800; margin-bottom:6px; font-size:14px; color: #ffffff; }
    .custom-overpay-summary .line{ margin-top: 4px; font-size: 13px; font-weight: 600; display:flex; justify-content:space-between; gap:8px; color: #fff; }
    .custom-overpay-summary .numbers{ font-weight:900; margin-left: 8px; color: #fff; }

    /* Force the label (left span) to white even if other rules apply */
    .custom-overpay-summary .line > span:first-child {
      color: #ffffff !important;
    }

    /* Accent colors kept bright for visibility */
    .custom-overpay-summary .pos { color: #7ef39a !important; }
    .custom-overpay-summary .neg { color: #ff7f7f !important; }
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);


  let overlay = document.getElementById("pekora-overlay");
  if(!overlay){
    overlay = document.createElement("div");
    overlay.id = "pekora-overlay";
    document.body.appendChild(overlay);
  }

  function createOverlayTagElement(valueText){
    const tag = document.createElement("div");
    tag.className = "custom-value-tag small";
    tag.style.position = "absolute";
    tag.style.pointerEvents = "auto";
    tag.style.left = "0px";
    tag.style.top = "0px";
    const v = document.createElement("div");
    v.className = "value";
    v.textContent = valueText;
    tag.appendChild(v);
    return tag;
  }

  function createOverlaySummaryElement(){
    const s = document.createElement("div");
    s.className = "custom-overpay-summary";
    s.style.position = "absolute";
    s.style.pointerEvents = "auto";
    s.style.left = "0px";
    s.style.top = "0px";
    return s;
  }

  function positionTagForBox(tagEl, boxEl){
    if(!boxEl || !tagEl) return;
    const rect = boxEl.getBoundingClientRect();
    if(rect.width === 0 && rect.height === 0){
      tagEl.style.display = "none";
      return;
    }
    tagEl.style.display = "";
    const leftCenter = rect.left + rect.width / 2 + window.scrollX;
    const top = rect.bottom + 6 + window.scrollY;
    const vw = document.documentElement.clientWidth;
    const half = (tagEl.offsetWidth || 80) / 2;
    const desiredLeft = Math.min(Math.max(leftCenter - half, 6 + window.scrollX), vw - half - 6 + window.scrollX);
    tagEl.style.left = `${Math.round(desiredLeft + half)}px`; 
    tagEl.style.top = `${Math.round(top)}px`;
  }


  function positionSummaryForModal(summaryEl, modalEl){
    if(!summaryEl || !modalEl) return;
    const rect = modalEl.getBoundingClientRect();
    if(rect.width === 0 && rect.height === 0){
      summaryEl.style.display = "none";
      return;
    }
    summaryEl.style.display = "";

    const bottomInset = 12;

    const preferredInsideLeft = rect.left + 8 + window.scrollX;

    const summaryW = summaryEl.offsetWidth || 160;
    const outsideLeftCandidate = rect.left - summaryW - 12 + window.scrollX;

    const minViewportX = 6 + window.scrollX;
    let finalLeft;
    if(outsideLeftCandidate >= minViewportX){
      finalLeft = outsideLeftCandidate;
    } else {
      finalLeft = preferredInsideLeft;
    }

    const topVal = rect.bottom - bottomInset - summaryEl.offsetHeight + window.scrollY;
    if(summaryEl.offsetHeight === 0 || summaryEl.offsetWidth === 0){
      requestAnimationFrame(()=> {
        const measuredWidth = summaryEl.offsetWidth || summaryW;
        const outsideLeftCandidate2 = rect.left - measuredWidth - 12 + window.scrollX;
        const chosenLeft = (outsideLeftCandidate2 >= minViewportX) ? outsideLeftCandidate2 : preferredInsideLeft;
        summaryEl.style.left = `${Math.round(chosenLeft)}px`;
        summaryEl.style.top = `${Math.round(rect.bottom - bottomInset - summaryEl.offsetHeight + window.scrollY)}px`;
      });
      return;
    }

    summaryEl.style.left = `${Math.round(finalLeft)}px`;
    summaryEl.style.top = `${Math.round(topVal)}px`;
  }

  let repositionRequested = false;
  function requestReposition(){
    if(repositionRequested) return;
    repositionRequested = true;
    requestAnimationFrame(()=>{
      repositionRequested = false;
      const children = Array.from(overlay.children);
      for(const child of children){
        try {
          const srcType = child.dataset?.pekoraSrcType;
          const src = child._pekora_src_element;
          if(!src) continue;
          if(srcType === "box" && src instanceof Element){
            positionTagForBox(child, src);
          } else if(srcType === "img" && src instanceof Element){
            const box = src.closest(".col-0-2-133") || src.closest(".card") || src.closest(".item") || src.parentElement;
            positionTagForBox(child, box || src);
          } else if(srcType === "modal-summary" && src instanceof Element){
            positionSummaryForModal(child, src);
          }
        } catch(e){
      
        }
      }
    });
  }


  window.addEventListener("scroll", requestReposition, { passive: true });
  window.addEventListener("resize", requestReposition, { passive: true });
  let repositionInterval = setInterval(requestReposition, 700);


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

  function isLikelyItemImage(img){
    try{
      if(!img || !(img instanceof HTMLImageElement)) return false;
      const alt = (img.alt||"").toLowerCase();
      if(alt.includes("avatar") || alt.includes("profile")) return false;
      const nw = img.naturalWidth || img.width || 0;
      const nh = img.naturalHeight || img.height || 0;
      if(Math.max(nw,nh) < 16) return false;
      const src = (img.src||"").toLowerCase();
      if(src.includes("thumbnail") || src.includes("thumbnails") || src.includes("/catalog/") || src.includes("roblox")) return true;
      if(img.offsetParent !== null) return true;
      return false;
    }catch(e){ return false; }
  }

  function clearModalMarkers(modal){
    if(!modal) return;
    const children = Array.from(overlay.children);
    for(const child of children){
      try{
        const src = child._pekora_src_element;
        if(!src) continue;
        if(src === modal || modal.contains(src)){
          child.remove();
        }
      }catch(e){}
    }
    modal.querySelectorAll("[data-pekora-enhanced]").forEach(n=>n.removeAttribute("data-pekora-enhanced"));
    modal.querySelectorAll("[data-pekora-value]").forEach(n=>n.removeAttribute("data-pekora-value"));
  }

  function gatherBoxesFromRows(modal){
    const rows = Array.from(modal.querySelectorAll(".row.ms-1.mb-4"));
    const boxes = [];
    for(const row of rows){
      const found = Array.from(row.querySelectorAll(".col-0-2-133"));
      if(found.length) found.forEach(f => boxes.push(f));
    }
    return boxes;
  }

  function gatherItemBoxes(modal){

    const strict = gatherBoxesFromRows(modal);
    if(strict.length) return strict;


    const boxes = [];
    const imgs = Array.from(modal.querySelectorAll("img"));
    for(const img of imgs){
      if(!isLikelyItemImage(img)) continue;
      const box = img.closest(".col-0-2-133") || img.closest(".card") || img.closest(".item") || img.closest("a") || img.parentElement;
      if(box && !boxes.includes(box)) boxes.push(box);
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

    const tries = [
      "a[href*='/catalog/']",
      ".itemName-0-2-135 a",
      ".itemName a",
      ".item-name a",
      ".itemTitle a",
      "p.fw-bolder",
      "p",
      "div"
    ];
    for(const s of tries){
      try {
        const el = box.querySelector(s);
        if(el && el.textContent){
          const t = el.textContent.trim();
          if(t.length && !isLabelish(t)) return t;
        }
      } catch(e){}
    }
    const img = box.querySelector && box.querySelector("img");
    if(img){
      if(img.alt && img.alt.trim() && !isLabelish(img.alt)) return img.alt.trim();
      if(img.title && img.title.trim() && !isLabelish(img.title)) return img.title.trim();
    }
    const full = (box.textContent||"").trim();
    if(!full) return "";

    const lines = full.split('\n').map(l=>l.trim()).filter(Boolean);
    for(const line of lines){
      if(!isLabelish(line)) return line;
    }
    return "";
  }

  function createValueTag(val){
    const w = document.createElement("div");
    w.className = "custom-value-tag small";
    w.style.position = "absolute";
    w.style.pointerEvents = "auto";
    const v = document.createElement("div");
    v.className = "value";
    v.textContent = val ? formatNumber(val) : "N/A";
    w.appendChild(v);
    return w;
  }


  function enhanceModal(modal){
    if(!modal) return 0;
    clearModalMarkers(modal);

    const boxes = gatherItemBoxes(modal);
    log("candidate boxes:", boxes.length);
    let inserted = 0;

    const rows = Array.from(modal.querySelectorAll(".row.ms-1.mb-4"));

    for(const box of boxes){
      try {
        if(!box) continue;
        if(box.dataset && box.dataset.pekoraEnhanced === "1") continue;

        const name = findNameInBox(box);
        if(!name){
          log("no name found for a box, skipping");
          continue;
        }

        const key = cleanName(name);
        let value = valueMap.get(key);

        if(value === undefined){
          let fuzzy = null;
          for(const k of valueMap.keys()){
            if(!k) continue;
            if(key.includes(k) || k.includes(key)){ fuzzy = k; break; }
          }
          if(fuzzy){ value = valueMap.get(fuzzy); log("fuzzy match", name, "->", fuzzy); }
        }

        if(value === undefined || value === null){
          log("no value for", name);
          continue;
        }

        const tag = createValueTag(value);
        Object.defineProperty(tag, "_pekora_src_element", { value: box, configurable: true });
        tag.dataset.pekoraSrcType = "box";

        overlay.appendChild(tag);
        try { box.dataset.pekoraEnhanced = "1"; box.dataset.pekoraValue = String(Number(value)); } catch(e){}

        positionTagForBox(tag, box);

        inserted++;
      } catch(err){
        console.error(LOG, "enhance error", err);
      }
    }

    const enhancedBoxes = Array.from(modal.querySelectorAll('[data-pekora-value]'));
    let giveTotal = 0, receiveTotal = 0;
    if(enhancedBoxes.length){
      for(const b of enhancedBoxes){
        const v = Number(b.dataset.pekoraValue) || 0;
        const containingRow = b.closest(".row.ms-1.mb-4");
        if(containingRow){
          const idx = rows.indexOf(containingRow);
          if(idx > 0) receiveTotal += v; else giveTotal += v;
        } else {
          giveTotal += v;
        }
      }
      if(rows.length === 0 && enhancedBoxes.length > 1){
        giveTotal = 0; receiveTotal = 0;
        enhancedBoxes.forEach((b,i)=>{
          const v = Number(b.dataset.pekoraValue) || 0;
          if(i < enhancedBoxes.length/2) giveTotal += v; else receiveTotal += v;
        });
      }
    }

    Array.from(overlay.children).forEach(c => {
      try {
        if(c._pekora_src_element === modal) c.remove();
      } catch(e){}
    });

    const overpay = receiveTotal - giveTotal;
    const summary = createOverlaySummaryElement();

    summary.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = overpay === 0 ? 'Fair Trade' : (overpay > 0 ? `+${formatNumber(overpay)}` : `${formatNumber(overpay)}`);
    if(overpay > 0) title.classList.add('pos');
    else if(overpay < 0) title.classList.add('neg');
    summary.appendChild(title);

    const youLine = document.createElement('div');
    youLine.className = 'line';
    youLine.innerHTML = `<span>You're offering</span><span class="numbers">${formatNumber(giveTotal)}</span>`;
    const youNumEl = youLine.querySelector('.numbers');
    if(overpay < 0) youNumEl.classList.add('neg'); else if(overpay > 0) youNumEl.classList.add('pos');
    summary.appendChild(youLine);

    const themLine = document.createElement('div');
    themLine.className = 'line';
    themLine.innerHTML = `<span>They're offering</span><span class="numbers">${formatNumber(receiveTotal)}</span>`;
    const themNumEl = themLine.querySelector('.numbers');
    if(overpay > 0) themNumEl.classList.add('pos'); else if(overpay < 0) themNumEl.classList.add('neg');
    summary.appendChild(themLine);

    Object.defineProperty(summary, "_pekora_src_element", { value: modal, configurable: true });
    summary.dataset.pekoraSrcType = "modal-summary";
    overlay.appendChild(summary);

    positionSummaryForModal(summary, modal);

    requestReposition();

    log("inserted tags:", inserted, "giveTotal:", giveTotal, "receiveTotal:", receiveTotal, "overpay:", overpay);
    return inserted;
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

  const mo = new MutationObserver(muts=>{
    let added = 0;
    for(const m of muts) if(m.addedNodes && m.addedNodes.length) added += m.addedNodes.length;
    if(added > 0){
      if(window.__pekoraDeb) clearTimeout(window.__pekoraDeb);
      window.__pekoraDeb = setTimeout(()=>{
        const modal = findTradeModal();
        if(modal) enhanceModal(modal);
      }, 180);
    }
  });
  mo.observe(document, { childList:true, subtree:true });

  setTimeout(()=>{ const m = findTradeModal(); if(m) enhanceModal(m); }, 700);
  setTimeout(()=>{ const m = findTradeModal(); if(m) enhanceModal(m); }, 1500);

  scheduleEnhanceOnViewDetails();


  window.__pekoraEnhancer = {
    reScan: () => { const m = findTradeModal(); if(m) clearModalMarkers(m); const mm = findTradeModal(); if(mm) enhanceModal(mm); },
    dataCount: () => valueMap.size,
    sample: () => Array.from(valueMap.entries()).slice(0,12)
  };

  window.addEventListener("beforeunload", ()=>{
    if(repositionInterval) clearInterval(repositionInterval);
    mo.disconnect();
  });

  log("ready — overlays in place, will not change site layout. Summary placed far left; summary label text forced white.");
})();

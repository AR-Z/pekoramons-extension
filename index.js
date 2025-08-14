// ==UserScript==
// @name        Pekoramons Trading Extension
// @namespace    arz/ami
// @version      2.0
// @description  Inserts pekoramons item values into trades.
// @match        ://.pekora.zip/*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
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
    .custom-value-tag{ font-family: Arial, sans-serif; margin-top:4px; display:flex; justify-content:center; gap:6px; font-size:13px; pointer-events:auto; }
    .custom-value-tag .value{ color:#00e676; font-weight:bold; }
    .custom-overpay-summary{ text-align:center; font-weight:bold; font-size:15px; text-shadow:none; margin-top:10px; padding:6px; border-radius:8px; }
    .custom-overpay-summary .line{ margin-top:6px; font-size:13px; }
    .custom-overpay-summary .numbers{ font-weight:700; }
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

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
    modal.querySelectorAll(".custom-value-tag, .custom-overpay-summary").forEach(n=>n.remove());
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
    w.className = "custom-value-tag";
    w.style.display = "flex";
    w.style.justifyContent = "center";
    w.style.gap = "6px";
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

        const img = box.querySelector("img") || box.closest && box.closest("img");
        const tag = createValueTag(value);
        if(img && img.parentElement){
          try { img.insertAdjacentElement('afterend', tag); } catch(e){ box.appendChild(tag); }
        } else {
          try { box.insertAdjacentElement('afterend', tag); } catch(e){ box.appendChild(tag); }
        }

        try { box.dataset.pekoraEnhanced = "1"; box.dataset.pekoraValue = String(Number(value)); } catch(e){}

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

    modal.querySelectorAll('.custom-overpay-summary').forEach(n=>n.remove());
    const overpay = receiveTotal - giveTotal;
    const summary = document.createElement('div');
    summary.className = 'custom-overpay-summary';

    const top = document.createElement('div');
    top.className = 'line numbers';
    if(overpay === 0){
      top.textContent = 'Fair Trade';
      top.style.color = '#AAAAAA';
    } else if(overpay > 0){
      top.textContent = `+${formatNumber(overpay)}`;
      top.style.color = '#00FF00';
    } else {
      top.textContent = `${formatNumber(overpay)}`;
      top.style.color = '#FF3131';
    }
    summary.appendChild(top);


    const youLine = document.createElement('div');
    youLine.className = 'line';
    const youLabel = document.createElement('span');
    youLabel.textContent = "You're offering: ";
    const youNum = document.createElement('span');
    youNum.className = 'numbers';
    youNum.textContent = formatNumber(giveTotal);
    youNum.style.color = overpay < 0 ? '#FF7070' : (overpay > 0 ? '#70FF70' : '#CCCCCC');
    youLine.appendChild(youLabel); youLine.appendChild(youNum);
    summary.appendChild(youLine);


    const themLine = document.createElement('div');
    themLine.className = 'line';
    const themLabel = document.createElement('span');
    themLabel.textContent = "They're offering: ";
    const themNum = document.createElement('span');
    themNum.className = 'numbers';
    themNum.textContent = formatNumber(receiveTotal);
    themNum.style.color = overpay > 0 ? '#70FF70' : (overpay < 0 ? '#FF7070' : '#CCCCCC');
    themLine.appendChild(themLabel); themLine.appendChild(themNum);
    summary.appendChild(themLine);


    const userCol = modal.querySelector(".col-3.divider-right");
    const innerTextBlock = userCol?.querySelector("p > div");
    if(innerTextBlock) innerTextBlock.appendChild(summary); else modal.appendChild(summary);

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

  log("ready — improved name detection and totals.");
})();

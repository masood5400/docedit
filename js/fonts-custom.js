/* ============ DocEdit — custom user fonts (travel with the document) ============ */
"use strict";

let CUSTOM_FONTS = []; // [{name, data(dataURL)}]
try { CUSTOM_FONTS = JSON.parse(localStorage.getItem("de_myfonts") || "[]"); } catch (e) {}

function customFontCss(fonts = CUSTOM_FONTS) {
  return (fonts || []).map(f =>
    `@font-face{font-family:"${f.name.replace(/"/g, "")}";src:url(${f.data});font-display:swap;}`
  ).join("\n");
}

function injectCustomFonts(fonts = CUSTOM_FONTS, docSelectToo = true) {
  let st = document.getElementById("custom-fonts-style");
  if (!st) {
    st = document.createElement("style");
    st.id = "custom-fonts-style";
    document.head.appendChild(st);
  }
  st.textContent = customFontCss(fonts);
  if (docSelectToo) refreshCustomFontOptions(fonts);
}

function refreshCustomFontOptions(fonts) {
  const sel = document.getElementById("sel-font");
  if (!sel) return;
  let og = document.getElementById("og-myfonts");
  if (!og) {
    og = document.createElement("optgroup");
    og.id = "og-myfonts";
    og.label = t ? t("my_fonts") : "My fonts";
    sel.insertBefore(og, sel.firstChild);
  }
  og.innerHTML = "";
  (fonts || []).forEach(f => {
    const o = document.createElement("option");
    o.value = f.name;
    o.textContent = "★ " + f.name;
    og.appendChild(o);
  });
}

function saveCustomFonts() {
  try { localStorage.setItem("de_myfonts", JSON.stringify(CUSTOM_FONTS)); }
  catch (e) { /* quota — fonts still work this session and travel with published docs */ }
}

function importFontFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 1_500_000) return reject(new Error(t("font_too_big")));
    const name = file.name.replace(/\.[^.]+$/, "").replace(/[^\w ؀-ۿ-]/g, "").slice(0, 40) || "MyFont";
    const r = new FileReader();
    r.onload = () => {
      CUSTOM_FONTS = CUSTOM_FONTS.filter(f => f.name !== name).concat([{ name, data: r.result }]).slice(-3);
      saveCustomFonts();
      injectCustomFonts();
      resolve(name);
    };
    r.onerror = () => reject(new Error("read error"));
    r.readAsDataURL(file);
  });
}

/* fonts arriving with a loaded/shared document — merge (session only, not persisted) */
function adoptDocFonts(fonts) {
  if (!Array.isArray(fonts) || !fonts.length) return;
  const names = new Set(CUSTOM_FONTS.map(f => f.name));
  fonts.forEach(f => { if (f && f.name && !names.has(f.name)) CUSTOM_FONTS.push({ name: f.name, data: f.data }); });
  injectCustomFonts();
}

function initFontImportUI() {
  const btn = document.getElementById("btn-font-import");
  const inp = document.getElementById("font-file-input");
  if (!btn || !inp) return;
  btn.addEventListener("click", () => inp.click());
  inp.addEventListener("change", async () => {
    const f = inp.files[0];
    inp.value = "";
    if (!f) return;
    try {
      const name = await importFontFile(f);
      alert((t ? t("font_added") : "Font added: ") + name);
    } catch (e) { alert(e.message); }
  });
}

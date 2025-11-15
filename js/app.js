/* ========================================================================= */
/*  SMBG CARTE INTERACTIVE – APP.JS FINAL & STABILISÉ                        */
/* ========================================================================= */

/* -------------------------------------------------------------------------- */
/* CARTE                                                                      */
/* -------------------------------------------------------------------------- */
var map = L.map("map", { zoomControl: true, scrollWheelZoom: true });
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
}).addTo(map);
map.setView([46.8, 2.4], 6);


/* -------------------------------------------------------------------------- */
/* CHARGEMENT EXCEL                                                           */
/* -------------------------------------------------------------------------- */
async function loadExcel() {
    const url =
        "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";

    const res = await fetch(url);
    const buf = await res.arrayBuffer();

    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];

    return XLSX.utils.sheet_to_json(ws, {
        defval: "",
        raw: false,
        blankrows: false,
    });
}


/* -------------------------------------------------------------------------- */
/* OUTILS : NETTOYAGE & CONVERSION                                            */
/* -------------------------------------------------------------------------- */
function clean(v) {
    if (!v) return "";
    v = v.toString().trim();
    if (["-", "/", "0", "O"].includes(v)) return "";
    return v;
}

function toNumber(v) {
    if (!v) return null;
    return parseFloat(
        v.toString()
            .replace(/\s+/g, "") 
            .replace(/[€m²]/g, "")
            .replace(/,/g, ".")
    );
}

function formatRef(r) {
    if (!r) return "";
    return r.toString().trim().replace(/^0+/, "").replace(/\.0$/, "");
}

function money(v) {
    const n = toNumber(v);
    return n ? n.toLocaleString("fr-FR") + " €" : "-";
}
function area(v) {
    const n = toNumber(v);
    return n ? n.toLocaleString("fr-FR") + " m²" : "-";
}


/* -------------------------------------------------------------------------- */
/* GLOBALES                                                                    */
/* -------------------------------------------------------------------------- */
let DATA = [];
let MARKERS = [];
let PIN_SELECTED = null;


/* -------------------------------------------------------------------------- */
/* PANNEAU DROIT – AFFICHAGE                                                  */
/* -------------------------------------------------------------------------- */
const COLS = [
    "Adresse",
    "Emplacement",
    "Typologie",
    "Type (location pure / cession bail / cession fonds)",
    "Cession / Droit au bail",
    "Numéro de lot",
    "Surface GLA",
    "Répartition surface GLA",
    "Surface utile",
    "Répartition surface utile",
    "Loyer annuel",
    "Loyer Mensuel",
    "Loyer €/m²",
    "Loyer variable",
    "Charges annuelles",
    "Charges Mensuelles",
    "Charges €/m²",
    "Taxe foncière",
    "Taxe foncière €/m²",
    "Marketing",
    "Marketing €/m²",
    "Total (L+C+M)",
    "Dépôt de garantie",
    "GAPD",
    "Gestion",
    "Etat de livraison",
    "Extraction",
    "Restauration",
    "Environnement Commercial",
    "Commentaires",
    "Honoraires",
];

function showPanel(d) {
    const panel = document.getElementById("sidebar-right");
    panel.scrollTop = 0;

    document.getElementById("ref-annonce").innerHTML =
        formatRef(d["Référence annonce"]);

    let html = "";

    // Adresse + Google Maps
    if (clean(d["Adresse"])) {
        html += `
        <div class="info-line info-line-no-border">
            <div class="info-key">Adresse</div>
            <div class="info-value">${clean(d["Adresse"])}</div>
        </div>
        `;

        if (clean(d["Lien Google Maps"])) {
            html += `
            <button class="btn-maps" onclick="window.open('${d["Lien Google Maps"]}', '_blank')">
                Google Maps
            </button>
            <hr class="hr-smbg">
            `;
        }
    }

    // Autres champs
    COLS.forEach((c) => {
        if (c === "Adresse") return;
        let v = clean(d[c]);
        if (!v) return;

        if (c.toLowerCase().includes("€")) v = money(v);
        if (c.toLowerCase().includes("m²")) v = area(v);

        html += `
        <div class="info-line">
            <div class="info-key">${c}</div>
            <div class="info-value">${v}</div>
        </div>`;
    });

    document.getElementById("info-lot").innerHTML = html;

    document.getElementById("photos-lot").innerHTML = "";
}


/* -------------------------------------------------------------------------- */
/* VALEURS UNIQUES                                                            */
/* -------------------------------------------------------------------------- */
function uniques(col) {
    return [...new Set(DATA.map((x) => clean(x[col])))]
        .filter((x) => x)
        .sort();
}


/* -------------------------------------------------------------------------- */
/* CHECKBOXES SIMPLES                                                         */
/* -------------------------------------------------------------------------- */
function genCheckboxes(list, target, cls) {
    let html = "";
    list.forEach((v) => {
        html += `
        <div class="checkbox-item">
            <input type="checkbox" class="${cls}" value="${v}">
            <label>${v}</label>
        </div>`;
    });
    document.getElementById(target).innerHTML = html;
}


/* -------------------------------------------------------------------------- */
/* GÉNÉRATION FILTRES                                                         */
/* -------------------------------------------------------------------------- */
function generateFilters() {
    genCheckboxes(uniques("Région"), "filter-regions", "chk-region");

    document.getElementById("filter-departements").innerHTML = "";

    const sList = DATA.map((x) => toNumber(x["Surface GLA"])).filter((v) => v > 0);
    initDouble("surface", Math.min(...sList), Math.max(...sList), "m²");

    const lList = DATA.map((x) => toNumber(x["Loyer annuel"])).filter((v) => v > 0);
    initDouble("loyer", Math.min(...lList), Math.max(...lList), "€");

    genCheckboxes(uniques("Emplacement"), "filter-emplacement", "chk-emplacement");
    genCheckboxes(uniques("Typologie"), "filter-typologie", "chk-typologie");
    genCheckboxes(uniques("Extraction"), "filter-extraction", "chk-extraction");
    genCheckboxes(uniques("Restauration"), "filter-restauration", "chk-restauration");
}


/* -------------------------------------------------------------------------- */
/* DÉPARTEMENTS IMBRIQUÉS                                                     */
/* -------------------------------------------------------------------------- */
function updateDepartments() {
    const box = document.getElementById("filter-departements");
    box.innerHTML = "";

    const regs = [...document.querySelectorAll(".chk-region:checked")].map(
        (x) => x.value
    );
    if (regs.length === 0) return;

    regs.forEach((reg) => {
        let deps = DATA.filter((x) => x["Région"] === reg)
            .map((x) => clean(x["Département"]))
            .filter((x) => x);

        deps = [...new Set(deps)].sort();

        let html = `<div class="region-group"><div class="region-label">${reg}</div>`;

        deps.forEach((d) => {
            html += `
            <div class="checkbox-sub">
                <input type="checkbox" class="chk-departement" value="${d}">
                <label>${d}</label>
            </div>`;
        });

        html += `</div>`;
        box.innerHTML += html;
    });
}


/* -------------------------------------------------------------------------- */
/* DOUBLE SLIDER ROBUSTE                                                      */
/* -------------------------------------------------------------------------- */
function initDouble(name, minV, maxV, unit) {
    if (!isFinite(minV) || !isFinite(maxV) || minV >= maxV) {
        minV = 0;
        maxV = 100000;
    }

    const box = document.getElementById(name + "-slider");

    box.innerHTML = `
    <div class="double-slider">
        <input type="range" id="${name}-min" min="${minV}" max="${maxV}" value="${minV}">
        <input type="range" id="${name}-max" min="${minV}" max="${maxV}" value="${maxV}">
    </div>`;

    const minI = document.getElementById(`${name}-min`);
    const maxI = document.getElementById(`${name}-max`);
    const out = document.getElementById(`${name}-values`);

    function refresh() {
        let v1 = parseFloat(minI.value);
        let v2 = parseFloat(maxI.value);

        if (v1 > v2) [v1, v2] = [v2, v1];

        minI.value = v1;
        maxI.value = v2;

        const f1 =
            unit === "€"
                ? v1.toLocaleString("fr-FR") + " €"
                : v1.toLocaleString("fr-FR") + " m²";

        const f2 =
            unit === "€"
                ? v2.toLocaleString("fr-FR") + " €"
                : v2.toLocaleString("fr-FR") + " m²";

        out.innerHTML = `${f1} — ${f2}`;

        displayPins();
    }

    minI.oninput = refresh;
    maxI.oninput = refresh;

    refresh();
}


/* -------------------------------------------------------------------------- */
/* FILTRAGE                                                                   */
/* -------------------------------------------------------------------------- */
function pass(d) {
    let actif = (d["Actif"] || "")
        .toString()
        .normalize("NFKD")
        .replace(/\s+/g, "")
        .replace(/[^\w]/g, "")
        .toLowerCase();

    if (actif !== "oui") return false;

    const regs = [...document.querySelectorAll(".chk-region:checked")].map(
        (x) => x.value
    );
    if (regs.length && !regs.includes(d["Région"])) return false;

    const deps = [...document.querySelectorAll(".chk-departement:checked")].map(
        (x) => x.value
    );
    if (deps.length && !deps.includes(d["Département"])) return false;

    const sv = toNumber(d["Surface GLA"]);
    const sMin = parseFloat(document.getElementById("surface-min").value);
    const sMax = parseFloat(document.getElementById("surface-max").value);
    if (!sv || sv < sMin || sv > sMax) return false;

    const lv = toNumber(d["Loyer annuel"]);
    const lMin = parseFloat(document.getElementById("loyer-min").value);
    const lMax = parseFloat(document.getElementById("loyer-max").value);
    if (!lv || lv < lMin || lv > lMax) return false;

    const emp = [...document.querySelectorAll(".chk-emplacement:checked")].map(
        (x) => x.value
    );
    if (emp.length && !emp.includes(d["Emplacement"])) return false;

    const typ = [...document.querySelectorAll(".chk-typologie:checked")].map(
        (x) => x.value
    );
    if (typ.length && !typ.includes(d["Typologie"])) return false;

    const ext = [...document.querySelectorAll(".chk-extraction:checked")].map(
        (x) => x.value
    );
    if (ext.length && !ext.includes(d["Extraction"])) return false;

    const res = [...document.querySelectorAll(".chk-restauration:checked")].map(
        (x) => x.value
    );
    if (res.length && !res.includes(d["Restauration"])) return false;

    return true;
}


/* -------------------------------------------------------------------------- */
/* AFFICHAGE DES PINS                                                         */
/* -------------------------------------------------------------------------- */
function displayPins() {
    MARKERS.forEach((m) => map.removeLayer(m));
    MARKERS = [];

    const filtered = DATA.filter((d) => pass(d));

    filtered.forEach((d) => {
        /** 🔥 CORRECTION LAT/LNG ICI */
        const lat = parseFloat(
            (d["Latitude"] || "").toString().trim().replace(",", ".")
        );
        const lng = parseFloat(
            (d["Longitude"] || "").toString().trim().replace(",", ".")
        );

        if (!isFinite(lat) || !isFinite(lng)) return;

        const ref = formatRef(d["Référence annonce"]);

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div>${ref}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            }),
        });

        marker.on("click", () => {
            if (PIN_SELECTED)
                PIN_SELECTED._icon.classList.remove("smbg-pin-selected");

            PIN_SELECTED = marker;
            marker._icon.classList.add("smbg-pin-selected");

            showPanel(d);
        });

        marker.addTo(map);
        MARKERS.push(marker);
    });
}


/* -------------------------------------------------------------------------- */
/* RESET                                                                      */
/* -------------------------------------------------------------------------- */
function resetAll() {
    document.querySelectorAll("#sidebar-left input[type=checkbox]").forEach(
        (x) => (x.checked = false)
    );

    generateFilters();
    displayPins();

    document.getElementById("info-lot").innerHTML = "";
    document.getElementById("photos-lot").innerHTML = "";
    document.getElementById("ref-annonce").innerHTML = "Référence";
}


/* -------------------------------------------------------------------------- */
/* INIT                                                                        */
/* -------------------------------------------------------------------------- */
async function init() {
    DATA = await loadExcel();

    generateFilters();
    displayPins();

    document
        .getElementById("filter-regions")
        .addEventListener("change", () => {
            updateDepartments();
            displayPins();
        });

    document
        .getElementById("filter-departements")
        .addEventListener("change", () => displayPins());

    ["filter-emplacement", "filter-typologie", "filter-extraction", "filter-restauration"]
        .forEach((id) =>
            document.getElementById(id).addEventListener("change", () =>
                displayPins()
            )
        );

    document.getElementById("btn-reset").addEventListener("click", resetAll);
}

init();

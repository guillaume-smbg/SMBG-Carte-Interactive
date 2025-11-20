/* ============================================================
   SMBG – Carte interactive (VERSION STABLE + GROS LOTS FIX)
   ============================================================ */

/* ============================================================
   1. CARTE
   ============================================================ */
var map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: false
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

map.setView([46.8, 2.4], 6);

/* ============================================================
   2. CHARGEMENT EXCEL
   ============================================================ */
async function loadExcel() {
    const url =
      "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

let DATA = [];

/* ============================================================
   3. FORMATAGE
   ============================================================ */
function formatReference(r) {
    if (!r) return "";
    return r.toString().trim().replace(/^0+/, "").replace(/\.0$/, "");
}

function formatValue(key, val) {
    if (["", "-", "/", "0", "O", 0, 0.0].includes(val)) return null;
    val = val.toString().trim();

    const euros = [
        "Loyer annuel","Loyer Mensuel","Loyer €/m²","Loyer variable",
        "Charges annuelles","Charges Mensuelles","Charges €/m²",
        "Taxe foncière","Taxe foncière €/m²",
        "Marketing","Marketing €/m²",
        "Total (L+C+M)","Dépôt de garantie"
    ];

    const surfaces = ["Surface GLA","Surface utile"];

    if (euros.includes(key)) {
        const n = Math.round(parseFloat(val.replace(/\s/g,"")));
        if (isNaN(n)) return val;
        return n.toLocaleString("fr-FR") + " €";
    }

    if (surfaces.includes(key)) {
        const n = Math.round(parseFloat(val.replace(/\s/g,"")));
        if (isNaN(n)) return val;
        return n.toLocaleString("fr-FR") + " m²";
    }

    return val;
}

/* ============================================================
   4. PANNEAU DROIT
   ============================================================ */

const colonnes_info = [
    "Adresse","Emplacement","Typologie","Type",
    "Cession / Droit au bail","Numéro de lot",
    "Surface GLA","Répartition surface GLA",
    "Surface utile","Répartition surface utile",
    "Loyer annuel","Loyer Mensuel","Loyer €/m²","Loyer variable",
    "Charges annuelles","Charges Mensuelles","Charges €/m²",
    "Taxe foncière","Taxe foncière €/m²",
    "Marketing","Marketing €/m²",
    "Total (L+C+M)",
    "Dépôt de garantie","GAPD","Gestion","Etat de livraison",
    "Extraction","Restauration",
    "Environnement Commercial","Commentaires","Honoraires"
];

function afficherPanneauDroit(d) {

    const ref = formatReference(d["Référence annonce"]);
    document.getElementById("ref-annonce").innerHTML = ref;

    let html = "";

    const adresse = d["Adresse"];
    const gmaps = (d["Lien Google Maps"] || "").trim();

    if (adresse && !["-", "/"].includes(adresse)) {
        html += `
            <div class="info-line info-line-no-border">
                <div class="info-key">Adresse</div>
                <div class="info-value">${adresse}</div>
            </div>
        `;

        if (gmaps) {
            html += `
                <button class="btn-maps" onclick="window.open('${gmaps}','_blank')">
                    Google Maps
                </button>
                <hr class="hr-smbg">
            `;
        }
    }

    colonnes_info.forEach(col => {
        if (col === "Adresse") return;
        const val = formatValue(col, d[col]);
        if (val === null) return;

        html += `
            <div class="info-line">
                <div class="info-key">${col}</div>
                <div class="info-value">${val}</div>
            </div>
        `;
    });

    document.getElementById("info-lot").innerHTML = html;

    let photos = (d["Photos"] || d["AP"] || "")
        .toString().split(";").map(x => x.trim()).filter(x => x);

    let ph = "";
    photos.forEach(url => { ph += `<img src="${url}">`; });

    document.getElementById("photos-lot").innerHTML = ph;

    /* Remonter automatiquement */
    document.querySelector("#sidebar-right .sidebar-inner").scrollTop = 0;
}

/* ============================================================
   5. AFFICHAGE DES PINS
   ============================================================ */
let pinSelectionne = null;
let markers = [];

function afficherPinsFiltrés(donnees) {

    markers.forEach(m => map.removeLayer(m));
    markers = [];

    donnees.forEach(d => {
        if ((d["Actif"] || "").toLowerCase().trim() !== "oui") return;

        const lat = parseFloat(d["Latitude"]);
        const lng = parseFloat(d["Longitude"]);
        if (!lat || !lng) return;

        const ref = formatReference(d["Référence annonce"]);

        const marker = L.marker([lat,lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div>${ref}</div>`,
                iconSize: [30,30],
                iconAnchor: [15,15]
            })
        });

        marker.on("click", ()=>{

            if (pinSelectionne)
                pinSelectionne._icon.classList.remove("smbg-pin-selected");

            pinSelectionne = marker;
            marker._icon.classList.add("smbg-pin-selected");

            afficherPanneauDroit(d);
        });

        marker.addTo(map);
        markers.push(marker);
    });
}

/* ============================================================
   6. FILTRES
   ============================================================ */
function valeursUniques(key) {
    const set = new Set();
    DATA.forEach(d => {
        const v = (d[key] || "").toString().trim();
        if (v && v !== "-" && v !== "/") set.add(v);
    });
    return [...set].sort();
}

function remplirCheckbox(id, valeurs) {
    const zone = document.getElementById(id);
    zone.innerHTML = "";
    valeurs.forEach(v => {
        const div = document.createElement("div");
        div.className = "checkbox-line";
        div.innerHTML = `
            <input type="checkbox" value="${v}">
            <label>${v}</label>
        `;
        zone.appendChild(div);
    });
}

function valeursCochées(id) {
    return [...document.querySelectorAll(`#${id} input:checked`)].map(x => x.value);
}

/* ============================================================
   7. SLIDER SURFACE (MAX 2000, MAIS CASE INDEPENDANTE)
   ============================================================ */
function initSliderSurface(values) {

    const uniq = values.map(v=>parseInt(v||0)).filter(v=>!isNaN(v));
    const MAX_LIMIT = 2000;

    const min = Math.min(...uniq);
    const maxSlider = MAX_LIMIT;

    const minInput = document.getElementById("surface-min");
    const maxInput = document.getElementById("surface-max");
    const display = document.getElementById("surface-values");

    minInput.min = maxInput.min = min;
    minInput.max = maxInput.max = maxSlider;

    minInput.value = min;
    maxInput.value = maxSlider;

    function aff() {
        let a = parseInt(minInput.value);
        let b = parseInt(maxInput.value);
        if (a > b) minInput.value = b;

        display.innerHTML =
            a.toLocaleString("fr-FR") + " m² — " +
            b.toLocaleString("fr-FR") + " m²";
    }

    minInput.oninput = aff;
    maxInput.oninput = aff;
    aff();
}

/* ============================================================
   8. SLIDER LOYER (MAX 200k FIXÉ)
   ============================================================ */
function initSliderLoyer(values) {

    const uniq = values.map(v=>parseInt(v||0)).filter(v=>!isNaN(v));

    const min = Math.min(...uniq);
    const MAX_LIMIT = 200000;

    const minInput = document.getElementById("loyer-min");
    const maxInput = document.getElementById("loyer-max");
    const display = document.getElementById("loyer-values");

    minInput.min = maxInput.min = min;
    minInput.max = maxInput.max = MAX_LIMIT;

    minInput.value = min;
    maxInput.value = MAX_LIMIT;

    function aff() {
        let a = parseInt(minInput.value);
        let b = parseInt(maxInput.value);
        if (a > b) minInput.value = b;

        display.innerHTML =
            a.toLocaleString("fr-FR") + " € — " +
            b.toLocaleString("fr-FR") + " €";
    }

    minInput.oninput = aff;
    maxInput.oninput = aff;
    aff();
}

/* ============================================================
   9. APPLICATION DES FILTRES (GROS LOTS INDEPENDANTS)
   ============================================================ */
function appliquerFiltres() {

    const fr = valeursCochées("filter-regions");
    const fd = valeursCochées("filter-departements");
    const fe = valeursCochées("filter-emplacement");
    const ft = valeursCochées("filter-typologie");
    const fx = valeursCochées("filter-extraction");
    const frs = valeursCochées("filter-restauration");

    const bigSurface = document.getElementById("checkbox-grand-surface").checked;
    const bigLoyer = document.getElementById("checkbox-grand-loyer").checked;

    const surfMin = parseInt(document.getElementById("surface-min").value);
    const surfMax = parseInt(document.getElementById("surface-max").value);

    const loyMin = parseInt(document.getElementById("loyer-min").value);
    const loyMax = parseInt(document.getElementById("loyer-max").value);

    const OUT = DATA.filter(d => {

        if (fr.length && !fr.includes(d["Région"])) return false;
        if (fd.length && !fd.includes(d["Département"])) return false;

        if (fe.length && !fe.includes(d["Emplacement"])) return false;
        if (ft.length && !ft.includes(d["Typologie"])) return false;
        if (fx.length && !fx.includes(d["Extraction"])) return false;
        if (frs.length && !frs.includes(d["Restauration"])) return false;

        /* SURFACE */
        const surf = parseInt(d["Surface GLA"] || 0);

        if (surf > 2000) {
            if (!bigSurface) return false;
        } else {
            if (surf < surfMin || surf > surfMax) return false;
        }

        /* LOYER */
        const loy = parseInt(d["Loyer annuel"] || 0);

        if (loy > 200000) {
            if (!bigLoyer) return false;
        } else {
            if (loy < loyMin || loy > loyMax) return false;
        }

        return true;
    });

    afficherPinsFiltrés(OUT);
}

/* ============================================================
   10. INITIALISATION
   ============================================================ */
async function init() {

    DATA = await loadExcel();

    remplirCheckbox("filter-regions", valeursUniques("Région"));
    remplirCheckbox("filter-departements", valeursUniques("Département"));

    remplirCheckbox("filter-emplacement", valeursUniques("Emplacement"));
    remplirCheckbox("filter-typologie", valeursUniques("Typologie"));
    remplirCheckbox("filter-extraction", valeursUniques("Extraction"));
    remplirCheckbox("filter-restauration", valeursUniques("Restauration"));

    initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"]||0)));
    initSliderLoyer(DATA.map(x => parseInt(x["Loyer annuel"]||0)));

    document.querySelectorAll("#sidebar-left input").forEach(el => {
        el.addEventListener("input", appliquerFiltres);
    });

    document.getElementById("btn-reset").addEventListener("click", () => {

        document.querySelectorAll("#sidebar-left input[type=checkbox]")
            .forEach(x => x.checked = false);

        document.getElementById("checkbox-grand-surface").checked = true;
        document.getElementById("checkbox-grand-loyer").checked = true;

        initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"]||0)));
        initSliderLoyer(DATA.map(x => parseInt(x["Loyer annuel"]||0)));

        afficherPinsFiltrés(DATA);
    });

    afficherPinsFiltrés(DATA);
}

init();

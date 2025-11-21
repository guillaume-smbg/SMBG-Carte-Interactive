/* ============================================================
   1. CARTE
   ============================================================ */
var map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: false
});

/* Fond de carte */
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

/* Position centrée France */
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

function afficherPanneauDroit(d) {

    // ouverture
    document.getElementById("sidebar-right").classList.add("open");

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

    const columns = [
        "Emplacement","Typologie","Surface GLA","Répartition surface GLA",
        "Surface utile","Répartition surface utile",
        "Loyer annuel","Loyer Mensuel","Loyer €/m²",
        "Charges annuelles","Charges Mensuelles","Charges €/m²",
        "Total (L+C+M)","Etat de livraison","Extraction","Restauration",
        "Environnement Commercial"
    ];

    columns.forEach(col => {
        const val = d[col];
        if (val && val !== "-" && val !== "/") {
            html += `
                <div class="info-line">
                    <div class="info-key">${col}</div>
                    <div class="info-value">${val}</div>
                </div>
            `;
        }
    });

    document.getElementById("info-lot").innerHTML = html;

    let photos = (d["Photos"] || d["AP"] || "")
        .toString().split(";").map(x => x.trim()).filter(x => x);

    let ph = "";
    photos.forEach(url => { ph += `<img src="${url}">`; });

    document.getElementById("photos-lot").innerHTML = ph;

    document.querySelector("#sidebar-right .sidebar-inner").scrollTop = 0;
}

/* FERMETURE panneau */
function fermerPanneauDroit() {
    document.getElementById("sidebar-right").classList.remove("open");
    document.getElementById("ref-annonce").innerHTML = "";
    document.getElementById("info-lot").innerHTML = "";
    document.getElementById("photos-lot").innerHTML = "";
}


/* ============================================================
   4. PINS
   ============================================================ */
let pinSelectionne = null;
let markers = [];

function afficherPinsFiltrés(donnees) {

    markers.forEach(m => map.removeLayer(m));
    markers = [];
    pinSelectionne = null;

    donnees.forEach(d => {

        if ((d["Actif"] || "").toLowerCase().trim() !== "oui") return;

        const lat = parseFloat(d["Latitude"]);
        const lng = parseFloat(d["Longitude"]);
        if (!lat || !lng) return;

        const ref = formatReference(d["Référence annonce"]);

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div>${ref}</div>`,
                iconSize: [30,30],
                iconAnchor: [15,15]
            })
        });

        marker.on("click", () => {

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
   5. FILTRES
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
        const safeId = id + "_" + v.replace(/[^a-zA-Z0-9]/g, "_");
        const div = document.createElement("div");
        div.className = "checkbox-line";
        div.innerHTML = `
            <input type="checkbox" id="${safeId}" value="${v}">
            <label for="${safeId}">${v}</label>
        `;
        zone.appendChild(div);
    });
}

function valeursCochées(id) {
    return [...document.querySelectorAll(`#${id} input:checked`)]
        .map(x => x.value);
}


/* ============================================================
   6. RÉGIONS/DÉPARTEMENTS
   ============================================================ */
let REGIONS_MAP = {};

function buildRegionsMap() {
    const mapR = {};
    DATA.forEach(d => {
        const reg = (d["Région"] || "").trim();
        const dep = (d["Département"] || "").trim();
        if (!reg || !dep || dep === "-" || dep === "/") return;
        if (!mapR[reg]) mapR[reg] = new Set();
        mapR[reg].add(dep);
    });
    Object.keys(mapR).forEach(r => mapR[r] = [...mapR[r]].sort());
    return mapR;
}


/* ============================================================
   7. APPLY FILTERS
   ============================================================ */
function appliquerFiltres() {

    const fr  = valeursCochées("filter-regions");
    const fd  = valeursCochées("filter-departements");

    const OUT = DATA.filter(d => {

        const reg = (d["Région"] || "").trim();
        const dep = (d["Département"] || "").trim();

        if (fr.length && !fr.includes(reg)) return false;
        if (fd.length && !fd.includes(dep)) return false;

        return true;
    });

    afficherPinsFiltrés(OUT);
}


/* ============================================================
   8. INIT
   ============================================================ */
async function init() {

    DATA = await loadExcel();

    REGIONS_MAP = buildRegionsMap();

    remplirCheckbox("filter-emplacement", valeursUniques("Emplacement"));
    remplirCheckbox("filter-typologie", valeursUniques("Typologie"));
    remplirCheckbox("filter-extraction", valeursUniques("Extraction"));
    remplirCheckbox("filter-restauration", valeursUniques("Restauration"));

    document.querySelectorAll("#sidebar-left input").forEach(el => {
        el.addEventListener("input", appliquerFiltres);
    });

    /* RESET : ferme panneau + reset filtres */
    document.getElementById("btn-reset").addEventListener("click", () => {

        fermerPanneauDroit();

        document.querySelectorAll("#sidebar-left input[type=checkbox]")
            .forEach(x => x.checked = false);

        afficherPinsFiltrés(DATA);
    });

    afficherPinsFiltrés(DATA);
}

init();

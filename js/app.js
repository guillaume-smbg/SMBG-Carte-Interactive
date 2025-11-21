/* ============================================================
   SMBG – Carte interactive (VERSION STABLE + RÉTRACTABLE + FIX COMPTEUR)
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
   2. PANNEAU DROIT (RÉTRACTABLE)
   ============================================================ */

const sidebarRight = document.getElementById("sidebar-right");
const mapContainer = document.getElementById("map-container");

function ouvrirPanneau() {
    sidebarRight.classList.add("open");
    mapContainer.style.right = "325px";   // largeur panneau ouvert
}

function fermerPanneau() {
    sidebarRight.classList.remove("open");
    mapContainer.style.right = "10px";    // rebord seulement
}

// fermer panneau quand on clique sur la carte
map.on("click", function () {
    fermerPanneau();
});


/* ============================================================
   3. COMPTEUR DYNAMIQUE
   ============================================================ */
function updateCompteur(n) {
    const zone = document.getElementById("compteur-annonces");
    if (!zone) return;

    if (n === 1)
        zone.innerHTML = `Annonces sélectionnées : <b>1</b>`;
    else
        zone.innerHTML = `Annonces sélectionnées : <b>${n}</b>`;
}



/* ============================================================
   4. CHARGEMENT EXCEL
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
   5. FORMATAGE
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
   6. PANNEAU DROIT – AFFICHAGE
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

    ouvrirPanneau();

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

    // photos
    let photos = (d["Photos"] || d["AP"] || "")
        .toString().split(";").map(x => x.trim()).filter(x => x);

    let ph = "";
    photos.forEach(url => { ph += `<img src="${url}">`; });
    document.getElementById("photos-lot").innerHTML = ph;

    document.querySelector("#sidebar-right .sidebar-inner").scrollTop = 0;
}


/* ============================================================
   7. PINS
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

    /* 🔥 MAJ COMPTEUR */
    updateCompteur(donnees.length);
}


/* ============================================================
   8. OUTILS GÉNÉRIQUES DE FILTRES
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
   9. APPLY FILTERS
   ============================================================ */

function appliquerFiltres() {

    const fr  = regionsCochees();
    const fd  = departementsCoches();

    const fe  = valeursCochées("filter-emplacement");
    const ft  = valeursCochées("filter-typologie");
    const fx  = valeursCochées("filter-extraction");
    const frs = valeursCochées("filter-restauration");

    const bigSurf = document.getElementById("checkbox-grand-surface").checked;
    const bigLoy  = document.getElementById("checkbox-grand-loyer").checked;

    const surfMin = parseInt(document.getElementById("surface-min").value);
    const surfMax = parseInt(document.getElementById("surface-max").value);

    const loyMin  = parseInt(document.getElementById("loyer-min").value);
    const loyMax  = parseInt(document.getElementById("loyer-max").value);

    const OUT = DATA.filter(d => {

        const region = (d["Région"] || "").trim();
        const departement = (d["Département"] || "").trim();

        let regionMatch = false;
        let depMatch    = false;

        if (fr.length || fd.length) {

            if (fd.includes(departement)) {
                depMatch = true;
            }

            if (fr.includes(region)) {
                const depsOfRegion = REGIONS_MAP[region] || [];
                const hasSelDep = depsOfRegion.some(dep => fd.includes(dep));
                if (!hasSelDep) regionMatch = true;
            }

            if (!regionMatch && !depMatch) return false;
        }

        if (fe.length  && !fe.includes(d["Emplacement"]))   return false;
        if (ft.length  && !ft.includes(d["Typologie"]))     return false;
        if (fx.length  && !fx.includes(d["Extraction"]))    return false;
        if (frs.length && !frs.includes(d["Restauration"])) return false;

        const surf = parseInt(d["Surface GLA"]  || 0);
        const loy  = parseInt(d["Loyer annuel"] || 0);

        if (surf > 2000   && !bigSurf) return false;
        if (loy > 200000  && !bigLoy)  return false;

        if (surf <= 2000 && (surf < surfMin || surf > surfMax)) return false;
        if (loy <= 200000 && (loy < loyMin || loy > loyMax)) return false;

        return true;
    });

    afficherPinsFiltrés(OUT);
}


/* ============================================================
   10. INIT
   ============================================================ */
async function init() {

    DATA = await loadExcel();

    REGIONS_MAP = buildRegionsMap();
    construireRegionsEtDepartements();

    remplirCheckbox("filter-emplacement",  valeursUniques("Emplacement"));
    remplirCheckbox("filter-typologie",    valeursUniques("Typologie"));
    remplirCheckbox("filter-extraction",   valeursUniques("Extraction"));
    remplirCheckbox("filter-restauration", valeursUniques("Restauration"));

    initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"] || 0)));
    initSliderLoyer  (DATA.map(x => parseInt(x["Loyer annuel"] || 0)));

    document.querySelectorAll("#sidebar-left input").forEach(el => {
        el.addEventListener("input", appliquerFiltres);
    });

    document.getElementById("btn-reset").addEventListener("click", () => {

        document.querySelectorAll("#sidebar-left input[type=checkbox]")
            .forEach(x => x.checked = false);

        document.getElementById("checkbox-grand-surface").checked = true;
        document.getElementById("checkbox-grand-loyer").checked   = true;

        document.querySelectorAll("#filter-regions .departements-container")
            .forEach(c => c.style.display = "none");

        initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"] || 0)));
        initSliderLoyer  (DATA.map(x => parseInt(x["Loyer annuel"] || 0)));

        // retract panel
        fermerPanneau();
        document.getElementById("ref-annonce").innerHTML = "";
        document.getElementById("info-lot").innerHTML = "";
        document.getElementById("photos-lot").innerHTML = "";

        afficherPinsFiltrés(DATA);
    });

    afficherPinsFiltrés(DATA);

    fermerPanneau();
}

init();

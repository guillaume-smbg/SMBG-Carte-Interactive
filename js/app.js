/* ============================================================
   SMBG – Carte interactive (VERSION IMBRICATION RÉGIONS/DÉPARTEMENTS)
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

    document.querySelector("#sidebar-right .sidebar-inner").scrollTop = 0;
}

/* ============================================================
   5. PINS
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
}

/* ============================================================
   6. RÉGIONS + DÉPARTEMENTS — IMBRICATION
   ============================================================ */

// On construit la map Région -> liste des départements
function mappingRegions() {
    const mapR = {};
    DATA.forEach(d => {
        const reg = d["Région"];
        const dep = d["Département"];
        if (!reg || !dep) return;
        if (!mapR[reg]) mapR[reg] = new Set();
        mapR[reg].add(dep);
    });

    // Convertit les Sets en array triés
    Object.keys(mapR).forEach(reg => {
        mapR[reg] = [...mapR[reg]].sort();
    });

    return mapR;
}

let REGIONS_MAP = {};

/* Construit dynamiquement toute la liste Régions + Départements imbriqués */
function reconstruireListeRegions() {

    const zone = document.getElementById("filter-regions");
    zone.innerHTML = "";

    // Liste des régions triées
    const regions = Object.keys(REGIONS_MAP).sort();

    regions.forEach(region => {

        // ID safe
        const safeRegionId = "region_" + region.replace(/[^a-zA-Z0-9]/g, "_");

        // Ligne région
        const divR = document.createElement("div");
        divR.className = "checkbox-line";

        divR.innerHTML = `
            <input type="checkbox" id="${safeRegionId}" value="${region}">
            <label for="${safeRegionId}">${region}</label>
        `;

        zone.appendChild(divR);

        // On écoute le changement sur la région
        divR.querySelector("input").addEventListener("input", ()=>{
            reconstruireListeRegions(); // mise à jour dynamique de l’arbre
            appliquerFiltres();
        });

        // Si cette région est cochée → insérer les départements
        const regionChecked = document.getElementById(safeRegionId).checked;

        if (regionChecked) {

            const deps = REGIONS_MAP[region];

            deps.forEach(dep => {

                const safeDepId = "dep_" + dep.replace(/[^a-zA-Z0-9]/g, "_");

                const divD = document.createElement("div");
                divD.className = "checkbox-line departement-indent";

                divD.innerHTML = `
                    <input type="checkbox" id="${safeDepId}" value="${dep}">
                    <label for="${safeDepId}">${dep}</label>
                `;

                zone.appendChild(divD);

                // écoute département
                divD.querySelector("input").addEventListener("input", ()=>{
                    appliquerFiltres();
                });
            });
        }
    });
}

/* Récupère les départements cochés */
function departementsCoches() {
    return [...document.querySelectorAll("#filter-regions .departement-indent input:checked")]
            .map(x => x.value);
}

/* Récupère les régions cochées */
function regionsCochees() {
    return [...document.querySelectorAll("#filter-regions > .checkbox-line > input:checked")]
            .map(x => x.value);
}


/* ============================================================
   7. SLIDER SURFACE 
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
   8. SLIDER LOYER
   ============================================================ */
function initSliderLoyer(values) {

    const uniq = values.map(v=>parseInt(v||0)).filter(v=>!isNaN(v));

    const min = Math.min(...uniq);
    const max = Math.max(...uniq);

    const maxAfficher = 200000;

    const minInput = document.getElementById("loyer-min");
    const maxInput = document.getElementById("loyer-max");
    const display = document.getElementById("loyer-values");

    minInput.min = maxInput.min = min;
    minInput.max = maxAfficher;
    maxInput.max = maxAfficher;

    minInput.value = min;
    maxInput.value = maxAfficher;

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
   9. APPLY FILTERS — LOGIQUE RÉGION / DÉPARTEMENT
   ============================================================ */

function appliquerFiltres() {

    const regs = regionsCochees();
    const deps = departementsCoches();

    const fe = valeursCochées("filter-emplacement");
    const ft = valeursCochées("filter-typologie");
    const fx = valeursCochées("filter-extraction");
    const frs = valeursCochées("filter-restauration");

    const bigSurf = document.getElementById("checkbox-grand-surface").checked;
    const bigLoy = document.getElementById("checkbox-grand-loyer").checked;

    const surfMin = parseInt(document.getElementById("surface-min").value);
    const surfMax = parseInt(document.getElementById("surface-max").value);

    const loyMin = parseInt(document.getElementById("loyer-min").value);
    const loyMax = parseInt(document.getElementById("loyer-max").value);

    const OUT = DATA.filter(d => {

        /* ============================================================
           LOGIQUE RÉGION / DÉPARTEMENT
           ------------------------------------------------------------
           1. Si un département de la région est coché → IGNORE la région
           2. Sinon région cochée → filtre par région
           3. Filtre final = annonces dont :
               - région ∈ régions_valide
               - OU département ∈ deps
        ============================================================ */

        let regionValide = regs.includes(d["Région"]);

        // Si cette région contient un département coché → région ignorée
        if (regionValide && deps.length > 0) {
            const depsReg = REGIONS_MAP[d["Région"]] || [];
            const intersect = depsReg.some(dep => deps.includes(dep));

            if (intersect) regionValide = false;
        }

        const depValide = deps.includes(d["Département"]);

        // Condition OR
        if (regs.length > 0 || deps.length > 0) {
            if (!regionValide && !depValide) return false;
        }

        /* ============================================================
           AUTRES FILTRES (inchangés)
        ============================================================ */

        if (fe.length && !fe.includes(d["Emplacement"])) return false;
        if (ft.length && !ft.includes(d["Typologie"])) return false;
        if (fx.length && !fx.includes(d["Extraction"])) return false;
        if (frs.length && !frs.includes(d["Restauration"])) return false;

        const surf = parseInt(d["Surface GLA"] || 0);
        const loy = parseInt(d["Loyer annuel"] || 0);

        if (surf > 2000 && !bigSurf) return false;
        if (loy > 200000 && !bigLoy) return false;

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

    REGIONS_MAP = mappingRegions();

    reconstruireListeRegions();

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

        reconstruireListeRegions();

        initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"]||0)));
        initSliderLoyer(DATA.map(x => parseInt(x["Loyer annuel"]||0)));

        afficherPinsFiltrés(DATA);
    });

    afficherPinsFiltrés(DATA);
}

init();

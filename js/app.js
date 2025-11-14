/* -------------------------------------------------------------------------- */
/* INITIALISATION DE LA CARTE                                                 */
/* -------------------------------------------------------------------------- */
var map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

map.setView([46.8, 2.4], 6);


/* -------------------------------------------------------------------------- */
/* LECTURE DU FICHIER EXCEL                                                   */
/* -------------------------------------------------------------------------- */
async function loadExcel() {
    const url = "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}


/* -------------------------------------------------------------------------- */
/* FONCTIONS DE FORMATAGE SMBG                                                */
/* -------------------------------------------------------------------------- */
function formatReference(r) {
    if (!r) return "";
    return r.toString().trim().replace(/^0+/, "").replace(/\.0$/, "");
}

function formatMoney(val) {
    val = val.toString().replace(/\s/g, "");
    const n = Math.round(parseFloat(val));
    if (isNaN(n)) return val;
    return n.toLocaleString("fr-FR") + " €";
}

function formatArea(val) {
    val = val.toString().replace(/\s/g, "");
    const n = Math.round(parseFloat(val));
    if (isNaN(n)) return val;
    return n.toLocaleString("fr-FR") + " m²";
}

function cleanValue(val) {
    if (!val) return null;
    val = val.toString().trim();
    if (["-", "/", "0", "O"].includes(val)) return null;
    return val;
}


/* -------------------------------------------------------------------------- */
/* PANNEAU DROIT - AFFICHAGE DE L'ANNONCE                                     */
/* -------------------------------------------------------------------------- */
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

    const panel = document.getElementById("sidebar-right");
    panel.scrollTop = 0; // remonte automatiquement en haut ✔

    const ref = formatReference(d["Référence annonce"]);
    document.getElementById("ref-annonce").innerHTML = ref;

    let html = "";

    const adresse = cleanValue(d["Adresse"]);
    const gmaps = cleanValue(d["Lien Google Maps"]);

    if (adresse) {
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

        let val = cleanValue(d[col]);
        if (!val) return;

        if (col.includes("€")) val = formatMoney(val);
        if (col.includes("m²")) val = formatArea(val);

        html += `
            <div class="info-line">
                <div class="info-key">${col}</div>
                <div class="info-value">${val}</div>
            </div>
        `;
    });

    document.getElementById("info-lot").innerHTML = html;

    // Gestion des photos Cloudflare
    let photos = (d["AP"] || "").split(";").map(x => x.trim()).filter(x => x);
    let ph = "";
    photos.forEach(url => {
        ph += `<img src="${url}">`;
    });
    document.getElementById("photos-lot").innerHTML = ph;
}


/* -------------------------------------------------------------------------- */
/* VARIABLES GLOBALES                                                         */
/* -------------------------------------------------------------------------- */
let DATA = [];
let MARKERS = [];
let pinSelectionne = null;


/* -------------------------------------------------------------------------- */
/* EXTRACTION DES VALEURS UNIQUES                                             */
/* -------------------------------------------------------------------------- */
function uniqueValues(col) {
    return [...new Set(
        DATA.map(r => r[col]).filter(v => cleanValue(v))
    )].sort();
}


/* -------------------------------------------------------------------------- */
/* GÉNÉRATION DES FILTRES                                                     */
/* -------------------------------------------------------------------------- */
function genererFiltres() {

    // REGIONS
    const regions = uniqueValues("Région");
    let htmlR = "";
    regions.forEach(r => {
        htmlR += `
            <div class="checkbox-item">
                <input type="checkbox" class="chk-region" value="${r}">
                <label>${r}</label>
            </div>
        `;
    });
    document.getElementById("filter-regions").innerHTML = htmlR;

    // Vider départements au départ
    document.getElementById("filter-departements").innerHTML = "";

    // SLIDERS – Surface
    const surfaces = DATA.map(r => parseFloat(r["Surface GLA"])).filter(v => !isNaN(v));
    const minS = Math.min(...surfaces);
    const maxS = Math.max(...surfaces);

    initDoubleSlider("surface", minS, maxS, "m²");

    // SLIDERS – Loyer annuel
    const loyers = DATA.map(r => parseFloat(r["Loyer annuel"])).filter(v => !isNaN(v));
    const minL = Math.min(...loyers);
    const maxL = Math.max(...loyers);

    initDoubleSlider("loyer", minL, maxL, "€");

    // Emplacement
    generateCheckboxGroup("Emplacement", "filter-emplacement", "chk-emplacement");

    // Typologie
    generateCheckboxGroup("Typologie", "filter-typologie", "chk-typologie");

    // Extraction
    generateCheckboxGroup("Extraction", "filter-extraction", "chk-extraction");

    // Restauration
    generateCheckboxGroup("Restauration", "filter-restauration", "chk-restauration");
}


/* -------------------------------------------------------------------------- */
/* CRÉATION DES CHECKBOXES SPÉCIFIQUES                                        */
/* -------------------------------------------------------------------------- */
function generateCheckboxGroup(col, containerID, className) {
    const vals = uniqueValues(col);
    let html = "";
    vals.forEach(v => {
        html += `
            <div class="checkbox-item">
                <input type="checkbox" class="${className}" value="${v}">
                <label>${v}</label>
            </div>
        `;
    });
    document.getElementById(containerID).innerHTML = html;
}


/* -------------------------------------------------------------------------- */
/* DÉPARTEMENTS IMBRIQUÉS PAR RÉGION – OPTION A                               */
/* -------------------------------------------------------------------------- */
function mettreAJourDepartements() {

    const container = document.getElementById("filter-departements");
    container.innerHTML = "";

    const regionsCochees = [...document.querySelectorAll(".chk-region:checked")].map(x => x.value);

    if (regionsCochees.length === 0) return;

    let html = "";

    regionsCochees.forEach(region => {

        // Nom de la région (non cliquable ici)
        html += `
            <div class="checkbox-item" style="margin-top:10px; font-weight:bold;">
                ${region}
            </div>
        `;

        let deps = DATA
            .filter(r => r["Région"] === region)
            .map(r => r["Département"])
            .filter(v => cleanValue(v));

        deps = [...new Set(deps)].sort(); // tri et suppression des doublons

        deps.forEach(dep => {
            html += `
                <div class="checkbox-sub">
                    <input type="checkbox" class="chk-departement" value="${dep}">
                    <label>${dep}</label>
                </div>
            `;
        });
    });

    container.innerHTML = html;
}


/* -------------------------------------------------------------------------- */
/* VRAI DOUBLE SLIDER                                                         */
/* -------------------------------------------------------------------------- */
function initDoubleSlider(prefix, min, max, unit) {

    const minID = prefix + "-min";
    const maxID = prefix + "-max";
    const outputID = prefix + "-values";

    const sliderHTML = `
        <input type="range" id="${minID}" min="${min}" max="${max}" value="${min}">
        <input type="range" id="${maxID}" min="${min}" max="${max}" value="${max}">
    `;

    document.getElementById(minID).outerHTML = sliderHTML;

    const minInput = document.getElementById(minID);
    const maxInput = document.getElementById(maxID);

    function updateValues() {
        let v1 = parseFloat(minInput.value);
        let v2 = parseFloat(maxInput.value);

        if (v1 > v2) {
            [v1, v2] = [v2, v1];
            minInput.value = v1;
            maxInput.value = v2;
        }

        const val1 = unit === "€" ? v1.toLocaleString("fr-FR") + " €" : v1 + " " + unit;
        const val2 = unit === "€" ? v2.toLocaleString("fr-FR") + " €" : v2 + " " + unit;

        document.getElementById(outputID).innerHTML = `${val1} — ${val2}`;
        afficherPinsFiltres();
    }

    minInput.oninput = updateValues;
    maxInput.oninput = updateValues;
}


/* -------------------------------------------------------------------------- */
/* FILTRAGE MULTI-CRITÈRES                                                    */
/* -------------------------------------------------------------------------- */
function passerFiltres(d) {

    /* Région */
    const regions = [...document.querySelectorAll(".chk-region:checked")].map(x => x.value);
    if (regions.length > 0 && !regions.includes(d["Région"])) return false;

    /* Département */
    const deps = [...document.querySelectorAll(".chk-departement:checked")].map(x => x.value);
    if (deps.length > 0 && !deps.includes(d["Département"])) return false;

    /* Surface */
    const sMin = parseFloat(document.getElementById("surface-min").value);
    const sMax = parseFloat(document.getElementById("surface-max").value);
    const surf = parseFloat(d["Surface GLA"]);
    if (isNaN(surf) || surf < sMin || surf > sMax) return false;

    /* Loyer annuel */
    const lMin = parseFloat(document.getElementById("loyer-min").value);
    const lMax = parseFloat(document.getElementById("loyer-max").value);
    const loy = parseFloat(d["Loyer annuel"]);
    if (isNaN(loy) || loy < lMin || loy > lMax) return false;

    /* Emplacement */
    const empl = [...document.querySelectorAll(".chk-emplacement:checked")].map(x => x.value);
    if (empl.length > 0 && !empl.includes(d["Emplacement"])) return false;

    /* Typologie */
    const typ = [...document.querySelectorAll(".chk-typologie:checked")].map(x => x.value);
    if (typ.length > 0 && !typ.includes(d["Typologie"])) return false;

    /* Extraction */
    const ext = [...document.querySelectorAll(".chk-extraction:checked")].map(x => x.value);
    if (ext.length > 0 && !ext.includes(d["Extraction"])) return false;

    /* Restauration */
    const res = [...document.querySelectorAll(".chk-restauration:checked")].map(x => x.value);
    if (res.length > 0 && !res.includes(d["Restauration"])) return false;

    return true;
}


/* -------------------------------------------------------------------------- */
/* AFFICHAGE DES PINS FILTRÉS                                                 */
/* -------------------------------------------------------------------------- */
function afficherPinsFiltres() {

    MARKERS.forEach(m => map.removeLayer(m));
    MARKERS = [];

    const dataFiltree = DATA.filter(d => {
        if ((d["Actif"] || "").toLowerCase().trim() !== "oui") return false;
        return passerFiltres(d);
    });

    dataFiltree.forEach(d => {

        const lat = parseFloat(d["Latitude"]);
        const lng = parseFloat(d["Longitude"]);
        if (!lat || !lng) return;

        const ref = formatReference(d["Référence annonce"]);

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div>${ref}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
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
        MARKERS.push(marker);
    });
}


/* -------------------------------------------------------------------------- */
/* RESET                                                                      */
/* -------------------------------------------------------------------------- */
function resetFiltres() {

    document.querySelectorAll("#sidebar-left input[type=checkbox]").forEach(x => x.checked = false);

    genererFiltres();
    afficherPinsFiltres();

    document.getElementById("info-lot").innerHTML = "";
    document.getElementById("photos-lot").innerHTML = "";
    document.getElementById("ref-annonce").innerHTML = "Référence";
}


/* -------------------------------------------------------------------------- */
/* INIT                                                                        */
/* -------------------------------------------------------------------------- */
async function init() {

    DATA = await loadExcel();

    genererFiltres();
    afficherPinsFiltres();

    // Regions
    document.getElementById("filter-regions").addEventListener("change", () => {
        mettreAJourDepartements();
        afficherPinsFiltres();
    });

    // Departements
    document.getElementById("filter-departements").addEventListener("change", () => {
        afficherPinsFiltres();
    });

    // Groupes simples
    ["filter-emplacement", "filter-typologie", "filter-extraction", "filter-restauration"]
        .forEach(id => {
            document.getElementById(id).addEventListener("change", () => {
                afficherPinsFiltres();
            });
        });

    // Reset
    document.getElementById("btn-reset").addEventListener("click", () => {
        resetFiltres();
    });
}

init();

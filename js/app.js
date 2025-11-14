/* -------------------------------------------------------------------------- */
/* INITIALISATION CARTE                                                       */
/* -------------------------------------------------------------------------- */
var map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
}).addTo(map);

map.setView([46.8, 2.4], 6);


/* -------------------------------------------------------------------------- */
/* LECTURE EXCEL                                                              */
/* -------------------------------------------------------------------------- */
async function loadExcel() {
    const url =
        "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        defval: "",
    });
}


/* -------------------------------------------------------------------------- */
/* FORMATAGE VALEURS SMBG                                                     */
/* -------------------------------------------------------------------------- */
function cleanValue(v) {
    if (!v) return null;
    v = v.toString().trim();
    if (["-", "/", "0", "O"].includes(v)) return null;
    return v;
}

function formatReference(r) {
    if (!r) return "";
    return r.toString().trim().replace(/^0+/, "").replace(/\.0$/, "");
}

function formatMoney(v) {
    v = v.toString().replace(/\s/g, "");
    const n = Math.round(parseFloat(v));
    if (isNaN(n)) return v;
    return n.toLocaleString("fr-FR") + " €";
}

function formatArea(v) {
    v = v.toString().replace(/\s/g, "");
    const n = Math.round(parseFloat(v));
    if (isNaN(n)) return v;
    return n.toLocaleString("fr-FR") + " m²";
}


/* -------------------------------------------------------------------------- */
/* PANNEAU DROIT – AFFICHAGE                                                  */
/* -------------------------------------------------------------------------- */
const colonnes_info = [
    "Adresse",
    "Emplacement",
    "Typologie",
    "Type",
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

function afficherPanneauDroit(d) {
    const panel = document.getElementById("sidebar-right");
    panel.scrollTop = 0;

    const ref = formatReference(d["Référence annonce"]);
    document.getElementById("ref-annonce").innerHTML = ref;

    let html = "";

    // Adresse
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
                <button class="btn-maps" onclick="window.open('${gmaps}', '_blank')">
                    Google Maps
                </button>
                <hr class="hr-smbg">
            `;
        }
    }

    colonnes_info.forEach((col) => {
        if (col === "Adresse") return;

        let val = cleanValue(d[col]);
        if (!val) return;

        if (col.toLowerCase().includes("€")) val = formatMoney(val);
        if (col.toLowerCase().includes("m²")) val = formatArea(val);

        html += `
            <div class="info-line">
                <div class="info-key">${col}</div>
                <div class="info-value">${val}</div>
            </div>
        `;
    });

    document.getElementById("info-lot").innerHTML = html;

    // PHOTOS
    let urls = (d["AP"] || "").split(";").map((x) => x.trim()).filter((x) => x);
    let ph = "";
    urls.forEach((u) => (ph += `<img src="${u}">`));
    document.getElementById("photos-lot").innerHTML = ph;
}


/* -------------------------------------------------------------------------- */
/* VARIABLES                                                                  */
/* -------------------------------------------------------------------------- */
let DATA = [];
let MARKERS = [];
let pinSelectionne = null;


/* -------------------------------------------------------------------------- */
/* VALEURS UNIQUES                                                            */
/* -------------------------------------------------------------------------- */
function uniqueValues(col) {
    return [...new Set(DATA.map((r) => cleanValue(r[col])))]
        .filter((x) => x)
        .sort();
}


/* -------------------------------------------------------------------------- */
/* GÉNÉRATION FILTRES                                                         */
/* -------------------------------------------------------------------------- */
function genererFiltres() {
    // Régions
    const regions = uniqueValues("Région");
    let htmlR = "";
    regions.forEach((r) => {
        htmlR += `
            <div class="checkbox-item">
                <input type="checkbox" class="chk-region" value="${r}">
                <label>${r}</label>
            </div>
        `;
    });
    document.getElementById("filter-regions").innerHTML = htmlR;

    // Départements = vides au départ
    document.getElementById("filter-departements").innerHTML = "";

    // Sliders Surface
    const surfaces = DATA.map((r) => parseFloat(r["Surface GLA"])).filter(
        (v) => !isNaN(v)
    );
    initDoubleSlider("surface", Math.min(...surfaces), Math.max(...surfaces), "m²");

    // Sliders Loyer annuel
    const loyers = DATA.map((r) => parseFloat(r["Loyer annuel"])).filter(
        (v) => !isNaN(v)
    );
    initDoubleSlider("loyer", Math.min(...loyers), Math.max(...loyers), "€");

    // Autres filtres
    generateCheckboxGroup("Emplacement", "filter-emplacement", "chk-emplacement");
    generateCheckboxGroup("Typologie", "filter-typologie", "chk-typologie");
    generateCheckboxGroup("Extraction", "filter-extraction", "chk-extraction");
    generateCheckboxGroup(
        "Restauration",
        "filter-restauration",
        "chk-restauration"
    );
}

function generateCheckboxGroup(col, containerID, className) {
    const vals = uniqueValues(col);
    let html = "";
    vals.forEach((v) => {
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
/* DÉPARTEMENTS IMBRIQUÉS PAR RÉGION                                          */
/* -------------------------------------------------------------------------- */
function mettreAJourDepartements() {
    const container = document.getElementById("filter-departements");
    container.innerHTML = "";

    const regions = [...document.querySelectorAll(".chk-region:checked")].map(
        (x) => x.value
    );

    if (regions.length === 0) return;

    regions.forEach((region) => {
        let html = `
            <div class="region-group">
                <div class="region-label">${region}</div>
        `;

        let deps = DATA.filter((r) => r["Région"] === region)
            .map((r) => cleanValue(r["Département"]))
            .filter((v) => v);

        deps = [...new Set(deps)].sort();

        deps.forEach((d) => {
            html += `
                <div class="checkbox-sub">
                    <input type="checkbox" class="chk-departement" value="${d}">
                    <label>${d}</label>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML += html;
    });
}


/* -------------------------------------------------------------------------- */
/* DOUBLE SLIDER – VERSION PRO                                                */
/* -------------------------------------------------------------------------- */
function initDoubleSlider(name, min, max, unit) {
    const target = document.getElementById(name + "-slider");

    target.innerHTML = `
        <div class="double-slider">
            <input type="range" id="${name}-min" min="${min}" max="${max}" value="${min}">
            <input type="range" id="${name}-max" min="${min}" max="${max}" value="${max}">
        </div>
    `;

    const minInput = document.getElementById(name + "-min");
    const maxInput = document.getElementById(name + "-max");
    const output = document.getElementById(name + "-values");

    function update() {
        let v1 = parseFloat(minInput.value);
        let v2 = parseFloat(maxInput.value);

        if (v1 > v2) [v1, v2] = [v2, v1];

        minInput.value = v1;
        maxInput.value = v2;

        const f1 =
            unit === "€"
                ? v1.toLocaleString("fr-FR") + " €"
                : v1.toLocaleString("fr-FR") + " " + unit;
        const f2 =
            unit === "€"
                ? v2.toLocaleString("fr-FR") + " €"
                : v2.toLocaleString("fr-FR") + " " + unit;

        output.innerHTML = `${f1} — ${f2}`;

        afficherPinsFiltres();
    }

    minInput.oninput = update;
    maxInput.oninput = update;

    update();
}


/* -------------------------------------------------------------------------- */
/* FILTRAGE MULTI CRITÈRES                                                     */
/* -------------------------------------------------------------------------- */
function passerFiltres(d) {
    // Region
    const regs = [...document.querySelectorAll(".chk-region:checked")].map(
        (x) => x.value
    );
    if (regs.length > 0 && !regs.includes(d["Région"])) return false;

    // Département
    const deps = [...document.querySelectorAll(".chk-departement:checked")].map(
        (x) => x.value
    );
    if (deps.length > 0 && !deps.includes(d["Département"])) return false;

    // Surface
    const sMin = parseFloat(document.getElementById("surface-min").value);
    const sMax = parseFloat(document.getElementById("surface-max").value);
    const surf = parseFloat(d["Surface GLA"]);
    if (isNaN(surf) || surf < sMin || surf > sMax) return false;

    // Loyer
    const lMin = parseFloat(document.getElementById("loyer-min").value);
    const lMax = parseFloat(document.getElementById("loyer-max").value);
    const loy = parseFloat(d["Loyer annuel"]);
    if (isNaN(loy) || loy < lMin || loy > lMax) return false;

    // Emplacement
    const emp = [
        ...document.querySelectorAll(".chk-emplacement:checked"),
    ].map((x) => x.value);
    if (emp.length > 0 && !emp.includes(d["Emplacement"])) return false;

    // Typologie
    const typ = [
        ...document.querySelectorAll(".chk-typologie:checked"),
    ].map((x) => x.value);
    if (typ.length > 0 && !typ.includes(d["Typologie"])) return false;

    // Extraction
    const ext = [
        ...document.querySelectorAll(".chk-extraction:checked"),
    ].map((x) => x.value);
    if (ext.length > 0 && !ext.includes(d["Extraction"])) return false;

    // Restauration
    const res = [
        ...document.querySelectorAll(".chk-restauration:checked"),
    ].map((x) => x.value);
    if (res.length > 0 && !res.includes(d["Restauration"])) return false;

    return true;
}


/* -------------------------------------------------------------------------- */
/* PINS FILTRÉS                                                                 */
/* -------------------------------------------------------------------------- */
function afficherPinsFiltres() {
    MARKERS.forEach((m) => map.removeLayer(m));
    MARKERS = [];

    const filtres = DATA.filter((d) => {
        if ((d["Actif"] || "").toLowerCase() !== "oui") return false;
        return passerFiltres(d);
    });

    filtres.forEach((d) => {
        const lat = parseFloat(d["Latitude"]);
        const lng = parseFloat(d["Longitude"]);
        if (!lat || !lng) return;

        const ref = formatReference(d["Référence annonce"]);

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div>${ref}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            }),
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
    document
        .querySelectorAll("#sidebar-left input[type=checkbox]")
        .forEach((x) => (x.checked = false));

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

    // Région → met à jour départements
    document
        .getElementById("filter-regions")
        .addEventListener("change", () => {
            mettreAJourDepartements();
            afficherPinsFiltres();
        });

    // Sous-départements → filtrage
    document
        .getElementById("filter-departements")
        .addEventListener("change", () => {
            afficherPinsFiltres();
        });

    // Autres filtres
    ["filter-emplacement", "filter-typologie", "filter-extraction", "filter-restauration"].forEach(
        (id) => {
            document.getElementById(id).addEventListener("change", () => {
                afficherPinsFiltres();
            });
        }
    );

    document
        .getElementById("btn-reset")
        .addEventListener("click", () => resetFiltres());
}

init();

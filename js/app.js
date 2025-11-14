/* ───────────────────────────────────────────────────────────── */
/*                    INITIALISATION DE LA CARTE                */
/* ───────────────────────────────────────────────────────────── */

var map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: false
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

map.setView([46.8, 2.4], 6);


/* ───────────────────────────────────────────────────────────── */
/*                        LECTURE EXCEL                         */
/* ───────────────────────────────────────────────────────────── */

async function loadExcel() {
    const url = "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}


/* ───────────────────────────────────────────────────────────── */
/*                        FORMATAGE SMBG                        */
/* ───────────────────────────────────────────────────────────── */

function formatReference(r) {
    if (!r) return "";
    return r.toString().trim().replace(/^0+/, "").replace(/\.0$/, "");
}

function formatValue(key, val) {
    if (["","-","/","0","O",0,0.0].includes(val)) return null;
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

/* Colonnes d’infos à afficher */
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


/* ───────────────────────────────────────────────────────────── */
/*                   AFFICHAGE DU PANNEAU DROIT                 */
/* ───────────────────────────────────────────────────────────── */

function afficherPanneauDroit(d) {

    const ref = formatReference(d["Référence annonce"]);
    document.getElementById("ref-annonce").innerHTML = ref;

    let html = "";

    const adresse = d["Adresse"];
    const gmaps = (d["Lien Google Maps"] || "").trim();

    if (adresse && !["-","/"].includes(adresse)) {
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
        .toString().split(";").map(x=>x.trim()).filter(x=>x);

    let ph = "";
    photos.forEach(url=>{
        ph += `<img src="${url}">`;
    });

    document.getElementById("photos-lot").innerHTML = ph;
}


/* ───────────────────────────────────────────────────────────── */
/*                        VARIABLES GLOBALES                     */
/* ───────────────────────────────────────────────────────────── */

let DATA = [];
let MARKERS = [];
let pinSelectionne = null;


/* ───────────────────────────────────────────────────────────── */
/*                     GÉNÉRATION DES FILTRES                   */
/* ───────────────────────────────────────────────────────────── */

function uniqueValues(col) {
    return [...new Set(
        DATA.map(r => r[col]).filter(v => v && !["-","/","0","O"].includes(v.toString().trim()))
    )].sort();
}


function genererFiltres() {

    /* ─────────────────────────────── */
    /* RÉGIONS                         */
    /* ─────────────────────────────── */
    const regions = uniqueValues("Région");
    let html_regions = "";

    regions.forEach(r => {
        html_regions += `
            <div class="checkbox-item">
                <input type="checkbox" class="chk-region" value="${r}">
                <label>${r}</label>
            </div>
        `;
    });

    document.getElementById("filter-regions").innerHTML = html_regions;


    /* ─────────────────────────────── */
    /* DÉPARTEMENTS (affichés dynamiquement) */
    /* ─────────────────────────────── */
    document.getElementById("filter-departements").innerHTML = "";


    /* ─────────────────────────────── */
    /* EMPLACEMENT                     */
    /* ─────────────────────────────── */
    const empl = uniqueValues("Emplacement");
    let html_empl = "";
    empl.forEach(e => {
        html_empl += `
            <div class="checkbox-item">
                <input type="checkbox" class="chk-emplacement" value="${e}">
                <label>${e}</label>
            </div>
        `;
    });
    document.getElementById("filter-emplacement").innerHTML = html_empl;


    /* ─────────────────────────────── */
    /* TYPOLOGIE                       */
    /* ─────────────────────────────── */
    const typo = uniqueValues("Typologie");
    let html_typo = "";
    typo.forEach(e => {
        html_typo += `
            <div class="checkbox-item">
                <input type="checkbox" class="chk-typologie" value="${e}">
                <label>${e}</label>
            </div>
        `;
    });
    document.getElementById("filter-typologie").innerHTML = html_typo;


    /* ─────────────────────────────── */
    /* EXTRACTION                      */
    /* ─────────────────────────────── */
    const extr = uniqueValues("Extraction");
    let html_ext = "";
    extr.forEach(e => {
        html_ext += `
            <div class="checkbox-item">
                <input type="checkbox" class="chk-extraction" value="${e}">
                <label>${e}</label>
            </div>
        `;
    });
    document.getElementById("filter-extraction").innerHTML = html_ext;


    /* ─────────────────────────────── */
    /* RESTAURATION                    */
    /* ─────────────────────────────── */
    const rest = uniqueValues("Restauration");
    let html_rest = "";
    rest.forEach(e => {
        html_rest += `
            <div class="checkbox-item">
                <input type="checkbox" class="chk-restauration" value="${e}">
                <label>${e}</label>
            </div>
        `;
    });
    document.getElementById("filter-restauration").innerHTML = html_rest;


    /* ─────────────────────────────── */
    /* SLIDERS SURFACE                 */
    /* ─────────────────────────────── */
    const surfaces = DATA.map(r => parseFloat(r["Surface"] || r["Surface GLA"] || r["N"])).filter(v => !isNaN(v));
    const minS = Math.min(...surfaces);
    const maxS = Math.max(...surfaces);

    document.getElementById("surface-min").min = minS;
    document.getElementById("surface-min").max = maxS;
    document.getElementById("surface-min").value = minS;

    document.getElementById("surface-max").min = minS;
    document.getElementById("surface-max").max = maxS;
    document.getElementById("surface-max").value = maxS;

    document.getElementById("surface-values").innerHTML =
        `${minS} m² — ${maxS} m²`;


    /* ─────────────────────────────── */
    /* SLIDERS LOYER ANNUEL            */
    /* ─────────────────────────────── */
    const loyers = DATA.map(r => parseFloat(r["Loyer annuel"] || r["R"])).filter(v => !isNaN(v));
    const minL = Math.min(...loyers);
    const maxL = Math.max(...loyers);

    document.getElementById("loyer-min").min = minL;
    document.getElementById("loyer-min").max = maxL;
    document.getElementById("loyer-min").value = minL;

    document.getElementById("loyer-max").min = minL;
    document.getElementById("loyer-max").max = maxL;
    document.getElementById("loyer-max").value = maxL;

    document.getElementById("loyer-values").innerHTML =
        `${minL.toLocaleString("fr-FR")} € — ${maxL.toLocaleString("fr-FR")} €`;
}


/* ───────────────────────────────────────────────────────────── */
/*                  GÉNÉRATION DYNAMIQUE DES DÉPARTEMENTS        */
/* ───────────────────────────────────────────────────────────── */

function mettreAJourDepartements() {

    const regionsCochees = [...document.querySelectorAll(".chk-region:checked")].map(chk => chk.value);

    let html = "";

    if (regionsCochees.length === 0) {
        document.getElementById("filter-departements").innerHTML = "";
        return;
    }

    regionsCochees.forEach(region => {

        DATA.filter(r => r["Région"] === region)
            .forEach(r => {
                const dep = r["Département"];
                if (!dep || ["-","/","0","O"].includes(dep)) return;

                html += `
                    <div class="checkbox-sub">
                        <input type="checkbox" class="chk-departement" value="${dep}">
                        <label>${dep}</label>
                    </div>
                `;
            });

    });

    document.getElementById("filter-departements").innerHTML = html;
}


/* ───────────────────────────────────────────────────────────── */
/*                   FILTRAGE MULTI-CRITÈRES                     */
/* ───────────────────────────────────────────────────────────── */

function passerFiltres(d) {

    /* Région */
    const regions = [...document.querySelectorAll(".chk-region:checked")].map(x => x.value);
    if (regions.length > 0 && !regions.includes(d["Région"])) return false;

    /* Département */
    const deps = [...document.querySelectorAll(".chk-departement:checked")].map(x => x.value);

    if (deps.length > 0) {
        if (!deps.includes(d["Département"])) return false;
    }

    /* Surface */
    const minS = parseFloat(document.getElementById("surface-min").value);
    const maxS = parseFloat(document.getElementById("surface-max").value);
    const surf = parseFloat(d["Surface"] || d["Surface GLA"] || d["N"]);
    if (isNaN(surf) || surf < minS || surf > maxS) return false;

    /* Loyer */
    const minL = parseFloat(document.getElementById("loyer-min").value);
    const maxL = parseFloat(document.getElementById("loyer-max").value);
    const loy = parseFloat(d["Loyer annuel"] || d["R"]);
    if (isNaN(loy) || loy < minL || loy > maxL) return false;

    /* Emplacement */
    const emp = [...document.querySelectorAll(".chk-emplacement:checked")].map(x=>x.value);
    if (emp.length > 0 && !emp.includes(d["Emplacement"])) return false;

    /* Typologie */
    const typ = [...document.querySelectorAll(".chk-typologie:checked")].map(x=>x.value);
    if (typ.length > 0 && !typ.includes(d["Typologie"])) return false;

    /* Extraction */
    const ext = [...document.querySelectorAll(".chk-extraction:checked")].map(x=>x.value);
    if (ext.length > 0 && !ext.includes(d["Extraction"])) return false;

    /* Restauration */
    const res = [...document.querySelectorAll(".chk-restauration:checked")].map(x=>x.value);
    if (res.length > 0 && !res.includes(d["Restauration"])) return false;

    return true;
}


/* ───────────────────────────────────────────────────────────── */
/*                AFFICHER LES PINS APRÈS FILTRAGE              */
/* ───────────────────────────────────────────────────────────── */

function afficherPinsFiltres() {

    MARKERS.forEach(m => map.removeLayer(m));
    MARKERS = [];

    const dataFiltree = DATA.filter(d => {
        if ((d["Actif"]||"").toLowerCase().trim() !== "oui") return false;
        return passerFiltres(d);
    });

    dataFiltree.forEach(d => {

        const lat = parseFloat(d["Latitude"]);
        const lng = parseFloat(d["Longitude"]);
        if (!lat || !lng) return;

        const ref = formatReference(d["Référence annonce"]);

        const marker = L.marker([lat,lng], {
            icon: L.divIcon({
                className:"smbg-pin",
                html:`<div>${ref}</div>`,
                iconSize:[30,30],
                iconAnchor:[15,15]
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
        MARKERS.push(marker);
    });
}


/* ───────────────────────────────────────────────────────────── */
/*                        RESET DES FILTRES                      */
/* ───────────────────────────────────────────────────────────── */

function resetFiltres() {

    document.querySelectorAll("#sidebar-left input[type=checkbox]").forEach(x => x.checked = false);

    genererFiltres();
    afficherPinsFiltres();

    document.getElementById("info-lot").innerHTML = "";
    document.getElementById("photos-lot").innerHTML = "";
    document.getElementById("ref-annonce").innerHTML = "Référence";
}


/* ───────────────────────────────────────────────────────────── */
/*                        INITIALISATION                         */
/* ───────────────────────────────────────────────────────────── */

async function init() {

    DATA = await loadExcel();

    genererFiltres();
    afficherPinsFiltres();

    document.getElementById("filter-regions").addEventListener("change", ()=>{
        mettreAJourDepartements();
        afficherPinsFiltres();
    });

    document.getElementById("filter-departements").addEventListener("change", ()=>{
        afficherPinsFiltres();
    });

    ["surface-min","surface-max","loyer-min","loyer-max"].forEach(id=>{
        document.getElementById(id).addEventListener("input", ()=>{
            document.getElementById("surface-values").innerHTML =
                `${document.getElementById("surface-min").value} m² — ${document.getElementById("surface-max").value} m²`;

            document.getElementById("loyer-values").innerHTML =
                `${parseInt(document.getElementById("loyer-min").value).toLocaleString("fr-FR")} € — ${parseInt(document.getElementById("loyer-max").value).toLocaleString("fr-FR")} €`;

            afficherPinsFiltres();
        });
    });

    ["filter-emplacement","filter-typologie","filter-extraction","filter-restauration"]
    .forEach(id=>{
        document.getElementById(id).addEventListener("change", ()=>{
            afficherPinsFiltres();
        });
    });

    document.getElementById("btn-reset").addEventListener("click", ()=>{
        resetFiltres();
    });
}

init();

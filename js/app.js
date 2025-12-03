/* ============================================================
   SMBG – Carte interactive (PINS + CARROUSEL + LIGHTBOX)
   ============================================================ */

/* ============================================================
   1. CARTE
   ============================================================ */
var map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: false,

    fadeAnimation: true,
    zoomAnimation: true,
    markerZoomAnimation: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

map.setView([46.8, 2.4], 6);

map.whenReady(() => {
    map.panBy([162, 0], { animate: false });
});


/* ============================================================
   2. PANNEAU DROIT + LIGHTBOX
   ============================================================ */

const sidebarRight   = document.getElementById("sidebar-right");
const lightbox       = document.getElementById("photo-lightbox");
const lightboxImg    = document.getElementById("lightbox-image");
const lightboxPrev   = document.getElementById("lightbox-prev");
const lightboxNext   = document.getElementById("lightbox-next");
const lightboxClose  = document.getElementById("lightbox-close");

let pinSelectionne   = null;
let markers          = [];
let currentPhotos    = [];
let currentPhotoIndex = 0;

function ouvrirPanneau() {
    sidebarRight.classList.add("open");
}

function fermerPanneau() {
    sidebarRight.classList.remove("open");

    document.getElementById("ref-annonce").innerHTML = "";
    document.getElementById("info-lot").innerHTML = "";
    document.getElementById("photos-lot").innerHTML = "";

    if (pinSelectionne && pinSelectionne._icon) {
        pinSelectionne._icon.classList.remove("smbg-pin-selected");
    }

    document.getElementById("carousel-wrapper").style.display = "none";

    pinSelectionne = null;
    currentPhotos = [];
}

map.on("click", fermerPanneau);


/* ============================================================
   3. LIGHTBOX
   ============================================================ */

function openLightbox(index) {
    if (!currentPhotos.length) return;
    currentPhotoIndex = index;
    lightboxImg.src = currentPhotos[currentPhotoIndex];
    lightbox.style.display = "flex";
}

function closeLightbox() {
    lightbox.style.display = "none";
}

function changePhoto(delta) {
    if (!currentPhotos.length) return;
    const n = currentPhotos.length;
    currentPhotoIndex = (currentPhotoIndex + delta + n) % n;
    lightboxImg.src = currentPhotos[currentPhotoIndex];
}

lightboxPrev.addEventListener("click", () => changePhoto(-1));
lightboxNext.addEventListener("click", () => changePhoto(1));
lightboxClose.addEventListener("click", closeLightbox);

lightbox.addEventListener("click", e => {
    if (e.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeLightbox();
});


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
    if (!val || ["-", "/", "0", "O"].includes(val)) return null;

    val = val.toString().trim();

    if (key === "Dépôt de garantie" || key === "GAPD") {
        return val;
    }

    const euros = [
        "Loyer annuel","Loyer Mensuel","Loyer €/m²","Loyer variable",
        "Charges annuelles","Charges Mensuelles","Charges €/m²",
        "Taxe foncière","Taxe foncière €/m²",
        "Marketing","Marketing €/m²",
        "Total (L+C+M)"
    ];

    const surfaces = ["Surface GLA","Surface utile"];

    if (euros.includes(key)) {
        const n = Math.round(parseFloat(val.replace(/\s/g,"")));
        return isNaN(n) ? val : n.toLocaleString("fr-FR") + " €";
    }

    if (surfaces.includes(key)) {
        const n = Math.round(parseFloat(val.replace(/\s/g,"")));
        return isNaN(n) ? val : n.toLocaleString("fr-FR") + " m²";
    }

    return val;
}


/* ============================================================
   6. PANNEAU DROIT
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

    document.querySelector("#sidebar-right .sidebar-inner").scrollTop = 0;
}


/* ============================================================
   7. CARROUSEL BAS (NOUVELLE VERSION)
   ============================================================ */

const wrapper = document.getElementById("carousel-wrapper");
const zoneCarousel = document.getElementById("photo-carousel");
const arrowLeft = document.getElementById("carousel-left");
const arrowRight = document.getElementById("carousel-right");

function afficherCarousel(d) {

    let photos = (
        d["Photos"] ||
        d["Photos annonce"] ||
        d["Photo annonce"] ||
        d["AP"] ||
        ""
    )
    .toString()
    .split(";")
    .map(x => x.trim())
    .filter(x => x !== "");

    if (!photos.length) {
        wrapper.style.display = "none";
        currentPhotos = [];
        return;
    }

    currentPhotos = photos;
    currentPhotoIndex = 0;

    zoneCarousel.innerHTML = photos
        .map((url, i) => `<img src="${url}" data-index="${i}">`)
        .join("");

    wrapper.style.display = "flex"; 
    zoneCarousel.scrollLeft = 0;

    zoneCarousel.querySelectorAll("img").forEach(img => {
        img.addEventListener("click", e => {
            openLightbox(parseInt(e.target.dataset.index));
        });
    });
}

/* Défilement molette */
zoneCarousel.addEventListener("wheel", e => {
    e.preventDefault();
    zoneCarousel.scrollLeft += e.deltaY;
});

/* Défilement flèches */
arrowLeft.addEventListener("click", () => {
    zoneCarousel.scrollLeft -= 260;
});
arrowRight.addEventListener("click", () => {
    zoneCarousel.scrollLeft += 260;
});


/* ============================================================
   8. PINS
   ============================================================ */

function afficherPinsFiltrés(donnees) {

    document.getElementById("compteur-annonces").innerHTML =
        "Annonces sélectionnées : " + donnees.length;

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
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        });

        marker.refAnnonce = ref;

        marker.on("click", () => {

            if (pinSelectionne && pinSelectionne._icon) {
                pinSelectionne._icon.classList.remove("smbg-pin-selected");
            }

            pinSelectionne = marker;

            setTimeout(() => {
                if (marker._icon) {
                    marker._icon.classList.add("smbg-pin-selected");
                }
            }, 10);

            afficherPanneauDroit(d);
            afficherCarousel(d);
        });

        marker.addTo(map);
        markers.push(marker);
    });
}


/* ============================================================
   9. OUTILS FILTRES
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
        zone.innerHTML += `
            <div class="checkbox-line">
                <input type="checkbox" id="${safeId}" value="${v}">
                <label for="${safeId}">${v}</label>
            </div>
        `;
    });
}

function valeursCochées(id) {
    return [...document.querySelectorAll(`#${id} input:checked`)]
        .map(x => x.value);
}


/* ============================================================
   10. RÉGIONS & DÉPARTEMENTS
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
    Object.keys(mapR).forEach(r => {
        mapR[r] = [...mapR[r]].sort();
    });
    return mapR;
}

function construireRegionsEtDepartements() {
    const zoneReg = document.getElementById("filter-regions");
    zoneReg.innerHTML = "";

    const regions = Object.keys(REGIONS_MAP).sort();

    regions.forEach(region => {
        const regionId = "region_" + region.replace(/[^a-zA-Z0-9]/g, "_");

        const divR = document.createElement("div");
        divR.className = "checkbox-line";
        divR.innerHTML = `
            <input type="checkbox" id="${regionId}" value="${region}">
            <label for="${regionId}">${region}</label>
        `;
        zoneReg.appendChild(divR);

        const depsContainer = document.createElement("div");
        depsContainer.className = "departements-container";
        depsContainer.style.display = "none";

        (REGIONS_MAP[region] || []).forEach(dep => {
            const depId = "dep_" + dep.replace(/[^a-zA-Z0-9]/g, "_");
            const divD = document.createElement("div");
            divD.className = "checkbox-line departement-indent";
            divD.innerHTML = `
                <input type="checkbox" id="${depId}" value="${dep}">
                <label for="${depId}">${dep}</label>
            `;
            depsContainer.appendChild(divD);
        });

        zoneReg.appendChild(depsContainer);

        const regionInput = divR.querySelector("input");

        regionInput.addEventListener("input", () => {
            if (regionInput.checked) {
                depsContainer.style.display = "block";
            } else {
                depsContainer.querySelectorAll("input[type=checkbox]").forEach(inp => inp.checked = false);
                depsContainer.style.display = "none";
            }
            appliquerFiltres();
        });

        depsContainer.querySelectorAll("input[type=checkbox]").forEach(inp => {
            inp.addEventListener("input", appliquerFiltres);
        });
    });
}

function regionsCochees() {
    return [...document.querySelectorAll("#filter-regions > .checkbox-line > input:checked")]
        .map(x => x.value);
}

function departementsCoches() {
    return [...document.querySelectorAll("#filter-regions .departements-container input:checked")]
        .map(x => x.value);
}


/* ============================================================
   11. SLIDER SURFACE 
   ============================================================ */
function initSliderSurface(values) {

    const uniq = values.map(v => parseInt(v || 0)).filter(v => !isNaN(v));
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
            a.toLocaleString("fr-FR") + " m² — " + b.toLocaleString("fr-FR") + " m²";
    }

    minInput.oninput = aff;
    maxInput.oninput = aff;
    aff();
}


/* ============================================================
   12. SLIDER LOYER
   ============================================================ */
function initSliderLoyer(values) {

    const uniq = values.map(v => parseInt(v || 0)).filter(v => !isNaN(v));

    const min = Math.min(...uniq);
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
            a.toLocaleString("fr-FR") + " € — " + b.toLocaleString("fr-FR") + " €";
    }

    minInput.oninput = aff;
    maxInput.oninput = aff;
    aff();
}


/* ============================================================
   13. APPLY FILTERS
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

            if (fd.includes(departement)) depMatch = true;

            if (fr.includes(region)) {
                const depsOfRegion = REGIONS_MAP[region] || [];
                const has = depsOfRegion.some(dep => fd.includes(dep));
                if (!has) regionMatch = true;
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
        if (loy  > 200000 && !bigLoy)  return false;

        if (surf <= 2000 && (surf < surfMin || surf > surfMax)) return false;
        if (loy  <= 200000 && (loy < loyMin || loy > loyMax))   return false;

        return true;
    });

    if (pinSelectionne) {
        const refSel = pinSelectionne.refAnnonce;
        const stillVisible = OUT.some(d =>
            formatReference(d["Référence annonce"]) === refSel
        );
        if (!stillVisible) {
            fermerPanneau();
        }
    }

    afficherPinsFiltrés(OUT);
}


/* ============================================================
   14. INIT
   ============================================================ */
async function init() {

    DATA = await loadExcel();

    REGIONS_MAP = buildRegionsMap();
    construireRegionsEtDepartements();

    remplirCheckbox("filter-emplacement",  valeursUniques("Emplacement"));
    remplirCheckbox("filter-typologie",    valeursUniques("Typologie"));
    remplirCheckbox("filter-extraction",   valeursUniques("Extraction"));
    remplirCheckbox("filter-restauration", valeursUniques("Restauration"));

    initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"]   || 0)));
    initSliderLoyer  (DATA.map(x => parseInt(x["Loyer annuel"]  || 0)));

    document.querySelectorAll("#sidebar-left input")
        .forEach(el => el.addEventListener("input", appliquerFiltres));

    document.getElementById("btn-reset").addEventListener("click", () => {

        document.querySelectorAll("#sidebar-left input[type=checkbox]")
            .forEach(x => x.checked = false);

        document.getElementById("checkbox-grand-surface").checked = true;
        document.getElementById("checkbox-grand-loyer").checked   = true;

        document.querySelectorAll("#filter-regions .departements-container")
            .forEach(c => c.style.display = "none");

        initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"]   || 0)));
        initSliderLoyer  (DATA.map(x => parseInt(x["Loyer annuel"]  || 0)));

        fermerPanneau();
        afficherPinsFiltrés(DATA);
    });

    afficherPinsFiltrés(DATA);
    fermerPanneau();
}

init();


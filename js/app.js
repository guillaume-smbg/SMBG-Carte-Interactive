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

let pinSelectionne    = null;
let markers           = [];
let currentPhotos     = [];
let currentPhotoIndex = 0;

function ouvrirPanneau(lat, lng) {

    sidebarRight.classList.add("open");

    /* 🔹 Affichage module enseignes */
    if (typeof afficherModuleEnseignes === "function" && lat && lng) {
        afficherModuleEnseignes(lat, lng);
    }
}

function fermerPanneau() {

    sidebarRight.classList.remove("open");

    document.getElementById("ref-annonce").innerHTML = "";
    document.getElementById("info-lot").innerHTML = "";
    document.getElementById("photos-lot").innerHTML = "";

    if (pinSelectionne && pinSelectionne._icon) {
        pinSelectionne._icon.classList.remove("smbg-pin-selected");
    }

    /* 🔹 Masque carrousel */
    document.getElementById("carousel-wrapper").style.display = "none";

    /* 🔹 Important : redescend le zoom */
    document.body.classList.remove("carousel-open");

    pinSelectionne = null;
    currentPhotos = [];

    /* 🔹 Masquage module enseignes */
    if (typeof masquerModuleEnseignes === "function") {
        masquerModuleEnseignes();
    }
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
    if (!val || ["-", "/", "O"].includes(val)) return null;

    val = val.toString().trim();

    if (key === "Dépôt de garantie" || key === "GAPD") {
        return val;
    }

    if (key === "Loyer variable" || key === "Gestion") {
        const n = parseFloat(val.replace(",", "."));
        if (isNaN(n)) return val;
        const pct = n <= 1 ? n * 100 : n;
        return Math.round(pct) + " %";
    }

    const euros = [
        "Cession / Droit au bail",
        "Loyer annuel","Loyer Mensuel","Loyer €/m²",
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
    "Adresse","Emplacement","Typologie","Type","Durée du bail",
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
    "Environnement Commercial","Commentaires","Honoraires de rédaction","Honoraires commerciaux"
];

function afficherPanneauDroit(d) {

    const lat = parseFloat(d["Latitude"]);
    const lng = parseFloat(d["Longitude"]);

    ouvrirPanneau(lat, lng);   // ✅ on passe maintenant les coordonnées

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

        /* ----- CAS SPÉCIAL : SURFACE GLA + SURFACE MAXIMALE ----- */
        if (col === "Surface GLA") {

            const surfGLA = parseInt(d["Surface GLA"] || 0);
            const surfMax = parseInt(d["Surface maximale"] || 0);

            html += `
                <div class="info-line">
                    <div class="info-key">Surface GLA</div>
                    <div class="info-value">
                        ${surfGLA.toLocaleString("fr-FR")} m²
                        ${surfMax && surfMax > surfGLA ? `
                            <div style="
                                margin-top: 2px;
                                font-size: 0.9em;
                                opacity: 0.9;
                            ">
                                jusqu’à ${surfMax.toLocaleString("fr-FR")} m²
                            </div>
                        ` : ``}
                    </div>
                </div>
            `;
            return;
        }

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
   7. CARROUSEL BAS
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

    /* ----- Aucune photo ----- */
    if (!photos.length) {
        wrapper.style.display = "none";
        document.body.classList.remove("carousel-open");   // 🔹 retire classe zoom
        currentPhotos = [];
        return;
    }

    /* ----- Photos présentes ----- */
    currentPhotos = photos;
    currentPhotoIndex = 0;

    zoneCarousel.innerHTML = photos
        .map((url, i) => `<img src="${url}" data-index="${i}">`)
        .join("");

    wrapper.style.display = "flex";

    /* 🔹 Active classe pour remonter le zoom */
    document.body.classList.add("carousel-open");

    zoneCarousel.scrollLeft = 0;

    zoneCarousel.querySelectorAll("img").forEach(img => {
        img.addEventListener("click", e => {
            openLightbox(parseInt(e.target.dataset.index));
        });
    });
}

/* ----- Défilement molette ----- */
zoneCarousel.addEventListener("wheel", e => {
    e.preventDefault();
    zoneCarousel.scrollLeft += e.deltaY;
});

/* ----- Défilement flèches ----- */
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
    return [...set];
}

function normaliser(v) {
    return v
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function remplirCheckbox(id, valeurs, ordreForce = null) {
    const zone = document.getElementById(id);
    if (!zone) return;

    zone.innerHTML = "";

    let vals = valeurs.slice();

    if (ordreForce && ordreForce.length) {
        const mapVals = {};
        vals.forEach(v => mapVals[normaliser(v)] = v);

        vals = ordreForce
            .map(o => mapVals[normaliser(o)])
            .filter(Boolean);
    } else {
        vals.sort();
    }

    vals.forEach(v => {
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
                depsContainer
                    .querySelectorAll("input[type=checkbox]")
                    .forEach(inp => inp.checked = false);
                depsContainer.style.display = "none";
            }
            appliquerFiltres();
        });

        depsContainer
            .querySelectorAll("input[type=checkbox]")
            .forEach(inp => inp.addEventListener("input", appliquerFiltres));
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

    const uniq = values
        .map(v => parseInt(v || 0))
        .filter(v => !isNaN(v));

    const MAX_LIMIT = 1000;

    const min = Math.min(...uniq);
    const maxSlider = MAX_LIMIT;

    const minInput = document.getElementById("surface-min");
    const maxInput = document.getElementById("surface-max");
    const display  = document.getElementById("surface-values");

    minInput.min = maxInput.min = min;
    minInput.max = maxInput.max = maxSlider;

    minInput.value = min;
    maxInput.value = maxSlider;

    function aff(fromMin = false) {

        let a = parseInt(minInput.value);
        let b = parseInt(maxInput.value);

        if (a > b) {
            if (fromMin) {
                maxInput.value = a;
                b = a;
            } else {
                minInput.value = b;
                a = b;
            }
        }

        display.innerHTML =
            a.toLocaleString("fr-FR") + " m² — " +
            b.toLocaleString("fr-FR") + " m²";
    }

    minInput.oninput = () => aff(true);
    maxInput.oninput = () => aff(false);

    aff();
}


/* ============================================================
   12. SLIDER LOYER
   ============================================================ */

function initSliderLoyer(values) {

    const uniq = values
        .map(v => parseInt(v || 0))
        .filter(v => !isNaN(v));

    const min = Math.min(...uniq);
    const maxAfficher = 200000;

    const minInput = document.getElementById("loyer-min");
    const maxInput = document.getElementById("loyer-max");
    const display  = document.getElementById("loyer-values");

    minInput.min = maxInput.min = min;
    minInput.max = maxInput.max = maxAfficher;

    minInput.value = min;
    maxInput.value = maxAfficher;

    function aff(fromMin = false) {

        let a = parseInt(minInput.value);
        let b = parseInt(maxInput.value);

        if (a > b) {
            if (fromMin) {
                maxInput.value = a;
                b = a;
            } else {
                minInput.value = b;
                a = b;
            }
        }

        display.innerHTML =
            a.toLocaleString("fr-FR") + " € — " +
            b.toLocaleString("fr-FR") + " €";
    }

    minInput.oninput = () => aff(true);
    maxInput.oninput = () => aff(false);

    aff();
}


/* ============================================================
   13. APPLY FILTERS
   ============================================================ */

function appliquerFiltres() {

    const fr  = regionsCochees();
    const fd  = departementsCoches();

    const fn  = valeursCochées("filter-nature");
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

        if (fn.length  && !fn.includes(d["Nature"]))        return false;
        if (fe.length  && !fe.includes(d["Emplacement"]))   return false;
        if (ft.length  && !ft.includes(d["Typologie"]))     return false;
        if (fx.length  && !fx.includes(d["Extraction"]))    return false;
        if (frs.length && !frs.includes(d["Restauration"])) return false;

        /* ================= SURFACE ================= */

        const rawGLA = (d["Surface GLA"] || "").toString().replace(/\s/g,"").trim();
        const rawMax = (d["Surface maximale"] || "").toString().replace(/\s/g,"").trim();

        let surfGLA = parseInt(rawGLA);
        if (isNaN(surfGLA)) surfGLA = 0;

        let surfMaxLot = parseInt(rawMax);
        if (isNaN(surfMaxLot)) surfMaxLot = surfGLA;

        if (surfMaxLot < surfGLA) surfMaxLot = surfGLA;

        const loy = parseInt(d["Loyer annuel"] || 0);

        /* ===== LOGIQUE >1000 m² CORRIGÉE ===== */

        // Si >1000 décoché → on exclut uniquement
        // les lots dont la surface minimale est > 1000
        if (!bigSurf && surfGLA > 1000) return false;

        /* Chevauchement intervalle */

        const overlapSurface =
            surfMaxLot >= surfMin &&
            surfGLA    <= surfMax;

        // Si lot <= 1000 → toujours soumis au slider
        if (surfGLA <= 1000) {
            if (!overlapSurface) return false;
        }

        // Si lot > 1000 :
        // - s’il est autorisé (bigSurf = true), on ne le bloque pas par le slider
        // - s’il n’est pas autorisé, déjà filtré plus haut

        /* ================= LOYER ================= */

        if (loy > 200000 && !bigLoy) return false;
        if (loy <= 200000 && (loy < loyMin || loy > loyMax)) return false;

        return true;
    });

    if (pinSelectionne) {
        const refSel = pinSelectionne.refAnnonce;
        const stillVisible = OUT.some(d =>
            formatReference(d["Référence annonce"]) === refSel
        );
        if (!stillVisible) fermerPanneau();
    }

    afficherPinsFiltrés(OUT);
}


/* ============================================================
   14. MODULE ENSEIGNES – MOTEUR RETAIL V4 FINAL COMPLET
   ============================================================ */

const DISTANCES = [2000, 5000, 10000, 20000, 50000];
const MAX_MARKERS = 1500;

/* =========================
   TAXONOMIE COMPLÈTE
========================= */

const RETAIL_STRUCTURE = {

    "Mode & Accessoires": {
        color: "#8E44AD",
        subgroups: {
            "Prêt-à-porter Femme": ["clothes"],
            "Prêt-à-porter Homme": ["clothes"],
            "Prêt-à-porter Enfant": ["clothes"],
            "Chaussures": ["shoes"],
            "Maroquinerie": ["bag","leather"],
            "Bijouterie joaillerie": ["jewelry"],
            "Bijouterie fantaisie": ["jewelry"],
            "Horlogerie": ["watches"],
            "Lingerie": ["lingerie"],
            "Accessoires": ["fashion_accessories"],
            "Luxe / Premium": ["clothes"]
        }
    },

    "Beauté & Bien-être": {
        color: "#E91E63",
        subgroups: {
            "Cosmétique": ["cosmetics"],
            "Parfumerie": ["perfumery"],
            "Coiffeur": ["hairdresser"],
            "Onglerie": ["beauty"],
            "Institut de beauté": ["beauty"],
            "Massage": ["massage"],
            "Spa": ["spa"]
        }
    },

    "Santé": {
        color: "#16A085",
        subgroups: {
            "Pharmacie": ["pharmacy"],
            "Opticien": ["optician"],
            "Audioprothésiste": ["hearing_aids"],
            "Laboratoire médical": ["clinic"],
            "Maison de santé": ["doctors"],
            "Orthopédie": ["medical_supply"],
            "Parapharmacie": ["cosmetics"]
        }
    },

    "Alimentaire": {
        color: "#27AE60",
        subgroups: {
            "Supermarché": ["supermarket"],
            "Hypermarché": ["supermarket"],
            "Supérette": ["convenience"],
            "Boulangerie": ["bakery"],
            "Boucherie": ["butcher"],
            "Fromagerie": ["cheese"],
            "Poissonnerie": ["seafood"],
            "Primeur": ["greengrocer"],
            "Caviste": ["wine"],
            "Chocolatier": ["chocolate"],
            "Bio": ["organic"]
        }
    },

    "Restauration": {
        color: "#D35400",
        subgroups: {
            "Restaurant traditionnel": ["restaurant"],
            "Fast-food": ["fast_food"],
            "Café": ["cafe"],
            "Bar": ["bar"],
            "Glacier": ["ice_cream"],
            "Sandwicherie": ["fast_food"],
            "Pizzeria": ["restaurant"],
            "Sushi": ["restaurant"]
        }
    },

    "Sport & Loisirs": {
        color: "#2980B9",
        subgroups: {
            "Salle de sport": ["fitness_centre"],
            "Cycle": ["bicycle"],
            "Outdoor": ["sports"],
            "Sport généraliste": ["sports"],
            "Jeux / Gaming": ["video_games"],
            "Jouets": ["toy"],
            "Musique": ["music"]
        }
    },

    "Maison & Décoration": {
        color: "#795548",
        subgroups: {
            "Mobilier": ["furniture"],
            "Décoration": ["interior_decoration"],
            "Luminaire": ["lighting"],
            "Bricolage": ["hardware"],
            "Jardin": ["garden_centre"]
        }
    },

    "Culture & Média": {
        color: "#2C3E50",
        subgroups: {
            "Librairie": ["books"],
            "Presse": ["newsagent"],
            "Photographie": ["photo"],
            "Art": ["art"],
            "Cadeaux": ["gift"]
        }
    },

    "Électronique": {
        color: "#34495E",
        subgroups: {
            "Téléphonie": ["mobile_phone"],
            "Informatique": ["computer"],
            "Hi-Fi": ["electronics"],
            "Électroménager": ["appliance"]
        }
    },

    "Automobile": {
        color: "#7F8C8D",
        subgroups: {
            "Vente auto": ["car"],
            "Réparation": ["car_repair"],
            "Pneus": ["tyres"],
            "Moto": ["motorcycle"],
            "Station-service": ["fuel"]
        }
    },

    "Services": {
        color: "#1ABC9C",
        subgroups: {
            "Agence de voyage": ["travel_agency"],
            "Pressing": ["laundry"],
            "Serrurerie": ["locksmith"],
            "Animalerie": ["pet"],
            "Agence immobilière": ["estate_agent"],
            "Banque": ["bank"],
            "Point relais": ["parcel_shop"],
            "Fleuriste": ["florist"]
        }
    }

};

/* =========================
   ÉTAT GLOBAL
========================= */

let retailState = {
    selectedGroups: [],
    selectedSubgroups: [],
    selectedDistance: 5000,
    lastLotCoords: null,
    cache: {}
};

let retailLayer = L.layerGroup().addTo(map);

/* =========================
   BUILD HIERARCHY
========================= */

function buildRetailHierarchy() {

    let container = document.getElementById("retail-hierarchy");

    if (!container) {
        console.error("retail-hierarchy introuvable dans le HTML");
        return;
    }

    container.innerHTML = "";

    Object.entries(RETAIL_STRUCTURE).forEach(([groupName, groupData]) => {

        const groupDiv = document.createElement("div");
        groupDiv.className = "retail-group";

        const header = document.createElement("div");
        header.className = "retail-group-header";

        header.innerHTML = `
            <label style="cursor:pointer;">
                <input type="checkbox"
                       class="group-checkbox"
                       data-group="${groupName}">
                <span style="
                    display:inline-block;
                    width:10px;
                    height:10px;
                    border-radius:50%;
                    margin:0 6px;
                    background:${groupData.color};
                "></span>
                ${groupName}
            </label>
            <span class="arrow">▶</span>
        `;

        const subDiv = document.createElement("div");
        subDiv.className = "retail-subgroups";
        subDiv.style.display = "none";

        Object.keys(groupData.subgroups).forEach(subName => {

            const label = document.createElement("label");
            label.style.display = "block";
            label.style.marginLeft = "18px";

            label.innerHTML = `
                <input type="checkbox"
                       class="sub-checkbox"
                       data-group="${groupName}"
                       data-sub="${subName}">
                ${subName}
            `;

            subDiv.appendChild(label);
        });

        header.addEventListener("click", (e) => {
            if (e.target.tagName !== "INPUT") {
                subDiv.style.display =
                    subDiv.style.display === "none" ? "block" : "none";
            }
        });

        groupDiv.appendChild(header);
        groupDiv.appendChild(subDiv);
        container.appendChild(groupDiv);
    });
}

/* =========================
   UTILITAIRES
========================= */

function showRetailLoader() {
    const loader = document.getElementById("retail-loader");
    if (loader) loader.classList.add("active");
}

function hideRetailLoader() {
    const loader = document.getElementById("retail-loader");
    if (loader) loader.classList.remove("active");
}

function distanceMeters(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI/180;
    const dLon = (b.lng - a.lng) * Math.PI/180;
    const lat1 = a.lat * Math.PI/180;
    const lat2 = b.lat * Math.PI/180;

    const x = Math.sin(dLat/2)**2 +
        Math.sin(dLon/2)**2 * Math.cos(lat1) * Math.cos(lat2);

    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function getEffectiveSubgroups() {

    let effective = [...retailState.selectedSubgroups];

    retailState.selectedGroups.forEach(group => {

        Object.keys(RETAIL_STRUCTURE[group].subgroups)
            .forEach(sub => {
                if (!effective.includes(sub))
                    effective.push(sub);
            });

    });

    return effective;
}

/* =========================
   OVERPASS
========================= */

function buildOverpassQuery(lat, lng, radius, subgroups) {

    let filters = [];

    subgroups.forEach(sub => {
        Object.entries(RETAIL_STRUCTURE).forEach(([gName, gData]) => {
            if (gData.subgroups[sub]) {
                gData.subgroups[sub].forEach(tag => {

                    filters.push(`
                        node(around:${radius},${lat},${lng})[shop=${tag}];
                        node(around:${radius},${lat},${lng})[amenity=${tag}];
                        node(around:${radius},${lat},${lng})[leisure=${tag}];
                    `);

                });
            }
        });
    });

    return `
    [out:json][timeout:25];
    (
        ${filters.join("\n")}
    );
    out center;
    `;
}

/* =========================
   FETCH
========================= */

async function fetchRetail(lat, lng) {

    const effectiveSubgroups = getEffectiveSubgroups();

    if (!effectiveSubgroups.length) {
        retailLayer.clearLayers();
        return;
    }

    showRetailLoader();

    const key = `${lat}_${lng}_${retailState.selectedDistance}_${effectiveSubgroups.sort().join("-")}`;

    if (retailState.cache[key]) {
        renderRetail(retailState.cache[key], lat, lng, effectiveSubgroups);
        hideRetailLoader();
        return;
    }

    const query = buildOverpassQuery(
        lat,
        lng,
        retailState.selectedDistance,
        effectiveSubgroups
    );

    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
    });

    const data = await res.json();

    const results = data.elements
        .filter(el => el.tags && (el.tags.name || el.tags.brand))
        .map(el => ({
            name: el.tags.brand || el.tags.name,
            lat: el.lat || el.center?.lat,
            lng: el.lon || el.center?.lon,
            tags: el.tags
        }));

    retailState.cache[key] = results;

    renderRetail(results, lat, lng, effectiveSubgroups);
    hideRetailLoader();
}

/* =========================
   RENDER
========================= */

function renderRetail(results, lotLat, lotLng, effectiveSubgroups) {

    retailLayer.clearLayers();
    let count = 0;

    results.forEach(r => {

        if (count >= MAX_MARKERS) return;

        const dist = Math.round(distanceMeters(
            {lat: lotLat, lng: lotLng},
            {lat: r.lat, lng: r.lng}
        ));

        if (dist > retailState.selectedDistance) return;

        let color = "#E1782C";

        Object.entries(RETAIL_STRUCTURE).forEach(([gName, gData]) => {
            Object.entries(gData.subgroups).forEach(([subName, tags]) => {

                if (!effectiveSubgroups.includes(subName)) return;

                tags.forEach(tag => {

                    if (
                        r.tags.shop === tag ||
                        r.tags.amenity === tag ||
                        r.tags.leisure === tag
                    ) {
                        color = gData.color;
                    }

                });
            });
        });

        const marker = L.circleMarker([r.lat, r.lng], {
            radius: 5,
            color: color,
            fillColor: color,
            fillOpacity: 0.9
        });

        marker.bindPopup(`
            <strong>${r.name}</strong><br>
            Distance : ${dist} m
        `);

        marker.addTo(retailLayer);
        count++;
    });

    const counter = document.getElementById("enseigne-count");
    if (counter)
        counter.innerHTML = count + " enseignes trouvées";
}

/* =========================
   MODULE DISPLAY
========================= */

function afficherModuleEnseignes(lat, lng) {

    const module = document.getElementById("module-enseignes");
    if (module) module.style.display = "block";

    const newCoords = { lat, lng };

    if (retailState.lastLotCoords) {
        const d = distanceMeters(retailState.lastLotCoords, newCoords);
        if (d < 150) return;
    }

    retailState.lastLotCoords = newCoords;

    fetchRetail(lat, lng);
}

function masquerModuleEnseignes() {
    const module = document.getElementById("module-enseignes");
    if (module) module.style.display = "none";
    retailLayer.clearLayers();
}

/* ============================================================
   15. INIT – RETAIL MULTI SÉLECTION STABLE
   ============================================================ */

async function init() {

    DATA = await loadExcel();
    REGIONS_MAP = buildRegionsMap();
    construireRegionsEtDepartements();

    remplirCheckbox("filter-nature", valeursUniques("Nature"));
    remplirCheckbox("filter-emplacement", valeursUniques("Emplacement"));
    remplirCheckbox("filter-typologie", valeursUniques("Typologie"));

    initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"] || 0)));
    initSliderLoyer(DATA.map(x => parseInt(x["Loyer annuel"] || 0)));

    document.querySelectorAll("#sidebar-left input")
        .forEach(el => el.addEventListener("input", appliquerFiltres));

    buildRetailHierarchy();

    const dropdown = document.getElementById("retail-dropdown");
    const inputActivite = document.getElementById("search-activite");
    const autocomplete = document.getElementById("autocomplete-activite");
    const chipsContainer = document.getElementById("selected-activites");

    /* =========================
       OUVERTURE / FERMETURE
    ========================== */

    inputActivite.addEventListener("focus", () => {
        dropdown.classList.add("open");
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest("#module-enseignes")) {
            dropdown.classList.remove("open");
        }
    });

    /* =========================
       AUTOCOMPLETE ACTIVITÉ
    ========================== */

    inputActivite.addEventListener("input", () => {

        const value = inputActivite.value.toLowerCase().trim();
        autocomplete.innerHTML = "";

        if (!value) {
            autocomplete.style.display = "none";
            return;
        }

        const matches = [];

        Object.entries(RETAIL_STRUCTURE).forEach(([groupName, groupData]) => {

            if (groupName.toLowerCase().includes(value))
                matches.push({ type: "group", name: groupName });

            Object.keys(groupData.subgroups).forEach(subName => {
                if (subName.toLowerCase().includes(value))
                    matches.push({ type: "sub", name: subName });
            });

        });

        matches.forEach(m => {

            const div = document.createElement("div");
            div.className = "autocomplete-item";
            div.textContent = m.name;

            div.addEventListener("click", () => {

                if (m.type === "group") {

                    if (!retailState.selectedGroups.includes(m.name))
                        retailState.selectedGroups.push(m.name);

                    document.querySelectorAll(`.group-checkbox[data-group="${m.name}"]`)
                        .forEach(cb => cb.checked = true);

                } else {

                    if (!retailState.selectedSubgroups.includes(m.name))
                        retailState.selectedSubgroups.push(m.name);

                    document.querySelectorAll(`.sub-checkbox[data-sub="${m.name}"]`)
                        .forEach(cb => cb.checked = true);
                }

                inputActivite.value = "";
                autocomplete.style.display = "none";

                refreshChips();

                if (retailState.lastLotCoords)
                    fetchRetail(
                        retailState.lastLotCoords.lat,
                        retailState.lastLotCoords.lng
                    );
            });

            autocomplete.appendChild(div);
        });

        autocomplete.style.display = matches.length ? "block" : "none";
    });

    /* =========================
       CHIPS (MULTI)
    ========================== */

    function refreshChips() {

        chipsContainer.innerHTML = "";

        const allSelected = [
            ...retailState.selectedGroups,
            ...retailState.selectedSubgroups
        ];

        allSelected.forEach(name => {

            const chip = document.createElement("div");
            chip.className = "selected-item";
            chip.innerHTML = `${name} <span class="remove">✕</span>`;

            chip.querySelector(".remove").addEventListener("click", () => {

                retailState.selectedGroups =
                    retailState.selectedGroups.filter(g => g !== name);

                retailState.selectedSubgroups =
                    retailState.selectedSubgroups.filter(s => s !== name);

                document.querySelectorAll(`.group-checkbox[data-group="${name}"]`)
                    .forEach(cb => cb.checked = false);

                document.querySelectorAll(`.sub-checkbox[data-sub="${name}"]`)
                    .forEach(cb => cb.checked = false);

                refreshChips();

                if (retailState.lastLotCoords)
                    fetchRetail(
                        retailState.lastLotCoords.lat,
                        retailState.lastLotCoords.lng
                    );
            });

            chipsContainer.appendChild(chip);
        });
    }

    /* =========================
       GROUP CHECKBOX
    ========================== */

    document.addEventListener("change", (e) => {

        if (e.target.classList.contains("group-checkbox")) {

            const group = e.target.dataset.group;

            if (e.target.checked) {

                if (!retailState.selectedGroups.includes(group))
                    retailState.selectedGroups.push(group);

            } else {

                retailState.selectedGroups =
                    retailState.selectedGroups.filter(g => g !== group);
            }

            refreshChips();

            if (retailState.lastLotCoords)
                fetchRetail(
                    retailState.lastLotCoords.lat,
                    retailState.lastLotCoords.lng
                );
        }

        /* =========================
           SUB CHECKBOX
        ========================== */

        if (e.target.classList.contains("sub-checkbox")) {

            const sub = e.target.dataset.sub;

            if (e.target.checked) {

                if (!retailState.selectedSubgroups.includes(sub))
                    retailState.selectedSubgroups.push(sub);

            } else {

                retailState.selectedSubgroups =
                    retailState.selectedSubgroups.filter(s => s !== sub);
            }

            refreshChips();

            if (retailState.lastLotCoords)
                fetchRetail(
                    retailState.lastLotCoords.lat,
                    retailState.lastLotCoords.lng
                );
        }
    });

    /* =========================
       RESET RETAIL
    ========================== */

    document.getElementById("reset-enseignes")
        .addEventListener("click", () => {

            retailState.selectedGroups = [];
            retailState.selectedSubgroups = [];

            document.querySelectorAll(".group-checkbox")
                .forEach(cb => cb.checked = false);

            document.querySelectorAll(".sub-checkbox")
                .forEach(cb => cb.checked = false);

            retailLayer.clearLayers();
            refreshChips();

            const counter = document.getElementById("enseigne-count");
            if (counter) counter.innerHTML = "";
        });

    afficherPinsFiltrés(DATA);
    fermerPanneau();
}

init();

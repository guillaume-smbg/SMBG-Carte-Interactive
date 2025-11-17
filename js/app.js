/* ============================================================
   SMBG – Carte interactive
   Version reconstruite et stabilisée
   - Pins identiques (ronds bleu SMBG)
   - Sélection cuivrée inchangée
   - Panneau droit intact
   - Filtres complets : Région, Département, Emplacement, Typologie, Extraction, Restauration
   - Sliders double curseur Surface + Loyer
   - Scroll auto dans le panneau droit
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
   2. CHARGEMENT FICHIER EXCEL
   ============================================================ */
async function loadExcel() {
    const url = "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";
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
        const n = Math.round(parseFloat(val.replace(/\s/g, "")));
        if (isNaN(n)) return val;
        return n.toLocaleString("fr-FR") + " €";
    }

    if (surfaces.includes(key)) {
        const n = Math.round(parseFloat(val.replace(/\s/g, "")));
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

    // Référence
    const ref = formatReference(d["Référence annonce"]);
    document.getElementById("ref-annonce").innerHTML = ref;

    let html = "";

    // Adresse + bouton Gmaps
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

    // Autres colonnes
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

    // Photos
    let photos = (d["Photos"] || d["AP"] || "")
        .toString().split(";").map(x=>x.trim()).filter(x=>x);

    let ph = "";
    photos.forEach(url => { ph += `<img src="${url}">`; });

    document.getElementById("photos-lot").innerHTML = ph;

    // Scroll auto ↑↑↑
    document.getElementById("sidebar-right").scrollTop = 0;
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

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div>${ref}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
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
   6. FILTRES
   ============================================================ */

function valeursUniques(key) {
    const set = new Set();
    DATA.forEach(d => {
        const v = (d[key] || "").toString().trim();
        if (v && v !== "-" && v !== "/" && v !== "0") set.add(v);
    });
    return [...set].sort();
}

function remplirCheckbox(id, valeurs, indent=false) {
    const zone = document.getElementById(id);
    zone.innerHTML = "";

    valeurs.forEach(v => {
        const div = document.createElement("div");
        div.className = "checkbox-line" + (indent ? " departement-indent" : "");

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
   7. SLIDERS DOUBLE CURSEUR
   ============================================================ */
function initSliderDouble(minId, maxId, values, displayId) {

    const min = Math.min(...values);
    const max = Math.max(...values);

    const minInput = document.getElementById(minId);
    const maxInput = document.getElementById(maxId);
    const display = document.getElementById(displayId);

    minInput.min = maxInput.min = min;
    minInput.max = maxInput.max = max;

    minInput.value = min;
    maxInput.value = max;

    function updateDisplay() {
        const a = parseInt(minInput.value);
        const b = parseInt(maxInput.value);

        if (a > b) minInput.value = b;

        display.innerHTML =
            a.toLocaleString("fr-FR") + " — " + b.toLocaleString("fr-FR");
    }

    minInput.oninput = updateDisplay;
    maxInput.oninput = updateDisplay;

    updateDisplay();
}


/* ============================================================
   8. APPLICATION DES FILTRES
   ============================================================ */
function appliquerFiltres() {

    const fr = valeursCochées("filter-regions");
    const fd = valeursCochées("filter-departements");
    const fe = valeursCochées("filter-emplacement");
    const ft = valeursCochées("filter-typologie");
    const fx = valeursCochées("filter-extraction");
    const frs = valeursCochées("filter-restauration");

    const surfMin = parseInt(document.getElementById("surface-min").value);
    const surfMax = parseInt(document.getElementById("surface-max").value);
    const loyMin = parseInt(document.getElementById("loyer-min").value);
    const loyMax = parseInt(document.getElementById("loyer-max").value);

    const out = DATA.filter(d => {

        if (fr.length && !fr.includes(d["Région"])) return false;
        if (fd.length && !fd.includes(d["Département"])) return false;

        if (fe.length && !fe.includes(d["Emplacement"])) return false;
        if (ft.length && !ft.includes(d["Typologie"])) return false;
        if (fx.length && !fx.includes(d["Extraction"])) return false;
        if (frs.length && !frs.includes(d["Restauration"])) return false;

        const surf = parseInt(d["Surface GLA"] || "0");
        if (surf < surfMin || surf > surfMax) return false;

        const loy = parseInt(d["Loyer annuel"] || "0");
        if (loy < loyMin || loy > loyMax) return false;

        return true;
    });

    afficherPinsFiltrés(out);
}



/* ============================================================
   9. INITIALISATION GLOBALE
   ============================================================ */
async function init() {

    DATA = await loadExcel();

    /* Filtres Région / Département / etc. */
    remplirCheckbox("filter-regions", valeursUniques("Région"));
    remplirCheckbox("filter-departements", valeursUniques("Département"));

    remplirCheckbox("filter-emplacement", valeursUniques("Emplacement"));
    remplirCheckbox("filter-typologie", valeursUniques("Typologie"));
    remplirCheckbox("filter-extraction", valeursUniques("Extraction"));
    remplirCheckbox("filter-restauration", valeursUniques("Restauration"));

    /* Sliders double curseur */
    initSliderDouble("surface-min", "surface-max",
        DATA.map(d => parseInt(d["Surface GLA"] || "0")),
        "surface-values"
    );

    initSliderDouble("loyer-min", "loyer-max",
        DATA.map(d => parseInt(d["Loyer annuel"] || "0")),
        "loyer-values"
    );

    /* Events */
    document.querySelectorAll("#sidebar-left input[type=checkbox]").forEach(chk => {
        chk.addEventListener("change", appliquerFiltres);
    });

    document.getElementById("surface-min").addEventListener("input", appliquerFiltres);
    document.getElementById("surface-max").addEventListener("input", appliquerFiltres);
    document.getElementById("loyer-min").addEventListener("input", appliquerFiltres);
    document.getElementById("loyer-max").addEventListener("input", appliquerFiltres);

    document.getElementById("btn-reset").addEventListener("click", () => {
        document.querySelectorAll("#sidebar-left input[type=checkbox]").forEach(x => x.checked = false);
        initSliderDouble("surface-min", "surface-max", DATA.map(d => parseInt(d["Surface GLA"] || "0")), "surface-values");
        initSliderDouble("loyer-min", "loyer-max", DATA.map(d => parseInt(d["Loyer annuel"] || "0")), "loyer-values");
        afficherPinsFiltrés(DATA);
    });

    /* Affichage initial */
    afficherPinsFiltrés(DATA);
}

init();

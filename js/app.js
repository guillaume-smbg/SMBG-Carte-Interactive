let DATA = [];
let map;
let markersLayer;

// =========================
// CHARGEMENT EXCEL
// =========================
async function chargerExcel() {
    const url =
        "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    DATA = XLSX.utils.sheet_to_json(sheet);

    DATA = DATA.filter((x) => x["Actif"] === "Oui");

    initialiserCarte();
    genererFiltres();
    afficherPins(DATA);
}

// =========================
// CARTE
// =========================
function initialiserCarte() {
    map = L.map("map").setView([46.6, 2.5], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
}

// =========================
// AFFICHAGE DES PINS
// =========================
function afficherPins(liste) {
    markersLayer.clearLayers();

    liste.forEach((item) => {
        const lat = parseFloat(item["Latitude"]);
        const lon = parseFloat(item["Longitude"]);
        if (!lat || !lon) return;

        let ref = item["Référence annonce"] || "";
        ref = ref.replace(/^0+/, "");

        const icon = L.divIcon({
            html: `<div class="pin"><span>${ref}</span></div>`,
            className: "pin-container",
            iconSize: [40, 40],
            iconAnchor: [20, 20],
        });

        const marker = L.marker([lat, lon], { icon }).addTo(markersLayer);

        marker.on("click", () => {
            afficherAnnonce(item);
        });
    });
}

// =========================
// PANEL DROIT
// =========================
function afficherAnnonce(item) {
    const panel = document.getElementById("panel-right");
    panel.innerHTML = "";

    let ref = item["Référence annonce"] || "";
    ref = ref.replace(/^0+/, "");

    panel.innerHTML += `
        <div class="ref-annonce">${ref}</div>
    `;

    // Google Maps
    panel.innerHTML += `
        <div class="ligne">
            <div class="cle">Adresse</div>
            <div class="val">${item["Adresse"] || "-"}</div>
        </div>
        <div class="googlemaps-btn">
            <a href="${item["Lien Google Maps"]}" target="_blank">Google Maps</a>
        </div>
    `;

    const champs = [
        ["Emplacement", "Emplacement"],
        ["Typologie", "Typologie"],
        ["Type", "Type"],
        ["Cession / Droit au bail", "Cession / Droit au bail"],
        ["Surface GLA", "Surface GLA"],
        ["Répartition surface GLA", "Répartition surface GLA"],
        ["Surface utile", "Surface utile"],
        ["Répartition surface utile", "Répartition surface utile"],
        ["Loyer annuel", "Loyer annuel"],
        ["Loyer Mensuel", "Loyer Mensuel"],
        ["Loyer €/m²", "Loyer €/m²"],
        ["Loyer variable", "Loyer variable"],
        ["Charges annuelles", "Charges annuelles"],
        ["Charges Mensuelles", "Charges Mensuelles"],
        ["Charges €/m²", "Charges €/m²"],
        ["Taxe foncière", "Taxe foncière"],
        ["Taxe foncière €/m²", "Taxe foncière €/m²"],
        ["Marketing", "Marketing"],
        ["Marketing €/m²", "Marketing €/m²"],
        ["Total (L+C+M)", "Total (L+C+M)"],
        ["Dépôt de garantie", "Dépôt de garantie"],
        ["GAPD", "GAPD"],
        ["Gestion", "Gestion"],
        ["Etat de livraison", "Etat de livraison"],
        ["Extraction", "Extraction"],
        ["Restauration", "Restauration"],
        ["Environnement Commercial", "Environnement Commercial"],
        ["Commentaires", "Commentaires"],
        ["Honoraires", "Honoraires"]
    ];

    champs.forEach(([label, key]) => {
        const val = item[key];
        if (!val || val === "-" || val === "/" || val === "0") return;

        panel.innerHTML += `
            <div class="ligne">
                <div class="cle">${label}</div>
                <div class="val">${val}</div>
            </div>
        `;
    });

    panel.scrollTop = 0;
}

// =========================
// FILTRES
// =========================
function uniques(cle) {
    const set = new Set();
    DATA.forEach((row) => {
        const v = row[cle];
        if (v && v !== "-" && v !== "/") set.add(v);
    });
    return [...set];
}

function injecterCases(id, valeurs) {
    const zone = document.getElementById(id);
    zone.innerHTML = "";

    valeurs.forEach((v) => {
        const ligne = document.createElement("div");
        ligne.className = "checkbox-line";
        ligne.innerHTML = `
            <input type="checkbox" value="${v}">
            <label>${v}</label>
        `;
        zone.appendChild(ligne);
    });

    zone.querySelectorAll("input").forEach((chk) =>
        chk.addEventListener("change", appliquerFiltres)
    );
}

function genererFiltres() {
    injecterCases("filter-regions", uniques("Région"));
    injecterCases("filter-departements", uniques("Département"));

    injecterCases("filter-emplacement", uniques("Emplacement"));
    injecterCases("filter-typologie", uniques("Typologie"));
    injecterCases("filter-extraction", uniques("Extraction"));
    injecterCases("filter-restauration", uniques("Restauration"));

    document.getElementById("reset-btn").addEventListener("click", resetFiltres);

    appliquerFiltres();
}

function cochés(id) {
    return [...document.querySelectorAll(`#${id} input:checked`)].map(
        (x) => x.value
    );
}

function appliquerFiltres() {
    const f = {
        regions: cochés("filter-regions"),
        deps: cochés("filter-departements"),

        emp: cochés("filter-emplacement"),
        typo: cochés("filter-typologie"),
        ext: cochés("filter-extraction"),
        rest: cochés("filter-restauration"),
    };

    const out = DATA.filter((row) => {
        if (f.regions.length && !f.regions.includes(row["Région"])) return false;
        if (f.deps.length && !f.deps.includes(row["Département"])) return false;

        if (f.emp.length && !f.emp.includes(row["Emplacement"])) return false;
        if (f.typo.length && !f.typo.includes(row["Typologie"])) return false;
        if (f.ext.length && !f.ext.includes(row["Extraction"])) return false;
        if (f.rest.length && !f.rest.includes(row["Restauration"])) return false;

        return true;
    });

    afficherPins(out);
}

function resetFiltres() {
    document
        .querySelectorAll("#sidebar-left input[type=checkbox]")
        .forEach((b) => (b.checked = false));

    afficherPins(DATA);
}

// =========================
// LANCEMENT
// =========================
chargerExcel();

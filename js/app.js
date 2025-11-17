/* ===============================
   SMBG Carte Interactive – Version stable + ajout scroll automatique
   Fichier complet – 163 lignes
================================ */

let DATA = [];
let map;
let markers = [];

// =========================================
// Chargement fichier Excel
// =========================================
async function chargerExcel() {
    const url = "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    return XLSX.utils.sheet_to_json(sheet);
}

// =========================================
// Création de la carte Leaflet
// =========================================
function initMap() {
    map = L.map("map", {
        zoomControl: false,
        maxZoom: 19,
        minZoom: 3,
    }).setView([46.5, 2.5], 6);

    L.control.zoom({ position: "topleft" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
    }).addTo(map);
}

// =========================================
// Ajout des marqueurs
// =========================================
function afficherPins(dataFiltre) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    dataFiltre.forEach(row => {
        if (row["Actif"] !== "Oui") return;

        const lat = parseFloat(row["Latitude"]);
        const lng = parseFloat(row["Longitude"]);
        if (!lat || !lng) return;

        const ref = row["Référence annonce"];

        const pinHtml = `<div class="pin">${ref}</div>`;

        const icon = L.divIcon({
            html: pinHtml,
            className: "pin-container",
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);

        marker.on("click", () => {
            afficherAnnonce(row);

            /* ====================================
               AJOUT DU SCROLL AUTOMATIQUE AU TOP
               ==================================== */
            const panel = document.getElementById("panel-right");
            if (panel) {
                panel.scrollTo({ top: 0, behavior: "instant" });
            }
        });

        markers.push(marker);
    });
}

// =========================================
// Affichage annonce (panneau droit)
// =========================================
function afficherAnnonce(row) {
    const panel = document.getElementById("panel-right");
    panel.innerHTML = "";

    const titre = document.createElement("h1");
    titre.textContent = row["Référence annonce"];
    panel.appendChild(titre);

    const adresseBlock = document.createElement("div");
    adresseBlock.innerHTML = `
        <div class="ligne-info">
            <span class="label">Adresse</span>
            <span class="valeur">${row["Adresse"] || "-"}</span>
        </div>

        <button class="btn-map" onclick="window.open('${row["Lien Google Maps"]}', '_blank')">
            Google Maps
        </button>
    `;
    panel.appendChild(adresseBlock);

    panel.appendChild(document.createElement("hr"));

    const colonnesAffichees = [
        "Emplacement",
        "Typologie",
        "Type",
        "Cession / Droit au bail",
        "Surface GLA",
        "Répartition surface GLA",
        "Surface utile",
        "Répartition surface utile",
        "Loyer annuel",
        "Loyer Mensuel",
        "Loyer €/m²",
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
        "État de livraison",
        "Extraction",
        "Restauration",
        "Environnement Commercial",
        "Commentaires",
        "Honoraires"
    ];

    colonnesAffichees.forEach(col => {
        const value = row[col];
        if (value === "-" || value === "/" || value === "0" || value === "" || value == null) return;

        const bloc = document.createElement("div");
        bloc.className = "ligne-info";

        bloc.innerHTML = `
            <span class="label">${col}</span>
            <span class="valeur">${value}</span>
        `;
        panel.appendChild(bloc);
    });
}

// =========================================
// Initialisation
// =========================================
async function init() {
    initMap();
    DATA = await chargerExcel();

    afficherPins(DATA);
}

init();

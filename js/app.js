// ─────────────────────────────────────────────
// SMBG – Carte, Excel, Pins, Panneau droit
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// 1) Initialisation de la carte Leaflet
// ─────────────────────────────────────────────
var map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    dragging: true,
    attributionControl: false,
    minZoom: 3,
    maxZoom: 19
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

map.setView([46.8, 2.4], 6);


// ─────────────────────────────────────────────
// 2) Lecture Excel (GitHub RAW)
// ─────────────────────────────────────────────
async function loadExcel() {
    const url =
        "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    console.log("Excel chargé :", json.length, "lignes");
    return json;
}


// ─────────────────────────────────────────────
// 3) Formatage de la référence annonce
// ─────────────────────────────────────────────
function formatReference(ref) {
    if (!ref) return "";
    ref = ref.toString().trim();
    ref = ref.replace(/^0+/, "");
    ref = ref.replace(/\.0$/, "");
    return ref;
}


// ─────────────────────────────────────────────
// 4) Formatage général des valeurs (OPTION A)
// ─────────────────────────────────────────────
function formatValue(key, val) {

    if (
        val === "" ||
        val === "-" ||
        val === "/" ||
        val === "0" ||
        val === "O" ||
        val === 0 ||
        val === 0.0
    ) return null;

    val = val.toString().trim();

    const euroFields = [
        "Loyer annuel", "Loyer Mensuel", "Loyer €/m²",
        "Loyer variable",
        "Charges annuelles", "Charges Mensuelles", "Charges €/m²",
        "Taxe foncière", "Taxe foncière €/m²",
        "Marketing", "Marketing €/m²",
        "Total (L+C+M)",
        "Dépôt de garantie"
    ];

    if (euroFields.includes(key)) {
        const num = Math.round(parseFloat(val.replace(/\s/g, "")));
        if (isNaN(num)) return val;
        return num.toLocaleString("fr-FR") + " €";
    }

    const surfaceFields = ["Surface GLA", "Surface utile"];
    if (surfaceFields.includes(key)) {
        const num = Math.round(parseFloat(val.replace(/\s/g, "")));
        if (isNaN(num)) return val;
        return num.toLocaleString("fr-FR") + " m²";
    }

    return val;
}


// ─────────────────────────────────────────────
// 5) Colonnes G → AL (dans l’ordre)
// ─────────────────────────────────────────────
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
    "Honoraires"
];


// ─────────────────────────────────────────────
// 6) Affichage du panneau droit
// ─────────────────────────────────────────────
function afficherPanneauDroit(donnees) {

    document.getElementById("sidebar-right").scrollTop = 0;

    const ref = formatReference(donnees["Référence annonce"]);
    document.getElementById("ref-annonce").innerHTML = ref || "Référence";

    let html = "";
    let mapsButton = "";

    const adresse = donnees["Adresse"] || "";
    const gmaps = (donnees["Lien Google Maps"] || "").trim();

    if (adresse && adresse !== "-" && adresse !== "/" && adresse !== "0") {
        html += `
            <div class="info-line">
                <div class="info-key">Adresse</div>
                <div class="info-value">${adresse}</div>
            </div>
        `;
        if (gmaps !== "" && gmaps !== "-" && gmaps !== "/") {
            html += `
                <button class="btn-maps" onclick="window.open('${gmaps}', '_blank')">
                    Google Maps
                </button>
            `;
        }
    }

    colonnes_info.forEach(col => {
        if (col === "Adresse") return;
        if (col === "Lien Google Maps") return;

        const val = formatValue(col, donnees[col]);
        if (val === null) return;

        html += `
            <div class="info-line">
                <div class="info-key">${col}</div>
                <div class="info-value">${val}</div>
            </div>
        `;
    });

    document.getElementById("info-lot").innerHTML = html;

    const photos = (donnees["Photos"] || donnees["AP"] || "")
        .toString()
        .split(";")
        .map(x => x.trim())
        .filter(x => x !== "" && x !== "-" && x !== "/");

    let photos_html = "";
    photos.forEach(url => {
        photos_html += `<img src="${url}" style="width:100%; margin-top:10px; border-radius:4px;">`;
    });

    document.getElementById("photos-lot").innerHTML = photos_html;
}


// ─────────────────────────────────────────────
// 7) Affichage des PINS + sélection cuivre
// ─────────────────────────────────────────────
let pinSelectionne = null;

async function afficherPins() {
    const data = await loadExcel();

    data.forEach(row => {

        if ((row["Actif"] || "").toString().trim().toLowerCase() !== "oui") return;

        const lat = parseFloat(row["Latitude"]);
        const lng = parseFloat(row["Longitude"]);
        if (!lat || !lng) return;

        const ref = formatReference(row["Référence annonce"]);

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div>${ref}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        });

        marker.on("click", () => {

            if (pinSelectionne) {
                pinSelectionne._icon.classList.remove("smbg-pin-selected");
            }

            pinSelectionne = marker;
            marker._icon.classList.add("smbg-pin-selected");

            afficherPanneauDroit(row);
        });

        marker.addTo(map);
    });
}

afficherPins();

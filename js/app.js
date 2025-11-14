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
    ref = ref.replace(/^0+/, "");         // supprime 00012 → 12
    ref = ref.replace(/\.0$/, "");        // supprime .0
    return ref;
}



// ─────────────────────────────────────────────
// 4) Formatage général des valeurs
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
    ) return null;   // signifie : NE PAS AFFICHER LA LIGNE

    // Nettoyage
    val = val.toString().trim();

    // Formatage € (loyer, charges, total...)
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
        const num = parseFloat(val.toString().replace(/\s/g, ""));
        if (isNaN(num)) return val;
        return num.toLocaleString("fr-FR") + " €";
    }

    // Formatage surfaces
    const surfaceFields = [
        "Surface GLA", "Surface utile"
    ];

    if (surfaceFields.includes(key)) {
        const num = parseFloat(val.toString().replace(/\s/g, ""));
        if (isNaN(num)) return val;
        return num.toLocaleString("fr-FR") + " m²";
    }

    return val;
}



// ─────────────────────────────────────────────
// 5) Colonnes à afficher dans le panneau droit
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

    // Titre (Référence)
    const ref = formatReference(donnees["Référence annonce"]);
    document.getElementById("ref-annonce").innerHTML = ref || "Référence";

    // Contenu (colonnes info)
    let html = "";

    colonnes_info.forEach(col => {
        const val = formatValue(col, donnees[col]);

        if (val !== null) {   // si ligne pertinente
            html += `
                <div class="info-line">
                    <strong>${col}</strong><br>
                    ${val}
                </div>
            `;
        }
    });

    // Bouton Google Maps (colonne H)
    const gm = (donnees["Lien Google Maps"] || "").trim();
    if (gm !== "" && gm !== "-" && gm !== "/" && gm !== "0") {
        html += `
            <div class="info-line">
                <button onclick="window.open('${gm}', '_blank')" 
                    style="padding:8px 14px; background:#C67B42; color:#05263d; 
                    border:none; border-radius:6px; cursor:pointer; font-weight:bold;">
                    Cliquer ici
                </button>
            </div>
        `;
    }

    document.getElementById("info-lot").innerHTML = html;



    // PHOTOS CLOUDFLARE (colonne AP)
    const photos = (donnees["Photos"] || donnees["Photo"] || donnees["Photos Cloudflare"] || donnees["AP"] || "")
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
// 7) Affichage des pins + clic → panneau droit
// ─────────────────────────────────────────────
async function afficherPins() {
    const data = await loadExcel();

    data.forEach(row => {

        // Actif = oui
        if ((row["Actif"] || "").toString().trim().toLowerCase() !== "oui") return;

        const lat = parseFloat(row["Latitude"]);
        const lng = parseFloat(row["Longitude"]);
        if (!lat || !lng) return;

        const ref = formatReference(row["Référence annonce"]);

        // Création du pin SMBG
        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div class="pin-label">${ref}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        });

        // Clic → panneau droit
        marker.on("click", () => {
            afficherPanneauDroit(row);
        });

        marker.addTo(map);
    });
}

afficherPins();



// ─────────────────────────────────────────────
// 8) Style CSS des pins (injecté)
// ─────────────────────────────────────────────
const style = document.createElement('style');
style.innerHTML = `
.smbg-pin {
    background-color: #05263d;
    color: white;
    border-radius: 50%;
    border: 2px solid white;
    width: 30px;
    height: 30px;
    text-align: center;
    line-height: 26px;
    font-size: 13px;
    font-weight: bold;
    box-shadow: 0 0 4px rgba(0,0,0,0.4);
}
`;
document.head.appendChild(style);

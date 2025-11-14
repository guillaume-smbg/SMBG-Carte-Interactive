// ─────────────────────────────────────────────
// SMBG – Carte + Chargement Excel + Pins
// ─────────────────────────────────────────────

// Initialisation de la carte Leaflet
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
//             LECTURE DE L'EXCEL GITHUB
// ─────────────────────────────────────────────

async function loadExcel() {
    const url = "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    console.log("Excel chargé :", json.length, "lignes");
    return json;
}



// ─────────────────────────────────────────────
//             FORMATTAGE RÉFÉRENCE
// ─────────────────────────────────────────────

function formatReference(ref) {
    if (!ref) return "";
    ref = ref.toString().trim();

    // supprime les 0 inutiles
    ref = ref.replace(/^0+/, "");

    if (ref.endsWith(".0")) {
        ref = ref.replace(".0", "");
    }
    return ref;
}



// ─────────────────────────────────────────────
//             AFFICHAGE DES PINS
// ─────────────────────────────────────────────

async function afficherPins() {
    const data = await loadExcel();

    data.forEach(row => {

        // filtre ACTIF = oui
        if ((row["Actif"] || "").toString().trim().toLowerCase() !== "oui") {
            return;
        }

        const lat = parseFloat(row["Latitude"]);
        const lng = parseFloat(row["Longitude"]);

        if (!lat || !lng) return;

        const ref = formatReference(row["Référence annonce"]);

        // pin bleu SMBG
        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div class="pin-label">${ref}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        });

        marker.addTo(map);
    });

    console.log("Pins affichés.");
}

afficherPins();


// ─────────────────────────────────────────────
//         STYLE DES PINS (injecté en JS)
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

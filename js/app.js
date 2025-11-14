// Initialisation de la carte
var map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    dragging: true,
    attributionControl: false,
    minZoom: 3,
    maxZoom: 19
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
map.setView([46.8, 2.4], 6);

// Lecture Excel
async function loadExcel() {
    const url = "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

// Format référence
function formatReference(r) {
    if (!r) return "";
    return r.toString().trim().replace(/^0+/, "").replace(/\.0$/, "");
}

// Format valeurs
function formatValue(key, val) {
    if (["","-","/","0","O",0,0.0].includes(val)) return null;

    const euros = [
        "Loyer annuel","Loyer Mensuel","Loyer €/m²","Loyer variable",
        "Charges annuelles","Charges Mensuelles","Charges €/m²",
        "Taxe foncière","Taxe foncière €/m²",
        "Marketing","Marketing €/m²",
        "Total (L+C+M)","Dépôt de garantie"
    ];
    const surfaces = ["Surface GLA","Surface utile"];

    val = val.toString().trim();

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

// Colonnes d'affichage
const colonnes_info = [
    "Adresse","Emplacement","Typologie","Type",
    "Cession / Droit au bail","Numéro de lot",
    "Surface GLA","Répartition surface GLA",
    "Surface utile","Répartition surface utile",
    "Loyer annuel","Loyer Mensuel","Loyer €/m²","Loyer variable",
    "Charges annuelles","Charges Mensuelles","Charges €/m²",
    "Taxe foncière","Taxe foncière €/m²",
    "Marketing","Marketing €/m²",
    "Total (L+C+M)","Dépôt de garantie","GAPD","Gestion","Etat de livraison",
    "Extraction","Restauration","Environnement Commercial","Commentaires","Honoraires"
];

// Ouvrir le panneau
function openPanel() {
    document.getElementById("sidebar-right").classList.add("open");
}

// Fermer le panneau
function closePanel() {
    document.getElementById("sidebar-right").classList.remove("open");
    if (pinSelectionne)
        pinSelectionne._icon.classList.remove("smbg-pin-selected");
    pinSelectionne = null;
}

// Affichage du panneau
function afficherPanneauDroit(d) {

    openPanel();

    const ref = formatReference(d["Référence annonce"]);
    document.getElementById("ref-annonce").innerHTML = ref;

    let html = "";

    const adresse = d["Adresse"];
    const gmaps = (d["Lien Google Maps"] || "").trim();

    if (adresse && !["-","/","0"].includes(adresse)) {
        html += `
        <div class="info-line info-line-no-border">
            <div class="info-key">Adresse</div>
            <div class="info-value">${adresse}</div>
        </div>`;

        if (gmaps && !["-","/"].includes(gmaps)) {
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
        </div>`;
    });

    document.getElementById("info-lot").innerHTML = html;

    let ph = "";
    (d["Photos"] || d["AP"] || "")
        .toString()
        .split(";")
        .map(x=>x.trim())
        .filter(x=>x!=="")
        .forEach(url=> ph += `<img src="${url}">`);

    document.getElementById("photos-lot").innerHTML =
        ph + `<div style="height:50px;"></div>`;
}

// Sélection de pin
let pinSelectionne = null;

// Affichage des pins
async function afficherPins() {
    const data = await loadExcel();

    data.forEach(d => {

        if ((d["Actif"]||"").toLowerCase().trim()!=="oui") return;

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

        marker.on("click", e => {
            L.DomEvent.stopPropagation(e);

            if (pinSelectionne)
                pinSelectionne._icon.classList.remove("smbg-pin-selected");

            pinSelectionne = marker;
            marker._icon.classList.add("smbg-pin-selected");

            afficherPanneauDroit(d);
        });

        marker.addTo(map);
    });
}

// Clic sur la carte → fermer
map.on("click", function() {
    closePanel();
});

afficherPins();

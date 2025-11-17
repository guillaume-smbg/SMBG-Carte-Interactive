// ==============================
// 1. CHARGEMENT DU FICHIER EXCEL
// ==============================
let DATA = [];
let map;
let markersLayer;

// URL GitHub du fichier Excel
const EXCEL_URL =
  "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";

// Fonction pour lire l'excel
async function chargerExcel() {
  const response = await fetch(EXCEL_URL);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  DATA = XLSX.utils.sheet_to_json(sheet);

  DATA = DATA.filter((row) => row["Actif"] && row["Actif"].toString().toLowerCase() === "oui");

  console.log("✔ Données chargées :", DATA.length, "lots actifs");

  initialiserCarte();
  genererFiltres();
  afficherPins(DATA);
}

// ==============================
// 2. INITIALISATION CARTE
// ==============================
function initialiserCarte() {
  map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView([46.6, 2.5], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

// ==============================
// 3. AFFICHAGE DES PINS
// ==============================
function afficherPins(donnees) {
  markersLayer.clearLayers();

  donnees.forEach((item) => {
    const lat = parseFloat(item["Latitude"]);
    const lon = parseFloat(item["Longitude"]);

    if (!lat || !lon) return;

    // Référence affichée
    let ref = item["Référence annonce"] || "";
    ref = ref.replace(/^0+/, "") || ref;

    const iconHtml = `
      <div class="custom-pin">
         <span>${ref}</span>
      </div>
    `;

    const icon = L.divIcon({
      html: iconHtml,
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

// ==============================
// 4. AFFICHAGE VOLET DROIT
// ==============================
function afficherAnnonce(item) {
  const panneau = document.getElementById("panel-right");

  panneau.innerHTML = `
    <div class="ref-annonce">${item["Référence annonce"].replace(/^0+/, "")}</div>

    <div class="ligne">
      <div class="cle">Adresse</div>
      <div class="val">${item["Adresse"] || "-"}</div>
    </div>

    <div class="googlemaps-btn">
      <a href="${item["Lien Google Maps"]}" target="_blank">Google Maps</a>
    </div>

    ${ligne("Emplacement", item["Emplacement"])}
    ${ligne("Typologie", item["Typologie"])}
    ${ligne("Extraction", item["Extraction"])}
    ${ligne("Restauration", item["Restauration"])}
    ${ligne("Surface (m²)", item["Surface GLA"])}
    ${ligne("Loyer annuel (€)", item["Loyer annuel"])}
    ${ligne("Loyer Mensuel (€)", item["Loyer Mensuel"])}
    ${ligne("Charges annuelles (€)", item["Charges annuelles"])}
    ${ligne("Total (L+C+M)", item["Total (L+C+M)"])}
  `;

  panneau.style.display = "block";
  panneau.scrollTop = 0;
}

function ligne(nom, valeur) {
  if (!valeur || valeur === "-" || valeur === "/" || valeur === 0 || valeur === "0") return "";
  return `
    <div class="ligne">
      <div class="cle">${nom}</div>
      <div class="val">${valeur}</div>
    </div>
  `;
}

// ==============================
// 5. FILTRES
// ==============================
function nettoyer(val) {
  if (!val) return null;
  return val.toString().trim();
}

function uniques(cle) {
  const set = new Set();
  DATA.forEach((row) => {
    const v = nettoyer(row[cle]);
    if (v && v !== "-" && v !== "/") set.add(v);
  });
  return [...set].sort();
}

function genererFiltres() {
  // Régions
  injecterCases("filter-regions", uniques("Région"));

  // Départements
  injecterCases("filter-departements", uniques("Département"));

  // Emplacement
  injecterCases("filter-emplacement", uniques("Emplacement"));

  // Typologie
  injecterCases("filter-typologie", uniques("Typologie"));

  // Extraction
  injecterCases("filter-extraction", uniques("Extraction"));

  // Restauration
  injecterCases("filter-restauration", uniques("Restauration"));

  // Sliders
  initDoubleSlider(
    "surface-slider",
    "surface-values",
    DATA.map((x) => parseInt(x["Surface GLA"] || 0))
  );

  initDoubleSlider(
    "loyer-slider",
    "loyer-values",
    DATA.map((x) => parseInt(x["Loyer annuel"] || 0))
  );

  appliquerFiltres();
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

// ==============================
// 6. DOUBLE SLIDER
// ==============================
function initDoubleSlider(idSlider, idValues, listeValeurs) {
  const min = Math.min(...listeValeurs);
  const max = Math.max(...listeValeurs);

  const slider = document.getElementById(idSlider);
  const values = document.getElementById(idValues);

  slider.min = min;
  slider.max = max;
  slider.value = max;

  values.innerHTML = `${min} — ${max}`;

  slider.addEventListener("input", () => {
    values.innerHTML = `${min} — ${slider.value}`;
    appliquerFiltres();
  });
}

// ==============================
// 7. APPLICATION FILTRES
// ==============================
function appliquerFiltres() {
  const filtres = {
    regions: cochés("filter-regions"),
    departements: cochés("filter-departements"),
    empl: cochés("filter-emplacement"),
    typo: cochés("filter-typologie"),
    extract: cochés("filter-extraction"),
    restau: cochés("filter-restauration"),
    maxSurface: parseInt(document.getElementById("surface-slider").value),
    maxLoyer: parseInt(document.getElementById("loyer-slider").value),
  };

  const resultat = DATA.filter((row) => {
    const surf = parseInt(row["Surface GLA"] || 0);
    const loy = parseInt(row["Loyer annuel"] || 0);

    if (surf > filtres.maxSurface) return false;
    if (loy > filtres.maxLoyer) return false;

    if (filtres.regions.length && !filtres.regions.includes(row["Région"])) return false;
    if (filtres.departements.length && !filtres.departements.includes(row["Département"]))
      return false;

    if (filtres.empl.length && !filtres.empl.includes(row["Emplacement"])) return false;
    if (filtres.typo.length && !filtres.typo.includes(row["Typologie"])) return false;
    if (filtres.extract.length && !filtres.extract.includes(row["Extraction"])) return false;
    if (filtres.restau.length && !filtres.restau.includes(row["Restauration"])) return false;

    return true;
  });

  afficherPins(resultat);
}

function cochés(id) {
  return [...document.querySelectorAll(`#${id} input:checked`)].map((x) => x.value);
}

// ==============================
// 8. LANCEMENT
// ==============================
chargerExcel();

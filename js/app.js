/* ========================================================================= */
/*  SMBG CARTE INTERACTIVE – VERSION SAUVEGARDÉE + PARAMÈTRES AJOUTÉS       */
/* ========================================================================= */


/* -------------------------------------------------------------------------- */
/*  FONCTIONS UTILITAIRES                                                     */
/* -------------------------------------------------------------------------- */

function valeursUniques(data, colonne) {
    return [...new Set(
        data
            .map(x => (x[colonne] || "").toString().trim())
            .filter(v => v && !["-", "/", "0", "O"].includes(v))
    )].sort();
}

function genererCases(liste, containerId, cssClass) {
    const box = document.getElementById(containerId);
    let html = "";

    liste.forEach(v => {
        html += `
        <div class="checkbox-item">
            <input type="checkbox" class="${cssClass}" value="${v}">
            <label>${v}</label>
        </div>`;
    });

    box.innerHTML = html;
}


/* -------------------------------------------------------------------------- */
/*  LECTURE EXCEL                                                             */
/* -------------------------------------------------------------------------- */

async function chargerFichierExcel() {
    const url =
        "https://raw.githubusercontent.com/guillaume-smbg/SMBG-Carte-Interactive/main/Liste%20des%20lots.xlsx";

    const res = await fetch(url);
    const buf = await res.arrayBuffer();

    const workbook = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = workbook.Sheets[workbook.SheetNames[0]];

    return XLSX.utils.sheet_to_json(ws, {
        defval: "",
        raw: false,
        blankrows: false,
    });
}


/* -------------------------------------------------------------------------- */
/*  AFFICHAGE DES PINS (VERSION SAUVEGARDÉE : NO CHANGE)                      */
/* -------------------------------------------------------------------------- */

function afficherPins(map, data) {
    // ⚠ Version d’origine intacte — on n'y touche pas tant que tu ne demandes pas  
    // Tu n'avais pas mis de logique de filtrage ici dans la version sauvegardée.
    // On laisse donc tel quel pour l’instant.
}


/* -------------------------------------------------------------------------- */
/*  INITIALISATION PRINCIPALE                                                 */
/* -------------------------------------------------------------------------- */

async function initCarte() {

    /* --------------------------------------------------------------- */
    /* 1) CHARGER EXCEL                                                */
    /* --------------------------------------------------------------- */
    const data = await chargerFichierExcel();


    /* --------------------------------------------------------------- */
    /* 2) AJOUTER LES PARAMÈTRES DEMANDÉS                              */
    /* --------------------------------------------------------------- */

    // ✔ EMPLACEMENT
    genererCases(
        valeursUniques(data, "Emplacement"),
        "filter-emplacement",
        "chk-emplacement"
    );

    // ✔ TYPOLOGIE
    genererCases(
        valeursUniques(data, "Typologie"),
        "filter-typologie",
        "chk-typologie"
    );

    // ✔ EXTRACTION
    genererCases(
        valeursUniques(data, "Extraction"),
        "filter-extraction",
        "chk-extraction"
    );

    // ✔ RESTAURATION
    genererCases(
        valeursUniques(data, "Restauration"),
        "filter-restauration",
        "chk-restauration"
    );


    /* --------------------------------------------------------------- */
    /* 3) RECONSTRUIRE LA CARTE (VERSION SAUVEGARDÉE)                  */
    /* --------------------------------------------------------------- */
    const map = L.map("map", {
        zoomControl: true,
        scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
    }).addTo(map);

    // Position initiale France
    map.setView([46.8, 2.4], 6);

    // Version sauvegardée : pas encore de pins filtrés
    afficherPins(map, data);
}


// Lancer l’application
initCarte();

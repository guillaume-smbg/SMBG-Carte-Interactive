/* ============================================================
   SMBG – Carte interactive (VERSION FINALISÉE)
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
   2. CHARGEMENT EXCEL
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
   CONSTRUCTION RÉGIONS → DÉPARTEMENTS
   ============================================================ */
function construireRegionsDepartements() {

    const cont = document.getElementById("filter-regions-hierarchie");
    cont.innerHTML = "";

    let regions = {};

    DATA.forEach(d => {
        const reg = (d["Région"] || "").trim();
        const depNom = (d["Département"] || "").trim();
        const depNum = (d["N° Département"] || "").toString().trim();

        if (!reg) return;
        if (!regions[reg]) regions[reg] = {};

        if (depNom && depNum) {
            regions[reg][depNom] = depNum; // { "Charente": "16" }
        }
    });

    Object.keys(regions).sort().forEach(reg => {

        const idR = "reg-" + reg.replace(/\s+/g, "-");

        const div = document.createElement("div");
        div.className = "region-item";
        div.innerHTML = `
            <div class="checkbox-line">
                <input type="checkbox" id="${idR}" class="region-checkbox" data-region="${reg}">
                <label for="${idR}">${reg}</label>
            </div>
            <div class="departements-container" data-parent="${reg}"></div>
        `;
        cont.appendChild(div);

        const depContainer = div.querySelector(".departements-container");

        Object.keys(regions[reg]).sort().forEach(depNom => {
            const num = regions[reg][depNom];
            const idD = "dep-" + num;

            const el = document.createElement("div");
            el.className = "departement-item checkbox-line";

            el.innerHTML = `
                <input type="checkbox" id="${idD}"
                       class="departement-checkbox"
                       data-dep="${num}" data-region="${reg}">
                <label for="${idD}">${depNom} (${num})</label>
            `;

            depContainer.appendChild(el);
        });
    });

    activerRegionDepartements();
}


/* ============================================================
   COMPORTEMENT RÉGIONS / DÉPARTEMENTS
   ============================================================ */
function activerRegionDepartements() {

    document.querySelectorAll(".region-checkbox").forEach(box => {
        box.addEventListener("change", function () {

            const reg = this.dataset.region;
            const bloc = document.querySelector(
                `.departements-container[data-parent="${reg}"]`
            );

            if (!bloc) return;

            if (this.checked)
                bloc.style.display = "block";
            else {
                bloc.style.display = "none";
                bloc.querySelectorAll("input").forEach(i => i.checked = false);
            }

            appliquerFiltres();
        });
    });

    document.querySelectorAll(".departement-checkbox").forEach(dep => {
        dep.addEventListener("change", appliquerFiltres);
    });
}


/* ============================================================
   PINS
   ============================================================ */
let markers = [];
let pinSelectionne = null;

function afficherPinsFiltrés(data) {

    markers.forEach(m => map.removeLayer(m));
    markers = [];

    pinSelectionne = null;

    data.forEach(d => {

        if ((d["Actif"] || "").toLowerCase() !== "oui") return;

        const lat = parseFloat(d["Latitude"]);
        const lng = parseFloat(d["Longitude"]);
        if (!lat || !lng) return;

        const ref = (d["Référence annonce"] + "")
            .replace(/\.0$/, "")
            .trim();

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: "smbg-pin",
                html: `<div>${ref}</div>`,
                iconSize: [30,30],
                iconAnchor: [15,15]
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
   FILTRES COMBINES
   ============================================================ */
function appliquerFiltres() {

    const fr = [...document.querySelectorAll(".region-checkbox:checked")]
        .map(x => x.dataset.region);

    const fd = [...document.querySelectorAll(".departement-checkbox:checked")]
        .map(x => x.dataset.dep);

    const fe = valeursCochées("filter-emplacement");
    const ft = valeursCochées("filter-typologie");
    const fx = valeursCochées("filter-extraction");
    const frs = valeursCochées("filter-restauration");

    const bigSurf = document.getElementById("checkbox-grand-surface").checked;
    const bigLoy  = document.getElementById("checkbox-grand-loyer").checked;

    const surfMin = parseInt(document.getElementById("surface-min").value);
    const surfMax = parseInt(document.getElementById("surface-max").value);

    const loyMin = parseInt(document.getElementById("loyer-min").value);
    const loyMax = parseInt(document.getElementById("loyer-max").value);

    const OUT = DATA.filter(d => {

        const reg = (d["Région"] || "").trim();
        const dep = (d["N° Département"] || "").toString().trim();

        if (fr.length && !fr.includes(reg)) return false;
        if (fd.length && !fd.includes(dep)) return false;

        if (fe.length && !fe.includes(d["Emplacement"])) return false;
        if (ft.length && !ft.includes(d["Typologie"])) return false;
        if (fx.length && !fx.includes(d["Extraction"])) return false;
        if (frs.length && !frs.includes(d["Restauration"])) return false;

        const surf = parseInt(d["Surface GLA"] || 0);
        const loy  = parseInt(d["Loyer annuel"] || 0);

        if (surf > 2000 && !bigSurf) return false;
        if (loy  > 200000 && !bigLoy) return false;

        if (surf <= 2000 && (surf < surfMin || surf > surfMax)) return false;
        if (loy  <= 200000 && (loy < loyMin  || loy > loyMax))  return false;

        return true;
    });

    afficherPinsFiltrés(OUT);
}


/* ============================================================
   INIT
   ============================================================ */
async function init() {

    DATA = await loadExcel();

    construireRegionsDepartements();

    remplirCheckbox("filter-emplacement", valeursUniques("Emplacement"));
    remplirCheckbox("filter-typologie", valeursUniques("Typologie"));
    remplirCheckbox("filter-extraction", valeursUniques("Extraction"));
    remplirCheckbox("filter-restauration", valeursUniques("Restauration"));

    initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"]||0)));
    initSliderLoyer(DATA.map(x => parseInt(x["Loyer annuel"]||0)));

    document.querySelectorAll("#sidebar-left input")
        .forEach(el => el.addEventListener("input", appliquerFiltres));

    document.getElementById("btn-reset").addEventListener("click", () => {

        document.querySelectorAll("#sidebar-left input[type=checkbox]")
            .forEach(x => x.checked = false);

        document.getElementById("checkbox-grand-surface").checked = true;
        document.getElementById("checkbox-grand-loyer").checked   = true;

        initSliderSurface(DATA.map(x => parseInt(x["Surface GLA"]||0)));
        initSliderLoyer(DATA.map(x => parseInt(x["Loyer annuel"]||0)));

        afficherPinsFiltrés(DATA);
    });

    afficherPinsFiltrés(DATA);
}

init();

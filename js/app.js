// ─────────────────────────────────────────────
// SMBG – Carte Leaflet (Étape A : carte seule)
// ─────────────────────────────────────────────

// Création de la carte au centre
var map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
    dragging: true,
    minZoom: 3,
    maxZoom: 19,
    attributionControl: false
});

// Fond OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

// Vue initiale centrée sur la France
map.setView([46.8, 2.4], 6);

// Optionnel : empêche la carte de dépasser les colonnes
map.invalidateSize(true);
window.addEventListener('resize', () => {
    map.invalidateSize();
});

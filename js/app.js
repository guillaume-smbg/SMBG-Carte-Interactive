// ─────────────────────────────────────────────
// INITIALISATION LEAFLET - CARTE SMBG
// ─────────────────────────────────────────────

// Création de la carte dans la zone #map
var map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: true
});

// Fond OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

// Zoom initial sur la France
map.setView([46.8, 2.4], 6);

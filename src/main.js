import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorTileLayer from "ol/layer/VectorTile";
import { XYZ, VectorTile } from "ol/source";
import { createXYZ } from "ol/tilegrid"
import { MVT } from "ol/format";
import ClusterSource from 'ol/source/Cluster.js';
import OSM from 'ol/source/OSM.js';
import { fromLonLat } from 'ol/proj.js';
import Overlay from "ol/Overlay";
import { transform } from "ol/proj";
import { Style, Circle, Fill, Stroke, Text } from 'ol/style.js';

import './style.css';
import 'ol/ol.css';

let lastUf = ""

function populateFilters(data) {
  const municipios = new Set();
  const ufs = new Set();

  data.features.forEach((feature) => {
    municipios.add(feature.properties.municipio);
    ufs.add(feature.properties.uf);
  });

  const municipioSelect = document.getElementById('municipio');
  municipioSelect.innerHTML = '<option value="">All</option>';
  const municipioArray = Array.from(municipios)
  municipioArray.sort()
  municipioArray.forEach((municipio) => {
    const option = document.createElement('option');
    option.value = municipio;
    option.textContent = municipio;
    municipioSelect.appendChild(option);
  });
}

const citySelect = document.getElementById("city");
const ufSelect = document.getElementById("uf");

function updateBigNumbers(totalClients, totalMarket) {
  document.getElementById("totalClients").textContent =
    totalClients.toLocaleString();
  document.getElementById("totalMarket").textContent = totalMarket.toLocaleString();
}


function fetchBigNumbers(uf, city) {
  fetch(`http://ns5004901.ip-51-222-153.net/api/laquila-stats?uf=${uf}&city=${city}`)
    .then((response) => response.json())
    .then((data) => {
      updateBigNumbers(data.data.totalClients, data.data.totalMarket);
    })
    .catch((error) => console.error("Error fetching big numbers:", error));
}

function applyFilters() {
  let selectedMunicipio = document.getElementById('city').value;
  const selectedUF = document.getElementById('uf').value;
  if (selectedUF !== lastUf) {
    citySelect.value = ""
    selectedMunicipio= ""
    lastUf = selectedUF
  }
  if (selectedUF && !selectedMunicipio) {
    citySelect.disabled = false;
    citySelect.innerHTML = '<option value="">Todos os muncípios</option>'
    try {
      fetch(
        `http://ns5004901.ip-51-222-153.net/api/municipios?uf=${selectedUF}&useStandard=true`
      )
        .then((response) => {
          return response.json();
        })
        .then((data) => {
          const cities = data.municipios;
          cities.forEach((city) => {
            const option = document.createElement("option");
            option.value = city;
            option.textContent = city;
            citySelect.appendChild(option);
          });

          citySelect.disabled = false;
        })
        .catch((error) => console.error("Error fetching data:", error));
    } catch (error) {
      console.error("Error fetching cities:", error);
      citySelect.disabled = true;
    }
  } else if (!selectedMunicipio) {
    citySelect.disabled = true
  }

  fetchBigNumbers(selectedUF, selectedMunicipio)
  addMunicipiosLayer(selectedUF, selectedMunicipio)
  addCompaniesLayer(selectedUF, selectedMunicipio)
}

// Create map
const map = new Map({
  target: 'map',
  maxTilesLoading: 32,
  layers: [
    new TileLayer({
      source: new OSM(),
    }),
  ],
  view: new View({
    center: transform([-55.428, -12.64], "EPSG:4326", "EPSG:3857"),
    constrainResolution: true,
    zoom: 5,
  }),
  loadTilesWhileAnimating: true,
  loadTilesWhileInteracting: true,
});

let companiesVectorTileLayer;
let municipiosVectorTileLayer;

function addMunicipiosLayer(uf, city) {
  if (municipiosVectorTileLayer) {
    map.removeLayer(municipiosVectorTileLayer);
  }

  const municipiosSource = new VectorTile({
    format: new MVT(),
    url: `http://ns5004901.ip-51-222-153.net/api/municipios/tiles/{z}/{x}/{y}.pbf?municipio=${city}&uf=${uf}`,
    overlaps: false,
  });

  const cityStyle = new Style({
    stroke: new Stroke({
      color: "rgba(0, 128, 128, 0.8)",
      width: 3.5,
    }),
  });

  municipiosVectorTileLayer = new VectorTileLayer({
    source: municipiosSource,
    style: () => {
      return cityStyle
    },
  });

  map.addLayer(municipiosVectorTileLayer);
}


const clientCompanyStyle = new Style({
  image: new Circle({
    radius: 5,
    fill: new Fill({
      color:  "orange" , 
    }),
  }),
});

const marketCompanyStyle = new Style({
  image: new Circle({
    radius: 5,
    fill: new Fill({
      color:  "blue" , 
    }),
  }),
});

function addCompaniesLayer(uf, city) {
  if (companiesVectorTileLayer) {
    map.removeLayer(companiesVectorTileLayer);
  }

  const companiesSource = new VectorTile({
    format: new MVT(),
    url: `http://ns5004901.ip-51-222-153.net/api/laquila/tiles/{z}/{x}/{y}.pbf?municipio=${city}&uf=${uf}`,
    overlaps: false,
    tileGrid: new createXYZ({
      maxZoom: 14,
      minZoom: 5,
    })
  });
  const simplifyResolution = 50;
  companiesSource.set('format', new MVT({ featureProjection: 'EPSG:3857', simplify: simplifyResolution }));
  companiesVectorTileLayer = new VectorTileLayer({
    source: companiesSource,
    style: (feature) => {
      return feature.getProperties().tipo === "cliente" ? clientCompanyStyle : marketCompanyStyle
    },
  });

  map.addLayer(companiesVectorTileLayer);
}

function searchCNPJ(cnpj, callback) {
  const apiUrl = `http://ns5004901.ip-51-222-153.net/api/laquila/${cnpj}`;

  fetch(apiUrl)
    .then((response) => response.json())
    .then((data) => {
      callback(data);
    })
    .catch((error) => console.error("Error fetching data:", error));
}

const popupContainer = document.getElementById("popup");
const popupContent = document.getElementById("popup-content");
const popupCloser = document.getElementById("popup-closer");

const popupOverlay = new Overlay({
  element: popupContainer,
  autoPan: true,
  autoPanAnimation: {
    duration: 250,
  },
})

map.addOverlay(popupOverlay);

popupCloser.onclick = function () {
  popupOverlay.setPosition(undefined);
  popupCloser.blur();
  return false;
};

map.on("singleclick", function (evt) {
  map.removeOverlay(popupOverlay);
  const coordinate = evt.coordinate;
  const feature = map.forEachFeatureAtPixel(evt.pixel, function (feat) {
    return feat;
  });

  if (feature) {
    const properties = feature.getProperties();
    searchCNPJ(properties.cnpj, (data) => {
      popupContent.innerHTML = `<p><strong>CNPJ:</strong> ${properties.cnpj}</p>
       <p><strong>Razão Social:</strong> ${data.razaoSocial}</p>
       ${data.nomeFantasia ? (`<p><strong>Nome Fantasia: </strong>` + data.nomeFantasia + `</p>`) : ""}
       <p><strong>Município:</strong> ${data.municipio}</p>
       <p><strong>UF:</strong> ${data.uf}</p>
       <p><strong>Situação:</strong> ${properties.tipo.toUpperCase()}</p>`;
      popupOverlay.setPosition(coordinate);
      map.addOverlay(popupOverlay);
    });
  } else {
    map.removeOverlay(popupOverlay);
  }
});

addMunicipiosLayer("", "")
addCompaniesLayer("", "")
fetchBigNumbers("", "")
// Add event listeners
document.getElementById('city').addEventListener('change', applyFilters);
document.getElementById('uf').addEventListener('change', applyFilters);

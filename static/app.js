let resultsStates;

const colors = {
    republicans: ['#D61822', '#F7646C', '#FFA8AE', '#FFD6D9'],
    democrats: ['#0A3B7E', '#358DDE', '#7CBEF2', '#B9DCF8'],
    nodata: '#DEDEDE'
}

maptilersdk.config.apiKey = "Ku9I4tiWbXtGrb3Jk2JQ"

const map = new maptilersdk.Map({
    container: 'map', // container's id or the HTML element to render the map
    style: maptilersdk.MapStyle.DATAVIZ.LIGHT,
    center: [-96.05, 36.79], // starting position [lng, lat]
    zoom: 3.25, // starting zoom
});

const popup = new maptilersdk.Popup({ closeOnClick: false }).setLngLat([0, 0]);

map.on('load', async () => {
    map.addSource('countries', {
        type: 'vector',
        url: `https://api.maptiler.com/tiles/countries/tiles.json`
    });

    const firstSymbolId = findFirstSymbolLayer(map);

    map.addLayer(
        {
            'id': 'states',
            'source': 'countries',
            'source-layer': 'administrative',
            'type': 'fill',
            'maxzoom': 7,
            'filter': [
                'all',
                ['==', 'level', 1],
                ['==', 'level_0', 'US']
            ],
            'paint': {
                'fill-opacity': 1,
                'fill-outline-color': '#000',
                'fill-color': getColorByPartyAndPertentage(),
            }
        },
        firstSymbolId
    );

    map.addLayer({
        'id': 'states-highlight',
        'type': 'line',
        'source': 'countries',
        'source-layer': 'administrative',
        'filter': ['==', 'level', 1],
        'layout': {},
        'paint': {
            'line-color': '#FFFF00',
            'line-width': 2
        },
        'filter': ['==', 'name', ''] // Start with no state selected
    });

    resultsStates = await getStatesResults(selectedFile);

    map.on('sourcedata', getSourceData);

    map.on('move', (e) => {
        updatePolygonFeatures();
    });

    // just before the map enters an "idle" state.
    map.on('idle', function () {
        updatePolygonFeatures();
    });

    map.on('mousemove', 'states', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['states'] });
        if (features.length) {
            const stateName = features[0].properties.name;

            map.setFilter('states-highlight', ['==', 'name', stateName]);
            showInfo(e, features[0], map, popup);
        }
    });

    map.on('mouseleave', 'states', () => {
        popup.remove();  // Assuming popup is a Mapbox GL JS Popup
        map.setFilter('states-highlight', ['==', 'name', '']);
    });

});

function findFirstSymbolLayer() {
    const layers = map.getStyle().layers;
    let firstSymbolId;
    for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') {
            firstSymbolId = layers[i].id;
            break;
        }
    }
    return firstSymbolId;
}

async function getStatesResults(selectedFile) {
    console.log("Updating map..")
    console.log(`/data/${selectedFile}`)
    const response = await fetch(`/get_file_contents?file_name=${selectedFile}`);
    const data = await response.json();
    return data;
}

async function updateMapWithNewData(selectedFile) {   
    resultsStates = await getStatesResults(selectedFile);

    await updatePolygonFeatures();

    map.triggerRepaint();
    map.redraw();
}

async function getSourceData(e) {
    if (e.isSourceLoaded && e.dataType === 'source') {
        const { sourceId } = e;
        // Do something when the source has finished loading
        if (sourceId === 'countries') {
            map.off('sourcedata', getSourceData);
            await updatePolygonFeatures();
            map.redraw();
            //map.panBy([0,0]);
        }
    }
}

async function updatePolygonFeatures() {
    const features = map.queryRenderedFeatures({ layers: ['states'] });
    const filteredFeatutes = filterFeaturesNoFeatureState(features, map);
    filteredFeatutes.forEach(item => {
        const resultsData = resultsStates;
        const source = {
            source: item.source,
            sourceLayer: item.sourceLayer
        }
        addResultToFeature(item, resultsData, source, map);
    });
}

function filterFeaturesNoFeatureState(features, map) {
    const noStateFeatures = features.filter(item => {
        const fState = map.getFeatureState({
            source: item.source,
            sourceLayer: item.sourceLayer,
            id: item.id,
        });
        return !Object.keys(fState).length
    });
    return noStateFeatures
}

function addResultToFeature(feature, resultsData, source, map) {
    const code = getCode(feature);
    const result = resultsData[code];
    if (!result) return;
    const { winner, winner_percentage, loser_percentage } = getWinner(result);
    if (source) {
        const fState = map.getFeatureState({
            ...source,
            id: feature.id,
        });
        if (!fState?.winner) {
            map.setFeatureState({
                ...source,
                id: feature.id,
            }, {
                totalvotes: result.totalvotes,
                trump: result.trump,
                harris: result.harris,
                winner: winner,
                winner_percentage: winner_percentage,
                loser_percentage: loser_percentage
            });
        }
    } else {
        const { properties } = feature;
        feature.properties = {
            ...properties,
            totalvotes: result.totalvotes,
            trump: result.trump,
            harris: result.harris,
            winner: winner,
            winner_percentage: winner_percentage,
            loser_percentage: loser_percentage
        }
    }
}

function getCode(feature) {
    if (feature?.properties?.ste_stusps_code || feature?.properties?.coty_code) {
        return feature?.properties?.ste_stusps_code || feature?.properties?.coty_code.replace(/^\(1:|\)$/g, "").replace(/^0+/, "");
    } else {
        return feature.properties.code.replace('US-', '').replace(/^0+/, "");
    }
}

function getWinner(result) {
    if (!result) return { winner: '', winner_percentage: 0 };
    if (parseFloat(result.trump) > parseFloat(result.harris)) {
        return {
            winner: 'trump',
            winner_percentage: percentage(result.trump, result.totalvotes),
            loser_percentage: percentage(result.harris, result.totalvotes)
        }
    } else {
        return {
            winner: 'harris',
            winner_percentage: percentage(result.harris, result.totalvotes),
            loser_percentage: percentage(result.trump, result.totalvotes)
        }
    }
}

function percentage(partialValue, totalValue) {
    return parseFloat((100 * partialValue) / totalValue.toFixed(2));
}

function getColorByPartyAndPertentage() {
    return ['case',
        ['==', ['feature-state', 'winner'], 'harris'],
        ['case',
            ['>=', ['feature-state', 'winner_percentage'], 56],
            colors.democrats[0],
            ['>=', ['feature-state', 'winner_percentage'], 54],
            colors.democrats[1],
            ['>=', ['feature-state', 'winner_percentage'], 52],
            colors.democrats[2],
            colors.democrats[3]
        ],
        ['==', ['feature-state', 'winner'], 'trump'],
        ['case',
            ['>=', ['feature-state', 'winner_percentage'], 56],
            colors.republicans[0],
            ['>=', ['feature-state', 'winner_percentage'], 54],
            colors.republicans[1],
            ['>=', ['feature-state', 'winner_percentage'], 52],
            colors.republicans[2],
            colors.republicans[3]
        ],
        colors.nodata
    ];
}

function showInfo(e, feature, map, popup) {
    const { lng, lat } = e.lngLat;
    const info = [];
    if (feature?.properties?.name) {
        info.push(`<h2 class="pop-header">${feature.properties.name}</h2>`);
    }
    const { state } = feature;
    if (state.winner === 'trump') {
        state.loser_percentage = percentage(state.harris, state.totalvotes);
    } else {
        state.loser_percentage = percentage(state.trump, state.totalvotes);
    }
    state.margin = state.winner_percentage - state.loser_percentage;
    const data = {};
    if (state.winner === 'trump') {
        data.winner = {
            name: 'Donald Trump',
            votes: state.trump,
            pct: state.winner_percentage
        }
        data.loser = {
            name: 'Kamala Harris',
            votes: state.harris,
            pct: state.loser_percentage
        }
    } else {
        data.winner = {
            name: 'Kamala Harris',
            votes: state.harris,
            pct: state.winner_percentage
        }
        data.loser = {
            name: 'Donald Trump',
            votes: state.trump,
            pct: state.loser_percentage
        }
    }
    data.margin = state.margin;

    info.push(`<div class="chart"></div>`);

    info.push(`
        <div class='popup-wrapper'>
            <div class='popup-header'>
                <p>10 Electoral Votes</p>
            </div>

            <div class='trump' style='width:${state.winner == 'trump' ? (state.margin / 2 + 50).toFixed(2) : (100 - (state.margin / 2 + 50)).toFixed(2)}%;'>
                <p>${state.winner == 'trump' ? (state.margin / 2 + 50).toFixed(2) : (100 - (state.margin / 2 + 50)).toFixed(2)}%</p>
                <p>Trump</p>
            </div>

            <div class='harris' style='width:${state.winner == 'harris' ? (state.margin / 2 + 50).toFixed(2) : (100 - (state.margin / 2 + 50)).toFixed(2)}%'>
                <p>${state.winner == 'harris' ? (state.margin / 2 + 50).toFixed(2) : (100 - (state.margin / 2 + 50)).toFixed(2)}%</p>
                <p>Harris</p>
            </div>
        </div>
    `)

    const html = info.join("");

    popup.setLngLat([lng, lat])
        .setHTML(html)
        .addTo(map);
}

fetch('/get_filenames')
    .then(response => response.json())
    .then(data => {
        const dropdown = document.getElementById('fileDropdown');
        selectedFile = data[0]
        data.forEach(filename => {
            const option = document.createElement('option');
            option.value = filename;
            option.textContent = filename;
            dropdown.appendChild(option);
        });

        // Trigger the map update for the initially selected file
        if (selectedFile) {
            updateMapWithNewData(selectedFile).catch(error => console.error('Error fetching initial data:', error));
        }
    })
    .catch(error => console.error('Error fetching filenames:', error));


// Listen for dropdown change and update data
document.getElementById('fileDropdown').addEventListener('change', async function() {
    selectedFile = this.value;

    if (selectedFile) {
        try {
            await updateMapWithNewData(selectedFile);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    }
});
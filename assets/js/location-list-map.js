window.oasis = window.oasis || {};

(function() {

	var map;
	function createMap() {

		if (document.getElementById('map') && 'mapboxgl' in window && mapboxgl.supported()) {

			mapboxgl.accessToken = MAP_ACCESS_TOKEN;

			var container = document.getElementById('map');
			container.classList.add('active');

			map = new mapboxgl.Map({
				container: container,
				style: MAP_STYLE,
				maxBounds: MAP_BOUNDS
			});

			map.on('load', function() {

				// Add a zoom control
				map.addControl(new mapboxgl.NavigationControl( { position: 'top-right' } )); // position is optional

				// Draw food desert census tracts
				if (window.oasis.getParameterByName('deserts') === '1') {
					map.addSource('Food Deserts', FOOD_DESERTS_SOURCE);
					map.addLayer(FOOD_DESERTS_LAYER);
				}

				map.on("dragend", updateMarkers);
				map.on("zoomend", updateMarkers);
			});
		}
	}

	var centerMarker;
	function updateMarkers() {
		var center = map.getCenter().toArray();
		var longitude = center[0];
		var latitude  = center[1];

		var maxZoom = 14;
		var minZoom = 7.5;
		var zoomLevels = maxZoom - minZoom;
		itemsPerPage = (locations.length / zoomLevels) * (zoomLevels - (map.getZoom() >= zoomLevels + 1 ? map.getZoom() - zoomLevels : 1));
		itemsPerPage = Math.round(itemsPerPage);
		if (map.getZoom() > maxZoom) itemsPerPage = 20;
		if (itemsPerPage < 20) itemsPerPage = 20;
		if (itemsPerPage > 50) itemsPerPage = 50;
		// console.log('map.getZoom(): ' + map.getZoom());
		// console.log('itemsPerPage: ' + itemsPerPage);

		var userLocation = window.oasis.getLastUserLocation();

		if (!userLocation) return;

		var list = window.oasis.sortByClosest(latitude, longitude, userLocation.latitude, userLocation.longitude);

		removeAllMarkers();

		window.oasis.addMarkers(list);
		window.oasis.addListItems(list);

		/*
		var coordinates = [longitude, latitude];
		if (!centerMarker) {
			var template = document.getElementById('you-are-here-template');

			var marker = document.createElement('div');
			marker.innerHTML = template.innerHTML;
			centerMarker = new mapboxgl.Marker(marker);
			centerMarker.setLngLat(coordinates).addTo(map);
		} else {
			centerMarker.setLngLat(coordinates);
		}
		*/

	}

	function addYouAreHere(coordinates) {

		var template = document.getElementById('you-are-here-template');

		var marker = document.createElement('div');
		marker.innerHTML = template.innerHTML;

		return new mapboxgl.Marker(marker)
		.setLngLat(coordinates)
		.addTo(map);
	}

	var markerResetMethods = [];
	function resetMarkers() {
		for (var index = 0; index < markerResetMethods.length; index++) {
			markerResetMethods[index]();
		}
	}

	function createMarker(options, data) {
		var marker = document.createElement('div');
		marker.className = 'marker ' + options.className;
		var span = document.createElement('span');
		span.textContent = data.name;
		span.className = 'marker-label';
		marker.appendChild(span);
		return marker;
	}

	function updateMarkerLabels() {
		if (map.getZoom() > 14) { // Zoomed In
			document.body.classList.remove('hidden-marker-labels');
		} else { // Zoomed Out
			document.body.classList.add('hidden-marker-labels');
		}
	}

	function showLocationSummary(location) {
		var item = window.oasis.createListItem(location, 'div', true);
		var summary = document.getElementById('map-location-summary');
		summary.innerHTML = '';
		summary.appendChild(item);
		document.body.classList.add('has-map-location-summary');
	}

	function updateCurrentMarker(newMarker) {
		if (currentMarker) currentMarker.classList.remove('active');
		currentMarker = newMarker;
		currentMarker.classList.add('active');
	}

	var markers = [];
	function addMarker(location, coordinates) {
		var coordinates = [
			location.longitude,
			location.latitude
		];

		var options = MARKER_OPTIONS[location.category];

		if (!options) {
			options = {
				// Specify a class name we can refer to in CSS.
				className: '',
				// Set marker width and height
				iconSize: [30, 46],
				iconAnchor: [15, 40],
				popupAnchor: [0, -23]
			}
		}

		var marker = createMarker(options, location);

		new mapboxgl.Marker(marker)
			.setLngLat(coordinates)
			.addTo(map);

		marker.addEventListener('click', function(e) {
			updateCurrentMarker(marker);
			showLocationSummary(location);
		});

		markerResetMethods.push(function() {
			var icon = icons[location.category];
			marker.setIcon(icon);
		});

		markers.push(marker);

		return coordinates;
	}
	function removeAllMarkers() {
		for (var index = 0; index < markers.length; index++) {
			markers[index].remove();
		}
	}

	var currentMarker;
	var initializingMarkers = true;
	function addMarkers(locations, userLocation) {
		if (!map) return;

		var limit = window.oasis.getParameterByName('limit') || itemsPerPage;
		if (!limit) {
			limit = 10;
		}
		limit = Number(limit);
		var start = window.listOffset || 0;
		limit += start;
		if (limit >= locations.length) limit = locations.length;
		var bounds = [];

		document.body.classList.add('hidden-marker-labels');

		// Loop through the locations
		for (var index = start; index < locations.length && index < limit; index++) {

			// Add a marker
			var coordinates = addMarker(locations[index]);

			bounds.push(coordinates);
		}

		if (userLocation && userLocation.latitude && userLocation.longitude) {
			// Add a “You are here” marker
			var coordinates = [userLocation.longitude, userLocation.latitude];
			addYouAreHere(coordinates);
			bounds.unshift(coordinates);
		}

		// Increase the size of the viewport to fit the markers
		if (initializingMarkers) fitMarkers(bounds);

		// Show the marker labels
		setTimeout(function() {
			updateMarkerLabels();
		}, 1000);
		if (initializingMarkers) map.on('zoomend', updateMarkerLabels);

		// Deselect the current marker if the map is pressed
		if (initializingMarkers) handleMapPress();

		initializingMarkers = false;
	}

	function fitMarkers(bounds) {

		map.setZoom(15);

		var mapLngLatBounds = new mapboxgl.LngLatBounds();

		var limit = 10;
		for (var index = 0; index < limit && index < bounds.length; index++) {
			mapLngLatBounds.extend(bounds[index]);
		}

		map.fitBounds(mapLngLatBounds, { padding: 10, easing: function() { return 1; } });
		/*
		setTimeout(function() {
			map.setCenter([longitude, latitude]);
		}, 100);
		*/
	}

	function handleMapPress() {
		var mapContainer = document.getElementById('map');
		mapContainer.addEventListener('click', function(e){
			var target = e.target.getAttribute('class');
			if (target === 'mapboxgl-canvas') {
				if (currentMarker) currentMarker.classList.remove('active')

				var summary = document.getElementById('map-location-summary');
				summary.innerHTML = '';

				document.body.classList.remove('has-map-location-summary');
			}
		});
	}

	window.oasis.createMap = createMap;
	window.oasis.addMarkers = addMarkers;
})();

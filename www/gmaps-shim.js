/* ==========================================================
 * gmaps-shim.js — Leaflet-compatible facade backed by the
 * Google Maps JavaScript SDK. Provides the same `L` API the
 * RescueNet maps already use (L.map / L.marker / L.circle /
 * L.polyline / L.divIcon / L.tileLayer / L.control.zoom /
 * L.featureGroup / L.latLngBounds / L.latLng), so callers
 * stay unchanged while Leaflet itself is removed entirely.
 *
 * Requires `google.maps` to be already loaded (see the
 * <script> block in dashboard.html / dashboards.html that
 * loads the SDK synchronously using /maps-key.js).
 * ========================================================== */
(function (global) {
    'use strict';

    function G() {
        if (!global.google || !global.google.maps) {
            throw new Error('Google Maps SDK not loaded. Ensure /maps-key.js and the SDK <script> are in the page head.');
        }
        return global.google.maps;
    }

    /* Defensive HTML sanitizer — strips <script> / <iframe> / on* attributes
     * before the shim injects icon HTML or opens an InfoWindow. The values
     * normally come from internal helpers (pinIcon, buildSOSPopup) but a
     * couple of them interpolate user-supplied fields (resident names,
     * descriptions), so we scrub any executable markup defensively. */
    function sanitizeHTML(html) {
        if (html == null) return '';
        return String(html)
            .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
            .replace(/<\s*script[^>]*\/?>/gi, '')
            .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
            .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
            .replace(/javascript:/gi, '');
    }

    function toLL(v) {
        if (v == null) return { lat: 0, lng: 0 };
        if (Array.isArray(v)) return { lat: v[0], lng: v[1] };
        if (typeof v.lat === 'function' && typeof v.lng === 'function') {
            return { lat: v.lat(), lng: v.lng() };
        }
        if (typeof v === 'object' && 'lat' in v && 'lng' in v) {
            const lat = typeof v.lat === 'function' ? v.lat() : v.lat;
            const lng = typeof v.lng === 'function' ? v.lng() : v.lng;
            return { lat, lng };
        }
        return { lat: 0, lng: 0 };
    }

    /* Leaflet-compatible LatLng: exposes .lat/.lng as numeric properties
     * (matching Leaflet's convention used throughout the app) and .equals/
     * toString helpers. The Google Maps LatLng object uses .lat()/.lng()
     * method accessors, so whenever we cross the boundary we go via toLL(). */
    function llOut(v) {
        const x = toLL(v);
        return {
            lat: x.lat,
            lng: x.lng,
            equals(o) { const y = toLL(o); return y.lat === x.lat && y.lng === x.lng; },
            toString() { return '(' + x.lat + ', ' + x.lng + ')'; },
            distanceTo(o) {
                const y = toLL(o);
                const R = 6371000, toRad = d => d * Math.PI / 180;
                const dLat = toRad(y.lat - x.lat), dLng = toRad(y.lng - x.lng);
                const a = Math.sin(dLat / 2) ** 2 +
                          Math.cos(toRad(x.lat)) * Math.cos(toRad(y.lat)) * Math.sin(dLng / 2) ** 2;
                return 2 * R * Math.asin(Math.sqrt(a));
            }
        };
    }

    /* -------- L.map -------- */
    class LeafletMap {
        constructor(elOrId, opts) {
            const g = G();
            opts = opts || {};
            const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
            this.el = el;
            const centerLL = opts.center ? toLL(opts.center) : { lat: 0, lng: 0 };
            const startOpts = {
                center: new g.LatLng(centerLL.lat, centerLL.lng),
                zoom: typeof opts.zoom === 'number' ? opts.zoom : 12,
                disableDefaultUI: true,
                zoomControl: opts.zoomControl !== false,
                scrollwheel: opts.scrollWheelZoom !== false,
                draggable: opts.dragging !== false,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                rotateControl: false,
                clickableIcons: false,
                backgroundColor: '#eef4ff',
                gestureHandling: opts.tap ? 'cooperative' : 'auto'
            };
            this.g = new g.Map(el, startOpts);
            this._listeners = {};
        }
        setView(center, zoom /*, opts */) {
            const g = G();
            const ll = toLL(center);
            this.g.setCenter(new g.LatLng(ll.lat, ll.lng));
            if (typeof zoom === 'number') this.g.setZoom(zoom);
            return this;
        }
        fitBounds(bounds, opts) {
            try {
                const gb = bounds && bounds.g ? bounds.g : bounds;
                const pad = opts && typeof opts.padding === 'number' ? opts.padding : 36;
                this.g.fitBounds(gb, pad);
            } catch (e) { /* empty bounds */ }
            return this;
        }
        invalidateSize() {
            const g = G();
            g.event.trigger(this.g, 'resize');
            const c = this.g.getCenter();
            if (c) this.g.setCenter(c);
            return this;
        }
        getCenter() {
            const c = this.g.getCenter();
            return llOut({ lat: c.lat(), lng: c.lng() });
        }
        getZoom() { return this.g.getZoom(); }
        setZoom(z) { this.g.setZoom(z); return this; }
        addLayer(layer) { if (layer && layer._attach) layer._attach(this); return this; }
        removeLayer(layer) { if (layer && layer._detach) layer._detach(this); return this; }
        on(evt, fn) {
            const g = G();
            if (evt === 'click') {
                g.event.addListener(this.g, 'click', (e) => {
                    fn({ latlng: e.latLng ? llOut({ lat: e.latLng.lat(), lng: e.latLng.lng() }) : null, originalEvent: e });
                });
            } else if (evt === 'moveend' || evt === 'zoomend' || evt === 'dragend') {
                g.event.addListener(this.g, 'idle', fn);
            } else {
                g.event.addListener(this.g, evt, fn);
            }
            return this;
        }
    }

    /* -------- L.tileLayer (no-op; Google tiles are native) -------- */
    class LeafletTileLayer {
        constructor(url, opts) { this.url = url; this.opts = opts || {}; }
        addTo(map) { this._map = map; return this; }
        on() { return this; }
        remove() { this._map = null; return this; }
        _attach() {}
        _detach() {}
    }

    /* -------- L.circle -------- */
    class LeafletCircle {
        constructor(center, opts) {
            const g = G();
            opts = opts || {};
            const ll = toLL(center);
            this._g = new g.Circle({
                center: new g.LatLng(ll.lat, ll.lng),
                radius: opts.radius || 100,
                strokeColor: opts.color || '#ff6500',
                strokeOpacity: opts.opacity != null ? opts.opacity : 0.6,
                strokeWeight: opts.weight || 1.5,
                fillColor: opts.fillColor || opts.color || '#ff6500',
                fillOpacity: opts.fillOpacity != null ? opts.fillOpacity : 0.15,
                clickable: false,
                zIndex: opts.zIndexOffset || 0,
                panes: opts.dashArray ? undefined : undefined
            });
            this._map = null;
        }
        addTo(map) { this._map = map; this._g.setMap(map.g); return this; }
        setLatLng(ll) { const x = toLL(ll); this._g.setCenter(new G().LatLng(x.lat, x.lng)); return this; }
        setRadius(r) { this._g.setRadius(r); return this; }
        getLatLng() { const c = this._g.getCenter(); return llOut({ lat: c.lat(), lng: c.lng() }); }
        getBounds() {
            const c = this._g.getCenter(), r = this._g.getRadius();
            const g = G();
            const half = r / 111320; // meters → degrees lat approx
            return { g: new g.LatLngBounds(
                new g.LatLng(c.lat() - half, c.lng() - half / Math.cos(c.lat() * Math.PI / 180)),
                new g.LatLng(c.lat() + half, c.lng() + half / Math.cos(c.lat() * Math.PI / 180))
            ) };
        }
        _attach(m) { this._map = m; this._g.setMap(m.g); }
        _detach() { this._g.setMap(null); this._map = null; }
        remove() { this._g.setMap(null); }
        bindPopup() { return this; }
    }

    /* -------- L.polyline -------- */
    class LeafletPolyline {
        constructor(path, opts) {
            const g = G();
            opts = opts || {};
            const pts = (path || []).map(toLL).map(p => new g.LatLng(p.lat, p.lng));
            const polyOpts = {
                path: pts,
                strokeColor: opts.color || '#102d5c',
                strokeOpacity: opts.opacity != null ? opts.opacity : 0.9,
                strokeWeight: opts.weight || 3,
                clickable: false,
                zIndex: opts.zIndexOffset || 1
            };
            if (opts.dashArray) {
                // Convert "6 6" style dash pattern → SVG symbol pattern
                const dashes = String(opts.dashArray).trim().split(/\s+/).map(Number).filter(n => n > 0);
                const repeat = dashes.reduce((a, b) => a + b, 0) + 'px';
                polyOpts.icons = [{
                    icon: {
                        path: 'M 0,-1 0,1',
                        strokeOpacity: 0,
                        strokeWeight: opts.weight || 3,
                        fillColor: opts.color || '#102d5c',
                        fillOpacity: opts.opacity != null ? opts.opacity : 0.9,
                        strokeDasharray: dashes.map(d => d + 'px').join(',')
                    },
                    offset: '0',
                    repeat: repeat
                }];
                // Base polyline invisible when using icon overlay
                polyOpts.strokeOpacity = 0;
            }
            this._p = new g.Polyline(polyOpts);
            this._opts = opts;
            this._map = null;
        }
        addTo(map) { this._map = map; this._p.setMap(map.g); return this; }
        setLatLngs(path) { this._p.setPath((path || []).map(toLL).map(p => new G().LatLng(p.lat, p.lng))); return this; }
        getLatLngs() { return this._p.getPath().getArray().map(ll => llOut({ lat: ll.lat(), lng: ll.lng() })); }
        _attach(m) { this._map = m; this._p.setMap(m.g); }
        _detach() { this._p.setMap(null); this._map = null; }
        remove() { this._p.setMap(null); }
    }

    /* -------- L.divIcon (metadata; rendered by LeafletMarker via OverlayView) -------- */
    class LeafletDivIcon {
        constructor(opts) {
            opts = opts || {};
            this.html = opts.html || '';
            this.className = opts.className || '';
            this.iconSize = opts.iconSize || [24, 24];
            this.iconAnchor = opts.iconAnchor || [this.iconSize[0] / 2, this.iconSize[1] / 2];
        }
    }

    /* -------- L.marker (HTML overlay via OverlayView so divIcon content works) -------- */
    class LeafletMarker {
        constructor(latlng, opts) {
            const g = G();
            opts = opts || {};
            this._ll = toLL(latlng);
            this._map = null;
            this._popupHtml = null;
            this._clickHandler = null;
            this._dragEndHandler = null;
            const host = document.createElement('div');
            host.style.position = 'absolute';
            host.style.willChange = 'transform';
            host.style.pointerEvents = 'auto';
            host.style.zIndex = String(400 + (opts.zIndexOffset || 0));
            host.setAttribute('title', opts.title || '');
            if (opts.icon && opts.icon.html) {
                host.innerHTML = sanitizeHTML(opts.icon.html);
                const a = opts.icon.iconAnchor || [opts.icon.iconSize[0] / 2, opts.icon.iconSize[1] / 2];
                host.dataset.anchorX = a[0];
                host.dataset.anchorY = a[1];
            } else {
                // Default small red dot
                host.innerHTML = '<div style="width:14px;height:14px;border-radius:50%;background:#d62828;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>';
                host.dataset.anchorX = 7; host.dataset.anchorY = 7;
            }
            host.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._clickHandler) this._clickHandler(e);
                if (this._popupHtml) this.openPopup();
            });
            this.host = host;
            const ov = new g.OverlayView();
            ov.onAdd = () => {
                const panes = ov.getPanes();
                (panes.overlayMouseTarget || panes.floatPane || panes.overlayLayer).appendChild(host);
            };
            ov.draw = () => {
                const proj = ov.getProjection();
                if (!proj || !this._ll) return;
                const px = proj.fromLatLngToContainerPixel(new g.LatLng(this._ll.lat, this._ll.lng));
                if (!px) return;
                const ax = parseFloat(host.dataset.anchorX || '0');
                const ay = parseFloat(host.dataset.anchorY || '0');
                host.style.transform = 'translate(' + (px.x - ax) + 'px,' + (px.y - ay) + 'px)';
                host.style.left = '0';
                host.style.top = '0';
            };
            ov.onRemove = () => { host.parentNode && host.parentNode.removeChild(host); };
            this._ov = ov;
        }
        addTo(map) {
            this._map = map;
            this._ov.setMap(map.g);
            return this;
        }
        setMap(gmap) { this._ov.setMap(gmap || null); }
        setLatLng(ll) { this._ll = toLL(ll); if (this._map) this._ov.draw(); return this; }
        getLatLng() { const ll = this._ll; return llOut(ll); }
        /* Swap the marker's HTML icon in place. Used to refresh live accuracy
         * readouts without tearing down the OverlayView. */
        setIcon(icon) {
            if (icon && icon.html != null) {
                this.host.innerHTML = sanitizeHTML(icon.html);
                const a = icon.iconAnchor || (icon.iconSize ? [icon.iconSize[0] / 2, icon.iconSize[1] / 2] : null);
                if (a) { this.host.dataset.anchorX = a[0]; this.host.dataset.anchorY = a[1]; }
                if (this._map) this._ov.draw();
            }
            return this;
        }
        bindPopup(html /*, opts */) { this._popupHtml = html; return this; }
        unbindPopup() { this._popupHtml = null; if (this._iw) this._iw.close(); return this; }
        setPopupContent(html) { this._popupHtml = html; if (this._iw) this._iw.setContent(sanitizeHTML(html)); return this; }
        openPopup() {
            if (!this._map || !this._popupHtml) return this;
            const g = G();
            if (!this._iw) this._iw = new g.InfoWindow();
            this._iw.setContent(sanitizeHTML(this._popupHtml));
            this._iw.setPosition(new g.LatLng(this._ll.lat, this._ll.lng));
            this._iw.open(this._map.g);
            return this;
        }
        closePopup() { if (this._iw) this._iw.close(); return this; }
        /* Leaflet tooltips are text bubbles anchored to markers. We render the
         * label as an inline span inside the marker host so it's visible without
         * needing a separate overlay pane; permanent:true matches the app's usage
         * (responder / resident name labels on the tracking map). */
        bindTooltip(text /*, opts */) {
            try {
                const opts = (arguments[1] || {});
                const cls = (opts.className || 'rn-tooltip').split(' ').filter(Boolean);
                const label = document.createElement('div');
                label.className = cls.join(' ');
                label.style.position = 'absolute';
                label.style.whiteSpace = 'nowrap';
                label.style.pointerEvents = 'none';
                label.style.left = '50%';
                label.style.top = '-6px';
                label.style.transform = 'translate(-50%, -100%)';
                label.style.fontSize = '11px';
                label.style.fontWeight = '700';
                label.style.color = '#102d5c';
                label.style.background = 'rgba(255,255,255,.92)';
                label.style.border = '1px solid rgba(16,45,92,.25)';
                label.style.borderRadius = '10px';
                label.style.padding = '2px 8px';
                label.style.boxShadow = '0 2px 6px rgba(0,0,0,.15)';
                label.textContent = String(text == null ? '' : text);
                this.host.appendChild(label);
                this._tooltipEl = label;
            } catch (e) { /* non-fatal */ }
            return this;
        }
        unbindTooltip() { if (this._tooltipEl && this._tooltipEl.parentNode) this._tooltipEl.parentNode.removeChild(this._tooltipEl); this._tooltipEl = null; return this; }
        openTooltip() { return this; }
        closeTooltip() { return this; }
        bringToFront() { if (this.host) this.host.style.zIndex = '9999'; return this; }
        setZIndexOffset(z) { if (this.host) this.host.style.zIndex = String(400 + (z || 0)); return this; }
        on(evt, fn) {
            if (evt === 'click') this._clickHandler = fn;
            return this;
        }
        remove() { this._ov.setMap(null); this._map = null; return this; }
        _attach(m) { this._map = m; this._ov.setMap(m.g); }
        _detach() { this._ov.setMap(null); this._map = null; }
    }

    /* -------- L.featureGroup / L.latLngBounds -------- */
    class LeafletBounds {
        constructor(points) {
            const g = G();
            this.g = new g.LatLngBounds();
            (points || []).forEach(p => {
                const ll = toLL(p);
                if (Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) {
                    this.g.extend(new g.LatLng(ll.lat, ll.lng));
                }
            });
        }
        pad(f) {
            const g = G();
            if (this.g.isEmpty()) return this;
            const ne = this.g.getNorthEast(), sw = this.g.getSouthWest();
            const dLat = (ne.lat() - sw.lat()) * (f || 0);
            const dLng = (ne.lng() - sw.lng()) * (f || 0);
            this.g = new g.LatLngBounds(
                new g.LatLng(sw.lat() - dLat, sw.lng() - dLng),
                new g.LatLng(ne.lat() + dLat, ne.lng() + dLng)
            );
            return this;
        }
        getCenter() { const c = this.g.getCenter(); return llOut({ lat: c.lat(), lng: c.lng() }); }
        extend(p) { const ll = toLL(p); this.g.extend(new G().LatLng(ll.lat, ll.lng)); return this; }
    }

    class LeafletFeatureGroup {
        constructor(items) { this._items = items || []; }
        addTo(map) { this._items.forEach(i => i.addTo(map)); return this; }
        getBounds() {
            const pts = this._items.map(m => m._ll).filter(Boolean);
            return new LeafletBounds(pts);
        }
        eachLayer(fn) { this._items.forEach(fn); return this; }
    }

    /* -------- L.control.zoom (no-op; Google's own zoomControl is enabled via mapOptions) -------- */
    function leafletControlZoom() { return { addTo: () => {} }; }

    /* -------- L.latLng -------- */
    function leafletLatLng(lat, lng) { return llOut({ lat, lng }); }

    global.L = {
        map: (el, opts) => new LeafletMap(el, opts),
        tileLayer: (url, opts) => new LeafletTileLayer(url, opts),
        marker: (ll, opts) => new LeafletMarker(ll, opts),
        circle: (ll, opts) => new LeafletCircle(ll, opts),
        polyline: (path, opts) => new LeafletPolyline(path, opts),
        divIcon: (opts) => new LeafletDivIcon(opts),
        featureGroup: (items) => new LeafletFeatureGroup(items),
        latLngBounds: (pts) => new LeafletBounds(pts),
        latLng: leafletLatLng,
        control: { zoom: leafletControlZoom }
    };
})(window);

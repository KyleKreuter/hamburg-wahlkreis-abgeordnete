"use strict";

(() => {
  const FACTIONS = {
    spd: { label: "SPD", color: "var(--spd)" },
    cdu: { label: "CDU", color: "var(--cdu)" },
    gruenen: { label: "Grüne", color: "var(--gruenen)" },
    linke: { label: "Die Linke", color: "var(--linke)" },
    afd: { label: "AfD", color: "var(--afd)" },
    fraktionslos: { label: "fraktionslos", color: "var(--fraktionslos)" },
  };
  const faction = (key) => FACTIONS[key] || { label: key, color: "var(--fraktionslos)" };

  // Hamburg ohne Neuwerk – sonst wäre die Startansicht zu weit herausgezoomt.
  const HH_BOUNDS = L.latLngBounds([53.395, 9.73], [53.74, 10.33]);
  const PHOTON_BBOX = "9.70,53.38,10.35,53.75";

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  const state = { districts: new Map(), members: [], selected: null, marker: null };

  // ---------- Karte ----------
  const map = L.map("map", { zoomSnap: 0.25, minZoom: 9, maxBounds: HH_BOUNDS.pad(0.6) });
  map.fitBounds(HH_BOUNDS);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
  }).addTo(map);

  const INK = "#111113";
  const baseStyle = { color: INK, weight: 1.2, opacity: 0.55, fillColor: INK, fillOpacity: 0.02 };
  const hoverStyle = { weight: 2, opacity: 0.85, fillOpacity: 0.06 };
  const selectedStyle = { color: INK, weight: 2.5, opacity: 1, fillOpacity: 0.1 };
  const dimStyle = { ...baseStyle, opacity: 0.3, fillOpacity: 0.01 };
  const pinIcon = L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

  function restyle() {
    for (const d of state.districts.values()) {
      if (state.selected === d.nr) d.layer.setStyle(selectedStyle);
      else d.layer.setStyle(state.selected ? dimStyle : baseStyle);
    }
  }

  // ---------- Punkt-in-Polygon ----------
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(x, y, rings) {
    return inRing(x, y, rings[0]) && !rings.slice(1).some((hole) => inRing(x, y, hole));
  }
  function districtAt(lat, lng) {
    for (const d of state.districts.values()) {
      const g = d.feature.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      if (polys.some((p) => inPolygon(lng, lat, p))) return d;
    }
    return null;
  }

  // ---------- Darstellung ----------
  const initials = (name) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  function memberCard(m) {
    const node = $("#member-tpl").content.firstElementChild.cloneNode(true);
    const f = faction(m.faction);
    node.style.setProperty("--c", f.color);

    const img = node.querySelector(".member__img");
    if (m.img) {
      img.src = m.img;
      img.alt = `Foto von ${m.name}`;
      img.addEventListener("error", () => img.replaceWith(fallbackAvatar(m)), { once: true });
    } else img.replaceWith(fallbackAvatar(m));

    const link = node.querySelector(".member__name a");
    link.textContent = m.name;
    if (m.profile) link.href = m.profile; else link.removeAttribute("href");

    const badge = node.querySelector(".badge");
    badge.textContent = f.label;
    if (!m.wk) {
      node.querySelector(".member__name").append(" ", el("span", {
        className: "tag",
        textContent: "Landesliste",
        title: m.listWk
          ? `Über die Landesliste gewählt, hat 2025 im Wahlkreis ${m.listWk} kandidiert`
          : "Über die Landesliste gewählt",
      }));
    }

    const links = node.querySelector(".member__links");
    if (m.email) links.append(el("a", { href: `mailto:${m.email}`, textContent: "E-Mail" }));
    if (m.website) links.append(el("a", { href: m.website, target: "_blank", rel: "noopener", textContent: "Website" }));
    if (m.profile) links.append(el("a", { href: m.profile, target: "_blank", rel: "noopener", textContent: "Profil" }));
    return node;
  }

  function fallbackAvatar(m) {
    return el("div", { className: "member__img fallback", textContent: initials(m.name), ariaHidden: "true" });
  }

  function dots(members, listMembers = []) {
    return el("span", { className: "dots" }, ...[...members, ...listMembers].map((m) => {
      const s = el("span", {
        className: m.wk ? "dot" : "dot dot--ring",
        title: `${m.name} (${faction(m.faction).label}${m.wk ? "" : ", Landesliste"})`,
      });
      s.style.setProperty("--c", faction(m.faction).color);
      return s;
    }));
  }

  function renderOverview() {
    const list = $("#wk-list");
    list.replaceChildren(...[...state.districts.values()].map((d) => {
      const btn = el("button", { type: "button", className: "wk-item" },
        el("span", { className: "wk-num", textContent: d.nr }),
        el("span", { className: "wk-item__name", textContent: d.name }),
        dots(d.members, d.listMembers));
      btn.addEventListener("click", () => {
        if (state.marker) { state.marker.remove(); state.marker = null; }
        selectDistrict(d.nr, { fly: true });
      });
      return el("li", {}, btn);
    }));

    const listMembers = state.members.filter((m) => !m.wk);
    $("#list-count").textContent = `(${listMembers.length})`;
    $("#list-members").replaceChildren(...listMembers.map((m) => {
      const li = el("li", {}, el("span", { className: "dot" }),
        el("a", { href: m.profile, target: "_blank", rel: "noopener", textContent: m.name }));
      if (m.listWk) {
        const wk = el("button", { type: "button", className: "tag tag--wk", textContent: `WK ${m.listWk}`,
          title: `Hat 2025 im Wahlkreis ${m.listWk} (${state.districts.get(m.listWk)?.name ?? ""}) kandidiert` });
        wk.addEventListener("click", () => selectDistrict(m.listWk, { fly: true }));
        li.append(wk);
      }
      li.firstChild.style.setProperty("--c", faction(m.faction).color);
      li.firstChild.title = faction(m.faction).label;
      return li;
    }));
  }

  function renderResult(d, address) {
    const result = $("#result");
    const back = el("button", { type: "button", className: "back-btn", textContent: "← Alle Wahlkreise" });
    back.addEventListener("click", clearSelection);

    const sub = address
      ? `Ihre Adresse: ${address}`
      : `${d.members.length} Abgeordnete mit Wahlkreismandat`;

    result.replaceChildren(
      back,
      el("div", { className: "result-head" },
        el("span", { className: "wk-num", textContent: d.nr }),
        el("div", {},
          el("h2", { textContent: `Wahlkreis ${d.nr}: ${d.name}` }),
          el("p", { textContent: sub }))),
      el("ul", { className: "members" }, ...d.members.map(memberCard)),
    );
    if (d.listMembers.length) {
      result.append(
        el("h3", { className: "section-title", textContent: "Über die Landesliste" }),
        el("p", { className: "hint", textContent: "Abgeordnete mit Listenmandat, die 2025 in diesem Wahlkreis kandidiert haben." }),
        el("ul", { className: "members" }, ...d.listMembers.map(memberCard)),
      );
    }
    result.hidden = false;
    $("#overview").hidden = true;
  }

  function selectDistrict(nr, { fly = false, address = null } = {}) {
    const d = state.districts.get(nr);
    if (!d) return;
    state.selected = nr;
    restyle();
    d.layer.bringToFront();
    renderResult(d, address);
    if (fly) map.flyToBounds(d.layer.getBounds(), { padding: [20, 20], maxZoom: 13, duration: 0.6 });
    history.replaceState(null, "", `#wk=${nr}`);
    $("#panel-body").scrollTop = 0;
    // Mobil: nach Suche/Listenauswahl zur Karte scrollen, darunter folgt das Ergebnis.
    if ((fly || address) && matchMedia("(max-width: 760px)").matches) {
      $("#map").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function clearSelection() {
    state.selected = null;
    restyle();
    $("#result").hidden = true;
    $("#overview").hidden = false;
    if (state.marker) { state.marker.remove(); state.marker = null; }
    history.replaceState(null, "", location.pathname + location.search);
    map.flyToBounds(HH_BOUNDS, { duration: 0.6 });
  }

  function locatePoint(lat, lng, label) {
    const d = districtAt(lat, lng);
    if (state.marker) state.marker.remove();
    state.marker = L.marker([lat, lng], { icon: pinIcon, title: label || "Gewählter Ort", keyboard: false }).addTo(map);
    if (!d) {
      setStatus("Dieser Ort liegt in keinem Hamburger Bürgerschaftswahlkreis.", true);
      map.flyTo([lat, lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
      return;
    }
    setStatus("");
    selectDistrict(d.nr, { address: label });
    map.flyToBounds(d.layer.getBounds(), { padding: [20, 20], maxZoom: 13, duration: 0.6 });
  }

  function setStatus(text, isError = false) {
    const s = $("#status");
    s.textContent = text;
    s.classList.toggle("error", isError);
  }

  // ---------- Adresssuche (Photon / OSM) ----------
  const input = $("#address");
  const sugg = $("#suggestions");
  let suggestions = [];
  let active = -1;
  let debounce;
  let controller;

  function formatPlace(p) {
    const street = [p.street || (p.type === "street" ? p.name : ""), p.housenumber].filter(Boolean).join(" ");
    const title = p.name && p.type !== "street" && p.type !== "house" ? p.name : street || p.name || "";
    const sub = [title !== street ? street : "", [p.postcode, p.district || p.locality || p.city].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
    return { title, sub };
  }

  async function geocode(q) {
    controller?.abort();
    controller = new AbortController();
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=de&limit=6&bbox=${PHOTON_BBOX}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Geocoder: HTTP ${res.status}`);
    const data = await res.json();
    return data.features
      .filter((f) => (f.properties.city || f.properties.state) && /hamburg/i.test(`${f.properties.city} ${f.properties.state}`))
      .map((f) => ({ ...formatPlace(f.properties), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }));
  }

  function showSuggestions(items) {
    suggestions = items;
    active = -1;
    sugg.replaceChildren(...items.map((s, i) => {
      const li = el("li", { role: "option", id: `sugg-${i}` }, s.title, el("small", { textContent: s.sub }));
      li.addEventListener("mousedown", (e) => { e.preventDefault(); choose(i); });
      return li;
    }));
    sugg.hidden = items.length === 0;
    input.setAttribute("aria-expanded", String(items.length > 0));
  }

  function highlight(i) {
    active = i;
    [...sugg.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    if (i >= 0) input.setAttribute("aria-activedescendant", `sugg-${i}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function choose(i) {
    const s = suggestions[i];
    if (!s) return;
    const label = [s.title, s.sub].filter(Boolean).join(", ");
    input.value = label;
    showSuggestions([]);
    input.blur();
    locatePoint(s.lat, s.lng, label);
  }

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 3) { showSuggestions([]); return; }
    debounce = setTimeout(async () => {
      try {
        const items = await geocode(q);
        if (input.value.trim() !== q) return;
        showSuggestions(items);
        setStatus(items.length ? "" : "Keine passende Adresse in Hamburg gefunden.", !items.length);
      } catch (e) {
        if (e.name !== "AbortError") setStatus("Adresssuche gerade nicht erreichbar.", true);
      }
    }, 250);
  });

  input.addEventListener("keydown", (e) => {
    if (sugg.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); highlight((active + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight((active - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === "Escape") showSuggestions([]);
  });
  input.addEventListener("blur", () => setTimeout(() => showSuggestions([]), 150));

  $("#search-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sugg.hidden && suggestions.length) { choose(active >= 0 ? active : 0); return; }
    const q = input.value.trim();
    if (!q) return;
    setStatus("Suche …");
    try {
      const items = await geocode(q);
      if (!items.length) { setStatus("Keine passende Adresse in Hamburg gefunden.", true); return; }
      suggestions = items;
      choose(0);
    } catch (err) {
      if (err.name !== "AbortError") setStatus("Adresssuche gerade nicht erreichbar.", true);
    }
  });

  $("#locate").addEventListener("click", () => {
    if (!navigator.geolocation) { setStatus("Standortbestimmung wird nicht unterstützt.", true); return; }
    setStatus("Standort wird ermittelt …");
    navigator.geolocation.getCurrentPosition(
      (pos) => { input.value = ""; locatePoint(pos.coords.latitude, pos.coords.longitude, "Ihr Standort"); },
      () => setStatus("Standort konnte nicht ermittelt werden.", true),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

  // ---------- Daten laden ----------
  Promise.all([
    fetch("data/wahlkreise.geojson").then((r) => r.json()),
    fetch("data/abgeordnete.json").then((r) => r.json()),
  ]).then(([geo, data]) => {
    state.members = data.members;
    $("#data-date").textContent = new Date(data.fetchedAt).toLocaleDateString("de-DE");

    const groupBy = (key) => {
      const groups = new Map();
      for (const m of data.members) if (m[key]) (groups.get(m[key]) || groups.set(m[key], []).get(m[key])).push(m);
      const order = Object.keys(FACTIONS);
      for (const list of groups.values()) list.sort((a, b) => order.indexOf(a.faction) - order.indexOf(b.faction) || a.lastname.localeCompare(b.lastname, "de"));
      return groups;
    };
    const byWk = groupBy("wk");
    const byListWk = groupBy("listWk");

    geo.features.sort((a, b) => a.properties.nr - b.properties.nr);
    for (const feature of geo.features) {
      const { nr, name, lx, ly } = feature.properties;
      const members = byWk.get(nr) || [];
      const listMembers = byListWk.get(nr) || [];
      const layer = L.geoJSON(feature, { style: baseStyle }).addTo(map);
      const d = { nr, name, feature, layer, members, listMembers };
      state.districts.set(nr, d);

      layer.bindTooltip(`<strong>${nr} · ${name}</strong><br><span>${members.length} Abgeordnete${listMembers.length ? ` · +${listMembers.length} Landesliste` : ""}</span>`, { className: "wk-tip", sticky: true, direction: "top" });
      layer.on("mouseover", () => state.selected !== nr && layer.setStyle(hoverStyle));
      layer.on("mouseout", () => restyle());
      layer.on("click", (e) => locatePoint(e.latlng.lat, e.latlng.lng, null));

      L.tooltip({ permanent: true, direction: "center", className: "wk-label", interactive: false })
        .setLatLng([ly, lx]).setContent(String(nr)).addTo(map);
    }

    renderOverview();
    const m = location.hash.match(/wk=(\d+)/);
    if (m) selectDistrict(Number(m[1]), { fly: true });
  }).catch((err) => {
    console.error(err);
    setStatus("Daten konnten nicht geladen werden.", true);
  });
})();

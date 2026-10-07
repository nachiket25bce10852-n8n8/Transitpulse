# Transitpulse

## TransitPulse — Civic Bus Tracking & Fleet Management Platform

TransitPulse is a lightweight, full-stack municipal fleet management and real-time commuter transit platform built for Patiala City Transport[cite: 32]. It delivers live GPS tracking, arrival estimates (ETA), crowd density indicators, digital concession pass ticketing, and a centralized operations dispatch room without requiring native mobile application installations[cite: 32].

---

## Key Features

## 1. Commuter Portal & Live Tracker (`commuter_3.html`, `live_map.html`)
* **Interactive Street Maps:** Street-level visualization powered by Leaflet.js and Esri World Street Map tiles[cite: 15, 18].
* **Real-Time Telemetry & ETAs:** Refreshes active bus positions, vehicle speeds, and arrival estimations at 3-second intervals[cite: 15, 18].
* **Crowding & Seat Indicators:** Displays live available seat counts (out of 16 seats) broadcast directly from operating buses[cite: 15, 16].
* **Corridor & Multi-Bus Selector:** 1-click corridor filters and bus switching for corridors with multiple active buses[cite: 15, 18].
* **Milestone Progress Bar:** Step-by-step corridor timeline illustrating passed, current, and upcoming stops[cite: 15].
* **Full-Screen Map View:** Dedicated full-viewport tracking canvas (`live_map.html`) with network-wide multi-bus view toggling[cite: 18].

## 2. Driver Broadcaster (`driver.html`)
* **Hardware-Free GPS Broadcasting:** Captures live coordinates and velocity via the browser's native HTML5 Geolocation API (`navigator.geolocation.watchPosition`)[cite: 16].
* **16-Seat Top-View Layout:** Interactive seating grid allowing drivers or conductors to toggle individual seats between Free (green) and Taken (red)[cite: 16].
* **Operational Diagnostics:** Drivers can report traffic conditions (Normal, Slow Moving, Heavy Traffic, Road Block, Accident) and vehicle conditions (Running Fine, Breakdown, Flat Tyre, Need Help)[cite: 16].
* **Automated Ingestion Loop:** Broadcasts telemetry snapshots to `/api/telemetry/ingest` every 4 seconds[cite: 16].

## 3. Concession Passes & Digital Ticketing (`passes_3.html`, `passes_3.js`)
* **Pass Catalog Schemes:** Subsidized passes across Daily, Student, Monthly, and Regional Express tiers[cite: 22, 23].
* **Synchronous Expiration Engine:** Passes enforce a strict validity period (24 hours or 30 days) and automatically expire from commuter and administrative registries once time limits elapse[cite: 23, 24].
* **Digital Authentication:** Issues unique municipal transit credentials with verification identifiers upon issuance[cite: 22, 23].

## 4. Dispatch Command Center (`admin_2.html`)
* **Real-Time Fleet Grid:** Live tracking radar displaying active vehicles broadcasting on the Patiala municipal grid[cite: 13, 32].
* **Analytics & Delay Logs:** Database-audited incident logs documenting delay deviations and root causes[cite: 13, 17].
* **Network Infrastructure Management:** Dynamic CRUD controls to register or remove corridors, sequence stops, and adjust GPS geofence radii (35m–60m)[cite: 13, 17, 32].
* **Pass Issuance Registry:** Live audit of all active citizen transit bookings[cite: 13, 24].
* **Masked User Directory:** User credential management enforcing role assignments while masking security credentials as `••••••••` across API responses and dashboard tables[cite: 13, 24].

## 5. Role-Based Access Control (`login_2.html`)
* **Role Partitioning:** Case-insensitive authentication routing users to dedicated portals based on their authorized role[cite: 19, 24]:
  * `commuter` → `commuter_3.html`[cite: 19]
  * `driver` → `driver.html`[cite: 19]
  * `admin` → `admin_2.html`[cite: 19]
* **Self-Provisioning:** Built-in registration portal allowing self-service account creation for all three system roles directly into SQLite[cite: 19, 24].

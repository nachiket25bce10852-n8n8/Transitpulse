/**
 * TransitPulse — Pass Catalog & Booking Controller (passes_3.js)
 * Fully connected to the backend SQLite API
 */
const API_BASE = window.location.origin + "/api";

let PASS_DATA = [];

// 1. Determine currently logged-in commuter identity
const currentUsername = sessionStorage.getItem("userId") || "harish_commuter";
const profileEl = document.getElementById("current-commuter-id");
if (profileEl) profileEl.textContent = currentUsername;

const catalog = document.getElementById("passes-catalog");
const routeFilter = document.getElementById("route-filter");
const tabButtons = document.querySelectorAll(".tab-btn");
const myPassesGrid = document.getElementById("my-passes-grid");
const myPassesCount = document.getElementById("my-passes-count");

let activeFilter = {
  route: "all",
  category: "all"
};

// Client-Side Expiration Validator (Guarantees expired passes vanish from Commuter view)
function isPassExpired(ticket) {
  if (!ticket) return true;
  if (ticket.status && ticket.status.toUpperCase() === 'EXPIRED') return true;

  const now = Date.now();
  if (ticket.expires_at && typeof ticket.expires_at === 'number') {
    return now > ticket.expires_at;
  }

  let bookedTime = NaN;
  if (ticket.booked_at) {
    const parts = ticket.booked_at.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      const day = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      const year = parseInt(parts[3], 10);
      let hours = 0, minutes = 0, seconds = 0;
      const timeMatch = ticket.booked_at.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        const ampm = timeMatch[4] ? timeMatch[4].toLowerCase() : '';
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
      }
      bookedTime = new Date(year, month, day, hours, minutes, seconds).getTime();
    } else {
      bookedTime = Date.parse(ticket.booked_at);
    }
  }

  if (isNaN(bookedTime)) return false;

  let durationMs = 24 * 60 * 60 * 1000;
  const val = (ticket.validity || '').toLowerCase();
  if (val.includes('30') || val.includes('month')) {
    durationMs = 30 * 24 * 60 * 60 * 1000;
  } else if (val.includes('24') || val.includes('hour') || val.includes('daily')) {
    durationMs = 24 * 60 * 60 * 1000;
  }

  return now > (bookedTime + durationMs);
}

async function initPassesPortal() {
  await Promise.all([loadFilterRoutes(), loadPassesFromDB(), loadMyBookedPasses()]);
  renderPasses();
}

// 2. Fetch available corridors for pass filtering
async function loadFilterRoutes() {
  try {
    const res = await fetch(`${API_BASE}/routes`);
    if (!res.ok) return;
    const routes = await res.json();

    if (routeFilter) {
      routeFilter.innerHTML = '<option value="all">All Corridors (Citywide & Regional)</option>';
      routes.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.route_id;
        opt.textContent = r.name;
        routeFilter.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Failed loading routes into pass filter:", err);
  }
}

// 3. Load concession tariff schemes catalog
async function loadPassesFromDB() {
  try {
    const res = await fetch(`${API_BASE}/passes`);
    if (!res.ok) throw new Error("Failed fetching passes");
    PASS_DATA = await res.json();
  } catch (err) {
    console.error("Passes fetch error:", err);
    if (catalog) {
      catalog.innerHTML = `<div class="empty-state"><p>Unable to connect to backend. Please ensure <code>node server.js</code> is running.</p></div>`;
    }
  }
}

// 4. Load passes booked specifically by THIS commuter (Expired passes vanish)
async function loadMyBookedPasses() {
  try {
    const res = await fetch(`${API_BASE}/passes/my-passes?username=${encodeURIComponent(currentUsername)}`);
    if (!res.ok) return;
    const rawPasses = await res.json();

    // Filter out expired passes
    const myPasses = (rawPasses || []).filter(ticket => !isPassExpired(ticket));

    if (myPassesCount) {
      myPassesCount.textContent = `${myPasses.length} Active Pass${myPasses.length === 1 ? '' : 'es'}`;
    }

    if (!myPassesGrid) return;
    myPassesGrid.innerHTML = "";

    if (!myPasses || myPasses.length === 0) {
      myPassesGrid.innerHTML = `<p style="color:#64748b; font-size:0.88rem;">No active transit passes booked yet. Apply for any pass below to activate digital travel.</p>`;
      return;
    }

    myPasses.forEach((ticket) => {
      const card = document.createElement("div");
      card.className = "digital-ticket-card";
      card.innerHTML = `
        <div class="ticket-top">
          <div class="ticket-title">${ticket.pass_name}</div>
          <span class="ticket-badge">${ticket.status}</span>
        </div>
        <div class="ticket-meta">
          <div><strong>Tariff Paid:</strong> ${ticket.price} • ${ticket.category}</div>
          <div><strong>Validity:</strong> ${ticket.validity}</div>
          <div><strong>Issued To:</strong> ${ticket.username}</div>
        </div>
        <div class="ticket-footer">
          <span>QR AUTH: PRTC-${ticket.id}99X</span>
          <span>Booked: ${ticket.booked_at}</span>
        </div>
      `;
      myPassesGrid.appendChild(card);
    });
  } catch (err) {
    console.error("Error loading commuter passes:", err);
  }
}

// 5. Commuter books a pass
async function bookPass(pass) {
  const actualPassId = pass.pass_id || pass.id;
  if (!confirm(`Confirm application for "${pass.name}" at ${pass.price} on account: ${currentUsername}?`)) return;

  const payload = {
    username: currentUsername,
    pass_id: actualPassId,
    pass_name: pass.name,
    price: pass.price,
    validity: pass.validity,
    category: pass.category
  };

  try {
    const res = await fetch(`${API_BASE}/passes/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Booking failed");

    alert(`Success! "${pass.name}" has been issued to ${currentUsername} and logged in the municipal database.`);
    await loadMyBookedPasses();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    alert("Error booking pass: " + err.message);
  }
}

// 6. Render catalog cards with Book buttons
function renderPasses() {
  if (!catalog) return;
  catalog.innerHTML = "";

  const filtered = PASS_DATA.filter((pass) => {
    const matchesRoute =
      activeFilter.route === "all" || (pass.eligibleRoutes && pass.eligibleRoutes.includes(activeFilter.route));
    const matchesCategory =
      activeFilter.category === "all" || pass.category === activeFilter.category;
    return matchesRoute && matchesCategory;
  });

  if (filtered.length === 0) {
    catalog.innerHTML = `
      <div class="empty-state">
        <p>No transit passes found matching this route and category combination.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((pass, index) => {
    const actualPassId = pass.pass_id || pass.id || `pass-${index}`;
    const card = document.createElement("article");
    card.className = "pass-card";
    card.innerHTML = `
      <div class="pass-head">
        <span class="pass-tag ${pass.category.toLowerCase()}">${pass.category}</span>
        <span class="pass-price">${pass.price}</span>
      </div>
      <h2 class="pass-name">${pass.name}</h2>
      <p class="pass-validity">⏱️ Validity: ${pass.validity}</p>
      <p class="pass-desc">${pass.description}</p>
      <div class="pass-routes">
        <span class="routes-label">Valid Corridors:</span>
        <div class="route-tags-list">
          ${(pass.eligibleRoutes || [])
            .map((r) => `<span class="route-pill">${r.toUpperCase()}</span>`)
            .join("")}
        </div>
      </div>
      <button class="btn-primary" type="button" id="btn-book-${actualPassId}">
        Apply for Pass (${pass.price})
      </button>
    `;

    catalog.appendChild(card);
    const btn = document.getElementById(`btn-book-${actualPassId}`);
    if (btn) btn.addEventListener("click", () => bookPass(pass));
  });
}

if (routeFilter) {
  routeFilter.addEventListener("change", (e) => {
    activeFilter.route = e.target.value;
    renderPasses();
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter.category = btn.dataset.category;
    renderPasses();
  });
});

initPassesPortal();
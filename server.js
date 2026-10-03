const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new sqlite3.Database('./transitpulse.db');

app.use(cors());
app.use(express.json());

// Serve HTML, CSS, JS, and asset files directly
app.use(express.static(path.join(__dirname)));

// Root redirects directly to the login portal
app.get('/', (req, res) => {
  res.redirect('/login_2.html');
});

// -------------------------------------------------------------
// 0. AUTO-INITIALIZE PASS BOOKINGS TABLE (WITH EXPIRES_AT)
// -------------------------------------------------------------
db.run(`
  CREATE TABLE IF NOT EXISTS booked_passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    pass_id TEXT NOT NULL,
    pass_name TEXT NOT NULL,
    price TEXT NOT NULL,
    validity TEXT NOT NULL,
    category TEXT NOT NULL,
    booked_at TEXT NOT NULL,
    expires_at INTEGER,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
  )
`);

db.run(`ALTER TABLE booked_passes ADD COLUMN expires_at INTEGER`, () => {});

// Synchronous Expiration Engine
function isPassExpired(p) {
  if (!p) return true;
  if (p.status && p.status.toUpperCase() === 'EXPIRED') return true;

  const now = Date.now();
  if (p.expires_at && typeof p.expires_at === 'number') {
    return now > p.expires_at;
  }

  let bookedTime = NaN;
  if (p.booked_at) {
    const parts = p.booked_at.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      const day = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      const year = parseInt(parts[3], 10);
      let hours = 0, minutes = 0, seconds = 0;
      const timeMatch = p.booked_at.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?/i);
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
      bookedTime = Date.parse(p.booked_at);
    }
  }

  if (isNaN(bookedTime)) return false;

  let durationMs = 24 * 60 * 60 * 1000;
  const val = (p.validity || '').toLowerCase();
  if (val.includes('30') || val.includes('month')) {
    durationMs = 30 * 24 * 60 * 60 * 1000;
  } else if (val.includes('24') || val.includes('hour') || val.includes('daily')) {
    durationMs = 24 * 60 * 60 * 1000;
  }

  return now > (bookedTime + durationMs);
}

function getDurationMs(validity) {
  if (/24\s*hour/i.test(validity) || /daily/i.test(validity)) {
    return 24 * 60 * 60 * 1000;
  }
  const dayMatch = validity.match(/(\d+)\s*day/i);
  if (dayMatch) {
    return parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

// -------------------------------------------------------------
// 1. AUTHENTICATION & USER MANAGEMENT (CASE-INSENSITIVE)
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password/PIN are required.' });
  }

  db.get(
    'SELECT id, username, LOWER(role) AS role FROM users WHERE LOWER(TRIM(username)) = LOWER(?) AND TRIM(password) = ?',
    [username, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(401).json({ error: 'Invalid username identifier or security PIN.' });
      res.json(row);
    }
  );
});

app.post('/api/auth/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  const role = (req.body.role || '').toLowerCase().trim();

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password/PIN, and role are required.' });
  }

  const validRoles = ['commuter', 'driver', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid account role selected.' });
  }

  const sql = `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`;
  db.run(sql, [username, password, role], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Username is already taken. Please choose another.' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Account created successfully!', id: this.lastID, username, role });
  });
});

app.post('/api/users', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  const role = (req.body.role || '').toLowerCase().trim();

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password/PIN, and role are required.' });
  }

  const sql = `INSERT OR REPLACE INTO users (username, password, role) VALUES (?, ?, ?)`;
  db.run(sql, [username, password, role], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User authorized successfully', id: this.lastID });
  });
});

// Passwords masked at the API level
app.get('/api/users', (req, res) => {
  db.all('SELECT id, username, "••••••••" AS password, LOWER(role) AS role FROM users ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/api/users/:id', (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User deleted successfully', deletedId: req.params.id });
  });
});

// -------------------------------------------------------------
// 2. CORRIDOR / ROUTE MANAGEMENT
// -------------------------------------------------------------
app.get('/api/routes', (req, res) => {
  db.all('SELECT * FROM routes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/routes', (req, res) => {
  const { route_id, name, bus_reg, default_speed, default_eta, distance, stops } = req.body;
  const stopsJson = JSON.stringify(stops || []);

  const sql = `INSERT OR REPLACE INTO routes (route_id, name, bus_reg, default_speed, default_eta, distance, stops_json) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [route_id, name, bus_reg, default_speed, default_eta, distance, stopsJson], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Route corridor created successfully', id: route_id });
  });
});

app.delete('/api/routes/:id', (req, res) => {
  const routeId = req.params.id;
  db.run('DELETE FROM routes WHERE route_id = ?', [routeId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM live_telemetry WHERE route_id = ?', [routeId], () => {});
    res.json({ message: 'Route corridor deleted', route_id: routeId });
  });
});

// -------------------------------------------------------------
// 3. LIVE MULTI-BUS TELEMETRY
// -------------------------------------------------------------
app.post('/api/telemetry/ingest', (req, res) => {
  const {
    vehicle_id,
    route_id,
    latitude,
    longitude,
    speed,
    traffic_condition,
    vehicle_status,
    available_seats,
    seats_layout
  } = req.body;

  if (!vehicle_id || !route_id) {
    return res.status(400).json({ error: 'vehicle_id and route_id are required' });
  }

  const seatsJson = JSON.stringify(seats_layout || {});
  const now = new Date().toISOString();

  const sql = `INSERT OR REPLACE INTO live_telemetry 
               (vehicle_id, route_id, latitude, longitude, speed, traffic_condition, vehicle_status, available_seats, seats_layout_json, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(
    sql,
    [vehicle_id, route_id, latitude, longitude, speed, traffic_condition, vehicle_status, available_seats, seatsJson, now],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'ok', timestamp: now, vehicle_id });
    }
  );
});

app.get('/api/telemetry', (req, res) => {
  db.all('SELECT * FROM live_telemetry ORDER BY updated_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/telemetry/route/:routeId', (req, res) => {
  const routeId = req.params.routeId;
  db.all('SELECT * FROM live_telemetry WHERE route_id = ? ORDER BY updated_at DESC', [routeId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/telemetry/latest', (req, res) => {
  const routeId = req.query.routeId;
  db.get(
    'SELECT * FROM live_telemetry WHERE route_id = ? ORDER BY updated_at DESC LIMIT 1',
    [routeId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row || {});
    }
  );
});

app.delete('/api/telemetry/:vehicleId', (req, res) => {
  db.run('DELETE FROM live_telemetry WHERE vehicle_id = ?', [req.params.vehicleId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Active bus removed from telemetry feed', vehicle_id: req.params.vehicleId });
  });
});

// -------------------------------------------------------------
// 4. PHYSICAL BUS STOPS & GEOFENCES
// -------------------------------------------------------------
app.get('/api/stops', (req, res) => {
  db.all('SELECT * FROM bus_stops', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/stops', (req, res) => {
  const { stop_code, stop_name, latitude, longitude, geofence_radius, associated_routes, status } = req.body;
  const sql = `INSERT OR REPLACE INTO bus_stops (stop_code, stop_name, latitude, longitude, geofence_radius, associated_routes, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [stop_code, stop_name, latitude, longitude, geofence_radius, associated_routes, status || 'Active'], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Bus stop registered successfully', code: stop_code });
  });
});

app.delete('/api/stops/:code', (req, res) => {
  db.run('DELETE FROM bus_stops WHERE stop_code = ?', [req.params.code], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Bus stop removed', code: req.params.code });
  });
});

// -------------------------------------------------------------
// 5. PASSES CATALOG & EXPIRED-PURGE ENDPOINTS
// -------------------------------------------------------------
app.get('/api/passes', (req, res) => {
  db.all('SELECT * FROM passes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const formatted = rows.map(pass => ({
      ...pass,
      id: pass.pass_id,
      eligibleRoutes: pass.eligible_routes ? pass.eligible_routes.split(',') : []
    }));
    res.json(formatted);
  });
});

app.post('/api/passes/book', (req, res) => {
  const { username, pass_id, id, pass_name, price, validity, category } = req.body;
  const targetPassId = pass_id || id;

  if (!username || !targetPassId) {
    return res.status(400).json({ error: 'Username and pass details are required' });
  }

  const nowMs = Date.now();
  const bookedAt = new Date().toLocaleString();
  const expiresAt = nowMs + getDurationMs(validity);

  const sql = `INSERT INTO booked_passes (username, pass_id, pass_name, price, validity, category, booked_at, expires_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`;

  db.run(sql, [username.trim(), targetPassId, pass_name, price, validity, category, bookedAt, expiresAt], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Transit pass booked successfully!', id: this.lastID, pass_name, bookedAt, expiresAt });
  });
});

app.get('/api/passes/my-passes', (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: 'Username query parameter is required' });

  db.all('SELECT * FROM booked_passes WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))', [username], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const activeOnly = (rows || []).filter(p => !isPassExpired(p));

    rows.forEach(p => {
      if (isPassExpired(p) && p.status !== 'EXPIRED') {
        db.run('UPDATE booked_passes SET status = "EXPIRED" WHERE id = ?', [p.id]);
      }
    });

    res.json(activeOnly);
  });
});

app.get('/api/passes/all-bookings', (req, res) => {
  db.all('SELECT * FROM booked_passes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const activeOnly = (rows || []).filter(p => !isPassExpired(p));

    rows.forEach(p => {
      if (isPassExpired(p) && p.status !== 'EXPIRED') {
        db.run('UPDATE booked_passes SET status = "EXPIRED" WHERE id = ?', [p.id]);
      }
    });

    res.json(activeOnly);
  });
});

// -------------------------------------------------------------
// 6. DELAY AUDIT LOGS
// -------------------------------------------------------------
app.get('/api/logs', (req, res) => {
  db.all('SELECT * FROM trip_delay_logs ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// -------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 TransitPulse Full-Stack API Engine is LIVE on port ${PORT}`);
  console.log(`=============================================================\n`);
});
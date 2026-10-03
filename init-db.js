const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./transitpulse.db');

db.serialize(() => {
  console.log("Creating database tables...");

  // 1. Users & Authentication Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL
    )
  `);

  // 2. Corridors & Stops Hierarchy Table
  db.run(`
    CREATE TABLE IF NOT EXISTS routes (
      route_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bus_reg TEXT NOT NULL,
      default_speed INTEGER NOT NULL,
      default_eta TEXT NOT NULL,
      distance TEXT NOT NULL,
      stops_json TEXT NOT NULL
    )
  `);

  // 3. Registered Physical Stops & GPS Geofences Table
  db.run(`
    CREATE TABLE IF NOT EXISTS bus_stops (
      stop_code TEXT PRIMARY KEY,
      stop_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      geofence_radius TEXT NOT NULL,
      associated_routes TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `);

  // 4. Live Vehicle Telemetry Ingestion Table
  db.run(`
    CREATE TABLE IF NOT EXISTS live_telemetry (
      vehicle_id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      speed REAL NOT NULL,
      traffic_condition TEXT NOT NULL,
      vehicle_status TEXT NOT NULL,
      available_seats INTEGER NOT NULL,
      seats_layout_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 5. Concession Passes & Tariff Catalog Table
  db.run(`
    CREATE TABLE IF NOT EXISTS passes (
      pass_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price TEXT NOT NULL,
      validity TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      eligible_routes TEXT NOT NULL
    )
  `);

  // 6. Operational Delay Audit Logs Table
  db.run(`
    CREATE TABLE IF NOT EXISTS trip_delay_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      route_code TEXT NOT NULL,
      bus_plate TEXT NOT NULL,
      scheduled_arrival TEXT NOT NULL,
      actual_arrival TEXT NOT NULL,
      deviation TEXT NOT NULL,
      primary_factor TEXT NOT NULL
    )
  `);

  console.log("Seeding baseline records...");

  // Seed Users (matching login_2.html authorization keywords)
  const insertUser = db.prepare(`INSERT OR REPLACE INTO users (username, password, role) VALUES (?, ?, ?)`);
  insertUser.run('commute_patiala', 'pass123', 'commuter');
  insertUser.run('driver_101', 'pass123', 'driver');
  insertUser.run('admin_ops', 'pass123', 'admin');
  insertUser.finalize();

  // Seed Routes (matching commuter_3.html and admin_2.html data)
  const insertRoute = db.prepare(`INSERT OR REPLACE INTO routes VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertRoute.run(
    'route-101',
    'Route 101: Bus Stand ⇄ Railway Station',
    'PB-11-AA-1011',
    28,
    '07',
    '1.8 km remaining',
    JSON.stringify([
      { name: "General Bus Stand", time: "08:10 AM" },
      { name: "Fountain Chowk", time: "08:18 AM" },
      { name: "Civil Hospital", time: "08:26 AM" },
      { name: "Railway Station", time: "08:35 AM" }
    ])
  );
  insertRoute.run(
    'route-102',
    'Route 102: Punjabi University ⇄ Model Town',
    'PB-11-BC-2022',
    32,
    '11',
    '3.4 km remaining',
    JSON.stringify([
      { name: "Punjabi University", time: "09:00 AM" },
      { name: "Thapar Chowk", time: "09:12 AM" },
      { name: "Model Town", time: "09:25 AM" }
    ])
  );
  insertRoute.run(
    'route-103',
    'Route 103: Tripuri ⇄ Urban Estate',
    'PB-11-CD-3033',
    24,
    '05',
    '1.2 km remaining',
    JSON.stringify([
      { name: "Tripuri Market", time: "07:45 AM" },
      { name: "Leela Bhawan", time: "08:00 AM" },
      { name: "Urban Estate II", time: "08:20 AM" }
    ])
  );
  insertRoute.run(
    'route-104',
    'Route 104: Patiala ⇄ Chandigarh ISBT-43 Express',
    'PB-11-DE-4044',
    54,
    '22',
    '18.5 km remaining',
    JSON.stringify([
      { name: "Patiala Stand", time: "07:00 AM" },
      { name: "Rajpura Bypass", time: "07:35 AM" },
      { name: "Zirakpur Flyover", time: "08:15 AM" },
      { name: "Chandigarh ISBT-43", time: "08:45 AM" }
    ])
  );
  insertRoute.run(
    'route-105',
    'Route 105: Patiala ⇄ Ludhiana ISBT Express',
    'PB-11-EF-5055',
    48,
    '35',
    '29.0 km remaining',
    JSON.stringify([
      { name: "Patiala Stand", time: "06:30 AM" },
      { name: "Nabha Gate", time: "07:10 AM" },
      { name: "Malerkotla Chowk", time: "07:45 AM" },
      { name: "Ludhiana ISBT", time: "08:40 AM" }
    ])
  );
  insertRoute.finalize();

  // Seed Physical Bus Stops (matching admin_2.html Tab 4)
  const insertStop = db.prepare(`INSERT OR REPLACE INTO bus_stops VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertStop.run('STP-01', 'Patiala Central Bus Stand', 30.339810, 76.386920, '50 meters', 'Route 101, Route 104, Route 105', 'Active');
  insertStop.run('STP-02', 'Patiala Railway Station', 30.327450, 76.398120, '40 meters', 'Route 101', 'Active');
  insertStop.run('STP-03', 'Punjabi University Gate', 30.358210, 76.452030, '45 meters', 'Route 102', 'Active');
  insertStop.run('STP-04', 'Model Town Central', 30.326890, 76.376120, '35 meters', 'Route 102', 'Active');
  insertStop.run('STP-05', 'Tripuri Main Bazar', 30.351230, 76.388910, '35 meters', 'Route 103', 'Active');
  insertStop.run('STP-06', 'Urban Estate Phase 2', 30.344100, 76.431200, '40 meters', 'Route 103', 'Active');
  insertStop.run('STP-07', 'Chandigarh ISBT Sector 43', 30.725910, 76.745810, '60 meters', 'Route 104', 'Active');
  insertStop.run('STP-08', 'Ludhiana Central ISBT', 30.898420, 75.857190, '60 meters', 'Route 105', 'Active');
  insertStop.finalize();

  // Seed Initial Vehicle Telemetry (matching dc (1).html seat layout format)
  const defaultSeatLayout = {};
  for (let i = 1; i <= 16; i++) {
    defaultSeatLayout['S' + i] = true;
  }
  const insertTelemetry = db.prepare(`INSERT OR REPLACE INTO live_telemetry VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertTelemetry.run(
    'PB-11-AA-1011',
    'R101_UP',
    30.339810,
    76.386920,
    28.0,
    'Normal',
    'Running Fine',
    16,
    JSON.stringify(defaultSeatLayout),
    new Date().toISOString()
  );
  insertTelemetry.finalize();

  // Seed Passes Catalog (matching passes_3.js)
  const insertPass = db.prepare(`INSERT OR REPLACE INTO passes VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertPass.run('pass-day-hop', 'Patiala City Hopper', '₹40', '24 Hours (Unlimited)', 'Daily', 'Valid on all intra-city Patiala municipal corridors. Hop on and hop off any municipal city bus.', 'route-101,route-102,route-103');
  insertPass.run('pass-student-term', 'Campus Scholar Monthly', '₹250', '30 Days', 'Student', 'Subsidized travel between Model Town and Punjabi University. Valid student institution ID required upon boarding.', 'route-102');
  insertPass.run('pass-commuter-monthly', 'Urban Resident Monthly', '₹650', '30 Days', 'Monthly', 'Unlimited trips across all Patiala intra-city corridors for daily office, market, and industrial commuters.', 'route-101,route-102,route-103');
  insertPass.run('pass-tricity-corridor', 'Capital Link Corridor Pass', '₹1,400', '30 Days', 'Monthly', 'Daily round-trip transit pass on the high-speed NH-7 corridor between Patiala and Chandigarh ISBT-43 / Mohali.', 'route-104');
  insertPass.run('pass-punjab-regional', 'PRTC Punjab Regional Permit', '₹1,950', '30 Days', 'Interstate', 'Multi-city regional permit valid on state express highways connecting Patiala, Nabha, Ludhiana, and Chandigarh.', 'route-104,route-105');
  insertPass.finalize();

  // Seed Delay Audit Logs (matching admin_2.html Tab 2)
  const insertLog = db.prepare(`INSERT OR REPLACE INTO trip_delay_logs (timestamp, route_code, bus_plate, scheduled_arrival, actual_arrival, deviation, primary_factor) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertLog.run('Today, 16:10', 'Route 102', 'PB-11-BC-2022', '16:05', '16:12', '+7 min', 'Leela Bhawan Market Congestion');
  insertLog.run('Today, 15:30', 'Route 101', 'PB-11-AA-1011', '15:30', '15:31', '+1 min', 'Normal Traffic');
  insertLog.run('Today, 14:45', 'Route 104', 'PB-11-DE-4044', '14:25', '14:50', '+25 min', 'Zirakpur Flyover Toll Slowdown');
  insertLog.run('Today, 13:15', 'Route 103', 'PB-11-CD-3033', '13:10', '13:14', '+4 min', 'Sirhind Road Crossing Queue');
  insertLog.finalize();

  console.log("Database successfully populated in transitpulse.db");
});

db.close();
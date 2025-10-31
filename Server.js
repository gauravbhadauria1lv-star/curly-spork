const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(DB_FILE);

// Initialize DB tables if not present
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS menu (
    day TEXT NOT NULL, -- Mon, Tue, ...
    meal TEXT NOT NULL, -- breakfast/lunch/dinner
    description TEXT,
    PRIMARY KEY(day, meal)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS selections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    meal TEXT NOT NULL,
    will_attend INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, day, meal),
    FOREIGN KEY(member_id) REFERENCES members(id)
  )`);
});

// Helper: default weekly menu seed (if empty)
function seedMenuIfEmpty() {
  db.get("SELECT COUNT(*) as cnt FROM menu", (err,row) => {
    if(err) return console.error(err);
    if(row.cnt === 0) {
      const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const meals = ['breakfast','lunch','dinner'];
      const stmt = db.prepare("INSERT INTO menu(day, meal, description) VALUES(?,?,?)");
      days.forEach(d => {
        meals.forEach(m => {
          stmt.run(d, m, `${m} default for ${d}`);
        });
      });
      stmt.finalize();
      console.log('Seeded default weekly menu.');
    }
  });
}
seedMenuIfEmpty();

/* --- API --- */

// Register a member
app.post('/api/register', (req, res) => {
  const { name, room } = req.body;
  if(!name) return res.status(400).json({ error: 'name required' });
  db.run("INSERT INTO members(name, room) VALUES(?,?)", [name, room || null], function(err){
    if(err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, room });
  });
});

// List members (admin)
app.get('/api/members', (req,res) => {
  db.all("SELECT * FROM members ORDER BY id DESC", (err,rows) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get weekly menu
app.get('/api/menu', (req,res) => {
  db.all("SELECT day, meal, description FROM menu", (err,rows) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Update menu (admin)
app.post('/api/menu', (req,res) => {
  const items = req.body; // expect [{day, meal, description}, ...]
  if(!Array.isArray(items)) return res.status(400).json({ error: 'send array of menu items' });
  const stmt = db.prepare("INSERT OR REPLACE INTO menu(day, meal, description) VALUES(?,?,?)");
  db.serialize(() => {
    items.forEach(it => stmt.run(it.day, it.meal, it.description || ''));
    stmt.finalize();
    res.json({ ok: true });
  });
});

// Member sets selection for a meal on a day (create or update)
app.post('/api/selection', (req,res) => {
  const { member_id, day, meal, will_attend } = req.body;
  if(!member_id || !day || !meal) return res.status(400).json({ error: 'member_id, day, meal required' });
  const val = will_attend ? 1 : 0;
  db.run(`
    INSERT INTO selections(member_id, day, meal, will_attend)
    VALUES(?,?,?,?)
    ON CONFLICT(member_id, day, meal) DO UPDATE SET will_attend=excluded.will_attend, created_at=CURRENT_TIMESTAMP
  `, [member_id, day, meal, val], function(err){
    if(err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// Get member selections (for a member)
app.get('/api/selections/:member_id', (req,res) => {
  const member_id = req.params.member_id;
  db.all("SELECT day, meal, will_attend FROM selections WHERE member_id = ?", [member_id], (err,rows) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Summary for admin: counts per day+meal
app.get('/api/summary', (req,res) => {
  const sql = `SELECT day, meal, SUM(will_attend) as count
    FROM selections
    GROUP BY day, meal
    ORDER BY
      CASE day
        WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3 WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 WHEN 'Sun' THEN 7 ELSE 8 END,
      meal`;
  db.all(sql, (err,rows) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Clear selections (admin) - useful for testing
app.post('/api/clear-selections', (req,res) => {
  db.run("DELETE FROM selections", [], function(err){
    if(err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// Serve index.html at root (static in /public)
app.get('/', (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

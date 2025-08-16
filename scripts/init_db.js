import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new sqlite3.Database(path.join(__dirname, '..', 'data', 'database.sqlite'));

db.serialize(async () => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule TEXT UNIQUE,
    password TEXT,
    role TEXT,
    must_change INTEGER
  )`);

  const adminPass = await bcrypt.hash('Admin123!', 10);
  const paPass = await bcrypt.hash('PA123456!', 10);

  db.run('INSERT OR IGNORE INTO users (matricule, password, role, must_change) VALUES (?, ?, ?, ?)', ['ADMIN', adminPass, 'admin', 0]);
  db.run('INSERT OR IGNORE INTO users (matricule, password, role, must_change) VALUES (?, ?, ?, ?)', ['PA001', paPass, 'pa', 1]);

  console.log('Database initialized with default users.');
});

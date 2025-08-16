const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const DB_PATH = path.join(dataDir, 'database.sqlite');
if (fs.existsSync(DB_PATH)) {
  console.log('Database already exists at', DB_PATH);
  process.exit(0);
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(async () => {
  db.run(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    matricule TEXT UNIQUE,
    nom TEXT,
    prenom TEXT,
    role TEXT,
    password_hash TEXT,
    must_change_pw INTEGER DEFAULT 1
  )`);
  db.run(`CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    nom TEXT,
    prenom TEXT,
    matricule TEXT UNIQUE,
    telephone TEXT,
    grade TEXT,
    brigades TEXT,
    formations TEXT
  )`);
  db.run(`CREATE TABLE history (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    user_id TEXT,
    date INTEGER,
    changes TEXT
  )`);

  const adminPass = await bcrypt.hash('Admin123!', 10);
  const paPass = await bcrypt.hash('PA123456!', 10);

  db.run('INSERT INTO users (id, matricule, nom, prenom, role, password_hash, must_change_pw) VALUES (?,?,?,?,?,?,?)',
    uuidv4(), 'ADMIN', 'Super', 'Admin', 'admin', adminPass, 0);
  db.run('INSERT INTO users (id, matricule, nom, prenom, role, password_hash, must_change_pw) VALUES (?,?,?,?,?,?,?)',
    uuidv4(), 'PA001', 'Paul', 'AgentPA', 'PA', paPass, 1);

  // sample agents
  db.run('INSERT INTO agents (id, nom, prenom, matricule, telephone, grade, brigades, formations) VALUES (?,?,?,?,?,?,?,?)',
    uuidv4(), 'Dupont', 'Jean', 'A100', '0601010101', 'rookie', JSON.stringify(['Mary','ASD']), JSON.stringify(['10-20','ISTC']));
  db.run('INSERT INTO agents (id, nom, prenom, matricule, telephone, grade, brigades, formations) VALUES (?,?,?,?,?,?,?,?)',
    uuidv4(), 'Martin', 'Luc', 'A101', '0602020202', 'officier-I', JSON.stringify(['Crime']), JSON.stringify(['procédure','first-Lincoln']));

  console.log('Initialized DB at', DB_PATH);
  db.close();
});
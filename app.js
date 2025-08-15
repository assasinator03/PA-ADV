const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const path = require('path');
const morgan = require('morgan');
const methodOverride = require('method-override');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(morgan('dev'));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'supersecret-pa-adv',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(path.join(__dirname, 'police-academy.sqlite'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN','PA','AGENT')),
    mustChangePassword INTEGER NOT NULL DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule TEXT UNIQUE NOT NULL,
    lastName TEXT NOT NULL,
    firstName TEXT NOT NULL,
    phone TEXT,
    grade TEXT NOT NULL CHECK(grade IN ('rookie','officier-I','officier-II','officier-III')),
    brigade TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS formations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS agent_formations (
    agentId INTEGER NOT NULL,
    formationId INTEGER NOT NULL,
    PRIMARY KEY (agentId, formationId),
    FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (formationId) REFERENCES formations(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    targetMatricule TEXT NOT NULL,
    action TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`);

  const defaults = ['10-20','ISTC','procédure','first-Lincoln','Déminage'];
  defaults.forEach(name => {
    db.run(`INSERT OR IGNORE INTO formations (name) VALUES (?)`, [name]);
  });

  const defaultPassword = 'admin123';
  const hash = bcrypt.hashSync(defaultPassword, 10);
  db.run(`INSERT OR IGNORE INTO users (id, username, passwordHash, role, mustChangePassword) VALUES (1,'admin', ?, 'ADMIN', 1)`, [hash]);
});

function ensureAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function ensureRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== role) return res.status(403).send('Accès refusé');
    next();
  };
}
function ensurePA(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role === 'PA' || req.session.user.role === 'ADMIN') return next();
  return res.status(403).send('Accès réservé aux agents PA');
}

app.use((req, res, next) => {
  res.locals.layout = function(view){ this._layoutFile = view; };
  res.locals.user = req.session.user;
  next();
});

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username=?`, [username], async (err, user) => {
    if (err) return res.status(500).send('Erreur serveur');
    if (!user) return res.status(401).render('login', { error: 'Identifiants invalides' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).render('login', { error: 'Identifiants invalides' });
    req.session.user = { id: user.id, username: user.username, role: user.role, mustChangePassword: !!user.mustChangePassword };
    if (user.mustChangePassword) return res.redirect('/profile');
    return res.redirect('/');
  });
});
app.get('/logout', (req, res) => { req.session.destroy(()=> res.redirect('/login')); });

app.get('/', ensureAuth, (req, res) => { res.render('dashboard', { title: 'Accueil' }); });

app.get('/profile', ensureAuth, (req, res) => res.render('profile', { title: 'Profil', error: null, ok: null }));
app.post('/profile/change-password',
  ensureAuth,
  body('password').isLength({min:6}).withMessage('6 caractères min'),
  body('confirm').custom((val, {req}) => val === req.body.password).withMessage('La confirmation ne correspond pas'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.render('profile', { title: 'Profil', error: errors.array()[0].msg, ok: null });
    const hash = bcrypt.hashSync(req.body.password, 10);
    db.run(`UPDATE users SET passwordHash=?, mustChangePassword=0 WHERE id=?`, [hash, req.session.user.id], (err)=>{
      if (err) return res.render('profile', { title: 'Profil', error: 'Erreur serveur', ok: null });
      req.session.user.mustChangePassword = false;
      res.render('profile', { title: 'Profil', error: null, ok: 'Mot de passe mis à jour.' });
    });
  }
);

// Agents
app.get('/agents', ensureAuth, (req, res) => {
  const q = req.query.q;
  let sql = `SELECT * FROM agents`;
  let params = [];
  if (q) { sql += ` WHERE matricule LIKE ?`; params.push('%'+q+'%'); }
  sql += ` ORDER BY lastName ASC`;
  db.all(sql, params, (err, agents) => {
    if (err) agents = [];
    res.render('agents', { title: 'Liste du personnel', agents, q, canEdit: (req.session.user.role==='PA'||req.session.user.role==='ADMIN') });
  });
});
app.get('/agents/new', ensurePA, (req, res) => {
  res.render('agent_form', { title: 'Nouvel agent', action: '/agents', agent: null, selectedFormations: [] });
});
app.post('/agents', ensurePA, (req, res) => {
  const { matricule, lastName, firstName, phone, grade, brigade } = req.body;
  db.run(`INSERT INTO agents (matricule, lastName, firstName, phone, grade, brigade) VALUES (?,?,?,?,?,?)`,
    [matricule, lastName, firstName, phone, grade, brigade], function(err){
      if (err) return res.status(400).send('Erreur création agent: ' + err.message);
      const agentId = this.lastID;
      const arr = Array.isArray(req.body.formations) ? req.body.formations : (req.body.formations ? [req.body.formations] : []);
      if (arr.length) {
        db.all(`SELECT id,name FROM formations`, [], (e, rows)=> {
          const map = new Map(rows.map(r=>[r.name, r.id]));
          const stmt = db.prepare(`INSERT OR IGNORE INTO agent_formations (agentId, formationId) VALUES (?,?)`);
          arr.forEach(name => stmt.run(agentId, map.get(name)));
          stmt.finalize(()=>{
            logHistory(req.session.user.username, matricule, `Création agent + formations: ${arr.join(', ')}`);
            res.redirect('/agents/'+agentId);
          });
        });
      } else {
        logHistory(req.session.user.username, matricule, `Création agent`);
        res.redirect('/agents/'+agentId);
      }
    });
});
app.get('/agents/:id', ensureAuth, (req, res) => {
  const id = req.params.id;
  db.get(`SELECT * FROM agents WHERE id=?`, [id], (err, agent)=>{
    if (!agent) return res.status(404).send('Agent introuvable');
    db.all(`SELECT f.name FROM agent_formations af JOIN formations f ON f.id=af.formationId WHERE af.agentId=?`, [id], (e, rows)=>{
      const formations = rows.map(r=>r.name);
      res.render('agent_view', { title: 'Fiche agent', agent, formations, canEdit: (req.session.user.role==='PA'||req.session.user.role==='ADMIN') });
    });
  });
});
app.get('/agents/:id/edit', ensurePA, (req, res) => {
  const id = req.params.id;
  db.get(`SELECT * FROM agents WHERE id=?`, [id], (err, agent)=>{
    if (!agent) return res.status(404).send('Agent introuvable');
    db.all(`SELECT f.name FROM agent_formations af JOIN formations f ON f.id=af.formationId WHERE af.agentId=?`, [id], (e, rows)=>{
      const selectedFormations = rows.map(r=>r.name);
      res.render('agent_form', { title: 'Modifier agent', action: '/agents/'+id+'?_method=PUT', agent, selectedFormations });
    });
  });
});
app.put('/agents/:id', ensurePA, (req, res) => {
  const id = req.params.id;
  const { matricule, lastName, firstName, phone, grade, brigade } = req.body;
  db.run(`UPDATE agents SET matricule=?, lastName=?, firstName=?, phone=?, grade=?, brigade=? WHERE id=?`,
    [matricule, lastName, firstName, phone, grade, brigade, id], (err)=>{
      if (err) return res.status(400).send('Erreur mise à jour: ' + err.message);
      const arr = Array.isArray(req.body.formations) ? req.body.formations : (req.body.formations ? [req.body.formations] : []);
      db.run(`DELETE FROM agent_formations WHERE agentId=?`, [id], (e)=>{
        db.all(`SELECT id,name FROM formations`, [], (e2, rows)=> {
          const map = new Map(rows.map(r=>[r.name, r.id]));
          const stmt = db.prepare(`INSERT OR IGNORE INTO agent_formations (agentId, formationId) VALUES (?,?)`);
          arr.forEach(name => stmt.run(id, map.get(name)));
          stmt.finalize(()=>{
            logHistory(req.session.user.username, matricule, `Mise à jour fiche (grade=${grade}, brigade=${brigade}, formations=[${arr.join(', ')}])`);
            res.redirect('/agents/'+id);
          });
        });
      });
    });
});

function logHistory(actor, targetMatricule, action) {
  db.run(`INSERT INTO history (actor, targetMatricule, action, createdAt) VALUES (?,?,?,?)`,
    [actor, targetMatricule, action, new Date().toISOString()]);
}
app.get('/history', ensureAuth, (req, res) => {
  db.all(`SELECT * FROM history ORDER BY createdAt DESC LIMIT 200`, [], (err, logs)=>{
    res.render('history', { title: 'Historique', logs: logs || [] });
  });
});

// Admin
app.get('/admin', ensureRole('ADMIN'), (req, res) => {
  db.all(`SELECT id, username, role, mustChangePassword FROM users ORDER BY username ASC`, [], (err, users)=>{
    res.render('admin', { title: 'Administration', users: users || [] });
  });
});
app.post('/admin/users', ensureRole('ADMIN'), (req, res) => {
  const { username, password, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.run(`INSERT INTO users (username, passwordHash, role, mustChangePassword) VALUES (?,?,?,1)`,
    [username, hash, role.toUpperCase()], (err)=>{
      if (err) return res.status(400).send('Erreur création utilisateur: ' + err.message);
      res.redirect('/admin');
    });
});
app.post('/admin/users/:id/delete', ensureRole('ADMIN'), (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM users WHERE id=?`, [id], (err)=>{ res.redirect('/admin'); });
});

app.listen(PORT, () => { console.log(`Police-Academy-ADV en écoute sur http://localhost:${PORT}`); });

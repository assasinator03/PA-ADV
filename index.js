const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { v4: uuidv4 } = require('uuid');

const app = express();
const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

let db;
async function initDb(){
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
}
initDb();

// load current user
app.use(async (req, res, next) => {
  res.locals.currentUser = null;
  if (req.session && req.session.userId) {
    const user = await db.get('SELECT id, matricule, nom, prenom, role, must_change_pw FROM users WHERE id = ?', req.session.userId);
    if (user) res.locals.currentUser = user;
  }
  next();
});

function requireLogin(req, res, next){
  if (!res.locals.currentUser) return res.redirect('/login');
  next();
}

function requireRoles(roles){
  return (req, res, next) => {
    if (!res.locals.currentUser) return res.redirect('/login');
    if (roles.includes(res.locals.currentUser.role) || res.locals.currentUser.role === 'admin') return next();
    return res.status(403).send('Accès refusé');
  };
}

// Home
app.get('/', (req, res) => {
  if (res.locals.currentUser) return res.redirect('/dashboard');
  res.redirect('/login');
});

// Login
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
  const { matricule, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE matricule = ?', matricule);
  if (!user) return res.render('login', { error: 'Matricule ou mot de passe invalide' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.render('login', { error: 'Matricule ou mot de passe invalide' });
  req.session.userId = user.id;
  if (user.must_change_pw) return res.redirect('/change-password');
  res.redirect('/dashboard');
});

// Change password on first login or from profile
app.get('/change-password', requireLogin, (req, res) => {
  res.render('change-password', { error: null });
});
app.post('/change-password', requireLogin, async (req, res) => {
  const { password, password2 } = req.body;
  if (!password || password !== password2) return res.render('change-password', { error: 'Les mots de passe ne correspondent pas' });
  const hash = await bcrypt.hash(password, 10);
  await db.run('UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?', hash, req.session.userId);
  res.redirect('/dashboard');
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Dashboard - list agents + search by matricule
app.get('/dashboard', requireLogin, async (req, res) => {
  const q = req.query.q || '';
  let agents;
  if (q) agents = await db.all('SELECT * FROM agents WHERE matricule = ? COLLATE NOCASE', q);
  else agents = await db.all('SELECT * FROM agents ORDER BY nom LIMIT 500');
  res.render('dashboard', { agents, q });
});

// Create agent (PA only)
app.get('/agents/new', requireLogin, requireRoles(['PA']), (req, res) => {
  res.render('agent-form', { agent: null, error: null });
});
app.post('/agents/new', requireLogin, requireRoles(['PA']), async (req, res) => {
  const { nom, prenom, matricule, telephone, grade, brigades, formations } = req.body;
  // brigades/formations may be string or array
  const brig = Array.isArray(brigades) ? JSON.stringify(brigades) : JSON.stringify(brigades ? [brigades] : []);
  const forms = Array.isArray(formations) ? JSON.stringify(formations) : JSON.stringify(formations ? [formations] : []);
  try {
    await db.run('INSERT INTO agents (id, nom, prenom, matricule, telephone, grade, brigades, formations) VALUES (?,?,?,?,?,?,?,?)',
      uuidv4(), nom, prenom, matricule, telephone, grade, brig, forms);
    res.redirect('/dashboard');
  } catch(e){
    res.render('agent-form', { agent: null, error: 'Erreur lors de la création: ' + e.message });
  }
});

// View agent
app.get('/agents/:id', requireLogin, async (req, res) => {
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  if (!agent) return res.status(404).send('Agent non trouvé');
  // parse arrays
  agent.brigades = agent.brigades ? JSON.parse(agent.brigades) : [];
  agent.formations = agent.formations ? JSON.parse(agent.formations) : [];
  const history = await db.all('SELECT h.*, u.matricule as pa_matricule, u.nom as pa_nom FROM history h LEFT JOIN users u ON h.user_id = u.id WHERE h.agent_id = ? ORDER BY h.date DESC', req.params.id);
  res.render('agent-view', { agent, history });
});

// Edit agent (PA only)
app.get('/agents/:id/edit', requireLogin, requireRoles(['PA']), async (req, res) => {
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  if (!agent) return res.status(404).send('Agent non trouvé');
  agent.brigades = agent.brigades ? JSON.parse(agent.brigades) : [];
  agent.formations = agent.formations ? JSON.parse(agent.formations) : [];
  res.render('agent-form', { agent, error: null });
});
app.post('/agents/:id/edit', requireLogin, requireRoles(['PA']), async (req, res) => {
  const { nom, prenom, matricule, telephone, grade, brigades, formations } = req.body;
  const brig = Array.isArray(brigades) ? JSON.stringify(brigades) : JSON.stringify(brigades ? [brigades] : []);
  const forms = Array.isArray(formations) ? JSON.stringify(formations) : JSON.stringify(formations ? [formations] : []);
  const before = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  await db.run('UPDATE agents SET nom=?, prenom=?, matricule=?, telephone=?, grade=?, brigades=?, formations=? WHERE id=?',
    nom, prenom, matricule, telephone, grade, brig, forms, req.params.id);
  const after = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  await db.run('INSERT INTO history (id, agent_id, user_id, date, changes) VALUES (?,?,?,?,?)',
    uuidv4(), req.params.id, req.session.userId, Date.now(), JSON.stringify({ before, after }));
  res.redirect('/agents/' + req.params.id);
});

// Delete agent (PA only)
app.post('/agents/:id/delete', requireLogin, requireRoles(['PA']), async (req, res) => {
  const before = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  await db.run('DELETE FROM agents WHERE id = ?', req.params.id);
  await db.run('INSERT INTO history (id, agent_id, user_id, date, changes) VALUES (?,?,?,?,?)',
    uuidv4(), req.params.id, req.session.userId, Date.now(), JSON.stringify({ action: 'deleted', before }));
  res.redirect('/dashboard');
});

// Admin panel - only admin
app.get('/admin', requireLogin, requireRoles(['admin']), async (req, res) => {
  const users = await db.all('SELECT id, matricule, nom, prenom, role FROM users ORDER BY matricule');
  res.render('admin', { users });
});

app.get('/admin/users/new', requireLogin, requireRoles(['admin']), (req, res) => {
  res.render('user-form', { user: null, error: null });
});
app.post('/admin/users/new', requireLogin, requireRoles(['admin']), async (req, res) => {
  const { matricule, nom, prenom, role, password } = req.body;
  const pw = password || Math.random().toString(36).slice(-8);
  const hash = await bcrypt.hash(pw, 10);
  try {
    await db.run('INSERT INTO users (id, matricule, nom, prenom, role, password_hash, must_change_pw) VALUES (?,?,?,?,?,?,?)',
      uuidv4(), matricule, nom, prenom, role, hash, 1);
    res.redirect('/admin');
  } catch(e){
    res.render('user-form', { user: null, error: 'Erreur création utilisateur: ' + e.message });
  }
});

app.post('/admin/users/:id/delete', requireLogin, requireRoles(['admin']), async (req, res) => {
  await db.run('DELETE FROM users WHERE id = ?', req.params.id);
  res.redirect('/admin');
});

// promote/demote user
app.post('/admin/users/:id/role', requireLogin, requireRoles(['admin']), async (req, res) => {
  const { role } = req.body;
  await db.run('UPDATE users SET role = ? WHERE id = ?', role, req.params.id);
  res.redirect('/admin');
});

// history page (PA and admin)
app.get('/history', requireLogin, requireRoles(['PA','admin']), async (req, res) => {
  const logs = await db.all('SELECT h.*, u.matricule as pa_matricule, u.nom as pa_nom FROM history h LEFT JOIN users u ON h.user_id = u.id ORDER BY h.date DESC LIMIT 500');
  res.render('history', { logs });
});

// profile - change password (after first login or later)
app.get('/profile', requireLogin, (req, res) => {
  res.render('profile', { error: null });
});
app.post('/profile', requireLogin, async (req, res) => {
  const { password, password2 } = req.body;
  if (!password || password !== password2) return res.render('profile', { error: 'Les mots de passe ne correspondent pas' });
  const hash = await bcrypt.hash(password, 10);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, req.session.userId);
  res.redirect('/dashboard');
});

// static logo route
app.get('/logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logo.png'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on port', PORT));
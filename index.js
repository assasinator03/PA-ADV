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
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
  secret: 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

let db;

async function initDb(){
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
}
initDb();

// middleware to load user from session
app.use(async (req, res, next) => {
  res.locals.currentUser = null;
  if (req.session && req.session.userId) {
    const user = await db.get('SELECT id, matricule, nom, prenom, role, must_change_pw FROM users WHERE id = ?', req.session.userId);
    if (user) {
      res.locals.currentUser = user;
    }
  }
  next();
});

// helper: require login
function requireLogin(req, res, next){
  if (!res.locals.currentUser) return res.redirect('/login');
  next();
}

// helper: require role
function requireRole(role){
  return (req, res, next) => {
    if (!res.locals.currentUser) return res.redirect('/login');
    if (res.locals.currentUser.role !== role && res.locals.currentUser.role !== 'admin') {
      return res.status(403).send('Accès refusé');
    }
    next();
  };
}

// Home -> redirect to dashboard or login
app.get('/', (req, res) => {
  if (res.locals.currentUser) return res.redirect('/dashboard');
  res.redirect('/login');
});

// LOGIN
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { matricule, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE matricule = ?', matricule);
  if (!user) return res.render('login', { error: 'Matricule ou mot de passe invalide' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.render('login', { error: 'Matricule ou mot de passe invalide' });
  // login
  req.session.userId = user.id;
  // If first login and must_change_pw true -> redirect to change-password
  if (user.must_change_pw) return res.redirect('/change-password');
  res.redirect('/dashboard');
});

// CHANGE PASSWORD
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

// DASHBOARD - list agents + search
app.get('/dashboard', requireLogin, async (req, res) => {
  const q = req.query.q || '';
  let agents;
  if (q) {
    agents = await db.all('SELECT * FROM agents WHERE matricule = ? COLLATE NOCASE', q);
  } else {
    agents = await db.all('SELECT * FROM agents ORDER BY nom LIMIT 200');
  }
  res.render('dashboard', { agents, q });
});

// NEW AGENT
app.get('/agents/new', requireLogin, requireRole('PA'), async (req, res) => {
  res.render('agent-form', { agent: null, error: null });
});
app.post('/agents/new', requireLogin, requireRole('PA'), async (req, res) => {
  const { nom, prenom, matricule, telephone, grade, brigade, formations } = req.body;
  const forms = Array.isArray(formations) ? formations.join(',') : (formations || '');
  try {
    await db.run('INSERT INTO agents (id, nom, prenom, matricule, telephone, grade, brigade, formations) VALUES (?,?,?,?,?,?,?,?)',
      uuidv4(), nom, prenom, matricule, telephone, grade, brigade, forms);
    res.redirect('/dashboard');
  } catch(e) {
    res.render('agent-form', { agent: null, error: 'Erreur lors de la création' });
  }
});

// VIEW AGENT
app.get('/agents/:id', requireLogin, async (req, res) => {
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  if (!agent) return res.status(404).send('Agent non trouvé');
  const history = await db.all('SELECT h.*, u.matricule as pa_matricule, u.nom as pa_nom FROM history h LEFT JOIN users u ON h.user_id = u.id WHERE h.agent_id = ? ORDER BY h.date DESC', req.params.id);
  res.render('agent-view', { agent, history });
});

// EDIT AGENT
app.get('/agents/:id/edit', requireLogin, requireRole('PA'), async (req, res) => {
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  if (!agent) return res.status(404).send('Agent non trouvé');
  res.render('agent-form', { agent, error: null });
});
app.post('/agents/:id/edit', requireLogin, requireRole('PA'), async (req, res) => {
  const { nom, prenom, matricule, telephone, grade, brigade, formations } = req.body;
  const forms = Array.isArray(formations) ? formations.join(',') : (formations || '');
  const agentBefore = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  await db.run('UPDATE agents SET nom=?, prenom=?, matricule=?, telephone=?, grade=?, brigade=?, formations=? WHERE id=?',
    nom, prenom, matricule, telephone, grade, brigade, forms, req.params.id);
  const agentAfter = await db.get('SELECT * FROM agents WHERE id = ?', req.params.id);
  // log history
  await db.run('INSERT INTO history (id, agent_id, user_id, date, changes) VALUES (?,?,?,?,?)',
    uuidv4(), req.params.id, req.session.userId, Date.now(), JSON.stringify({ before: agentBefore, after: agentAfter }));
  res.redirect('/agents/' + req.params.id);
});

// DELETE AGENT
app.post('/agents/:id/delete', requireLogin, requireRole('PA'), async (req, res) => {
  await db.run('DELETE FROM agents WHERE id = ?', req.params.id);
  await db.run('INSERT INTO history (id, agent_id, user_id, date, changes) VALUES (?,?,?,?,?)',
    uuidv4(), req.params.id, req.session.userId, Date.now(), JSON.stringify({ action: 'deleted' }));
  res.redirect('/dashboard');
});

// ADMIN PANEL - manage users
app.get('/admin', requireLogin, requireRole('admin'), async (req, res) => {
  const users = await db.all('SELECT id, matricule, nom, prenom, role FROM users ORDER BY matricule');
  res.render('admin', { users });
});

app.get('/admin/users/new', requireLogin, requireRole('admin'), (req, res) => {
  res.render('user-form', { user: null, error: null });
});
app.post('/admin/users/new', requireLogin, requireRole('admin'), async (req, res) => {
  const { matricule, nom, prenom, role, password } = req.body;
  const pw = password || 'changeme';
  const hash = await bcrypt.hash(pw, 10);
  try {
    await db.run('INSERT INTO users (id, matricule, nom, prenom, role, password_hash, must_change_pw) VALUES (?,?,?,?,?,?,?)',
      uuidv4(), matricule, nom, prenom, role, hash, 1);
    res.redirect('/admin');
  } catch(e) {
    res.render('user-form', { user: null, error: 'Erreur création utilisateur' });
  }
});

app.post('/admin/users/:id/delete', requireLogin, requireRole('admin'), async (req, res) => {
  await db.run('DELETE FROM users WHERE id = ?', req.params.id);
  res.redirect('/admin');
});

// LOGOUT
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// static assets for logo/placeholder
app.get('/logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logo.png'));
});

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server started on port', PORT);
});
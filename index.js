import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);
const db = new sqlite3.Database(path.join(__dirname, 'data', 'database.sqlite'));

// Sessions
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
  secret: 'CHANGE_ME_SECRET',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware auth
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Routes
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
  const { matricule, password } = req.body;
  db.get('SELECT * FROM users WHERE matricule = ?', [matricule], async (err, row) => {
    if (err) return res.render('login', { error: 'Erreur serveur' });
    if (!row) return res.render('login', { error: 'Utilisateur introuvable' });
    const valid = await bcrypt.compare(password, row.password);
    if (!valid) return res.render('login', { error: 'Mot de passe incorrect' });
    req.session.user = { id: row.id, matricule: row.matricule, role: row.role, must_change: row.must_change };
    if (row.must_change) return res.redirect('/change-password');
    res.redirect('/dashboard');
  });
});

app.get('/change-password', requireLogin, (req, res) => {
  if (!req.session.user.must_change) return res.redirect('/dashboard');
  res.render('change-password', { error: null });
});

app.post('/change-password', requireLogin, async (req, res) => {
  const { newPassword } = req.body;
  const hash = await bcrypt.hash(newPassword, 10);
  db.run('UPDATE users SET password = ?, must_change = 0 WHERE id = ?', [hash, req.session.user.id], (err) => {
    if (err) return res.render('change-password', { error: 'Erreur mise à jour' });
    req.session.user.must_change = 0;
    res.redirect('/dashboard');
  });
});

app.get('/dashboard', requireLogin, (req, res) => {
  res.render('dashboard', { user: req.session.user });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));

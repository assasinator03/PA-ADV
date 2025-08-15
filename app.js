
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const ejsLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'devsecret';
const dbPath = path.join(__dirname, 'police-academy.sqlite');
const db = new sqlite3.Database(dbPath);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layout');
app.use(express.urlencoded({extended:true}));
app.use(methodOverride('_method'));
app.use('/css', express.static(path.join(__dirname, 'public','css')));
app.use('/images', express.static(path.join(__dirname, 'public','images')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// --- DB schema ---
db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    passwordHash TEXT,
    role TEXT CHECK(role IN ('ADMIN','PA','AGENT')) NOT NULL DEFAULT 'AGENT',
    mustChangePassword INTEGER NOT NULL DEFAULT 1
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS agents(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule TEXT UNIQUE,
    firstName TEXT,
    lastName TEXT,
    phone TEXT,
    grade TEXT CHECK(grade IN ('rookie','officier-I','officier-II','officier-III','sergent','sergent-chef','lieutenant','lieutenant-chef','capitaine','commandant')) NOT NULL,
    brigade TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS formations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agentId INTEGER,
    label TEXT,
    UNIQUE(agentId,label)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS history(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER,
    actor TEXT,
    targetMatricule TEXT,
    action TEXT
  )`);

  // seed admin if not exists
  db.get(`SELECT * FROM users WHERE username='admin'`, (err,row)=>{
    if(!row){
      const h = bcrypt.hashSync('admin123',10);
      db.run(`INSERT INTO users(username,passwordHash,role,mustChangePassword) VALUES(?,?,?,1)`, ['admin',h,'ADMIN']);
      console.log('Admin user created: admin/admin123');
    }
  });
});

// --- helpers ---
function requireAuth(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  res.locals.user = req.session.user;
  next();
}
function ensurePA(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role==='PA' || req.session.user.role==='ADMIN'){ next(); }
  else res.status(403).send('Accès refusé');
}
function ensureAdmin(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role==='ADMIN'){ next(); }
  else res.status(403).send('Accès refusé');
}
function logHistory(actor,targetMatricule,action){
  db.run(`INSERT INTO history(at,actor,targetMatricule,action) VALUES(?,?,?,?)`, [Date.now(),actor,targetMatricule,action]);
}

// --- auth ---
app.get('/login',(req,res)=>{
  res.render('login',{error:null, layout:false});
});
app.post('/login',(req,res)=>{
  const {username,password}=req.body;
  db.get(`SELECT * FROM users WHERE username=?`,[username],(err,u)=>{
    if(!u) return res.render('login',{error:'Identifiants invalides', layout:false});
    if(!bcrypt.compareSync(password,u.passwordHash)) return res.render('login',{error:'Identifiants invalides', layout:false});
    req.session.user = {id:u.id,username:u.username,role:u.role,mustChangePassword:!!u.mustChangePassword};
    if(u.mustChangePassword) return res.redirect('/profile');
    res.redirect('/');
  });
});
app.get('/logout',(req,res)=>{ req.session.destroy(()=>res.redirect('/login')); });

// --- profile (change password at first login) ---
app.get('/profile', requireAuth, (req,res)=>{
  res.render('profile',{error:null, ok:false, title:'Profil', active:'profile'});
});
app.post('/profile/password', requireAuth, (req,res)=>{
  const {old,new1,new2}=req.body;
  if(new1!==new2) return res.render('profile',{error:'Les mots de passe ne correspondent pas', ok:false, title:'Profil', active:'profile'});
  db.get(`SELECT * FROM users WHERE id=?`,[req.session.user.id],(err,u)=>{
    if(!u || !bcrypt.compareSync(old,u.passwordHash)) return res.render('profile',{error:'Ancien mot de passe incorrect', ok:false, title:'Profil', active:'profile'});
    const h=bcrypt.hashSync(new1,10);
    db.run(`UPDATE users SET passwordHash=?, mustChangePassword=0 WHERE id=?`,[h,req.session.user.id],()=>{
      req.session.user.mustChangePassword=false;
      res.render('profile',{error:null, ok:true, title:'Profil', active:'profile'});
    });
  });
});

// --- home ---
app.get('/', requireAuth, (req,res)=>{
  res.render('home',{title:'Accueil',active:'home'});
});

// --- agents ---
app.get('/agents', requireAuth, (req,res)=>{
  const q=(req.query.q||'').trim();
  let sql='SELECT * FROM agents';
  const params=[];
  if(q){ sql+=' WHERE matricule LIKE ?'; params.push('%'+q+'%'); }
  db.all(sql,params,(e,rows)=>{
    res.render('agents',{title:'Personnel',active:'agents',agents:rows,q,canEdit:(req.session.user.role==='PA'||req.session.user.role==='ADMIN')});
  });
});

app.get('/agents/new', ensurePA, (req,res)=>{
  res.render('agent_form',{title:'Nouvel agent',active:'agents',formTitle:'Créer une fiche', action:'/agents', agent:null, selectedFormations:[]});
});

app.post('/agents', ensurePA, (req,res)=>{
  const {matricule,firstName,lastName,phone,grade,brigade}=req.body;
  db.run(`INSERT INTO agents(matricule,firstName,lastName,phone,grade,brigade) VALUES(?,?,?,?,?,?)`,
    [matricule,firstName,lastName,phone,grade,brigade], function(err){
      if(err) return res.status(400).send('Erreur: '+err.message);
      const id=this.lastID;
      // formations
      const forms = Array.isArray(req.body.formations)? req.body.formations : (req.body.formations?[req.body.formations]:[]);
      forms.forEach(f=> db.run(`INSERT OR IGNORE INTO formations(agentId,label) VALUES(?,?)`,[id,f]));
      logHistory(req.session.user.username, matricule, 'Création de la fiche agent');
      res.redirect('/agents/'+id);
    });
});

app.get('/agents/:id', requireAuth, (req,res)=>{
  const id=req.params.id;
  db.get(`SELECT * FROM agents WHERE id=?`,[id],(e,a)=>{
    if(!a) return res.status(404).send('Agent introuvable');
    db.all(`SELECT label FROM formations WHERE agentId=?`,[id],(e2,frows)=>{
      const formations=frows.map(r=>r.label);
      res.render('agent_view',{title:'Fiche agent',active:'agents',agent:a,formations,canEdit:(req.session.user.role==='PA'||req.session.user.role==='ADMIN')});
    });
  });
});

app.get('/agents/:id/edit', ensurePA, (req,res)=>{
  const id=req.params.id;
  db.get(`SELECT * FROM agents WHERE id=?`,[id],(e,a)=>{
    if(!a) return res.status(404).send('Agent introuvable');
    db.all(`SELECT label FROM formations WHERE agentId=?`,[id],(e2,frows)=>{
      const formations=frows.map(r=>r.label);
      res.render('agent_form',{title:'Modifier agent',active:'agents',formTitle:'Modifier la fiche', action:'/agents/'+id+'?_method=PUT', agent:a, selectedFormations:formations});
    });
  });
});

app.put('/agents/:id', ensurePA, (req,res)=>{
  const id=req.params.id;
  const {matricule,firstName,lastName,phone,grade,brigade}=req.body;
  db.run(`UPDATE agents SET matricule=?, firstName=?, lastName=?, phone=?, grade=?, brigade=? WHERE id=?`,
    [matricule,firstName,lastName,phone,grade,brigade,id], (err)=>{
      // update formations
      db.run(`DELETE FROM formations WHERE agentId=?`,[id],()=>{
        const forms = Array.isArray(req.body.formations)? req.body.formations : (req.body.formations?[req.body.formations]:[]);
        forms.forEach(f=> db.run(`INSERT OR IGNORE INTO formations(agentId,label) VALUES(?,?)`,[id,f]));
        logHistory(req.session.user.username, matricule, 'Mise à jour de la fiche agent');
        res.redirect('/agents/'+id);
      });
    });
});

app.post('/agents/:id/delete', ensurePA, (req,res)=>{
  const id=req.params.id;
  db.get(`SELECT matricule FROM agents WHERE id=?`,[id],(err,row)=>{
    const m = row?row.matricule:'?';
    db.run(`DELETE FROM agents WHERE id=?`,[id],()=>{
      db.run(`DELETE FROM formations WHERE agentId=?`,[id],()=>{
        logHistory(req.session.user.username, m, 'Suppression de la fiche agent');
        res.redirect('/agents');
      });
    });
  });
});

// --- history ---
app.get('/history', requireAuth, (req,res)=>{
  db.all(`SELECT * FROM history ORDER BY at DESC LIMIT 500`,[],(e,rows)=>{
    res.render('history',{title:'Historique',active:'history',history:rows});
  });
});

// --- admin ---
app.get('/admin', ensureAdmin, (req,res)=>{
  db.all(`SELECT id,username,role,mustChangePassword FROM users ORDER BY username`,[],(e,users)=>{
    res.render('admin',{title:'Administration',active:'admin',users});
  });
});
app.post('/admin/users', ensureAdmin, (req,res)=>{
  const {username,password,role}=req.body;
  const hash=bcrypt.hashSync(password||'changeme',10);
  db.run(`INSERT INTO users(username,passwordHash,role,mustChangePassword) VALUES(?,?,?,1)`,
    [username,hash,role||'AGENT'],()=>res.redirect('/admin'));
});
app.post('/admin/users/:id/delete', ensureAdmin, (req,res)=>{
  const id=req.params.id;
  db.run(`DELETE FROM users WHERE id=?`,[id],()=>res.redirect('/admin'));
});

// --- 404
app.use((req,res)=> res.status(404).send('Not Found'));

app.listen(PORT, ()=> console.log(`Police-Academy-ADV running on :${PORT}`));

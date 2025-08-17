const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const SQLiteStore = require("connect-sqlite3")(session);

const app = express();
const db = new sqlite3.Database("./database.sqlite");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    store: new SQLiteStore,
    secret: "changeme",
    resave: false,
    saveUninitialized: false
}));

// Middleware pour vérifier connexion
function requireLogin(req, res, next) {
    if (!req.session.userId) return res.redirect("/login");
    next();
}

// Page de login
app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

app.post("/login", (req, res) => {
    const { matricule, password } = req.body;
    db.get("SELECT * FROM users WHERE matricule = ?", [matricule], (err, user) => {
        if (err || !user) return res.render("login", { error: "Utilisateur introuvable" });
        bcrypt.compare(password, user.password, (err, same) => {
            if (!same) return res.render("login", { error: "Mot de passe incorrect" });
            req.session.userId = user.id;
            req.session.role = user.role;
            res.redirect("/dashboard");
        });
    });
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
});

// Dashboard
app.get("/dashboard", requireLogin, (req, res) => {
    res.render("dashboard", { user: req.session });
});

// Admin page
app.get("/admin", requireLogin, (req, res) => {
    if (req.session.role !== "admin") return res.send("Accès refusé");
    db.all("SELECT id, matricule, role FROM users", (err, users) => {
        res.render("admin", { users });
    });
});

app.listen(3000, () => console.log("Server started on http://localhost:3000"));

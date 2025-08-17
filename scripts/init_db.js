const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {
    db.run("DROP TABLE IF EXISTS users");
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matricule TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`);

    bcrypt.hash("admin123", 10, (err, hash) => {
        db.run("INSERT INTO users (matricule, password, role) VALUES (?, ?, ?)", ["admin", hash, "admin"], (err) => {
            if (err) console.error(err);
            else console.log("Admin account created: admin / admin123");
        });
    });
});


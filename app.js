const express = require('express');
const app = express();

// Example route
app.get('/', (req, res) => {
    res.send('Bienvenue sur Police-Academy-ADV');
});

// Corrected to listen on 0.0.0.0 for Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Police-Academy-ADV en écoute sur http://0.0.0.0:${PORT}`);
});

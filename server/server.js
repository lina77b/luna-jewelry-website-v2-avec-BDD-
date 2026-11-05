require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db');
const { chargerUtilisateur } = require('./middleware/auth');

const production = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error('SESSION_SECRET est absent : copiez .env.example vers .env.');
}
if (secret === 'change-me' || secret.length < 32) {
  if (production) {
    throw new Error('SESSION_SECRET est trop faible : 32 caractères minimum et valeur personnalisée.');
  }
  console.warn('Attention : SESSION_SECRET est faible, à remplacer avant toute mise en ligne.');
}

const app = express();

if (production) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        upgradeInsecureRequests: production ? [] : null
      }
    }
  })
);
app.use(express.json({ limit: '50kb' }));
app.use(
  session({
    store: new pgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: production, maxAge: 7 * 24 * 60 * 60 * 1000 }
  })
);

app.use('/api', chargerUtilisateur);
app.use('/api', require('./routes/produits'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/commandes', require('./routes/commandes'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', (req, res) => {
  res.status(404).json({ erreur: 'Ressource introuvable.' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erreur: 'Requête invalide.' });
  }
  console.error(err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log('Luna Jewelry : http://localhost:' + port);
  });
}

module.exports = app;

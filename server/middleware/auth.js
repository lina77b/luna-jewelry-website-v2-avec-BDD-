const pool = require('../db');

async function chargerUtilisateur(req, res, next) {
  try {
    if (req.session && req.session.idClient) {
      const { rows } = await pool.query(
        'SELECT id_client, prenom, nom, role FROM client WHERE id_client = $1',
        [req.session.idClient]
      );
      if (rows[0]) {
        req.utilisateur = { id: rows[0].id_client, prenom: rows[0].prenom, nom: rows[0].nom, role: rows[0].role };
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (!req.utilisateur) {
    return res.status(401).json({ erreur: 'Connexion requise.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.utilisateur) {
    return res.status(401).json({ erreur: 'Connexion requise.' });
  }
  if (req.utilisateur.role !== 'admin') {
    return res.status(403).json({ erreur: 'Accès réservé à l’administrateur.' });
  }
  next();
}

function requireClient(req, res, next) {
  if (!req.utilisateur) {
    return res.status(401).json({ erreur: 'Connexion requise.' });
  }
  if (req.utilisateur.role === 'admin') {
    return res.status(403).json({ erreur: 'Un compte administrateur ne peut pas commander ni donner d’avis.' });
  }
  next();
}

module.exports = { chargerUtilisateur, requireLogin, requireAdmin, requireClient };

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { limiteurConnexion, limiteurInscription } = require('../middleware/limites');

const router = express.Router();

const HASH_FACTICE = bcrypt.hashSync('mot-de-passe-facultatif', 10);

function texte(valeur) {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

function motDePasseValide(mdp) {
  return (
    typeof mdp === 'string' &&
    mdp.length >= 8 &&
    mdp.length <= 72 &&
    /[A-Z]/.test(mdp) &&
    /[a-z]/.test(mdp) &&
    /[0-9]/.test(mdp) &&
    /[!@#$%^&*(),.?":{}|<>]/.test(mdp)
  );
}

function dateValide(valeur) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const date = new Date(valeur + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== valeur) return false;
  return valeur <= new Date().toISOString().slice(0, 10);
}

function ouvrirSession(req, client) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.idClient = client.id_client;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

router.post('/register', limiteurInscription, async (req, res, next) => {
  try {
    const corps = req.body || {};
    const nom = texte(corps.nom);
    const prenom = texte(corps.prenom);
    const email = texte(corps.email);
    const telephone = texte(corps.telephone);
    const sexe = texte(corps.sexe);
    const dateNaissance = texte(corps.date_naissance);
    const motDePasse = corps.mot_de_passe;

    if (nom.length < 1 || nom.length > 60) {
      return res.status(400).json({ erreur: 'Le nom est obligatoire (60 caractères maximum).' });
    }
    if (prenom.length < 1 || prenom.length > 60) {
      return res.status(400).json({ erreur: 'Le prénom est obligatoire (60 caractères maximum).' });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ erreur: "L'adresse e-mail est invalide." });
    }
    if (!/^[0-9]{10}$/.test(telephone)) {
      return res.status(400).json({ erreur: 'Le numéro de téléphone doit contenir 10 chiffres.' });
    }
    if (sexe !== 'F' && sexe !== 'M') {
      return res.status(400).json({ erreur: 'Le sexe est invalide.' });
    }
    if (!dateValide(dateNaissance)) {
      return res.status(400).json({ erreur: 'La date de naissance est invalide.' });
    }
    if (!motDePasseValide(motDePasse)) {
      return res.status(400).json({
        erreur:
          'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.'
      });
    }
    if (corps.confirmation !== undefined && corps.confirmation !== motDePasse) {
      return res.status(400).json({ erreur: 'Les mots de passe ne correspondent pas.' });
    }

    const hash = await bcrypt.hash(motDePasse, 10);
    let client;
    try {
      const resultat = await pool.query(
        'INSERT INTO client (nom, prenom, email, telephone, sexe, date_naissance, mot_de_passe_hash) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_client, prenom, nom, role',
        [nom, prenom, email, telephone, sexe, dateNaissance, hash]
      );
      client = resultat.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ erreur: 'Un compte existe déjà avec cet e-mail.' });
      }
      if (err.code === '23514') {
        return res.status(400).json({ erreur: 'Certaines informations sont invalides.' });
      }
      throw err;
    }

    await ouvrirSession(req, client);
    res.status(201).json({ id: client.id_client, prenom: client.prenom, nom: client.nom, role: client.role });
  } catch (err) {
    next(err);
  }
});

router.post('/login', limiteurConnexion, async (req, res, next) => {
  try {
    const email = texte((req.body || {}).email);
    const motDePasse = (req.body || {}).mot_de_passe;
    if (!email || typeof motDePasse !== 'string' || motDePasse.length === 0) {
      return res.status(400).json({ erreur: 'E-mail et mot de passe obligatoires.' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM get_identifiants($1)',
      [email]
    );
    const client = rows[0];
    const correct = await bcrypt.compare(motDePasse, client ? client.mot_de_passe_hash : HASH_FACTICE);
    if (!client || !correct) {
      return res.status(401).json({ erreur: 'E-mail ou mot de passe incorrect.' });
    }

    await ouvrirSession(req, client);
    res.json({ id: client.id_client, prenom: client.prenom, nom: client.nom, role: client.role });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ message: 'Déconnexion réussie.' });
  });
});

router.get('/me', (req, res) => {
  res.json(req.utilisateur || null);
});

module.exports = router;

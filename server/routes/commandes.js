const express = require('express');
const pool = require('../db');
const { requireLogin, requireClient } = require('../middleware/auth');

const router = express.Router();

const MODES_PAIEMENT = ['credit', 'baridimob', 'cash'];

async function chargerCommandes(client, idClient, idCommande) {
  const parametres = [idClient];
  let filtre = '';
  if (idCommande !== undefined) {
    parametres.push(idCommande);
    filtre = ' AND id_commande = $2';
  }
  const commandes = await client.query(
    'SELECT id_commande, date_commande, statut, mode_paiement, nom_livraison, adresse_livraison, ' +
      'telephone_livraison, code_wilaya, wilaya, sous_total, frais_livraison, total ' +
      'FROM v_total_commande WHERE id_client = $1' +
      filtre +
      ' ORDER BY date_commande DESC, id_commande DESC',
    parametres
  );
  if (commandes.rows.length === 0) return [];

  const ids = commandes.rows.map((c) => c.id_commande);
  const lignes = await client.query(
    'SELECT l.id_commande, l.id_produit, p.nom, p.image, l.quantite, l.prix_unitaire, ' +
      '(l.quantite * l.prix_unitaire)::NUMERIC(10,2) AS sous_total ' +
      'FROM ligne_commande AS l JOIN produit AS p ON p.id_produit = l.id_produit ' +
      'WHERE l.id_commande = ANY($1::int[]) ORDER BY l.id_commande, l.id_produit',
    [ids]
  );

  return commandes.rows.map((commande) => ({
    ...commande,
    lignes: lignes.rows
      .filter((ligne) => ligne.id_commande === commande.id_commande)
      .map(({ id_commande, ...ligne }) => ligne)
  }));
}

function valider(corps) {
  const items = corps.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return 'Le panier est vide ou invalide.';
  }
  for (const item of items) {
    if (
      !item ||
      !Number.isInteger(item.id_produit) ||
      item.id_produit < 1 ||
      !Number.isInteger(item.quantite) ||
      item.quantite < 1 ||
      item.quantite > 99
    ) {
      return 'Le panier contient une ligne invalide.';
    }
  }
  const nom = typeof corps.nom === 'string' ? corps.nom.trim() : '';
  const adresse = typeof corps.adresse === 'string' ? corps.adresse.trim() : '';
  if (nom.length < 2 || nom.length > 120) return 'Le nom de livraison est invalide.';
  if (adresse.length < 5 || adresse.length > 255) return "L'adresse de livraison est invalide.";
  if (typeof corps.telephone !== 'string' || !/^[0-9]{10}$/.test(corps.telephone.trim())) {
    return 'Le numéro de téléphone doit contenir 10 chiffres.';
  }
  if (!Number.isInteger(corps.code_wilaya) || corps.code_wilaya < 1 || corps.code_wilaya > 58) {
    return 'La wilaya est invalide.';
  }
  if (!MODES_PAIEMENT.includes(corps.mode_paiement)) {
    return 'Le mode de paiement est invalide.';
  }
  return null;
}

router.post('/', requireClient, async (req, res, next) => {
  try {
    const corps = req.body || {};
    const probleme = valider(corps);
    if (probleme) {
      return res.status(400).json({ erreur: probleme });
    }

    const items = corps.items.map((item) => ({ id_produit: item.id_produit, quantite: item.quantite }));
    let idCommande;
    try {
      const resultat = await pool.query(
        'SELECT passer_commande($1, $2, $3, $4, $5, $6, $7::jsonb) AS id_commande',
        [
          req.utilisateur.id,
          corps.nom.trim(),
          corps.adresse.trim(),
          corps.telephone.trim(),
          corps.code_wilaya,
          corps.mode_paiement,
          JSON.stringify(items)
        ]
      );
      idCommande = resultat.rows[0].id_commande;
    } catch (err) {
      if (err.code === 'LU409') {
        return res.status(409).json({ erreur: err.message });
      }
      if (err.code === 'LU400') {
        return res.status(400).json({ erreur: err.message });
      }
      if (err.code === '23503') {
        return res.status(401).json({ erreur: 'Connexion requise.' });
      }
      throw err;
    }

    const commandes = await pool.avecContexte(req.utilisateur, (client) =>
      chargerCommandes(client, req.utilisateur.id, idCommande)
    );
    res.status(201).json(commandes[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/moi', requireLogin, async (req, res, next) => {
  try {
    res.json(
      await pool.avecContexte(req.utilisateur, (client) => chargerCommandes(client, req.utilisateur.id))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/annuler', requireLogin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ erreur: 'Commande invalide.' });
    }
    try {
      await pool.query('SELECT annuler_commande($1, $2)', [id, req.utilisateur.id]);
    } catch (err) {
      if (err.code === 'LU404') return res.status(404).json({ erreur: err.message });
      if (err.code === 'LU409') return res.status(409).json({ erreur: err.message });
      throw err;
    }
    res.json({ message: 'Commande annulée, le stock a été remis à jour.', id_commande: id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const pool = require('../db');
const { requireClient } = require('../middleware/auth');

const router = express.Router();

const TRIS = {
  id: 'p.id_produit',
  prix_asc: 'p.prix ASC, p.id_produit',
  prix_desc: 'p.prix DESC, p.id_produit',
  nom: 'p.nom, p.id_produit',
  note: 'n.note_moyenne DESC NULLS LAST, p.id_produit'
};

router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id_categorie, nom, slug FROM categorie ORDER BY id_categorie'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/wilayas', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT code_wilaya, nom, frais_livraison FROM wilaya ORDER BY code_wilaya'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

function nombre(valeur) {
  if (valeur === undefined || valeur === '') return null;
  const n = Number(valeur);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

router.get('/produits', async (req, res, next) => {
  try {
    const parametres = [];
    const ajouter = (valeur) => {
      parametres.push(valeur);
      return '$' + parametres.length;
    };
    const conditions = ['p.actif'];
    let rang = null;

    if (req.query.ids !== undefined) {
      const ids = String(req.query.ids)
        .split(',')
        .map((valeur) => Number(valeur))
        .filter((valeur) => Number.isInteger(valeur) && valeur > 0 && valeur < 1000000000)
        .slice(0, 100);
      conditions.push('p.id_produit = ANY(' + ajouter(ids) + '::int[])');
    }

    if (req.query.categorie) {
      conditions.push('c.slug = ' + ajouter(String(req.query.categorie)));
    }

    const mots = String(req.query.q || '').slice(0, 100).match(/[\p{L}\p{N}]+/gu);
    if (mots && mots.length > 0) {
      const requete = ajouter(mots.map((mot) => mot + ':*').join(' & '));
      conditions.push("p.recherche @@ to_tsquery('french', " + requete + ')');
      rang = "ts_rank(p.recherche, to_tsquery('french', " + requete + ')) DESC, p.id_produit';
    }

    const prixMin = nombre(req.query.prix_min);
    const prixMax = nombre(req.query.prix_max);
    if (prixMin !== null) conditions.push('p.prix >= ' + ajouter(prixMin));
    if (prixMax !== null) conditions.push('p.prix <= ' + ajouter(prixMax));
    if (req.query.en_stock === '1') conditions.push('p.stock > 0');

    const where = ' WHERE ' + conditions.join(' AND ');
    const from =
      ' FROM produit AS p JOIN categorie AS c ON c.id_categorie = p.id_categorie' +
      ' LEFT JOIN v_note_produit AS n ON n.id_produit = p.id_produit';

    const total = await pool.query('SELECT count(*)::int AS n' + from + where, parametres);

    let ordre = TRIS[req.query.tri] || (rang ? rang : TRIS.id);
    const apres = Number(req.query.apres);
    let pagination = '';
    let filtreCurseur = '';
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 50, 1), 100);

    if (Number.isInteger(apres) && apres > 0) {
      ordre = TRIS.id;
      filtreCurseur = ' AND p.id_produit > ' + ajouter(apres);
      pagination = ' LIMIT ' + ajouter(limite);
    } else {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      pagination = ' LIMIT ' + ajouter(limite) + ' OFFSET ' + ajouter((page - 1) * limite);
    }

    const { rows } = await pool.query(
      'SELECT p.id_produit, p.nom, p.description, p.prix, p.stock, p.image, c.slug AS categorie, ' +
        'n.note_moyenne::float8 AS note_moyenne, n.nb_avis::int AS nb_avis' +
        from +
        where +
        filtreCurseur +
        ' ORDER BY ' +
        ordre +
        pagination,
      parametres
    );
    res.set('X-Total-Count', String(total.rows[0].n));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/produits/:id/avis', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ erreur: 'Produit invalide.' });
    }
    const { rows } = await pool.query(
      'SELECT a.note, a.commentaire, a.date_avis, cl.prenom ' +
        'FROM avis AS a JOIN client AS cl ON cl.id_client = a.id_client ' +
        'WHERE a.id_produit = $1 ORDER BY a.date_avis DESC LIMIT 50',
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/produits/:id/avis', requireClient, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const note = (req.body || {}).note;
    const commentaire = typeof (req.body || {}).commentaire === 'string' ? req.body.commentaire.trim() : '';
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ erreur: 'Produit invalide.' });
    }
    if (!Number.isInteger(note) || note < 1 || note > 5) {
      return res.status(400).json({ erreur: 'La note doit être comprise entre 1 et 5.' });
    }
    if (commentaire.length > 500) {
      return res.status(400).json({ erreur: 'Le commentaire est trop long (500 caractères maximum).' });
    }

    const resultat = await pool.avecContexte(req.utilisateur, (client) =>
      client.query(
        'INSERT INTO avis (id_client, id_produit, note, commentaire) ' +
          'SELECT $1, $2, $3, $4 WHERE EXISTS (' +
          'SELECT 1 FROM commande AS c JOIN ligne_commande AS l ON l.id_commande = c.id_commande ' +
          "WHERE c.id_client = $1 AND l.id_produit = $2 AND c.statut <> 'annulee') " +
          'ON CONFLICT (id_client, id_produit) DO UPDATE ' +
          'SET note = EXCLUDED.note, commentaire = EXCLUDED.commentaire, date_avis = now()',
        [req.utilisateur.id, id, note, commentaire || null]
      )
    );
    if (resultat.rowCount === 0) {
      return res.status(403).json({ erreur: 'Vous ne pouvez noter que les produits que vous avez commandés.' });
    }
    res.status(201).json({ message: 'Merci pour votre avis !' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

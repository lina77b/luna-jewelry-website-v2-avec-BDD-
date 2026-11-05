const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const STATUTS = ['en_attente', 'confirmee', 'expediee', 'livree', 'annulee'];

router.use(requireAdmin);

router.get('/stats', async (req, res, next) => {
  try {
    const donnees = await pool.avecContexte(req.utilisateur, async (client) => {
      const requetes = {
        ca_mensuel:
          "SELECT to_char(mois, 'YYYY-MM') AS mois, nb_commandes::int AS nb_commandes, " +
          'chiffre_affaires::float8 AS chiffre_affaires FROM mv_ca_mensuel ORDER BY mois',
        meilleures_ventes:
          'SELECT nom, quantite_vendue::int AS quantite_vendue, chiffre_affaires::float8 AS chiffre_affaires ' +
          'FROM v_meilleures_ventes LIMIT 8',
        ca_wilaya:
          'SELECT wilaya, count(*)::int AS nb_commandes, sum(total)::float8 AS chiffre_affaires ' +
          "FROM v_total_commande WHERE statut <> 'annulee' GROUP BY wilaya ORDER BY chiffre_affaires DESC LIMIT 8",
        statuts: 'SELECT statut, count(*)::int AS nb FROM commande GROUP BY statut ORDER BY statut',
        stock_faible: 'SELECT id_produit, nom, stock FROM v_stock_faible'
      };
      const resultat = {};
      for (const cle of Object.keys(requetes)) {
        resultat[cle] = (await client.query(requetes[cle])).rows;
      }
      return resultat;
    });
    res.json(donnees);
  } catch (err) {
    next(err);
  }
});

router.get('/commandes', async (req, res, next) => {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 20, 1), 100);
    const statut = STATUTS.includes(req.query.statut) ? req.query.statut : null;
    const apresId = Number(req.query.apres_id);
    const curseur = Number.isInteger(apresId) && apresId > 0 && req.query.apres_date;

    const parametres = [statut, limite + 1];
    let filtreCurseur = '';
    if (curseur) {
      parametres.push(String(req.query.apres_date), apresId);
      filtreCurseur = ' AND (c.date_commande, c.id_commande) < ($3::timestamptz, $4::int)';
    }

    const lignes = await pool.avecContexte(req.utilisateur, async (client) => {
      const { rows } = await client.query(
        'SELECT c.id_commande, c.date_commande, c.date_commande::text AS curseur_date, c.statut, ' +
          "cl.prenom || ' ' || cl.nom AS client, w.nom AS wilaya, " +
          '(SELECT COALESCE(SUM(l.quantite * l.prix_unitaire), 0) + c.frais_livraison ' +
          'FROM ligne_commande AS l WHERE l.id_commande = c.id_commande) AS total ' +
          'FROM commande AS c JOIN client AS cl ON cl.id_client = c.id_client ' +
          'JOIN wilaya AS w ON w.code_wilaya = c.code_wilaya ' +
          'WHERE ($1::text IS NULL OR c.statut = $1)' +
          filtreCurseur +
          ' ORDER BY c.date_commande DESC, c.id_commande DESC LIMIT $2',
        parametres
      );
      return rows;
    });

    const suite = lignes.length > limite;
    const page = lignes.slice(0, limite);
    const derniere = page[page.length - 1];
    res.json({
      commandes: page.map(({ curseur_date, ...reste }) => reste),
      suivant: suite && derniere ? { apres_date: derniere.curseur_date, apres_id: derniere.id_commande } : null
    });
  } catch (err) {
    next(err);
  }
});

router.get('/commandes/:id/journal', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ erreur: 'Commande invalide.' });
    }
    const { rows } = await pool.query(
      'SELECT ancien_statut, nouveau_statut, date_changement FROM journal_commande ' +
        'WHERE id_commande = $1 ORDER BY id_journal',
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.patch('/commandes/:id/statut', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const statut = (req.body || {}).statut;
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ erreur: 'Commande invalide.' });
    }
    if (!STATUTS.includes(statut)) {
      return res.status(400).json({ erreur: 'Statut invalide.' });
    }
    try {
      if (statut === 'annulee') {
        await pool.query('SELECT annuler_commande($1)', [id]);
      } else {
        const resultat = await pool.avecContexte(req.utilisateur, (client) =>
          client.query('UPDATE commande SET statut = $1 WHERE id_commande = $2', [statut, id])
        );
        if (resultat.rowCount === 0) {
          return res.status(404).json({ erreur: 'Commande introuvable.' });
        }
      }
    } catch (err) {
      if (err.code === 'LU404') return res.status(404).json({ erreur: err.message });
      if (err.code === 'LU403' || err.code === 'LU409') return res.status(409).json({ erreur: err.message });
      throw err;
    }
    res.json({ id_commande: id, statut });
  } catch (err) {
    next(err);
  }
});

router.post('/rafraichir', async (req, res, next) => {
  try {
    const debut = process.hrtime.bigint();
    await pool.query('SELECT rafraichir_ca_mensuel()');
    const ms = Number(process.hrtime.bigint() - debut) / 1e6;
    res.json({ message: 'Vue matérialisée rafraîchie.', duree_ms: Math.round(ms * 10) / 10 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

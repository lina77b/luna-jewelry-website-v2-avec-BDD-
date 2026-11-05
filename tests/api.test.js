require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'secret-de-test-pour-les-tests-automatises';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const appPool = require('../server/db');
const app = require('../server/server');
const { supprimerClient, urlAdmin, Pool } = require('./aide');

const pool = new Pool({ connectionString: urlAdmin });

const EMAIL = 'api.test.' + Date.now() + '@example.com';
const MOT_DE_PASSE = 'Test@2025x';
const ID_PRODUIT = 1;

let serveur;
let base;
let cookie = '';
let stockInitial;
let idClient;

async function requete(chemin, options) {
  const reglages = options || {};
  const entetes = {};
  if (reglages.corps !== undefined) entetes['Content-Type'] = 'application/json';
  if (cookie && reglages.sansCookie !== true) entetes.Cookie = cookie;
  const reponse = await fetch(base + chemin, {
    method: reglages.methode || 'GET',
    headers: entetes,
    body: reglages.corps !== undefined ? JSON.stringify(reglages.corps) : undefined
  });
  const recu = reponse.headers.get('set-cookie');
  if (recu) cookie = recu.split(';')[0];
  return { statut: reponse.status, donnees: await reponse.json() };
}

function inscription(surcharge) {
  return Object.assign(
    {
      nom: 'Testeur',
      prenom: 'Api',
      email: EMAIL,
      telephone: '0555123456',
      sexe: 'F',
      date_naissance: '1999-05-05',
      mot_de_passe: MOT_DE_PASSE,
      confirmation: MOT_DE_PASSE
    },
    surcharge
  );
}

function commande(items) {
  return {
    items,
    nom: 'Api Testeur',
    adresse: '12 rue des Tests',
    telephone: '0555123456',
    code_wilaya: 16,
    mode_paiement: 'cash'
  };
}

async function stock() {
  const { rows } = await pool.query('SELECT stock FROM produit WHERE id_produit = $1', [ID_PRODUIT]);
  return rows[0].stock;
}

async function nombreCommandes() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM commande WHERE id_client = $1', [idClient]);
  return rows[0].n;
}

test.before(async () => {
  serveur = app.listen(0);
  await once(serveur, 'listening');
  base = 'http://127.0.0.1:' + serveur.address().port;
  const { rows } = await pool.query('SELECT stock FROM produit WHERE id_produit = $1', [ID_PRODUIT]);
  stockInitial = rows[0].stock;
  await pool.query('UPDATE produit SET stock = 20 WHERE id_produit = $1', [ID_PRODUIT]);
});

test.after(async () => {
  if (idClient) {
    await supprimerClient(idClient);
  }
  await pool.query('UPDATE produit SET stock = $1 WHERE id_produit = $2', [stockInitial, ID_PRODUIT]);
  await new Promise((resolve) => serveur.close(resolve));
  await pool.end();
  await appPool.end();
});

test('catalogue : 4 categories, 58 wilayas, 8 bagues', async () => {
  const categories = await requete('/api/categories');
  assert.equal(categories.statut, 200);
  assert.equal(categories.donnees.length, 4);

  const wilayas = await requete('/api/wilayas');
  assert.equal(wilayas.donnees.length, 58);
  assert.equal(wilayas.donnees[15].nom, 'Alger');

  const bagues = await requete('/api/produits?categorie=bagues');
  assert.equal(bagues.statut, 200);
  assert.deepEqual(bagues.donnees.map((p) => p.id_produit), [1, 2, 3, 4, 5, 6, 7, 8]);

  const ids = await requete('/api/produits?ids=1,2,999');
  assert.deepEqual(ids.donnees.map((p) => p.id_produit), [1, 2]);

  const inconnue = await requete('/api/produits?categorie=inexistante');
  assert.deepEqual(inconnue.donnees, []);
});

test('commande sans connexion : 401', async () => {
  const reponse = await requete(
    '/api/commandes',
    { methode: 'POST', corps: commande([{ id_produit: ID_PRODUIT, quantite: 1 }]), sansCookie: true }
  );
  assert.equal(reponse.statut, 401);
  assert.ok(reponse.donnees.erreur);

  const liste = await requete('/api/commandes/moi', { sansCookie: true });
  assert.equal(liste.statut, 401);
});

test('me sans session renvoie null', async () => {
  const reponse = await requete('/api/auth/me', { sansCookie: true });
  assert.equal(reponse.statut, 200);
  assert.equal(reponse.donnees, null);
});

test('inscription invalide : mot de passe faible, telephone, sexe', async () => {
  const faible = await requete('/api/auth/register', { methode: 'POST', corps: inscription({ mot_de_passe: 'faible', confirmation: 'faible' }), sansCookie: true });
  assert.equal(faible.statut, 400);
  const telephone = await requete('/api/auth/register', { methode: 'POST', corps: inscription({ telephone: '123' }), sansCookie: true });
  assert.equal(telephone.statut, 400);
  const sexe = await requete('/api/auth/register', { methode: 'POST', corps: inscription({ sexe: 'X' }), sansCookie: true });
  assert.equal(sexe.statut, 400);
});

test('inscription, me, deconnexion, connexion', async () => {
  const creation = await requete('/api/auth/register', { methode: 'POST', corps: inscription(), sansCookie: true });
  assert.equal(creation.statut, 201);
  assert.equal(creation.donnees.prenom, 'Api');
  idClient = creation.donnees.id;

  const moi = await requete('/api/auth/me');
  assert.deepEqual(moi.donnees, { id: idClient, prenom: 'Api', nom: 'Testeur', role: 'client' });

  const sortie = await requete('/api/auth/logout', { methode: 'POST' });
  assert.equal(sortie.statut, 200);
  cookie = '';
  const apres = await requete('/api/auth/me');
  assert.equal(apres.donnees, null);

  const mauvais = await requete('/api/auth/login', { methode: 'POST', corps: { email: EMAIL, mot_de_passe: 'Mauvais@2025' } });
  assert.equal(mauvais.statut, 401);

  const connexion = await requete('/api/auth/login', { methode: 'POST', corps: { email: EMAIL.toUpperCase(), mot_de_passe: MOT_DE_PASSE } });
  assert.equal(connexion.statut, 200);
  const moi2 = await requete('/api/auth/me');
  assert.equal(moi2.donnees.id, idClient);
});

test('e-mail deja utilise : 409', async () => {
  const doublon = await requete('/api/auth/register', { methode: 'POST', corps: inscription({ email: EMAIL.toUpperCase() }), sansCookie: true });
  assert.equal(doublon.statut, 409);
  assert.ok(doublon.donnees.erreur);
});

test('commande valide : prix serveur, total, stock decremente', async () => {
  const avant = await stock();
  const reponse = await requete('/api/commandes', {
    methode: 'POST',
    corps: commande([
      { id_produit: ID_PRODUIT, quantite: 1, prix_unitaire: 1, prix: 1 },
      { id_produit: ID_PRODUIT, quantite: 2 }
    ])
  });
  assert.equal(reponse.statut, 201);
  assert.equal(reponse.donnees.lignes.length, 1);
  assert.equal(reponse.donnees.lignes[0].quantite, 3);
  assert.equal(reponse.donnees.lignes[0].prix_unitaire, '2500.00');
  assert.equal(reponse.donnees.sous_total, '7500.00');
  assert.equal(reponse.donnees.frais_livraison, '500.00');
  assert.equal(reponse.donnees.total, '8000.00');
  assert.equal(reponse.donnees.statut, 'en_attente');
  assert.equal(await stock(), avant - 3);
});

test('stock insuffisant : 409 et stock inchange', async () => {
  await pool.query('UPDATE produit SET stock = 2 WHERE id_produit = $1', [ID_PRODUIT]);
  const commandesAvant = await nombreCommandes();
  const reponse = await requete('/api/commandes', {
    methode: 'POST',
    corps: commande([{ id_produit: ID_PRODUIT, quantite: 5 }])
  });
  assert.equal(reponse.statut, 409);
  assert.match(reponse.donnees.erreur, /Stock insuffisant/);
  assert.equal(await stock(), 2);
  assert.equal(await nombreCommandes(), commandesAvant);
});

test('commande invalide : 400', async () => {
  const vide = await requete('/api/commandes', { methode: 'POST', corps: commande([]) });
  assert.equal(vide.statut, 400);
  const mauvaise = await requete('/api/commandes', { methode: 'POST', corps: Object.assign(commande([{ id_produit: ID_PRODUIT, quantite: 1 }]), { mode_paiement: 'bitcoin' }) });
  assert.equal(mauvaise.statut, 400);
  const inconnu = await requete('/api/commandes', { methode: 'POST', corps: commande([{ id_produit: 99999, quantite: 1 }]) });
  assert.equal(inconnu.statut, 400);
});

test('mes commandes', async () => {
  const reponse = await requete('/api/commandes/moi');
  assert.equal(reponse.statut, 200);
  assert.equal(reponse.donnees.length, 1);
  assert.equal(reponse.donnees[0].lignes[0].nom, 'Bague Argent');
});

test('recherche plein texte, tri, filtres et pagination', async () => {
  const collier = await requete('/api/produits?q=collier');
  assert.ok(collier.donnees.length > 0);
  assert.ok(collier.donnees.every((p) => p.categorie === 'colliers'));

  const partiel = await requete('/api/produits?q=brac');
  assert.ok(partiel.donnees.length > 0);

  const aucun = await requete('/api/produits?q=xyzintrouvable');
  assert.deepEqual(aucun.donnees, []);

  const tri = await requete('/api/produits?categorie=bagues&tri=prix_desc');
  const prix = tri.donnees.map((p) => Number(p.prix));
  assert.deepEqual(prix, [...prix].sort((a, b) => b - a));

  const fourchette = await requete('/api/produits?prix_min=3000&prix_max=3000');
  assert.ok(fourchette.donnees.length > 0);
  assert.ok(fourchette.donnees.every((p) => p.prix === '3000.00'));

  const reponse = await fetch(base + '/api/produits?limite=5&page=2');
  assert.equal(reponse.headers.get('x-total-count'), '32');
  assert.deepEqual((await reponse.json()).map((p) => p.id_produit), [6, 7, 8, 9, 10]);

  const curseur = await requete('/api/produits?apres=30&limite=5');
  assert.deepEqual(curseur.donnees.map((p) => p.id_produit), [31, 32]);

  const injection = await requete("/api/produits?q=a'; DROP TABLE produit; --");
  assert.equal(injection.statut, 200);
  assert.equal((await requete('/api/categories')).donnees.length, 4);
});

test('avis : connexion requise, produit commande, note valide, mise a jour', async () => {
  const anonyme = await requete('/api/produits/1/avis', { methode: 'POST', corps: { note: 5 }, sansCookie: true });
  assert.equal(anonyme.statut, 401);

  const nonCommande = await requete('/api/produits/2/avis', { methode: 'POST', corps: { note: 5 } });
  assert.equal(nonCommande.statut, 403);

  const horsBornes = await requete('/api/produits/1/avis', { methode: 'POST', corps: { note: 6 } });
  assert.equal(horsBornes.statut, 400);

  const premier = await requete('/api/produits/1/avis', { methode: 'POST', corps: { note: 4, commentaire: 'Joli' } });
  assert.equal(premier.statut, 201);
  const second = await requete('/api/produits/1/avis', { methode: 'POST', corps: { note: 5, commentaire: 'Magnifique' } });
  assert.equal(second.statut, 201);

  const liste = await requete('/api/produits/1/avis', { sansCookie: true });
  const miens = liste.donnees.filter((a) => a.prenom === 'Api');
  assert.equal(miens.length, 1);
  assert.equal(miens[0].note, 5);

  const produit = await requete('/api/produits?ids=1');
  assert.ok(produit.donnees[0].nb_avis >= 1);
  assert.ok(produit.donnees[0].note_moyenne >= 1 && produit.donnees[0].note_moyenne <= 5);
});

test('annulation par le client : stock remis, double annulation 409, commande d un autre 404', async () => {
  const avant = await stock();
  const creation = await requete('/api/commandes', { methode: 'POST', corps: commande([{ id_produit: ID_PRODUIT, quantite: 2 }]) });
  assert.equal(creation.statut, 201);
  assert.equal(await stock(), avant - 2);

  const annulation = await requete('/api/commandes/' + creation.donnees.id_commande + '/annuler', { methode: 'POST' });
  assert.equal(annulation.statut, 200);
  assert.equal(await stock(), avant);

  const double = await requete('/api/commandes/' + creation.donnees.id_commande + '/annuler', { methode: 'POST' });
  assert.equal(double.statut, 409);
  assert.equal(await stock(), avant);

  const inconnue = await requete('/api/commandes/99999999/annuler', { methode: 'POST' });
  assert.equal(inconnue.statut, 404);

  const autre = await pool.query('SELECT min(id_commande) AS id FROM commande WHERE id_client <> $1', [idClient]);
  if (autre.rows[0].id) {
    const refus = await requete('/api/commandes/' + autre.rows[0].id + '/annuler', { methode: 'POST' });
    assert.equal(refus.statut, 404);
  }

  const anonyme = await requete('/api/commandes/1/annuler', { methode: 'POST', sansCookie: true });
  assert.equal(anonyme.statut, 401);
});

test('administration : refusee a un client, autorisee a un administrateur', async () => {
  const refus = await requete('/api/admin/stats');
  assert.equal(refus.statut, 403);
  const anonyme = await requete('/api/admin/stats', { sansCookie: true });
  assert.equal(anonyme.statut, 401);

  const creation = await requete('/api/commandes', { methode: 'POST', corps: commande([{ id_produit: ID_PRODUIT, quantite: 1 }]) });
  const id = creation.donnees.id_commande;

  await pool.query("UPDATE client SET role = 'admin' WHERE id_client = $1", [idClient]);
  try {
    const moi = await requete('/api/auth/me');
    assert.equal(moi.donnees.role, 'admin');

    const commandeAdmin = await requete('/api/commandes', { methode: 'POST', corps: commande([{ id_produit: ID_PRODUIT, quantite: 1 }]) });
    assert.equal(commandeAdmin.statut, 403);
    const avisAdmin = await requete('/api/produits/' + ID_PRODUIT + '/avis', { methode: 'POST', corps: { note: 5, commentaire: 'Test' } });
    assert.equal(avisAdmin.statut, 403);

    const stats = await requete('/api/admin/stats');
    assert.equal(stats.statut, 200);
    assert.deepEqual(Object.keys(stats.donnees).sort(), ['ca_mensuel', 'ca_wilaya', 'meilleures_ventes', 'statuts', 'stock_faible']);

    const patch = (statut) => requete('/api/admin/commandes/' + id + '/statut', { methode: 'PATCH', corps: { statut } });

    assert.equal((await patch('livree')).statut, 409);
    assert.equal((await patch('confirmee')).statut, 200);
    assert.equal((await patch('livree')).statut, 409);
    assert.equal((await patch('expediee')).statut, 200);
    assert.equal((await patch('annulee')).statut, 409);
    assert.equal((await patch('nimporte')).statut, 400);

    const journal = await requete('/api/admin/commandes/' + id + '/journal');
    assert.deepEqual(
      journal.donnees.map((e) => [e.ancien_statut, e.nouveau_statut]),
      [['en_attente', 'confirmee'], ['confirmee', 'expediee']]
    );

    const premiere = await requete('/api/admin/commandes?limite=2');
    assert.equal(premiere.donnees.commandes.length, 2);
    assert.ok(premiere.donnees.suivant);
    const suivante = await requete(
      '/api/admin/commandes?limite=2&apres_date=' + encodeURIComponent(premiere.donnees.suivant.apres_date) + '&apres_id=' + premiere.donnees.suivant.apres_id
    );
    const idsPremiere = premiere.donnees.commandes.map((c) => c.id_commande);
    assert.ok(suivante.donnees.commandes.every((c) => !idsPremiere.includes(c.id_commande)));

    const filtre = await requete('/api/admin/commandes?statut=expediee&limite=100');
    assert.ok(filtre.donnees.commandes.every((c) => c.statut === 'expediee'));

    const rafraichi = await requete('/api/admin/rafraichir', { methode: 'POST' });
    assert.equal(rafraichi.statut, 200);
    assert.equal(typeof rafraichi.donnees.duree_ms, 'number');
  } finally {
    await pool.query("UPDATE client SET role = 'client' WHERE id_client = $1", [idClient]);
  }
});

require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { supprimerClient, urlAdmin } = require('./aide');

const APPEL = 'SELECT passer_commande($1, $2, $3, $4, $5, $6, $7::jsonb) AS id';

let db;
let idClient;
let stocks;

async function commander(items, wilaya) {
  return db.query(APPEL, [idClient, 'Client Fonction', '3 rue des Fonctions', '0555111111', wilaya || 16, 'baridimob', JSON.stringify(items)]);
}

async function stock(id) {
  return (await db.query('SELECT stock FROM produit WHERE id_produit = $1', [id])).rows[0].stock;
}

async function nombreCommandes() {
  return (await db.query('SELECT count(*)::int AS n FROM commande WHERE id_client = $1', [idClient])).rows[0].n;
}

async function echec(promesse) {
  try {
    await promesse;
  } catch (erreur) {
    return erreur;
  }
  assert.fail('une exception etait attendue');
}

test.before(async () => {
  db = new Client({ connectionString: urlAdmin });
  await db.connect();
  stocks = (await db.query('SELECT id_produit, stock, actif FROM produit WHERE id_produit IN (3, 4, 5)')).rows;
  await db.query('UPDATE produit SET stock = 10, actif = TRUE WHERE id_produit IN (3, 4, 5)');
  const { rows } = await db.query(
    "INSERT INTO client (nom, prenom, email, telephone, sexe, date_naissance, mot_de_passe_hash) " +
      "VALUES ('Fonction', 'Test', $1, '0555111111', 'F', '1992-02-02', 'hash-de-test') RETURNING id_client",
    ['fonction.' + Date.now() + '@example.com']
  );
  idClient = rows[0].id_client;
});

test.after(async () => {
  await supprimerClient(idClient);
  for (const p of stocks) {
    await db.query('UPDATE produit SET stock = $1, actif = $2 WHERE id_produit = $3', [p.stock, p.actif, p.id_produit]);
  }
  await db.end();
});

test('succes : lignes fusionnees, prix lu dans produit, stock decremente, total par la vue', async () => {
  const { rows } = await commander([
    { id_produit: 3, quantite: 1, prix_unitaire: 1 },
    { id_produit: 3, quantite: 2 },
    { id_produit: 4, quantite: 1 }
  ]);
  const id = rows[0].id;
  const lignes = (await db.query('SELECT id_produit, quantite, prix_unitaire FROM ligne_commande WHERE id_commande = $1 ORDER BY id_produit', [id])).rows;
  assert.deepEqual(lignes, [
    { id_produit: 3, quantite: 3, prix_unitaire: '2700.00' },
    { id_produit: 4, quantite: 1, prix_unitaire: '500.00' }
  ]);
  assert.equal(await stock(3), 7);
  assert.equal(await stock(4), 9);
  const total = (await db.query('SELECT sous_total, frais_livraison, total FROM v_total_commande WHERE id_commande = $1', [id])).rows[0];
  assert.deepEqual(total, { sous_total: '8600.00', frais_livraison: '500.00', total: '9100.00' });
});

test('stock insuffisant sur la seconde ligne : tout est annule', async () => {
  const stockAvant = [await stock(3), await stock(4)];
  const commandesAvant = await nombreCommandes();
  const erreur = await echec(commander([{ id_produit: 3, quantite: 1 }, { id_produit: 4, quantite: 50 }]));
  assert.equal(erreur.code, 'LU409');
  assert.match(erreur.message, /Stock insuffisant/);
  assert.deepEqual([await stock(3), await stock(4)], stockAvant);
  assert.equal(await nombreCommandes(), commandesAvant);
});

test('produit inactif, produit inconnu, panier vide, wilaya inconnue : refuses', async () => {
  await db.query('UPDATE produit SET actif = FALSE WHERE id_produit = 5');
  const stockAvant = await stock(5);
  const inactif = await echec(commander([{ id_produit: 5, quantite: 1 }]));
  assert.equal(inactif.code, 'LU400');
  assert.equal(await stock(5), stockAvant);
  await db.query('UPDATE produit SET actif = TRUE WHERE id_produit = 5');

  const inconnu = await echec(commander([{ id_produit: 4, quantite: 1 }, { id_produit: 99999, quantite: 1 }]));
  assert.equal(inconnu.code, 'LU400');
  const vide = await echec(commander([]));
  assert.equal(vide.code, 'LU400');
  const wilaya = await echec(commander([{ id_produit: 4, quantite: 1 }], 99));
  assert.equal(wilaya.code, 'LU400');
});

test('declencheur : lignes modifiables en attente, gelees ensuite', async () => {
  const id = (await commander([{ id_produit: 5, quantite: 1 }])).rows[0].id;

  await db.query('UPDATE ligne_commande SET quantite = 2 WHERE id_commande = $1', [id]);
  assert.equal((await db.query('SELECT quantite FROM ligne_commande WHERE id_commande = $1', [id])).rows[0].quantite, 2);

  await db.query("UPDATE commande SET statut = 'confirmee' WHERE id_commande = $1", [id]);

  const modif = await echec(db.query('UPDATE ligne_commande SET quantite = 9 WHERE id_commande = $1', [id]));
  assert.equal(modif.code, 'LU403');
  const suppression = await echec(db.query('DELETE FROM ligne_commande WHERE id_commande = $1', [id]));
  assert.equal(suppression.code, 'LU403');
  const commandeSupprimee = await echec(db.query('DELETE FROM commande WHERE id_commande = $1', [id]));
  assert.equal(commandeSupprimee.code, 'LU403');
  assert.equal((await db.query('SELECT quantite FROM ligne_commande WHERE id_commande = $1', [id])).rows[0].quantite, 2);
});

test('contraintes : stock negatif, telephone invalide, produit vendu non supprimable', async () => {
  const negatif = await echec(db.query('UPDATE produit SET stock = -1 WHERE id_produit = 3'));
  assert.equal(negatif.code, '23514');
  const telephone = await echec(db.query("UPDATE client SET telephone = 'abc' WHERE id_client = $1", [idClient]));
  assert.equal(telephone.code, '23514');
  const produit = await echec(db.query('DELETE FROM produit WHERE id_produit = 3'));
  assert.equal(produit.code, '23503');
});

test('machine a etats : seules les transitions autorisees passent, le journal les enregistre', async () => {
  const id = (await commander([{ id_produit: 4, quantite: 1 }])).rows[0].id;
  const changer = (statut) => db.query('UPDATE commande SET statut = $1 WHERE id_commande = $2', [statut, id]);

  assert.equal((await echec(changer('livree'))).code, 'LU403');
  assert.equal((await echec(changer('expediee'))).code, 'LU403');
  await changer('confirmee');
  assert.equal((await echec(changer('livree'))).code, 'LU403');
  assert.equal((await echec(changer('en_attente'))).code, 'LU403');
  await changer('expediee');
  await changer('livree');
  assert.equal((await echec(changer('annulee'))).code, 'LU403');
  assert.equal((await echec(changer('confirmee'))).code, 'LU403');

  const journal = (await db.query(
    'SELECT ancien_statut, nouveau_statut, date_changement FROM journal_commande WHERE id_commande = $1 ORDER BY id_journal', [id]
  )).rows;
  assert.deepEqual(
    journal.map((e) => [e.ancien_statut, e.nouveau_statut]),
    [['en_attente', 'confirmee'], ['confirmee', 'expediee'], ['expediee', 'livree']]
  );
  assert.ok(journal.every((e) => e.date_changement instanceof Date));
});

test('annuler_commande : stock remis, journal, refus apres expedition, controle du proprietaire', async () => {
  const stock3 = await stock(3);
  const stock4 = await stock(4);
  const id = (await commander([{ id_produit: 3, quantite: 2 }, { id_produit: 4, quantite: 1 }])).rows[0].id;
  assert.deepEqual([await stock(3), await stock(4)], [stock3 - 2, stock4 - 1]);

  assert.equal((await echec(db.query('SELECT annuler_commande($1, $2)', [id, idClient + 1000000]))).code, 'LU404');
  assert.equal((await echec(db.query('SELECT annuler_commande($1)', [99999999]))).code, 'LU404');

  await db.query('SELECT annuler_commande($1, $2)', [id, idClient]);
  assert.deepEqual([await stock(3), await stock(4)], [stock3, stock4]);
  assert.equal((await db.query('SELECT statut FROM commande WHERE id_commande = $1', [id])).rows[0].statut, 'annulee');
  const dernier = (await db.query('SELECT ancien_statut, nouveau_statut FROM journal_commande WHERE id_commande = $1 ORDER BY id_journal DESC LIMIT 1', [id])).rows[0];
  assert.deepEqual(dernier, { ancien_statut: 'en_attente', nouveau_statut: 'annulee' });
  assert.equal((await echec(db.query('SELECT annuler_commande($1)', [id]))).code, 'LU409');
  assert.deepEqual([await stock(3), await stock(4)], [stock3, stock4]);

  const confirmee = (await commander([{ id_produit: 3, quantite: 1 }])).rows[0].id;
  await db.query("UPDATE commande SET statut = 'confirmee' WHERE id_commande = $1", [confirmee]);
  await db.query('SELECT annuler_commande($1)', [confirmee]);
  assert.equal(await stock(3), stock3);

  const expediee = (await commander([{ id_produit: 3, quantite: 1 }])).rows[0].id;
  await db.query("UPDATE commande SET statut = 'confirmee' WHERE id_commande = $1", [expediee]);
  await db.query("UPDATE commande SET statut = 'expediee' WHERE id_commande = $1", [expediee]);
  assert.equal((await echec(db.query('SELECT annuler_commande($1)', [expediee]))).code, 'LU409');
  assert.equal(await stock(3), stock3 - 1);
});

test('avis : note entre 1 et 5, une seule note par client et produit, vue des moyennes', async () => {
  await db.query('INSERT INTO avis (id_client, id_produit, note) VALUES ($1, 3, 4)', [idClient]);
  assert.equal((await echec(db.query('INSERT INTO avis (id_client, id_produit, note) VALUES ($1, 4, 6)', [idClient]))).code, '23514');
  assert.equal((await echec(db.query('INSERT INTO avis (id_client, id_produit, note) VALUES ($1, 4, 0)', [idClient]))).code, '23514');
  assert.equal((await echec(db.query('INSERT INTO avis (id_client, id_produit, note) VALUES ($1, 3, 5)', [idClient]))).code, '23505');
  const vue = (await db.query('SELECT nb_avis::int AS nb, note_moyenne FROM v_note_produit WHERE id_produit = 3')).rows[0];
  assert.ok(vue.nb >= 1);
  assert.ok(Number(vue.note_moyenne) >= 1 && Number(vue.note_moyenne) <= 5);
});

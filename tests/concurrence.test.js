require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { urlAdmin } = require('./aide');

const ID_PRODUIT = 32;
const APPEL = 'SELECT passer_commande($1, $2, $3, $4, $5, $6, $7::jsonb) AS id';

let c1;
let c2;
let c3;
let idClient;
let stockInitial;

function parametres() {
  return [idClient, 'Client Concurrence', '1 rue du Verrou', '0555000000', 16, 'cash', JSON.stringify([{ id_produit: ID_PRODUIT, quantite: 1 }])];
}

async function stock() {
  const { rows } = await c3.query('SELECT stock FROM produit WHERE id_produit = $1', [ID_PRODUIT]);
  return rows[0].stock;
}

async function lignes() {
  const { rows } = await c3.query(
    'SELECT count(*)::int AS n FROM commande AS c JOIN ligne_commande AS l ON l.id_commande = c.id_commande ' +
      'WHERE c.id_client = $1 AND l.id_produit = $2',
    [idClient, ID_PRODUIT]
  );
  return rows[0].n;
}

async function nettoyer() {
  await c3.query('DELETE FROM commande WHERE id_client = $1', [idClient]);
}

test.before(async () => {
  c1 = new Client({ connectionString: process.env.DATABASE_URL });
  c2 = new Client({ connectionString: process.env.DATABASE_URL });
  c3 = new Client({ connectionString: urlAdmin });
  await Promise.all([c1.connect(), c2.connect(), c3.connect()]);
  stockInitial = (await c3.query('SELECT stock FROM produit WHERE id_produit = $1', [ID_PRODUIT])).rows[0].stock;
  const email = 'concurrence.' + Date.now() + '@example.com';
  const { rows } = await c3.query(
    "INSERT INTO client (nom, prenom, email, telephone, sexe, date_naissance, mot_de_passe_hash) " +
      "VALUES ('Verrou', 'Test', $1, '0555000000', 'M', '1990-01-01', 'hash-de-test') RETURNING id_client",
    [email]
  );
  idClient = rows[0].id_client;
});

test.after(async () => {
  await nettoyer();
  await c3.query('DELETE FROM client WHERE id_client = $1', [idClient]);
  await c3.query('UPDATE produit SET stock = $1 WHERE id_produit = $2', [stockInitial, ID_PRODUIT]);
  await Promise.all([c1.end(), c2.end(), c3.end()]);
});

test('deux connexions, une seule unite : un seul succes, stock a 0', async () => {
  await c3.query('UPDATE produit SET stock = 1 WHERE id_produit = $1', [ID_PRODUIT]);

  const resultats = await Promise.allSettled([c1.query(APPEL, parametres()), c2.query(APPEL, parametres())]);
  const succes = resultats.filter((r) => r.status === 'fulfilled');
  const echecs = resultats.filter((r) => r.status === 'rejected');

  assert.equal(succes.length, 1);
  assert.equal(echecs.length, 1);
  assert.equal(echecs[0].reason.code, 'LU409');
  assert.equal(await stock(), 0);
  assert.equal(await lignes(), 1);
});

test('la seconde transaction attend le verrou puis echoue apres le COMMIT de la premiere', async () => {
  await nettoyer();
  await c3.query('UPDATE produit SET stock = 1 WHERE id_produit = $1', [ID_PRODUIT]);
  const pidSecond = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;

  await c1.query('BEGIN');
  await c1.query(APPEL, parametres());

  const seconde = c2.query(APPEL, parametres()).then(
    () => ({ ok: true }),
    (erreur) => ({ ok: false, erreur })
  );

  let bloquee = false;
  for (let essai = 0; essai < 50 && !bloquee; essai++) {
    const { rows } = await c3.query(
      "SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'",
      [pidSecond]
    );
    bloquee = rows.length > 0;
    if (!bloquee) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(bloquee, 'la seconde connexion devrait attendre le verrou de la premiere');

  await c1.query('COMMIT');
  const issue = await seconde;

  assert.equal(issue.ok, false);
  assert.equal(issue.erreur.code, 'LU409');
  assert.equal(await stock(), 0);
  assert.equal(await lignes(), 1);
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { supprimerClient, urlAdmin } = require('./aide');

const APPEL = 'SELECT passer_commande($1, $2, $3, $4, $5, $6, $7::jsonb) AS id';

let db;
let a;
let b;
let commandeA;
let commandeB;
let stockInitial;

async function creerClient(prenom) {
  const { rows } = await db.query(
    "INSERT INTO client (nom, prenom, email, telephone, sexe, date_naissance, mot_de_passe_hash) " +
      "VALUES ('Rls', $1, $2, '0555222222', 'F', '1993-03-03', 'hash-de-test') RETURNING id_client",
    [prenom, prenom.toLowerCase() + '.' + Date.now() + '@example.com']
  );
  return rows[0].id_client;
}

async function commander(idClient) {
  const items = JSON.stringify([{ id_produit: 6, quantite: 1 }]);
  return (await db.query(APPEL, [idClient, 'Client Rls', '5 rue du Filtre', '0555222222', 16, 'cash', items])).rows[0].id;
}

async function enTantQue(contexte, travail) {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE luna_app');
    if (contexte) {
      await db.query("SELECT set_config('app.id_client', $1, true), set_config('app.role', $2, true)", [String(contexte.id), contexte.role]);
    }
    return await travail();
  } finally {
    await db.query('ROLLBACK');
  }
}

test.before(async () => {
  db = new Client({ connectionString: urlAdmin });
  await db.connect();
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'database', 'roles.sql'), 'utf8'));
  stockInitial = (await db.query('SELECT stock FROM produit WHERE id_produit = 6')).rows[0].stock;
  a = await creerClient('Alice');
  b = await creerClient('Bruno');
  commandeA = await commander(a);
  commandeB = await commander(b);
});

test.after(async () => {
  await supprimerClient(a);
  await supprimerClient(b);
  await db.query('UPDATE produit SET stock = $1 WHERE id_produit = 6', [stockInitial]);
  await db.end();
});

test('sans contexte, le role restreint ne voit aucune commande', async () => {
  const resultat = await enTantQue(null, async () => ({
    commandes: (await db.query('SELECT count(*)::int AS n FROM commande')).rows[0].n,
    lignes: (await db.query('SELECT count(*)::int AS n FROM ligne_commande')).rows[0].n,
    vue: (await db.query('SELECT count(*)::int AS n FROM v_total_commande')).rows[0].n
  }));
  assert.deepEqual(resultat, { commandes: 0, lignes: 0, vue: 0 });
});

test('un client ne voit que ses propres commandes, lignes et totaux', async () => {
  const resultat = await enTantQue({ id: a, role: 'client' }, async () => ({
    commandes: (await db.query('SELECT DISTINCT id_client FROM commande')).rows.map((r) => r.id_client),
    lignes: (await db.query('SELECT DISTINCT id_commande FROM ligne_commande')).rows.map((r) => r.id_commande),
    vue: (await db.query('SELECT DISTINCT id_client FROM v_total_commande')).rows.map((r) => r.id_client),
    autre: (await db.query('SELECT count(*)::int AS n FROM commande WHERE id_client = $1', [b])).rows[0].n
  }));
  assert.deepEqual(resultat.commandes, [a]);
  assert.deepEqual(resultat.lignes, [commandeA]);
  assert.deepEqual(resultat.vue, [a]);
  assert.equal(resultat.autre, 0);
});

test('un client ne peut pas changer un statut, un administrateur le peut', async () => {
  await enTantQue({ id: a, role: 'client' }, async () => {
    const resultat = await db.query("UPDATE commande SET statut = 'confirmee' WHERE id_commande = $1", [commandeA]);
    assert.equal(resultat.rowCount, 0);
  });
  assert.equal((await db.query('SELECT statut FROM commande WHERE id_commande = $1', [commandeA])).rows[0].statut, 'en_attente');

  await db.query('BEGIN');
  await db.query('SET LOCAL ROLE luna_app');
  await db.query("SELECT set_config('app.id_client', $1, true), set_config('app.role', 'admin', true)", [String(a)]);
  const resultat = await db.query("UPDATE commande SET statut = 'confirmee' WHERE id_commande = $1", [commandeB]);
  assert.equal(resultat.rowCount, 1);
  await db.query('ROLLBACK');
});

test('un administrateur voit toutes les commandes', async () => {
  const proprietaire = (await db.query('SELECT count(*)::int AS n FROM commande')).rows[0].n;
  const admin = await enTantQue({ id: a, role: 'admin' }, async () => (await db.query('SELECT count(*)::int AS n FROM commande')).rows[0].n);
  assert.equal(admin, proprietaire);
  assert.ok(proprietaire >= 2);
});

test('le role restreint ne peut pas lire les mots de passe hachés', async () => {
  await enTantQue(null, async () => {
    await assert.rejects(db.query('SELECT mot_de_passe_hash FROM client'), { code: '42501' });
  });
  await enTantQue(null, async () => {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM client');
    assert.ok(rows[0].n >= 2);
  });
});

test('le role restreint ne peut pas fixer le role à l\'inscription', async () => {
  await enTantQue(null, async () => {
    await assert.rejects(
      db.query(
        "INSERT INTO client (nom, prenom, email, telephone, sexe, date_naissance, mot_de_passe_hash, role) " +
          "VALUES ('Pirate', 'Test', 'pirate@example.com', '0555333333', 'M', '1990-01-01', 'hash-de-test', 'admin')"
      ),
      { code: '42501' }
    );
  });
});

test('get_identifiants renvoie le hash d\'un seul compte, sans tenir compte de la casse', async () => {
  const email = (await db.query('SELECT email FROM client WHERE id_client = $1', [a])).rows[0].email;
  await enTantQue(null, async () => {
    const { rows } = await db.query('SELECT * FROM get_identifiants($1)', [email.toUpperCase()]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id_client, a);
    assert.equal(rows[0].mot_de_passe_hash, 'hash-de-test');
    const inconnu = await db.query('SELECT * FROM get_identifiants($1)', ['inconnu@example.com']);
    assert.equal(inconnu.rows.length, 0);
  });
});

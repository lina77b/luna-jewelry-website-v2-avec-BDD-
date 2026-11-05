require('dotenv').config();
process.env.NODE_ENV = 'development';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'secret-de-test-pour-les-tests-automatises';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const pool = require('../server/db');
const app = require('../server/server');

let serveur;
let base;

test.before(async () => {
  serveur = app.listen(0);
  await once(serveur, 'listening');
  base = 'http://127.0.0.1:' + serveur.address().port;
});

test.after(async () => {
  await new Promise((resolve) => serveur.close(resolve));
  await pool.end();
});

async function tenter() {
  const reponse = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'inconnu@example.com', mot_de_passe: 'Mauvais@2025x' })
  });
  return { statut: reponse.status, donnees: await reponse.json() };
}

test('la onzième tentative de connexion échouée est refusée avec le code 429', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await tenter()).statut, 401);
  }
  const bloquee = await tenter();
  assert.equal(bloquee.statut, 429);
  assert.match(bloquee.donnees.erreur, /Trop de tentatives/);
});

test('les en-têtes de sécurité sont présents', async () => {
  const reponse = await fetch(base + '/');
  assert.match(reponse.headers.get('content-security-policy'), /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.equal(reponse.headers.get('x-content-type-options'), 'nosniff');
});

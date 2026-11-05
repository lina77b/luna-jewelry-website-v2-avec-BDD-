require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
const dossier = path.join(__dirname, '..', 'database');
const args = process.argv.slice(2);

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connecter() {
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL est absent : copiez .env.example vers .env.');
  }
  const limite = Date.now() + 30000;
  let derniereErreur;
  while (Date.now() < limite) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      return client;
    } catch (err) {
      derniereErreur = err;
      console.log('Base de donnees pas encore prete, nouvel essai dans 1 s (' + (err.code || err.message) + ')');
      await client.end().catch(() => {});
      await attendre(1000);
    }
  }
  throw new Error('Impossible de se connecter a PostgreSQL apres 30 s : ' + derniereErreur.message);
}

async function lancer(client, fichier) {
  const sql = fs.readFileSync(path.join(dossier, fichier), 'utf8');
  await client.query(sql);
  console.log('OK  ' + fichier);
}

async function diagnostiquer(client) {
  const sql = fs.readFileSync(path.join(dossier, 'diagnostic.sql'), 'utf8');
  const requetes = sql.split(/;\s*\n/).map((r) => r.trim()).filter(Boolean);
  for (const requete of requetes) {
    console.log('\n' + requete.split('\n')[0]);
    const resultat = await client.query(requete);
    if (resultat.rows.length > 0) console.table(resultat.rows);
  }
}

async function main() {
  const client = await connecter();
  try {
    if (args.includes('--stats')) {
      await diagnostiquer(client);
      return;
    }
    if (args.includes('--demo')) {
      await lancer(client, 'demo_data.sql');
      return;
    }
    if (args.includes('--bench')) {
      await lancer(client, 'bench_data.sql');
      return;
    }
    if (args.includes('--roles')) {
      await lancer(client, 'roles.sql');
      return;
    }
    if (args.includes('--reset')) {
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('OK  schema public recree');
    } else {
      const existe = await client.query("SELECT to_regclass('public.produit') AS t");
      if (existe.rows[0].t) {
        console.log('La base est deja initialisee. Utilisez npm run db:reset pour repartir de zero.');
        return;
      }
    }
    for (const fichier of ['schema.sql', 'functions.sql', 'views.sql', 'seed.sql', 'roles.sql']) {
      await lancer(client, fichier);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Erreur : ' + err.message);
  process.exit(1);
});

require('dotenv').config();
const { Client, Pool } = require('pg');

const urlAdmin = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;

async function supprimerClient(idClient) {
  const client = new Client({ connectionString: urlAdmin });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE commande DISABLE TRIGGER trg_commande_suppression');
    await client.query('DELETE FROM avis WHERE id_client = $1', [idClient]);
    await client.query('DELETE FROM commande WHERE id_client = $1', [idClient]);
    await client.query('ALTER TABLE commande ENABLE TRIGGER trg_commande_suppression');
    await client.query('DELETE FROM client WHERE id_client = $1', [idClient]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

module.exports = { supprimerClient, urlAdmin, Pool };

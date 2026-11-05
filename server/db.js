require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.avecContexte = async function avecContexte(utilisateur, travail) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.id_client', $1, true), set_config('app.role', $2, true)", [
      String(utilisateur.id),
      utilisateur.role
    ]);
    const resultat = await travail(client);
    await client.query('COMMIT');
    return resultat;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = pool;

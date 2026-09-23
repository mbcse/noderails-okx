import 'dotenv/config';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in environment');
  process.exit(1);
}

async function main() {
  const contractId = process.argv[2];
  if (!contractId) {
    console.error('Usage: tsx src/scripts/print-contract-pg.ts <contractId>');
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const contractRes = await client.query('SELECT id, address, protocol, is_active FROM contracts WHERE id = $1', [contractId]);
    if (contractRes.rowCount === 0) {
      console.log('Contract not found:', contractId);
      process.exit(2);
    }
    const contract = contractRes.rows[0];
    console.log('Contract:', contract);

    const chainRes = await client.query('SELECT id, name, chain_id, rpc_urls, active_rpc_index FROM chains WHERE chain_id = (SELECT chain_id FROM contracts WHERE id = $1)', [contractId]);
    console.log('Chain:', chainRes.rows[0]);

    const indexStatesRes = await client.query('SELECT id, chain_id, last_indexed_block, last_finalized_block FROM index_states WHERE contract_id = $1', [contractId]);
    console.log('\nIndexStates:', indexStatesRes.rows);

    const subsRes = await client.query('SELECT id, event_name, is_active FROM event_subscriptions WHERE contract_id = $1', [contractId]);
    console.log('\nEventSubscriptions:', subsRes.rows);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

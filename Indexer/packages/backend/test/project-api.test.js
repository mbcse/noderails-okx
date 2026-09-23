import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3001/api/project';
const API_KEY = process.env.PROJECT_API_KEY; // Set to a project API key from admin (e.g. from .env) when running tests

// Example USDC contract (Ethereum mainnet)
const CONTRACT = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  abi: '[{"anonymous":false,"inputs":[{"indexed":true,"name":"from","type":"address"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Transfer","type":"event"}]',
  name: 'USDC',
  startBlock: 0,
  chainId: 1, // Must match an existing chain in DB
};
const FILTER = {
  eventName: 'Transfer',
  field: 'to',
  op: 'eq',
  value: '0x000000000000000000000000000000000000dead', // random address
};

// Watched addresses for native transfer indexing (chainId must exist in DB)
const WATCHED_CHAIN_ID = 1;
const WATCHED_ADDRESS_1 = '0x000000000000000000000000000000000000dead';
const WATCHED_ADDRESS_2 = '0x000000000000000000000000000000000000beef';
const WATCHED_ADDRESS_3 = '0x000000000000000000000000000000000000cafe';

async function main() {
  const headers = { 'x-api-key': API_KEY };

  let contract, filterData;
  const createdWatchedIds = [];
  try {
    // Ensure idempotent: list contracts and remove any with same address so we can re-run
    let listRes = await axios.get(`${API_URL}/contracts`, { headers }).catch(() => ({ data: { data: [] } }));
    const existing = (listRes.data?.data || []).find((c) => c.address?.toLowerCase() === CONTRACT.address.toLowerCase());
    if (existing) {
      console.log('--- 0. Removing existing contract with same address for clean run');
      await axios.delete(`${API_URL}/contracts/${existing.id}`, { headers });
    }

    console.log('--- 1. Adding contract:', CONTRACT);
    let res = await axios.post(`${API_URL}/contracts`, CONTRACT, { headers });
    contract = res.data.data;
    console.log('✔ Contract added:', contract);

    console.log('--- 2. Adding filter:', { ...FILTER, contractId: contract.id });
    res = await axios.post(`${API_URL}/filters`, { ...FILTER, contractId: contract.id }, { headers });
    filterData = res.data.data;
    console.log('✔ Filter added:', filterData);

    console.log('--- 3. Listing contracts');
    res = await axios.get(`${API_URL}/contracts`, { headers });
    console.log('✔ Contracts:', res.data.data);

    console.log('--- 4. Listing filters');
    res = await axios.get(`${API_URL}/filters`, { headers });
    console.log('✔ Filters:', res.data.data);

    console.log('--- 5. Updating filter:', { field: 'to', op: 'eq', value: '0x000000000000000000000000000000000000beef' });
    res = await axios.put(`${API_URL}/filters`, { field: 'to', op: 'eq', value: '0x000000000000000000000000000000000000beef' }, {
      headers,
      params: { contractId: contract.id, eventName: FILTER.eventName },
    });
    console.log('✔ Filter updated:', res.data.data);

    console.log('--- 6. Getting single contract:', contract.id);
    res = await axios.get(`${API_URL}/contracts/${contract.id}`, { headers });
    console.log('✔ Single contract:', res.data.data);

    console.log('--- 7. Getting single filter (by contractId + eventName)');
    res = await axios.get(`${API_URL}/filters/by-subscription`, {
      headers,
      params: { contractId: contract.id, eventName: FILTER.eventName },
    });
    console.log('✔ Single filter:', res.data.data);

    // ─── Watched addresses (native transfer) ─────────────────────────────────
    console.log('\n--- 8. Listing watched addresses (native transfer)');
    res = await axios.get(`${API_URL}/watched-addresses`, { headers });
    const initialWatched = res.data?.data ?? [];
    console.log('✔ Watched addresses:', initialWatched.length);

    console.log('--- 9. Adding one watched address');
    res = await axios.post(`${API_URL}/watched-addresses`, {
      chainId: WATCHED_CHAIN_ID,
      address: WATCHED_ADDRESS_1,
      direction: 'both',
      label: 'Test wallet 1',
    }, { headers });
    const wa1 = res.data.data;
    createdWatchedIds.push(wa1.id);
    console.log('✔ Added:', wa1.id, wa1.address, wa1.direction);

    console.log('--- 10. Getting single watched address by id');
    res = await axios.get(`${API_URL}/watched-addresses/${wa1.id}`, { headers });
    console.log('✔ Single watched address:', res.data.data?.address === wa1.address ? 'OK' : res.data.data);

    console.log('--- 11. Adding multiple watched addresses (bulk)');
    res = await axios.post(`${API_URL}/watched-addresses/bulk`, {
      chainId: WATCHED_CHAIN_ID,
      addresses: [WATCHED_ADDRESS_2, WATCHED_ADDRESS_3],
      direction: 'in',
      label: 'Bulk test',
    }, { headers });
    const bulkResult = res.data.data;
    (bulkResult.created || []).forEach((w) => createdWatchedIds.push(w.id));
    console.log('✔ Bulk created:', bulkResult.created?.length ?? 0, 'skipped:', bulkResult.skipped?.length ?? 0);

    console.log('--- 12. Listing watched addresses again');
    res = await axios.get(`${API_URL}/watched-addresses`, { headers, params: { chainId: WATCHED_CHAIN_ID } });
    const afterAdd = res.data?.data ?? [];
    console.log('✔ Total watched for chain', WATCHED_CHAIN_ID, ':', afterAdd.length);

    console.log('--- 13. Deleting one watched address');
    await axios.delete(`${API_URL}/watched-addresses/${wa1.id}`, { headers });
    createdWatchedIds.splice(createdWatchedIds.indexOf(wa1.id), 1);
    console.log('✔ Deleted', wa1.id);

    console.log('--- 14. Listing after delete');
    res = await axios.get(`${API_URL}/watched-addresses`, { headers });
    const afterDelete = res.data?.data ?? [];
    console.log('✔ Watched addresses after delete:', afterDelete.length);
  } catch (e) {
    console.error('❌ Test failed at step:', e.config?.url || 'unknown');
    if (e.response) {
      console.error('Status:', e.response.status);
      console.error('Response:', JSON.stringify(e.response.data, null, 2));
    } else {
      console.error('Error:', e.message || e.code || String(e));
    }
    process.exit(1);
  } finally {
    // Cleanup: delete remaining watched addresses
    for (const id of createdWatchedIds) {
      try {
        await axios.delete(`${API_URL}/watched-addresses/${id}`, { headers });
        console.log('✔ Deleted watched address', id);
      } catch (err) {
        console.error('Failed to delete watched address', id, err.response?.data || err.message);
      }
    }
    // Cleanup: clear filter (by contractId + eventName), then delete contract
    try {
      if (contract && filterData) {
        console.log('Cleaning up filter...');
        await axios.delete(`${API_URL}/filters`, { headers, params: { contractId: contract.id, eventName: FILTER.eventName } });
        console.log('✔ Filter deleted');
      }
    } catch (err) { console.error('Failed to delete filter:', err.response?.data || err.message); }
    try { if (contract) { console.log('Cleaning up contract...'); await axios.delete(`${API_URL}/contracts/${contract.id}`, { headers }); console.log('✔ Contract deleted'); } } catch (err) { console.error('Failed to delete contract:', err.response?.data || err.message); }
    console.log('Cleanup done.');
  }
}

main();

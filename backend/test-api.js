// Quick test script for the API
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const API_BASE = 'http://localhost:4000';
const TEST_TOKEN = 'test-user-123';

async function testAPI() {
  try {
    console.log('Testing health endpoint...');
    const health = await fetch(`${API_BASE}/health`);
    console.log('Health:', await health.json());

    console.log('\nAdding a test transaction...');
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        id: 'test-' + Date.now(),
        type: 'expense',
        amount: 25.50,
        date: new Date().toISOString(),
        category: 'Food',
        description: 'Test transaction'
      })
    });
    const addResponse = await fetch(`${API_BASE}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        id: 'test-' + Date.now(),
        type: 'expense',
        amount: 25.50,
        date: new Date(), // Use Date object for DateTime
        category: 'Food',
        description: 'Test transaction'
      })
    });
    console.log('Add result:', await addResponse.json());

    console.log('\nFetching transactions...');
    const getResponse = await fetch(`${API_BASE}/api/transactions`, {
      headers: { 'Authorization': `Bearer ${TEST_TOKEN}` }
    });
    const transactions = await getResponse.json();
    console.log(`Found ${transactions.length} transaction(s):`, transactions);

    console.log('\n✅ API is working correctly!');
  } catch (error) {
    console.error('❌ API test failed:', error.message);
  }
}

testAPI();

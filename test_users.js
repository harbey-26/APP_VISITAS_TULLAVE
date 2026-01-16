
const API_URL = 'http://localhost:3000/api';

async function testUsers() {
    try {
        console.log('1. Logging in...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email: 'agente@tullave.com', password: '123456' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const { token } = await loginRes.json();
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

        console.log('2. Creating User "New Agent"...');
        const createRes = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: 'New Agent',
                email: 'newagent@tullave.com',
                password: 'password123',
                role: 'AGENT'
            })
        });
        const newUser = await createRes.json();
        if (createRes.ok) {
            console.log('✅ Created User:', newUser.id, newUser.email);
        } else {
            console.error('❌ Creation Failed:', newUser);
            return;
        }

        console.log('3. Listing Users...');
        const listRes = await fetch(`${API_URL}/users`, { headers });
        const users = await listRes.json();
        console.log('Total Users:', users.length);
        const found = users.find(u => u.id === newUser.id);
        if (found) console.log('✅ New user found in list');

        console.log('4. Deleting User...');
        const deleteRes = await fetch(`${API_URL}/users/${newUser.id}`, {
            method: 'DELETE',
            headers
        });
        if (deleteRes.ok) {
            console.log('✅ User deleted successfully');
        } else {
            console.error('❌ Deletion failed:', await deleteRes.json());
        }

    } catch (e) {
        console.error(e);
    }
}

testUsers();


// Mock test for deletion password

const API_URL = 'http://localhost:3000/api';

async function testDelete() {
    try {
        // 1. Login
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email: 'agente@tullave.com', password: '123456' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const { token } = await loginRes.json();

        // 2. Create Visit
        const createRes = await fetch(`${API_URL}/visits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                propertyId: 2,
                scheduledStart: new Date().toISOString(),
                estimatedDuration: 30,
                type: 'SHOWING',
                notes: 'Test Daniel2809'
            })
        });
        const visit = await createRes.json();
        console.log('Created visit:', visit.id);

        // 3. Delete with "Daniel2809"
        const deleteRes = await fetch(`${API_URL}/visits/${visit.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ password: 'Daniel2809' })
        });

        if (deleteRes.ok) {
            console.log('✅ Success: Deleted using "Daniel2809"');
        } else {
            console.error('❌ Failed:', await deleteRes.json());
        }

    } catch (e) {
        console.error(e);
    }
}

testDelete();

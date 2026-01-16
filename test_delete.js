
// This script mocks what the frontend does.
// We verify the BACKEND LOGIC change for delete.

const API_URL = 'http://localhost:3000/api';

async function testDelete() {
    try {
        // 1. Login to get token
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'agente@tullave.com', password: '123456' })
        });
        const { token, user } = await loginRes.json();
        console.log('Login successful:', !!token);

        if (!token) return;

        // 2. Create a visit to delete
        const createRes = await fetch(`${API_URL}/visits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                propertyId: 2,
                scheduledStart: new Date().toISOString(),
                estimatedDuration: 30,
                type: 'SHOWING',
                notes: 'To be deleted'
            })
        });
        const visit = await createRes.json();
        console.log('Created visit:', visit.id);

        if (!visit.id) {
            console.log('Failed to create visit', visit);
            return;
        }

        // 3. Try delete with WRONG password
        const failRes = await fetch(`${API_URL}/visits/${visit.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password: 'WRONG_PASSWORD' })
        });
        console.log('Delete with wrong password status:', failRes.status, '(Expected 403)');

        // 4. Try delete with OLD magic password (should fail now)
        const oldMagicRes = await fetch(`${API_URL}/visits/${visit.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password: 'ELIMINAR123' })
        });

        console.log('Delete with old magic password status:', oldMagicRes.status, '(Expected 403)');

        // 5. Try delete with CORRECT password
        const successRes = await fetch(`${API_URL}/visits/${visit.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password: '123456' })
        });
        console.log('Delete with correct password status:', successRes.status, '(Expected 200)');
        const successData = await successRes.json();
        console.log('Delete success message:', JSON.stringify(successData));

    } catch (e) {
        console.error('Test failed:', e);
    }
}

testDelete();

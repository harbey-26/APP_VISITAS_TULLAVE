async function verifyLogin() {
    const users = [
        { email: 'admin@tullave.com', password: 'Tullave2024*' },
        { email: 'agente@tullave.com', password: 'Tullaveagente*' }
    ];

    for (const { email, password } of users) {
        try {
            console.log(`Attempting login for ${email}...`);
            const response = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                console.log(`✅ Login successful for ${email}`);
            } else {
                console.error(`❌ Login failed for ${email}. Status: ${response.status}`);
                const data = await response.json();
                console.error(data);
            }
        } catch (error) {
            console.error(`❌ Error verifying ${email}:`, error.message);
        }
    }
}

verifyLogin();

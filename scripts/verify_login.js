async function verifyLogin() {
    const baseUrl = process.argv[2] || 'http://localhost:3000';
    console.log(`Verifying against: ${baseUrl}`);

    const users = [
        { email: 'admin@tullave.com', password: 'Tullave2024*' },
        { email: 'agente@tullave.com', password: 'Tullaveagente*' }
    ];

    for (const { email, password } of users) {
        try {
            console.log(`Attempting login for ${email}...`);
            const response = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                console.log(`✅ Login successful for ${email}`);
            } else {
                console.error(`❌ Login failed for ${email}. Status: ${response.status}`);
                // Only try to parse JSON if content-type is json, otherwise text
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const data = await response.json();
                    console.error(data);
                } else {
                    const text = await response.text();
                    console.error(text.substring(0, 200)); // Log first 200 chars
                }
            }
        } catch (error) {
            console.error(`❌ Error verifying ${email}:`, error.message);
        }
    }
}

verifyLogin();

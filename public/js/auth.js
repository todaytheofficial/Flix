/**
 * auth.js - Handles Registration and Login logic
 */

function initAuth(type) {
    const form = document.getElementById('auth-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('error-message');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.textContent = '';
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            errorMsg.textContent = 'Please fill in all fields.';
            return;
        }

        const endpoint = type === 'register' ? '/api/register' : '/api/login';
        
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (res.ok) {
                window.location.href = '/';
            } else {

                errorMsg.textContent = data.error || `Authentication failed: ${res.status}`;
            }

        } catch (error) {
            errorMsg.textContent = 'Network error. Could not connect to the server.';
            console.error('Auth Error:', error);
        }
    });
}
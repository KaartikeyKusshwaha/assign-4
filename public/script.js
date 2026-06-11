document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const loginWrapper = document.getElementById('login-wrapper');
    const registerWrapper = document.getElementById('register-wrapper');
    const tfaWrapper = document.getElementById('tfa-wrapper');
    
    const toRegisterBtn = document.getElementById('to-register');
    const toLoginBtn = document.getElementById('to-login');
    const tfaCancelBtn = document.getElementById('tfa-cancel');

    const notification = document.getElementById('notification');

    // Forms
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tfaForm = document.getElementById('tfa-form');

    // Check if already authenticated
    fetch('/api/check-auth')
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                window.location.href = '/dashboard.html';
            }
        });

    // Navigation between forms
    const showForm = (formToShow) => {
        [loginWrapper, registerWrapper, tfaWrapper].forEach(w => w.classList.add('hidden'));
        setTimeout(() => {
            formToShow.classList.remove('hidden');
        }, 300); // Wait for transition
    };

    toRegisterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showForm(registerWrapper);
        hideNotification();
    });

    toLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showForm(loginWrapper);
        hideNotification();
    });

    tfaCancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fetch('/api/logout', { method: 'POST' }); // clear partial session
        showForm(loginWrapper);
        hideNotification();
    });

    // Notification helper
    const showNotification = (message, type) => {
        notification.textContent = message;
        notification.className = `notification show ${type}`;
        setTimeout(() => hideNotification(), 4000);
    };

    const hideNotification = () => {
        notification.classList.remove('show');
    };

    const toggleLoader = (btnId, show) => {
        const btn = document.getElementById(btnId);
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.loader');
        if (show) {
            text.classList.add('hidden');
            loader.classList.remove('hidden');
            btn.disabled = true;
        } else {
            text.classList.remove('hidden');
            loader.classList.add('hidden');
            btn.disabled = false;
        }
    };

    // Registration
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;

        toggleLoader('reg-btn', true);
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                showNotification('Registration successful! Please login.', 'success');
                showForm(loginWrapper);
                registerForm.reset();
            } else {
                let errorMsg = data.error || 'Registration failed';
                if (data.errors) errorMsg = data.errors[0].msg;
                showNotification(errorMsg, 'error');
            }
        } catch (error) {
            showNotification('Network error occurred.', 'error');
        } finally {
            toggleLoader('reg-btn', false);
        }
    });

    // Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        toggleLoader('login-btn', true);
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                if (data.require2FA) {
                    showForm(tfaWrapper);
                } else {
                    window.location.href = '/dashboard.html';
                }
            } else {
                showNotification(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            showNotification('Network error occurred.', 'error');
        } finally {
            toggleLoader('login-btn', false);
        }
    });

    // 2FA Verification
    tfaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = document.getElementById('tfa-token').value;

        toggleLoader('tfa-btn', true);
        try {
            const res = await fetch('/api/login/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const data = await res.json();
            
            if (res.ok) {
                window.location.href = '/dashboard.html';
            } else {
                showNotification(data.error || 'Verification failed', 'error');
            }
        } catch (error) {
            showNotification('Network error occurred.', 'error');
        } finally {
            toggleLoader('tfa-btn', false);
        }
    });
});

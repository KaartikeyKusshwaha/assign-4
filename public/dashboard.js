document.addEventListener('DOMContentLoaded', () => {
    const dashboardContent = document.getElementById('dashboard-content');
    const userDisplayName = document.getElementById('user-display-name');
    const logoutBtn = document.getElementById('logout-btn');
    const notification = document.getElementById('notification');

    // 2FA Elements
    const tfaBadge = document.getElementById('tfa-badge');
    const setup2faBtn = document.getElementById('setup-2fa-btn');
    const disable2faBtn = document.getElementById('disable-2fa-btn');
    const tfaSetupArea = document.getElementById('tfa-setup-area');
    const tfaDisableArea = document.getElementById('tfa-disable-area');
    const tfaActions = document.getElementById('tfa-actions');
    const qrImage = document.getElementById('qr-image');
    const secretText = document.getElementById('secret-text');
    const verifyTokenInput = document.getElementById('verify-token');
    const verify2faBtn = document.getElementById('verify-2fa-btn');
    const cancel2faSetupBtn = document.getElementById('cancel-2fa-setup-btn');

    // Authentication Check
    fetch('/api/check-auth')
        .then(res => res.json())
        .then(data => {
            if (!data.authenticated) {
                window.location.href = '/';
            } else {
                dashboardContent.style.display = 'block';
                loadUserInfo();
            }
        });

    const showNotification = (message, type) => {
        notification.textContent = message;
        notification.className = `notification show ${type}`;
        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    };

    const loadUserInfo = () => {
        fetch('/api/user/info')
            .then(res => res.json())
            .then(data => {
                userDisplayName.textContent = data.username;
                update2FAUI(data.two_factor_enabled);
            });
    };

    const update2FAUI = (isEnabled) => {
        if (isEnabled) {
            tfaBadge.textContent = 'Enabled';
            tfaBadge.className = 'status-badge status-enabled';
            tfaActions.classList.add('hidden');
            tfaSetupArea.classList.add('hidden');
            tfaDisableArea.classList.remove('hidden');
        } else {
            tfaBadge.textContent = 'Disabled';
            tfaBadge.className = 'status-badge status-disabled';
            tfaActions.classList.remove('hidden');
            tfaSetupArea.classList.add('hidden');
            tfaDisableArea.classList.add('hidden');
        }
    };

    // Logout
    logoutBtn.addEventListener('click', () => {
        fetch('/api/logout', { method: 'POST' })
            .then(() => {
                window.location.href = '/';
            });
    });

    // Setup 2FA Initiation
    setup2faBtn.addEventListener('click', () => {
        fetch('/api/2fa/setup', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                qrImage.src = data.qrCode;
                secretText.textContent = data.secret;
                tfaActions.classList.add('hidden');
                tfaSetupArea.classList.remove('hidden');
            });
    });

    cancel2faSetupBtn.addEventListener('click', () => {
        tfaSetupArea.classList.add('hidden');
        tfaActions.classList.remove('hidden');
        verifyTokenInput.value = '';
    });

    // Verify and Enable 2FA
    verify2faBtn.addEventListener('click', () => {
        const token = verifyTokenInput.value;
        if (!token) return;

        fetch('/api/2fa/enable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        })
        .then(res => {
            if (res.ok) {
                showNotification('2FA Enabled Successfully', 'success');
                update2FAUI(true);
                verifyTokenInput.value = '';
            } else {
                res.json().then(data => showNotification(data.error || 'Invalid Token', 'error'));
            }
        });
    });

    // Disable 2FA
    disable2faBtn.addEventListener('click', () => {
        if(confirm('Are you sure you want to disable Two-Factor Authentication?')) {
            fetch('/api/2fa/disable', { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        showNotification('2FA Disabled', 'success');
                        update2FAUI(false);
                    } else {
                        showNotification('Failed to disable 2FA', 'error');
                    }
                });
        }
    });
});

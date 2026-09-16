const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const path = require('path');
const db = require('./database');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Browser security headers. The policy permits the Google-hosted font used by
// the demo while keeping scripts, frames, and embedded objects locked down.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            // This project is also run over plain HTTP for local screenshots.
            upgradeInsecureRequests: null,
        },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permissionsPolicy: {
        features: { geolocation: [], microphone: [], camera: [] },
    },
}));
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_only_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true, // Prevents client-side JS from reading the cookie
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// Keep repeated authentication attempts bounded in this in-memory demo.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication requests. Please try again later.' },
});

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId && req.session.authenticated) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// --- Routes ---

// Register
app.post('/api/register', authLimiter, [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters long').escape(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert using parameterized query (SQL Injection Protection)
        db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Registration successful' });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login (Step 1)
app.post('/api/login', authLimiter, [
    body('username').trim().escape(),
    body('password').notEmpty()
], (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(400).json({ error: 'Invalid username or password' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(400).json({ error: 'Invalid username or password' });

        // Password is correct. Check if 2FA is enabled
        req.session.userId = user.id;
        req.session.username = user.username;

        if (user.two_factor_enabled) {
            req.session.authenticated = false; // Need 2FA step
            res.json({ message: '2FA required', require2FA: true });
        } else {
            req.session.authenticated = true; // Fully authenticated
            res.json({ message: 'Login successful', require2FA: false });
        }
    });
});

// Login (Step 2 - 2FA Verify)
app.post('/api/login/2fa', authLimiter, (req, res) => {
    if (!req.session.userId) return res.status(400).json({ error: 'Session expired. Please login again.' });

    const { token } = req.body;

    db.get('SELECT two_factor_secret FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'Error fetching user' });

        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            req.session.authenticated = true;
            res.json({ message: 'Login successful' });
        } else {
            res.status(400).json({ error: 'Invalid token' });
        }
    });
});

// Check Auth Status (Used by frontend to protect routes)
app.get('/api/check-auth', (req, res) => {
    if (req.session.userId && req.session.authenticated) {
        res.json({ authenticated: true, username: req.session.username });
    } else {
        res.json({ authenticated: false });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'Could not log out' });
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
    });
});

// 2FA Setup - Generate Secret and QR
app.post('/api/2fa/setup', requireAuth, (req, res) => {
    const secret = speakeasy.generateSecret({ name: `SecureApp (${req.session.username})` });
    
    // Save secret to DB
    db.run('UPDATE users SET two_factor_secret = ? WHERE id = ?', [secret.base32, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
            if (err) return res.status(500).json({ error: 'QR Generation error' });
            res.json({ qrCode: data_url, secret: secret.base32 });
        });
    });
});

// 2FA Enable - Verify token to enable
app.post('/api/2fa/enable', authLimiter, requireAuth, (req, res) => {
    const { token } = req.body;

    db.get('SELECT two_factor_secret FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'Database error' });

        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            db.run('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [req.session.userId], (err) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json({ message: '2FA enabled successfully' });
            });
        } else {
            res.status(400).json({ error: 'Invalid token' });
        }
    });
});

// 2FA Disable
app.post('/api/2fa/disable', requireAuth, (req, res) => {
    db.run('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?', [req.session.userId], (err) => {
         if (err) return res.status(500).json({ error: 'Database error' });
         res.json({ message: '2FA disabled successfully' });
    });
});

// Dashboard Status (Get user info including 2fa status)
app.get('/api/user/info', requireAuth, (req, res) => {
    db.get('SELECT username, two_factor_enabled FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'Database error' });
        res.json({ username: user.username, two_factor_enabled: !!user.two_factor_enabled });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

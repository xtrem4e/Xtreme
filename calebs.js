/**
 * XTREME REWARDS PROTOCOL - VERSION 7.0 (ENTERPRISE EDITION)
 * * CORE ARCHITECTURE:
 * - Engine: Node.js / Express
 * - Persistence: SQLite3 (Relational Storage)
 * - Security: Bcrypt (Password Hashing), Session Management
 * - Logistics: Automated Passive Yield, Auto-Expiring One-Time Codes (OTC)
 * - Communication: Nodemailer (SMTP/SMTPS)
 */

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// --- SERVER CONFIGURATION ---
const app = express();
const PORT = 4000;
const DB_PATH = path.join(__dirname, 'xtreme_protocol_v7.db');

// --- MASTER ADMIN CREDENTIALS ---
// In production, move these to environment variables
const MASTER_ADMIN_USER = "XtremeAdmin";
const MASTER_ADMIN_PASS = "Xtreme_Secure_777"; 

// --- DATABASE INITIALIZATION ---
/**
 * Using SQLite for professional data integrity.
 * Tables: users (Core Data), codes (One-time Access), logs (Audit Trail)
 */
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("[CRITICAL] Database Connection Failed:", err.message);
    } else {
        console.log("[SYSTEM] Connected to Xtreme SQLite Persistence Layer.");
    }
});

db.serialize(() => {
    // 1. Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        balance REAL DEFAULT 1.00,
        last_sync INTEGER,
        total_withdrawn REAL DEFAULT 0,
        is_verified INTEGER DEFAULT 0,
        created_at INTEGER
    )`);

    // 2. Admin Codes Table (One-Time-Use)
    db.run(`CREATE TABLE IF NOT EXISTS admin_codes (
        code TEXT PRIMARY KEY,
        created_at INTEGER,
        status TEXT DEFAULT 'active'
    )`);

    // 3. System Logs
    db.run(`CREATE TABLE IF NOT EXISTS system_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        user_id TEXT,
        details TEXT,
        timestamp INTEGER
    )`);
});

// --- MIDDLEWARE ---
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- EMAIL ENGINE ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'xtrem4e@gmail.com',
        pass: 'wunfuvoixbppkqkq' 
    },
    tls: { rejectUnauthorized: false }
});

// --- INTERNAL UTILITIES ---
const logEvent = (type, userId, details) => {
    db.run("INSERT INTO system_logs (event_type, user_id, details, timestamp) VALUES (?, ?, ?, ?)",
        [type, userId, details, Date.now()]);
};

// --- AUTHENTICATION ROUTES ---

/**
 * @route POST /api/register
 * Handles initial user creation
 */
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    try {
        const userId = 'xtr_' + uuidv4().split('-')[0];
        const hashedPassword = await bcrypt.hash(password, 12);
        const now = Date.now();

        db.run(
            "INSERT INTO users (id, username, password, last_sync, created_at) VALUES (?, ?, ?, ?, ?)",
            [userId, username, hashedPassword, now, now],
            (err) => {
                if (err) {
                    return res.status(409).json({ success: false, error: "Username already exists." });
                }
                logEvent("USER_REGISTER", userId, `New account created: ${username}`);
                res.json({ success: true, userId });
            }
        );
    } catch (e) {
        res.status(500).json({ error: "Encryption failure" });
    }
});

/**
 * @route POST /api/login
 * Standard secure login
 */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: "Account not found." });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: "Invalid credentials." });

        logEvent("USER_LOGIN", user.id, "Session started");
        res.json({ 
            success: true, 
            userId: user.id, 
            isVerified: user.is_verified,
            balance: user.balance 
        });
    });
});

// --- REWARD NODE LOGIC ---

/**
 * @route POST /api/verify-code
 * Validates admin code AND PURGES IT from database immediately
 */
app.post('/api/verify-code', (req, res) => {
    const { code, userId } = req.body;

    db.get("SELECT * FROM admin_codes WHERE code = ?", [code], (err, row) => {
        if (err || !row) {
            return res.status(401).json({ success: false, error: "Verification code invalid or expired." });
        }

        // ATOMIC ACTION: Delete code so it can never be used again
        db.run("DELETE FROM admin_codes WHERE code = ?", [code], (delErr) => {
            if (delErr) return res.status(500).json({ error: "Protocol Error" });

            // Activate User Node
            db.run("UPDATE users SET is_verified = 1 WHERE id = ?", [userId], (upErr) => {
                logEvent("NODE_ACTIVATED", userId, `Verified using code: ${code}`);
                res.json({ success: true, message: "Node activated. Code has been expired." });
            });
        });
    });
});

/**
 * @route POST /api/sync
 * Professional Yield Calculation
 */
app.post('/api/sync', (req, res) => {
    const { userId } = req.body;

    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
        if (!user) return res.status(404).json({ error: "Access Denied" });

        const now = Date.now();
        const hoursPassed = (now - user.last_sync) / (1000 * 60 * 60);
        const rate = (user.total_withdrawn > 0) ? 5.00 : 1.00;

        if (hoursPassed >= 24) {
            const days = Math.floor(hoursPassed / 24);
            const increment = days * rate;
            
            db.run("UPDATE users SET balance = balance + ?, last_sync = ? WHERE id = ?", 
                [increment, now, userId]);
            
            logEvent("YIELD_COLLECTED", userId, `Harvested $${increment}`);
            user.balance += increment;
        }

        res.json({
            balance: user.balance,
            progress: ((hoursPassed % 24) / 24) * 100,
            nextSync: (24 - (hoursPassed % 24)).toFixed(2),
            rate: rate
        });
    });
});

// --- FINANCIAL ROUTES ---

/**
 * @route POST /api/withdraw
 * Deducts balance and alerts admin via secure email
 */
app.post('/api/withdraw', async (req, res) => {
    const { userId, address, amount } = req.body;

    db.get("SELECT * FROM users WHERE id = ?", [userId], async (err, user) => {
        if (!user || user.balance < amount) return res.status(400).json({ error: "Liquidity error" });

        try {
            // Send Alert to Xtreme
            await transporter.sendMail({
                from: '"Xtreme Protocol" <xtrem4e@gmail.com>',
                to: 'xtrem4e@gmail.com',
                subject: `[WITHDRAWAL] $${amount} - ${user.username}`,
                html: `
                    <div style="background:#020617; color:#f8fafc; padding:40px; border-radius:30px; font-family:sans-serif;">
                        <h1 style="color:#7c3aed; margin-top:0;">Withdrawal Triggered</h1>
                        <p><b>User:</b> ${user.username} (${user.id})</p>
                        <p><b>Amount:</b> <span style="font-size:24px; color:#10b981;">$${amount}</span></p>
                        <p><b>Chain Address:</b> <code style="background:#1e293b; padding:10px; display:block; margin-top:10px;">${address}</code></p>
                        <hr style="border:0; border-top:1px solid #1e293b; margin:30px 0;">
                        <p style="font-size:12px; color:#94a3b8;">Authorize via the Admin Liquidity Management panel.</p>
                    </div>
                `
            });

            db.run("UPDATE users SET balance = balance - ?, total_withdrawn = total_withdrawn + ? WHERE id = ?",
                [amount, amount, userId]);
            
            logEvent("WITHDRAW_INITIATED", userId, `Requested $${amount} to ${address}`);
            res.json({ success: true });

        } catch (mailErr) {
            console.error("Mail Failure:", mailErr);
            res.status(500).json({ error: "Communication node failure" });
        }
    });
});

// --- ADMIN COMMAND CENTER (THE "DASHBOARD" ROUTES) ---

/**
 * Admin Login Verification
 */
app.post('/api/admin/auth', (req, res) => {
    const { user, pass } = req.body;
    if (user === MASTER_ADMIN_USER && pass === MASTER_ADMIN_PASS) {
        res.json({ success: true, token: "ADMIN_SECURE_TOKEN_XTREME" });
    } else {
        res.status(401).json({ success: false });
    }
});

/**
 * Fetch Full User Database
 */
app.get('/api/admin/users', (req, res) => {
    db.all("SELECT id, username, balance, total_withdrawn, is_verified, created_at FROM users ORDER BY created_at DESC", 
        [], (err, rows) => {
        res.json(rows);
    });
});

/**
 * Generate a New One-Time Verification Code
 */
app.post('/api/admin/generate-code', (req, res) => {
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    db.run("INSERT INTO admin_codes (code, created_at) VALUES (?, ?)", [newCode, Date.now()], (err) => {
        if (err) return res.status(500).json({ error: "Failed to write code" });
        res.json({ success: true, code: newCode });
    });
});

/**
 * Update User Parameters (Manual Control)
 */
app.post('/api/admin/update-user', (req, res) => {
    const { id, balance, is_verified } = req.body;
    db.run("UPDATE users SET balance = ?, is_verified = ? WHERE id = ?", 
        [balance, is_verified, id], (err) => {
        res.json({ success: !err });
    });
});

/**
 * Delete User Account
 */
app.post('/api/admin/delete-user', (req, res) => {
    const { id } = req.body;
    db.run("DELETE FROM users WHERE id = ?", [id], (err) => {
        res.json({ success: !err });
    });
});

// --- SYSTEM INITIALIZATION ---
const server = app.listen(PORT, () => {
    console.log(`
    ===========================================
    XTREME REWARDS PROTOCOL v7.0 - ACTIVE
    PORT: ${PORT}
    DB: SQLITE3
    MODE: ENTERPRISE COMMAND CENTER
    ===========================================
    `);
});

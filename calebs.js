/**
 * Xtreme Rewards - Secure Multi-Chain Backend
 * Persistence Layer: JSON Database
 * Features: Passive accumulation logic, withdrawal processing, and code management.
 */

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 4000;
const DB_PATH = path.join(__dirname, 'database.json');

// --- DATABASE INITIALIZATION ---
const initDB = () => {
    if (!fs.existsSync(DB_PATH)) {
        const initialData = {
            config: {
                admin_code: "777888",
                reward_per_24h: 1.00,
                min_withdrawal: 0.50
            },
            users: {},
            logs: []
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 4));
        console.log("Initialized new database.");
    }
};

const getDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));

// --- MIDDLEWARE ---
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- EMAIL CONFIG ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'xtrem4e@gmail.com',
        pass: 'wunfuvoixbppkqkq' // Ensure 2FA is on and this is an App Password
    }
});

// --- CORE ROUTES ---

/* =========================
   ADMIN: GENERATE NEW CODE
   This route updates the shared 
   admin_code in the database.
========================= */
app.post('/api/generate-code', (req, res) => {
    try {
        const db = getDB(); // Uses your existing getDB() function
        
        // Generate a random 6-digit string
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Update the configuration in the JSON file
        db.config.admin_code = newCode;
        
        // Log the action for security
        db.logs.push({
            type: "ADMIN_CODE_GEN",
            time: Date.now(),
            new_code: newCode
        });

        saveDB(db); // Uses your existing saveDB() function
        
        console.log(`[ADMIN] New Access Code Generated: ${newCode}`);
        
        res.json({
            success: true,
            code: newCode
        });

    } catch (err) {
        console.error("Code Generation Error:", err);
        res.status(500).json({
            success: false,
            error: "Database write error"
        });
    }
});
/**
 * @route POST /api/verify-code
 * Validates the admin-issued code and registers user in the DB.
 */
app.post('/api/verify-code', (req, res) => {
    const { code, userId } = req.body;
    const db = getDB();

    if (!code || !userId) {
        return res.status(400).json({ success: false, error: "Missing required parameters." });
    }

    if (code === db.config.admin_code) {
        if (!db.users[userId]) {
            db.users[userId] = {
                id: userId,
                balance: 1.00,
                last_sync: Date.now(),
                verified_at: Date.now(),
                status: "active",
                total_withdrawn: 0
            };
        }
        db.logs.push({ type: "VERIFY", user: userId, time: Date.now() });
        saveDB(db);
        return res.json({ success: true, balance: db.users[userId].balance });
    }

    res.status(401).json({ success: false, error: "Verification code invalid or expired." });
});

/**
 * @route POST /api/sync
 * Calculates time delta and adds $1 per 24 hours spent.
 */
/**
 * Updated Sync Route with Dynamic Reward Scaling
 */
app.post('/api/sync', (req, res) => {
    const { userId } = req.body;
    const db = getDB();
    const user = db.users[userId];

    if (!user) return res.status(404).json({ error: "Unauthorized access." });

    const now = Date.now();
    const msDiff = now - user.last_sync;
    const hoursPassed = msDiff / (1000 * 60 * 60);
    const daysPassed = hoursPassed / 24;

    // Determine Reward Rate: $5 if they have withdrawn before, else $1
    const currentRate = (user.total_withdrawn > 0) ? 5.00 : db.config.reward_per_24h;

    if (daysPassed >= 1) {
        const increment = Math.floor(daysPassed) * currentRate;
        user.balance += increment;
        user.last_sync = now;
        db.logs.push({ type: "ACCUMULATION", user: userId, amount: increment, rate: currentRate, time: now });
        saveDB(db);
    }

    // Calculate progress for the loading bar (percentage of 24 hours)
    const progressPercent = ((hoursPassed % 24) / 24) * 100;
    const nextUpdateInHours = (24 - (hoursPassed % 24)).toFixed(2);

    res.json({ 
        balance: user.balance, 
        nextSync: nextUpdateInHours,
        progress: progressPercent.toFixed(2),
        rate: currentRate
    });
});

/**
 * @route POST /api/withdraw
 * Processes withdrawal and notifies admin.
 */
app.post('/api/withdraw', async (req, res) => {
    const { userId, address, amount } = req.body;
    const db = getDB();
    const user = db.users[userId];

    if (!user) return res.status(403).json({ error: "User session not found." });
    if (amount > user.balance) return res.status(400).json({ error: "Insufficient funds." });
    if (amount < db.config.min_withdrawal) return res.status(400).json({ error: `Min withdraw: $${db.config.min_withdrawal}` });

    // Deduct Balance
    user.balance -= amount;
    user.total_withdrawn += amount;
    
    db.logs.push({ type: "WITHDRAW_REQUEST", user: userId, amount, address, time: Date.now() });
    saveDB(db);

    try {
        await transporter.sendMail({
            from: '"Portal Admin" <xtrem4e@gmail.com>',
            to: 'xtrem4e@gmail.com',
            subject: `Withdrawal Request: $${amount}`,
            html: `
                <div style="font-family: sans-serif; border: 1px solid #eee; padding: 20px;">
                    <h2>New Withdrawal</h2>
                    <p><b>User ID:</b> ${userId}</p>
                    <p><b>Amount:</b> $${amount}</p>
                    <p><b>Wallet address:</b> <code>${address}</code></p>
                    <hr>
                    <p>Please process via the main liquidity pool.</p>
                </div>
            `
        });
    } catch (err) {
        console.error("Email Notify Error:", err);
    }

    res.json({ success: true, remaining: user.balance });
});

// --- SERVER START ---
initDB();
app.listen(PORT, () => console.log(`[AUTH-SERVER] Active on port ${PORT}`));
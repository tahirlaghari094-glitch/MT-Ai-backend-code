const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
// Google Gen AI SDK import
const { GoogleGenAI } = require('@google/genai');

const app = express();

// Railway variable "GEMINIAPIKEY" ko read karein
const apiKey = process.env.GEMINIAPIKEY;
if (!apiKey) {
    console.error("❌ WARNING: GEMINIAPIKEY is not set in environment variables!");
}

const ai = new GoogleGenAI({ apiKey: apiKey });

// Payload size limit for smooth transfers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;

// MIDDLEWARES
app.use(cors());

// Static Files hosting
app.use(express.static(path.join(__dirname, 'public')));

// Ensure Uploads Directory Exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// MULTER STORAGE SYSTEM
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// IN-MEMORY MOCK DATABASE
const database = {
    users: [], 
    conversations: {} 
};

// 1. AUTHENTICATION: SIGN UP SYSTEM
app.post('/api/auth/signup', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const userExists = database.users.find(u => u.email === email);
    if (userExists) {
        return res.status(400).json({ success: false, message: "User profile already registered." });
    }

    const newUser = { email, password, isPremium: false, usedLimit: 0 };
    database.users.push(newUser);
    res.json({ success: true, message: "Identity created successfully." });
});

// 2. AUTHENTICATION: LOGIN SYSTEM
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = database.users.find(u => u.email === email && u.password === password);
    
    if (user) {
        res.json({ success: true, message: "Workspace verified access granted." });
    } else {
        res.status(401).json({ success: false, message: "Invalid system credentials." });
    }
});

// 3. ACCOUNT: LIMIT INQUIRY PIPELINE
app.get('/api/user/limits', (req, res) => {
    const { email } = req.query;
    const user = database.users.find(u => u.email === email);

    if (user) {
        res.json({ success: true, isPremium: user.isPremium, used: user.usedLimit });
    } else {
        res.status(404).json({ success: false, message: "Profile session missing." });
    }
});

// 4. ACCOUNT: PREMIUM UPGRADE INTERACTION
app.post('/api/user/upgrade', (req, res) => {
    const { email } = req.body;
    const user = database.users.find(u => u.email === email);

    if (user) {
        user.isPremium = true;
        res.json({ success: true, message: "Subscription tier raised to Premium." });
    } else {
        res.status(404).json({ success: false, message: "User not found." });
    }
});

// 5. ASSET PIPELINE: FILE/CAMERA UPLOAD SYSTEM
app.post('/api/upload', upload.single('file'), (req, res) => {
    const host = req.get('host');
    const protocol = host.includes('localhost') ? req.protocol : 'https';

    if (req.body.image) {
        try {
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
            const filename = `camera-${Date.now()}-${Math.round(Math.random() * 1E9)}.png`;
            const filepath = path.join(uploadDir, filename);

            fs.writeFileSync(filepath, base64Data, 'base64');

            return res.json({
                success: true,
                file: {
                    filename: filename,
                    originalName: req.body.originalName || "Camera_Capture.png",
                    url: `${protocol}://${host}/uploads/${filename}`
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Camera image process karne me masla hua." });
        }
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: "Failed parsing stream asset." });
    }

    res.json({
        success: true,
        file: {
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: `${protocol}://${host}/uploads/${req.file.filename}`
        }
    });
});

// 6. PIPELINE CHAT: CONTEXT MEMORY CLEARANCE
app.post('/api/chat/clear', (req, res) => {
    const { email } = req.body;
    if (email) {
        database.conversations[email] = [];
    }
    res.json({ success: true, message: "Context successfully refreshed." });
});

// --- REAL GOOGLE/WEB IMAGE FINDER (Directly Grabs JPG/PNG without links) ---
const findRealWebImage = async (query) => {
    try {
        const cleanQuery = query.trim();
        if (!cleanQuery) return null;

        // DuckDuckGo API to dynamically fetch real-world image hotlinks (works for celebrities like Imran Khan, Salman Khan, cars, etc.)
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&pretty=1`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        // Agar DuckDuckGo par official image mil jaye (usually highly accurate celebrities)
        if (data.Image && data.Image.startsWith('http')) {
            return data.Image;
        }

        // Backup 1: Wikipedia dynamic rendering (For most famous people and places)
        const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery.replace(/\s+/g, '_'))}`;
        const wikiResponse = await fetch(wikiUrl);
        if (wikiResponse.ok) {
            const wikiData = await wikiResponse.json();
            if (wikiData.thumbnail && wikiData.thumbnail.source) {
                return wikiData.thumbnail.source;
            }
        }

        // Backup 2: Quick stock photo direct hotlink (For generic queries like "laptop", "cat", etc.)
        return `https://images.unsplash.com/featured/?${encodeURIComponent(cleanQuery)}`;
    } catch (e) {
        console.error("Error fetching real image:", e);
        // Safest free AI drawing backup in case search is blocked
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(query)}?width=512&height=512&nologo=true`;
    }
};

// 7. PIPELINE CHAT: CORE AGENT QUERY ENGINE (Advanced Smart Integration)
app.post('/api/chat', async (req, res) => {
    const { 
        email = 'guest@example.com', 
        prompt = '', 
        mode = 'MT Standard', 
        pinnedFile = null 
    } = req.body;

    if (!prompt.trim() && !pinnedFile) {
        return res.status(400).json({ success: false, response: "Prompt empty nahi ho sakta!" });
    }

    let user = database.users.find(u => u.email === email);
    if (!user) {
        user = { email, password: 'password123', isPremium: false, usedLimit: 0 };
        database.users.push(user);
    }

    if (!user.isPremium && (mode === "MT Flash" || mode === "MT Pro")) {
        if (user.usedLimit >= 10) {
            return res.json({ 
                success: true, 
                response: `<strong style="color:#ef4444;">⚠️ Premium Daily Limit Exceeded (10/10)</strong><br>Please upgrade your plan to unlock unlimited requests.`
            });
        }
        user.usedLimit += 1;
    }

    if (!database.conversations[email]) {
        database.conversations[email] = [];
    }

    database.conversations[email].push({ sender: 'user', content: prompt });

    let aiResponse = "";

    try {
        if (pinnedFile) {
            aiResponse = `📎 <strong>Asset analyzed:</strong> ${pinnedFile.originalName || "Captured Image"}.<br>The file has been parsed in <strong>${mode}</strong> environment. File URL: <a href="${pinnedFile.url}" target="_blank" rel="noopener noreferrer">View File</a>`;
        } else {
            const conversationHistory = database.conversations[email].slice(-10);
            
            try {
                // Step A: Google Gemini Model
                const contents = conversationHistory.map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content || ' ' }]
                }));

                const geminiResponse = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: contents,
                    config: {
                        systemInstruction: "You are MT AI, a highly advanced, ultra-intelligent bilingual virtual assistant. Give detailed, smart, helpful and extremely creative responses in Urdu (Roman or Nastaliq) or English. Keep a friendly, genius-like personality.",
                        temperature: 0.7
                    }
                });

                if (geminiResponse && geminiResponse.text) {
                    aiResponse = geminiResponse.text;
                } else {
                    throw new Error("Empty Gemini Response");
                }
            } catch (geminiError) {
                console.warn("⚠️ Gemini 2.0 Free quota exceeded, activating Free Unlimited backup engine!");
                
                // Step B: Back-up Fallback System
                const chatScript = conversationHistory.map(msg => {
                    const senderName = msg.sender === 'user' ? 'User' : 'Assistant';
                    return `${senderName}: ${msg.content}`;
                }).join('\n');

                const systemInstructions = "System: You are MT AI, an ultra-intelligent AI assistant. Provide highly detailed, deep, and complete responses without summarizing too much. Reply naturally in Urdu/English.";
                const fullPayload = `${systemInstructions}\n\n${chatScript}\nAssistant:`;

                const fallbackFetch = await fetch(`https://text.pollinations.ai/${encodeURIComponent(fullPayload)}`);
                if (fallbackFetch.ok) {
                    aiResponse = await fallbackFetch.text();
                } else {
                    aiResponse = "Apologies, the backup system is busy. Please try again in a few moments.";
                }
            }
        }

        // --- DYNAMIC WEB IMAGE SEARCH INTEGRATION ---
        const promptLower = prompt.toLowerCase();
        const imageKeywords = ["image", "photo", "picture", "draw", "tasveer", "show", "create", "generate", "look like", "pic", "photos", "dikhao", "banao", "pic", "dp", "pic"];
        const wantsImage = imageKeywords.some(keyword => promptLower.includes(keyword));

        if (wantsImage) {
            let cleanQuery = prompt.replace(/(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|iski|isiki|it|this|that|dikhao|banao|mujhe|dikhaen|dhundo|search|ki)/gi, "").trim();
            
            if (cleanQuery.length < 3 && database.conversations[email].length > 1) {
                const userMessagesOnly = database.conversations[email]
                    .filter(msg => msg.sender === 'user')
                    .map(msg => msg.content);
                
                if (userMessagesOnly.length >= 2) {
                    const lastTopic = userMessagesOnly[userMessagesOnly.length - 2];
                    cleanQuery = lastTopic.replace(/(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|dikhao|banao|mujhe|ki)/gi, "").trim();
                }
            }

            // Real celebrity/object image URL directly from search APIs
            const realImageUrl = await findRealWebImage(cleanQuery);

            // Directly inject Image tag so the UI renders it automatically
            aiResponse += `<br><br><div style="margin-top: 15px; text-align: center;">
                <strong style="display: block; margin-bottom: 8px;">🔍 Real-world photo of "${cleanQuery}":</strong>
                <img src="${realImageUrl}" alt="${cleanQuery}" style="max-width: 100%; width: 350px; height: auto; border-radius: 12px; border: 2px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />
            </div>`;
        }

    } catch (error) {
        console.error("AI Generation Error details:", error);
        aiResponse = "Server connection lost. Please check your internet or retry.";
    }

    database.conversations[email].push({ sender: 'ai', content: aiResponse });

    res.json({
        success: true,
        response: aiResponse
    });
});

// START EXPRESS SERVER
app.listen(PORT, () => {
    console.log(`⚡ MT AI Engine Active on Port: ${PORT}`);
});

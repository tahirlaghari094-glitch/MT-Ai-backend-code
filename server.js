
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

// --- ULTRA-POWERFUL WIKIPEDIA DYNAMIC IMAGE SCRAPER ---
const findRealWebImage = async (query) => {
    try {
        let cleanQuery = query.trim();
        if (!cleanQuery) return { url: null, realTitle: "", found: false };

        // Manual Quick Auto-Correction for Super-Famous Shortcuts
        const lowerQuery = cleanQuery.toLowerCase();
        if (lowerQuery.includes("imrn") || lowerQuery.includes("imran") || lowerQuery.includes("imr")) {
            cleanQuery = "Imran Khan";
        } else if (
            lowerQuery.includes("qaid") || 
            lowerQuery.includes("quaid") || 
            lowerQuery.includes("jinnah") || 
            lowerQuery.includes("qaide azam") || 
            lowerQuery.includes("quaid e azam") || 
            lowerQuery.includes("quaid-e-azam")
        ) {
            cleanQuery = "Muhammad Ali Jinnah";
        } else if (lowerQuery.includes("slman") || lowerQuery.includes("salman") || lowerQuery.includes("slm") || lowerQuery.includes("khn")) {
            cleanQuery = "Salman Khan";
        } else if (lowerQuery.includes("babar") || lowerQuery.includes("bbr")) {
            cleanQuery = "Babar Azam";
        } else if (lowerQuery.includes("sharukh") || lowerQuery.includes("srk") || lowerQuery.includes("shahrukh")) {
            cleanQuery = "Shah Rukh Khan";
        }

        // Wikipedia Search API call
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&format=json&origin=*`;
        const searchResponse = await fetch(searchUrl);
        
        if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
                const matchedTitle = searchData.query.search[0].title;

                // Query details and pageimage/thumbnail URL
                const imageQueryUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(matchedTitle)}&prop=pageimages&pithumbsize=600&format=json&origin=*`;
                const imageResponse = await fetch(imageQueryUrl);

                if (imageResponse.ok) {
                    const imageData = await imageResponse.json();
                    const pages = imageData.query.pages;
                    const pageId = Object.keys(pages)[0];

                    if (pageId && pages[pageId] && pages[pageId].thumbnail && pages[pageId].thumbnail.source) {
                        return {
                            url: pages[pageId].thumbnail.source,
                            realTitle: matchedTitle,
                            found: true
                        };
                    }
                }
            }
        }

        return { url: null, realTitle: query, found: false };
    } catch (e) {
        console.error("Error fetching real image:", e);
        return { url: null, realTitle: query, found: false };
    }
};

// 7. PIPELINE CHAT: CORE AGENT QUERY ENGINE
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

    const promptLower = prompt.toLowerCase();
    const imageKeywords = [
        "image", "photo", "picture", "draw", "tasveer", "show", "create", 
        "generate", "look like", "pic", "photos", "dikhao", "banao", "dp", 
        "dikhayein", "dikhain", "taswer", "dekhni hai", "dekhni", "dikhana", "dekhain"
    ];
    const wantsImage = imageKeywords.some(keyword => promptLower.includes(keyword));

    try {
        if (pinnedFile) {
            aiResponse = `📎 <strong>Asset analyzed:</strong> ${pinnedFile.originalName || "Captured Image"}.<br>The file has been parsed in <strong>${mode}</strong> environment. File URL: <a href="${pinnedFile.url}" target="_blank" rel="noopener noreferrer">View File</a>`;
        } else if (wantsImage) {
            // --- BYPASS PATH FOR ALL IMAGES (SAFE CLEANING WITH WORD BOUNDARIES) ---
            let cleanQuery = prompt.replace(/\b(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|iski|isiki|it|this|that|dikhao|banao|mujhe|dikhaen|dhundo|search|ki|dikhayein|dikhain|taswer|dekhni hai|dekhni|dikhana)\b/gi, "").trim();
            
            // Backtrack query from previous messages if query is too short
            if (cleanQuery.length < 3 && database.conversations[email].length > 1) {
                const userMessagesOnly = database.conversations[email]
                    .filter(msg => msg.sender === 'user')
                    .map(msg => msg.content);
                
                if (userMessagesOnly.length >= 2) {
                    const lastTopic = userMessagesOnly[userMessagesOnly.length - 2];
                    cleanQuery = lastTopic.replace(/\b(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|dikhao|banao|mujhe|ki|dikhayein|dikhain|taswer)\b/gi, "").trim();
                }
            }

            // Cleaning extra punctuation marks safely
            cleanQuery = cleanQuery.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();

            const imageResult = await findRealWebImage(cleanQuery);
            
            if (imageResult && imageResult.found) {
                const displayName = imageResult.realTitle;
                const realImageUrl = imageResult.url;
                
                aiResponse = `Ji bilkul! Ye rahi **${displayName}** ki real photo:\n\n<img src="${realImageUrl}" alt="${displayName}" style="max-width:100%; width:280px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
            } else {
                aiResponse = `Maazrat! Mujhe **${cleanQuery}** ki koi real public profile photo nahi mil saki. Kya aap kisi aur famous celebrity ya mashhoor cheez ki pic dekhna chahte hain?`;
            }

        } else {
            // --- NORMAL CHAT PIPELINE ---
            const conversationHistory = database.conversations[email].slice(-6); // Limit history to prevent old text bugs
            
            // Strict System Instruction to prevent any hallucination or fake facts
            const systemPrompt = `You are MT AI, an advanced virtual assistant developed by MT. ALWAYS reply in natural Roman Urdu. 
You must NEVER invent fake facts or dates. Follow these rules strictly:
1. Quaid-e-Azam Muhammad Ali Jinnah is Pakistan's first Governor-General (NOT President/Rashtrapati). He was born on 25 December 1876 and passed away on 11 September 1948 (NOT August). He joined the Congress in 1906 and All India Muslim League in 1913. He presented Lahore Resolution (Qarardad-e-Pakistan) in March 1940 (NOT Cricket Club).
2. Imran Khan is ALIVE and currently in Adiala Jail. He was born on 5 October 1952. He won the 1992 Cricket World Cup (Wasim Akram was Man of the Match). His political party is PTI, founded in 1996. He became Prime Minister on 18 August 2018 until April 2022. Shaukat Khanum Lahore opened in 1994.
3. Keep the tone friendly, and refuse politely if you do not know a historical fact instead of hallucinating wrong details.`;

            try {
                if (!apiKey) {
                    throw new Error("Gemini API key is missing. Skipping directly to safe backup.");
                }

                const contents = conversationHistory.map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content || ' ' }]
                }));

                const geminiResponse = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: contents,
                    config: {
                        systemInstruction: systemPrompt,
                        temperature: 0.1 // Safest temperature to enforce factual precision
                    }
                });

                if (geminiResponse && geminiResponse.text) {
                    aiResponse = geminiResponse.text;
                } else {
                    throw new Error("Empty Gemini Response");
                }
            } catch (geminiError) {
                console.warn("⚠️ Gemini failed or inactive. Using safe fallback.", geminiError.message);
                
                try {
                    // Safe structured fallback payload that enforces the exact system instructions
                    const fallbackFetch = await fetch("https://text.pollinations.ai/", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            messages: [
                                { role: "system", content: systemPrompt },
                                ...conversationHistory.map(msg => ({
                                    role: msg.sender === 'user' ? "user" : "assistant",
                                    content: msg.content
                                }))
                            ],
                            model: "openai",
                            temperature: 0.1
                        })
                    });

                    if (fallbackFetch.ok) {
                        aiResponse = await fallbackFetch.text();
                    } else {
                        aiResponse = "Maazrat! System is waqt thoda load nahi le raha. Baraye meharbani kuch deir baad koshish karein.";
                    }
                } catch (fallbackErr) {
                    aiResponse = "System temporarily unavailable. Please try again in a few moments.";
                }
            }
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

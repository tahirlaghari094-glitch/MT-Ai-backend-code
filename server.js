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

// --- GOOGLE-LIKE WIKIPEDIA REAL SEARCH SYSTEM ---
const findRealWebImage = async (query) => {
    try {
        // Cleaning the query from common stop words
        let cleanQuery = query.trim()
            .replace(/\b(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|iski|isiki|it|this|that|dikhao|banao|mujhe|dikhaen|dhundo|search|ki|dikhayein|dikhain|taswer|dekhni hai|dekhni|dikhana)\b/gi, "")
            .trim();

        if (!cleanQuery) return { url: null, realTitle: "", found: false };

        // Mapping common Urdu/Hindi terms to main titles for accurate search
        const lowerQuery = cleanQuery.toLowerCase();
        if (lowerQuery.includes("imrn") || lowerQuery.includes("imran") || lowerQuery.includes("imr")) {
            cleanQuery = "Imran Khan";
        } else if (lowerQuery.includes("qaid") || lowerQuery.includes("quaid") || lowerQuery.includes("jinnah") || lowerQuery.includes("qaide azam") || lowerQuery.includes("quaid e azam")) {
            cleanQuery = "Muhammad Ali Jinnah";
        } else if (lowerQuery.includes("slman") || lowerQuery.includes("salman")) {
            cleanQuery = "Salman Khan";
        } else if (lowerQuery.includes("babar") || lowerQuery.includes("bbr")) {
            cleanQuery = "Babar Azam";
        } else if (lowerQuery.includes("sharukh") || lowerQuery.includes("srk") || lowerQuery.includes("shahrukh")) {
            cleanQuery = "Shah Rukh Khan";
        }

        // Wikipedia OpenSearch Api to locate the absolute best match
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&format=json&origin=*`;
        const searchResponse = await fetch(searchUrl);
        
        if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
                const matchedTitle = searchData.query.search[0].title;

                // Wikipedia PageImages prop with 800px quality fallback
                const imageQueryUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(matchedTitle)}&prop=pageimages|images&pithumbsize=800&format=json&origin=*`;
                const imageResponse = await fetch(imageQueryUrl);

                if (imageResponse.ok) {
                    const imageData = await imageResponse.json();
                    const pages = imageData.query.pages;
                    const pageId = Object.keys(pages)[0];

                    if (pageId && pages[pageId]) {
                        // Priority 1: Check thumbnail from API
                        if (pages[pageId].thumbnail && pages[pageId].thumbnail.source) {
                            return {
                                url: pages[pageId].thumbnail.source,
                                realTitle: matchedTitle,
                                found: true
                            };
                        }
                    }
                }
            }
        }
        return { url: null, realTitle: query, found: false };
    } catch (e) {
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
                response: `⚠️ Premium Daily Limit Exceeded (10/10). Please upgrade your plan.`
            });
        }
        user.usedLimit += 1;
    }

    if (!database.conversations[email]) {
        database.conversations[email] = [];
    }

    database.conversations[email].push({ sender: 'user', content: prompt });

    let aiResponse = "";
    let generatedImageLink = null;
    const promptLower = prompt.toLowerCase();

    // --- STRICT CLASSIFICATION ENGINE ---
    // User wants AI to CREATE/GENERATE an image:
    const generationKeywords = ["banao", "generate", "bana kar do", "bana do", "create", "draw", "sketch", "paint"];
    
    // User wants to SEE/SEARCH/FIND a real photo:
    const searchKeywords = ["show", "dikhao", "dikhayein", "dikhain", "search", "dhundo", "real photo", "real picture", "asli photo"];

    let isGeneration = false;
    let isSearch = false;

    // Strict priority: if generation word is present anywhere, handle as generation
    if (generationKeywords.some(kw => promptLower.includes(kw))) {
        isGeneration = true;
    } else if (searchKeywords.some(kw => promptLower.includes(kw))) {
        isSearch = true;
    }

    try {
        if (pinnedFile) {
            aiResponse = `📎 Asset analyzed: ${pinnedFile.originalName || "Captured Image"}. File URL: ${pinnedFile.url}`;
        } 
        else if (isGeneration) {
            // --- PROFESSIONAL AI IMAGE GENERATION PIPELINE ---
            // Step 1: Use Gemini to extract and upscale the user's Roman Urdu/Messy request into high quality professional English prompt.
            let cleanQuery = "A beautiful artwork";
            try {
                const extractionPrompt = `Extract ONLY the visual subject description from this messy user query for an AI image generator. Keep details but translate Roman Urdu/Hindi into high quality descriptive English prompt. For example, 'A cute cartoon potato' or 'A hyperrealistic photo of a sleek supercar on a mountain pass'. Output ONLY the final visual prompt in English without quotes or explanation.
                User Message: "${prompt}"`;

                const geminiExtraction = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: [{ role: 'user', parts: [{ text: extractionPrompt }] }],
                    config: { temperature: 0.1 }
                });

                if (geminiExtraction.text && geminiExtraction.text.trim()) {
                    cleanQuery = geminiExtraction.text.trim().replace(/^["']|["']$/g, "");
                }
            } catch (err) {
                // Safe fallback for stop-word cleaning if Gemini fails
                cleanQuery = prompt.replace(/\b(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|iski|isiki|it|this|that|dikhao|banao|mujhe|dikhaen|dhundo|search|ki|dikhayein|dikhain|taswer|dekhni hai|dekhni|dikhana|bana kar do|bana do)\b/gi, "").trim();
            }

            // Step 2: Use Pollinations with high-quality settings and enhanced upscaling parameters
            const seed = Math.floor(Math.random() * 1000000);
            
            // PROFESSIONAL QUALITY URL TEMPLATE (Upscaled, private, no logo)
            generatedImageLink = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanQuery)}?width=1024&height=1024&nologo=true&private=true&enhance=true&seed=${seed}`;

            // Clean, scannable, and styled image output container directly rendered on your frontend UI
            aiResponse = `Ji bilkul! Maine aapke professional request ke mutabiq **"${cleanQuery}"** ki tasveer generate kar di hai:

<div style="margin-top: 15px; display: block; max-width: 100%;">
  <img src="${generatedImageLink}" alt="${cleanQuery}" style="width: 100%; max-width: 450px; height: auto; border-radius: 12px; border: 2px solid #3b82f6; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.25); display: block;" />
</div>`;
        } 
        else if (isSearch) {
            // --- REAL SEARCH PIPELINE (WIKIPEDIA) ---
            let cleanQuery = prompt.replace(/\b(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|iski|isiki|it|this|that|dikhao|banao|mujhe|dikhaen|dhundo|search|ki|dikhayein|dikhain|taswer|dekhni hai|dekhni|dikhana)\b/gi, "").trim();

            const imageResult = await findRealWebImage(cleanQuery);
            
            if (imageResult && imageResult.found) {
                generatedImageLink = imageResult.url;
                aiResponse = `Ji bilkul! Ye rahi **${imageResult.realTitle}** ki real photo:

<div style="margin-top: 15px; display: block; max-width: 100%;">
  <img src="${imageResult.url}" alt="${imageResult.realTitle}" style="width: 100%; max-width: 450px; height: auto; border-radius: 12px; border: 2px solid #10b981; box-shadow: 0 4px 20px rgba(16, 185, 129, 0.25); display: block;" />
</div>`;
            } else {
                aiResponse = `Maazrat! Mujhe **${cleanQuery}** ki koi real public photo nahi mil saki. Agar aap chahte hain ke main iski image AI se khud **generate** karun, toh mujhe boleain "iski photo bana kar do"!`;
            }
        } 
        else {
            // --- NORMAL CHAT PIPELINE ---
            const conversationHistory = database.conversations[email].slice(-6);
            
            const systemPrompt = `You are MT AI, an advanced virtual assistant developed by MT. ALWAYS reply in natural Roman Urdu.

CRITICAL RULES FOR ABSOLUTE TRUTH:
1. You have a vast and verified knowledge base. You must answer questions about any international or national celebrity, historical figure, politician, place, science, or general knowledge topic with 100% accurate facts.
2. If the user presents a biographical text or details about a person/topic, analyze it with extreme care:
   - If there are factual mistakes (such as wrong spouses, fake marriages, incorrect parents, wrong siblings, or wrong achievements), you must gently and directly correct those errors. Do NOT agree with incorrect texts.
   - Example 1: Asif Ali Zardari's wife is Mohtarma Benazir Bhutto. His children are Bilawal, Bakhtawar, and Aseefa. He is currently (in 2026) the 14th President of Pakistan (second term).
   - Example 2: Nawaz Sharif's wife is Begum Kulsoom Nawaz. His children are Maryam Nawaz, Hassan, Hussain, and Asma.
   - Example 3: Imran Khan's wives are Jemima Goldsmith, Reham Khan, and Bushra Bibi. He studied at Oxford.
3. NEVER repeat yourself or loop sentences. Keep the tone natural, highly intelligent, and helpful.`;

            try {
                const contents = conversationHistory.map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content || ' ' }]
                }));

                const geminiResponse = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: contents,
                    config: {
                        systemInstruction: systemPrompt,
                        temperature: 0.1 
                    }
                });

                aiResponse = geminiResponse.text ? geminiResponse.text : "Empty Gemini Response";
            } catch (geminiError) {
                console.warn("⚠️ Gemini failed or inactive. Using safe fallback.", geminiError.message);
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

                aiResponse = fallbackFetch.ok ? await fallbackFetch.text() : "Maazrat! System is waqt thoda busy hai. Baraye meharbani kuch deir baad koshish karein.";
            }
        }

    } catch (error) {
        console.error("AI Generation Error details:", error);
        aiResponse = "Server connection lost. Please check your internet or retry.";
    }

    database.conversations[email].push({ sender: 'ai', content: aiResponse });
    
    // Explicit API response customized so the frontend can receive structured 'imageUrl' easily!
    res.json({ 
        success: true, 
        response: aiResponse, 
        imageUrl: generatedImageLink 
    });
});

// START EXPRESS SERVER
app.listen(PORT, () => {
    console.log(`⚡ MT AI Engine Active on Port: ${PORT}`);
});

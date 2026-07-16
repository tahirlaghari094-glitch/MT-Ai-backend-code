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

// MULTER STORAGE SYSTEM WITH AUTO-EXTENSIONS FOR STABILITY
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        let ext = path.extname(file.originalname);
        if(!ext) ext = '.png'; // Fallback extension
        cb(null, uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

// IN-MEMORY DATABASE
const database = {
    users: [], 
    conversations: {} 
};

// HELPER: CONVERT LOCAL PINNED FILE TO BASE64 FOR GEMINI VISION SENSING
const getImageDataForGemini = (pinnedFile) => {
    try {
        let filePath = '';
        if (pinnedFile.url.includes('/uploads/')) {
            const filename = pinnedFile.url.split('/uploads/')[1];
            filePath = path.join(__dirname, 'uploads', filename);
        }
        
        if (filePath && fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            if (ext === '.webp') mimeType = 'image/webp';
            
            return {
                inlineData: {
                    data: data.toString('base64'),
                    mimeType: mimeType
                }
            };
        }
    } catch (e) {
        console.error("⚠️ Local file read failed for Gemini Vision:", e);
    }
    return null;
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
            return res.status(500).json({ success: false, message: "Camera image processing error." });
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
        let cleanQuery = query.trim()
            .replace(/\b(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|iski|isiki|it|this|that|dikhao|banao|mujhe|dikhaen|dhundo|search|ki|dikhayein|dikhain|taswer|dekhni hai|dekhni|dikhana)\b/gi, "")
            .trim();

        if (!cleanQuery) return { url: null, realTitle: "", found: false };

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

        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&format=json&origin=*`;
        const searchResponse = await fetch(searchUrl);
        
        if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
                const matchedTitle = searchData.query.search[0].title;

                const imageQueryUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(matchedTitle)}&prop=pageimages|images&pithumbsize=800&format=json&origin=*`;
                const imageResponse = await fetch(imageQueryUrl);

                if (imageResponse.ok) {
                    const imageData = await imageResponse.json();
                    const pages = imageData.query.pages;
                    const pageId = Object.keys(pages)[0];

                    if (pageId && pages[pageId]) {
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

    // --- SMART CLASSIFICATION & INTENT DETECTION ENGINE ---
    const editKeywords = ["edit", "editing", "change", "tabdeel", "badlo", "modify", "correction", "crop", "color", "background", "sko", "isko", "usko", "add", "remove", "wear", "pehnao", "lagao", "glasses", "hair", "shirt", "kapde", "suit", "face", "shakal", "chehra"];
    const generationKeywords = ["banao", "generate", "bana kar do", "bana do", "create", "draw", "sketch", "paint"];
    const searchKeywords = ["show", "dikhao", "dikhayein", "dikhain", "search", "dhundo", "real photo", "real picture", "asli photo", "photo", "pic", "tasveer", "image"];

    const isEditRequested = editKeywords.some(kw => promptLower.includes(kw)) && pinnedFile;
    const isGeneration = generationKeywords.some(kw => promptLower.includes(kw)) && !isEditRequested;
    const isSearch = searchKeywords.some(kw => promptLower.includes(kw)) && !isEditRequested && !isGeneration;

    try {
        if (isEditRequested) {
            // --- NEW: MICRO-DETAIL FACE PRESERVATION & OPEN EDITING PIPELINE ---
            let combinedVisualPrompt = "A beautiful photo edited professionally";
            const imagePart = getImageDataForGemini(pinnedFile);

            if (imagePart) {
                try {
                    // Gemini maps the face with micro details to ensure absolute identity locking
                    const blendResponse = await ai.models.generateContent({
                        model: 'gemini-2.0-flash',
                        contents: [
                            imagePart,
                            {
                                role: 'user',
                                parts: [{
                                    text: `You are an expert prompt engineer for AI image generators.
                                    
                                    TASK:
                                    Analyze the person's face in the provided image with extreme care.
                                    Identify their key facial features (such as hair, eyes, beard/mustache status, nose, and jawline).
                                    
                                    The user wants this edit instruction: "${prompt}".
                                    
                                    Create a single, highly detailed image generation prompt in English that:
                                    1. Strictly locks and describes the exact facial features, likeness, physical structure, and facial identity of the original person so they look exactly like themselves.
                                    2. Incorporates the user's edits precisely (e.g., if they asked to change clothes, add sunglasses, change the background, or add items/animals nearby, describe those edits clearly).
                                    3. Ensure the original subject's realistic scale, proportions, and likeness are maintained perfectly, and the lighting is blended naturally with the final scene.
                                    
                                    Your response must contain ONLY the final English generation prompt. Do not add introductions or explanations.`
                                }]
                            }
                        ]
                    });

                    if (blendResponse.text && blendResponse.text.trim()) {
                        combinedVisualPrompt = blendResponse.text.trim().replace(/^["']|["']$/g, "");
                    }
                } catch (geminiVisionErr) {
                    console.error("⚠️ Gemini Vision failed to map face:", geminiVisionErr);
                    combinedVisualPrompt = `The exact same person from this source image, preserving their exact face identity, modified according to: ${prompt}`;
                }
            } else {
                combinedVisualPrompt = `The exact same person from this source image ${pinnedFile.url}, preserving their exact face identity and proportions, modified according to: ${prompt}`;
            }

            const seed = Math.floor(Math.random() * 1000000);
            const sourceImageUrl = pinnedFile.url;

            // Image-to-Image configuration with flux-realism and controlled strength to preserve the original face
            generatedImageLink = `https://image.pollinations.ai/prompt/${encodeURIComponent(combinedVisualPrompt)}?width=1024&height=1024&model=flux-realism&nologo=true&private=true&enhance=true&seed=${seed}&image=${encodeURIComponent(sourceImageUrl)}&strength=0.55`;

            aiResponse = `Ji bilkul! Maine aapki original photo ko process kiya hai aur original bande ki shakal (face identity) aur real pose ko bilkul same aur unchanged rakhte hue, aapke prompt ke mutabiq photo ko edit kar diya hai:

<div style="margin-top: 15px; display: block; max-width: 100%;">
  <p style="margin-bottom: 5px; color: #6b7280; font-size: 0.9rem;"><strong>Original Photo:</strong></p>
  <img src="${sourceImageUrl}" style="width: 100%; max-width: 150px; height: auto; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 15px; display: block;" />

  <p style="margin-bottom: 5px; color: #8b5cf6; font-size: 0.95rem;"><strong>Edited Version (Identical Face & Proportions):</strong></p>
  <img src="${generatedImageLink}" alt="Edited Version" style="width: 100%; max-width: 450px; height: auto; border-radius: 12px; border: 2px solid #8b5cf6; box-shadow: 0 4px 20px rgba(139, 92, 246, 0.25); display: block;" />
</div>`;
        } 
        else if (isGeneration) {
            // --- AI IMAGE GENERATION PIPELINE ---
            let cleanQuery = "A beautiful artwork";
            try {
                const extractionPrompt = `Extract ONLY the visual subject description from this user query for an AI image generator. Translate Roman Urdu/Hindi into high quality descriptive English prompt. Output ONLY the final visual prompt in English without quotes or explanation.
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
                cleanQuery = prompt.replace(/\b(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|iski|isiki|it|this|that|dikhao|banao|mujhe|dikhaen|dhundo|search|ki|dikhayein|dikhain|taswer|dekhni hai|dekhni|dikhana|bana kar do|bana do)\b/gi, "").trim();
            }

            const seed = Math.floor(Math.random() * 1000000);
            generatedImageLink = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanQuery)}?width=1024&height=1024&nologo=true&private=true&enhance=true&seed=${seed}`;

            aiResponse = `Ji bilkul! Maine aapke request ke mutabiq **"${cleanQuery}"** ki tasveer generate kar di hai:

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
            
            const systemPrompt = `You are MT AI, an advanced, highly accurate virtual assistant developed by MT.
            
CRITICAL LANGUAGE RULE:
1. ALWAYS respond in clear, professional English by default. 
2. ONLY switch to Roman Urdu, Urdu script, or another language if the user explicitly asks you to reply in that language (e.g., "Urdu me baat karo", "Roman Urdu me jawab do", etc.) or if they explicitly ask a question in a non-English language. If there is no explicit instruction, default strictly to professional English.

CRITICAL RULES FOR ABSOLUTE TRUTH:
1. You have a vast and verified knowledge base. You must answer questions about any international or national celebrity, historical figure, politician, place, science, or general knowledge topic with 100% accurate facts.
2. If the user presents a biographical text or details about a person/topic, analyze it with extreme care:
   - If there are factual mistakes (such as wrong spouses, fake marriages, incorrect parents, wrong siblings, or wrong achievements), you must gently and directly correct those errors. Do NOT agree with incorrect texts.
   - Example 1: Fahad Mustafa studied Doctor of Pharmacy (Pharm.D) at Baqai Medical University (left incomplete). He debuted in "Sheeshay Ka Mahal" (2002). His breakthrough was "Main Abdul Qadir Hoon" (2010). He hosts "Jeeto Pakistan" on ARY Digital. He is married to Sana Fahad since 2005, and they have two children: Fatima and Moosa.
   - Example 2: Asif Ali Zardari's wife is Mohtarma Benazir Bhutto. His children are Bilawal, Bakhtawar, and Aseefa. He is the 14th President of Pakistan (second term).
3. NEVER repeat yourself or loop sentences. Keep the tone natural, highly intelligent, professional, and helpful.`;

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

                aiResponse = fallbackFetch.ok ? await fallbackFetch.text() : "Sorry, the system is currently busy. Please try again in a moment.";
            }
        }

    } catch (error) {
        console.error("AI Generation Error details:", error);
        aiResponse = "Server connection lost. Please check your internet or retry.";
    }

    database.conversations[email].push({ sender: 'ai', content: aiResponse });
    
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

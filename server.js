const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Render ya kisi bhi live server ke liye Dynamic Port zaroori hai
// Payload size limit ko barha diya gaya hai taake base64 camera images asani se upload ho sakein
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;

// MIDDLEWARES
app.use(cors());

// HTML/CSS files host karne ke liye (agar frontend isi server se chalana ho tab ke liye)
app.use(express.static(path.join(__dirname, 'public')));

// Ensure Uploads Directory Exists (Local testing ke liye)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static(uploadDir));

// MULTER STORAGE SYSTEM FOR UPLOADS (My Files aur Gallery ke liye)
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
// Yeh endpoint standard file upload (Gallery/Documents) aur direct Base64 stream (Camera capture) dono ko handle karta hai
app.post('/api/upload', upload.single('file'), (req, res) => {
    const host = req.get('host');
    const protocol = host.includes('localhost') ? req.protocol : 'https';

    // A: Agar camera se direct image (Base64 data) aayi ho
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
                    originalName: "Camera_Capture.png",
                    url: `${protocol}://${host}/uploads/${filename}`
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Camera image process karne me masla hua." });
        }
    }

    // B: Agar normal file select (Gallery ya My Files) ki ho
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

// **--- IMAGE GENERATION HELPER FUNCTION ---**
const generateHumanPortraitImage = async (query, mode) => {
    const enhancedPrompt = `highly detailed portrait, realistic face of ${query}, cinematic lighting, 8k, detailed skin texture, photorealistic, professional photograph, high definition`;
    const searchKeyword = query ? encodeURIComponent(enhancedPrompt) : "amazing-portrait";
    
    // 512x512 compact square image
    const generatedImageUrl = `https://image.pollinations.ai/prompt/${searchKeyword}?width=512&height=512&nologo=true&private=true`;

    return generatedImageUrl;
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

    try {
        if (pinnedFile) {
            aiResponse = `📎 <strong>Asset analyzed:</strong> ${pinnedFile.originalName || "Captured Image"}.<br>The file has been parsed in <strong>${mode}</strong> environment. File URL: <a href="${pinnedFile.url}" target="_blank">View File</a>`;
        } else {
            const conversationHistory = database.conversations[email].slice(-10);

            const chatScript = conversationHistory.map(msg => {
                const senderName = msg.sender === 'user' ? 'User' : 'Assistant';
                return `${senderName}: ${msg.content}`;
            }).join('\n');

            const systemInstructions = "System: You are MT AI, a friendly and extremely smart bilingual (Urdu/English) virtual assistant. Remember and use the chat history below to understand pronouns and maintain context. Reply naturally in Urdu (Roman or Nastaliq) or English depending on how user talks.";
            const fullPayload = `${systemInstructions}\n\n${chatScript}\nAssistant:`;

            const aiFetch = await fetch(`https://text.pollinations.ai/${encodeURIComponent(fullPayload)}`);
            if (aiFetch.ok) {
                aiResponse = await aiFetch.text();
            } else {
                aiResponse = "System temporarily busy. Please try again.";
            }
        }

        // --- IMAGE DETECTION ENGINE ---
        const promptLower = prompt.toLowerCase();
        const imageKeywords = ["image", "photo", "picture", "draw", "tasveer", "show", "create", "generate", "look like", "pic"];
        const wantsImage = imageKeywords.some(keyword => promptLower.includes(keyword));

        if (wantsImage) {
            let cleanQuery = prompt.replace(/(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|iski|isiki|it|this|that)/gi, "").trim();
            
            if (cleanQuery.length < 3 && database.conversations[email].length > 1) {
                const userMessagesOnly = database.conversations[email]
                    .filter(msg => msg.sender === 'user')
                    .map(msg => msg.content);
                
                if (userMessagesOnly.length >= 2) {
                    const lastTopic = userMessagesOnly[userMessagesOnly.length - 2];
                    cleanQuery = lastTopic.replace(/(show me|give me|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a)/gi, "").trim();
                }
            }

            const generatedImageUrl = await generateHumanPortraitImage(cleanQuery, mode);

            aiResponse += `<br><br><div style="margin-top: 15px;">
                <strong>🎨 Generated Portrait for "${cleanQuery || "Context"}" :</strong><br>
                <img src="${generatedImageUrl}" alt="${cleanQuery}" style="max-width:350px; width:100%; height:auto; border-radius:12px; margin-top:8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
            </div>`;
        }

    } catch (error) {
        console.error("AI Generation Error:", error);
        aiResponse = "Server connection lost. Please check your internet or retry.";
    }

    database.conversations[email].push({ sender: 'ai', content: aiResponse });

    res.json({
        success: true,
        response: aiResponse
    });
});

// START EXPRESS PIPELINE INTERACTION
app.listen(PORT, () => {
    console.log(`⚡ MT AI Engine Active on Port: ${PORT}`);
});

const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Railway safe, no ESM conflicts
const { GoogleGenAI } = require('@google/genai');

const app = express();

app.use(cors());
app.use(express.json());

// Port binding for Railway
const PORT = process.env.PORT || 3000;

// Mock Databases
const database = {
    users: [],
    conversations: {}
};

// API Key configuration (Must be set in Railway variables as GEMINI_API_KEY)
const apiKey = process.env.GEMINI_API_KEY || "YOUR_FALLBACK_API_KEY"; 

// Initialize Google GenAI
const ai = new GoogleGenAI({ apiKey: apiKey });

// Real Web Image Finder (Axios Version)
async function findRealWebImage(query) {
    try {
        if (!query || query.length < 2) return { found: false };
        
        // Placeholder image layout - replace with your actual custom search if needed
        const url = `https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=600&auto=format&fit=crop`; 
        
        return {
            found: true,
            realTitle: query,
            url: url
        };
    } catch (e) {
        return { found: false };
    }
}

// ====================================================================
// 7. PIPELINE CHAT: CORE AGENT QUERY ENGINE (UNIVERSAL SEARCH & ROUTING)
// ====================================================================
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

    // Daily Limit Check
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

    // Save user's fresh prompt to memory
    database.conversations[email].push({ sender: 'user', content: prompt });

    let aiResponse = "";
    const promptLower = prompt.toLowerCase();
    
    // Keywords Analysis
    const imageKeywords = ["image", "photo", "pic", "picture", "tasveer", "taswer"];
    const wantsImage = imageKeywords.some(keyword => promptLower.includes(keyword));

    const generationKeywords = [
        "generate", "banao", "draw", "create", "make", 
        "design", "banaen", "banaon", "creative", "painting", "bana kar do", "bana kr do"
    ];
    const wantsAiGeneration = generationKeywords.some(keyword => promptLower.includes(keyword));

    try {
        if (pinnedFile) {
            // --- FILE INPUT PIPELINE ---
            aiResponse = `📎 <strong>Asset analyzed:</strong> ${pinnedFile.originalName || "Captured Image"}.<br>The file has been parsed in <strong>${mode}</strong> environment. File URL: <a href="${pinnedFile.url}" target="_blank" rel="noopener noreferrer">View File</a>`;
        
        } else if (wantsImage && wantsAiGeneration) {
            // --- PIPELINE 1: AI IMAGE GENERATION (Dono keywords sath hon to hi chalega) ---
            let cleanGenPrompt = prompt.replace(/\b(generate|banao|draw|create|make|design|banaen|banaon|bana kar do|bana kr do|show me|give me|of|a|an|please|image|photo|pic|picture|tasveer|taswer|ki|ko|mujhe)\b/gi, "").trim();
            
            if (cleanGenPrompt.length < 3 && database.conversations[email].length > 1) {
                const userMessagesOnly = database.conversations[email]
                    .filter(msg => msg.sender === 'user')
                    .map(msg => msg.content);
                if (userMessagesOnly.length >= 2) {
                    cleanGenPrompt = userMessagesOnly[userMessagesOnly.length - 2].replace(/\b(generate|banao|draw|create|make|design|banaen|banaon|image|photo|pic|picture|tasveer|taswer)\b/gi, "").trim();
                }
            }

            try {
                const encodedPrompt = encodeURIComponent(cleanGenPrompt);
                const generatedImageUrl = `https://image.pollinations.ai/p/${encodedPrompt}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

                const isRomanUrdu = promptLower.includes("banao") || promptLower.includes("mujhe") || promptLower.includes("tasveer") || promptLower.includes("kar");
                if (isRomanUrdu) {
                    aiResponse = `Maine aapke liye **"${cleanGenPrompt}"** ki AI image generate kar di hai:\n\n<img src="${generatedImageUrl}" alt="${cleanGenPrompt}" style="max-width:100%; width:320px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
                } else {
                    aiResponse = `I have generated the AI image for **"${cleanGenPrompt}"**:\n\n<img src="${generatedImageUrl}" alt="${cleanGenPrompt}" style="max-width:100%; width:320px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
                }
            } catch (genError) {
                aiResponse = `Failed to generate image. Please try again.`;
            }

        } else if (wantsImage && !wantsAiGeneration) {
            // --- PIPELINE 2: REAL IMAGE SEARCH (Sirf photo/pic likha ho, banao na ho) ---
            let cleanQuery = prompt.replace(/\b(show me|give me|give|do|tasveer|image|photo|pic|of|a|an|please|iski|isiki|it|this|that|mujhe|dikhaen|dhundo|search|ki|dikhayein|dikhain|taswer|dekhni hai|dekhni|dikhana|show|dikhao|dikhana)\b/gi, "").trim();
            
            if (cleanQuery.length < 3 && database.conversations[email].length > 1) {
                const userMessagesOnly = database.conversations[email]
                    .filter(msg => msg.sender === 'user')
                    .map(msg => msg.content);
                
                if (userMessagesOnly.length >= 2) {
                    const lastTopic = userMessagesOnly[userMessagesOnly.length - 2];
                    cleanQuery = lastTopic.replace(/\b(show me|give me|give|do|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|banao|mujhe|ki|dikhayein|dikhain|taswer|show|dikhao|dikhana)\b/gi, "").trim();
                }
            }

            cleanQuery = cleanQuery.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();

            const imageResult = await findRealWebImage(cleanQuery);
            if (imageResult && imageResult.found) {
                const displayName = imageResult.realTitle;
                const realImageUrl = imageResult.url;

                const isRomanUrdu = promptLower.includes("dikhao") || promptLower.includes("tasveer") || promptLower.includes("mujh");
                if (isRomanUrdu) {
                    aiResponse = `Ji bilkul! Ye rahi **${displayName}** ki real photo:\n\n<img src="${realImageUrl}" alt="${displayName}" style="max-width:100%; width:280px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
                } else {
                    aiResponse = `Sure! Here is the real photo of **${displayName}**:\n\n<img src="${realImageUrl}" alt="${displayName}" style="max-width:100%; width:280px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
                }
            } else {
                const isRomanUrdu = promptLower.includes("dikhao") || promptLower.includes("tasveer") || promptLower.includes("mujh");
                if (isRomanUrdu) {
                    aiResponse = `Maazrat! Mujhe **${cleanQuery}** ki koi real public photo nahi mil saki. Kya aap kisi aur famous celebrity ya mashhoor cheez ki pic dekhna chahte hain?`;
                } else {
                    aiResponse = `I'm sorry, but I couldn't find a public photo of **${cleanQuery}**. Would you like to view images of another famous person, landmark, or object?`;
                }
            }

        } else {
            // --- PIPELINE 3: GENERAL TEXT CHAT ---
            const systemPrompt = `You are MT AI, an elite AI assistant developed by MT. 
CRITICAL RULES:
1. DEFAULT LANGUAGE IS ENGLISH: Answer queries in fluent, highly professional English by default.
2. ADAPTIVE LANGUAGE SWITCHING: If the user types in Roman Urdu, Urdu, Hindi, or explicitly requests it, you MUST switch completely and reply in fluent Roman Urdu / Hindi.
3. ABSOLUTE GROUNDING & FACTUAL ACCURACY: You must evaluate user text, calculations, historical data, and biographies strictly against the live Google Search tool data. Correct any misinformation gently yet directly. Verify all fields (dates, events, achievements) with search data before validating.
4. MEMORY & CONTEXT RECALL: Analyze previous turns in the chat history to carry the context seamlessly if the user asks follow-up questions.
5. FORMATTING: Use bold text, clean lists, and markdown tables to structure responses dynamically. No dense walls of text.`;

            let modifiedPrompt = prompt;
            const contextTriggers = [
                "iske bare me", "is ke bare me", "who is he", "who is she", "who is this", 
                "kon hai ye", "tell me about him", "tell me about her", "tell me about it", 
                "explain", "batao", "koun hai", "who is", "tell me about", "kya ya sahi ha", "sahi hai", "is this correct"
            ];

            const isIndirectQuery = contextTriggers.some(trigger => promptLower.includes(trigger));

            if (isIndirectQuery && database.conversations[email].length > 1) {
                const previousUserMessages = database.conversations[email]
                    .filter(msg => msg.sender === 'user')
                    .map(msg => msg.content);
                
                if (previousUserMessages.length >= 2) {
                    const lastTopic = previousUserMessages[previousUserMessages.length - 2];
                    modifiedPrompt = `User asks: "${prompt}" based on their previous text/topic:\n"""\n${lastTopic}\n"""\nEvaluate all factual correctness carefully using live Google Search tool and point out any name, numerical, event, or historic mistakes clearly.`;
                }
            }

            // Slice last 6 turns to keep context lightweight yet effective
            const conversationHistory = database.conversations[email].slice(-6);

            // Build perfect contents history array for Gemini Node SDK
            let contents = conversationHistory.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content || ' ' }]
            }));

            // In case history has been contextually updated
            if (contents.length > 0 && isIndirectQuery) {
                contents[contents.length - 1].parts = [{ text: modifiedPrompt }];
            } else if (contents.length === 0) {
                contents.push({ role: 'user', parts: [{ text: modifiedPrompt }] });
            }

            try {
                if (!apiKey) {
                    throw new Error("Gemini API key is missing.");
                }

                const geminiResponse = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: contents,
                    config: {
                        systemInstruction: systemPrompt,
                        temperature: 0.1,
                        tools: [{ googleSearch: {} }], // Live search capability enforced
                        safetySettings: [
                            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                        ]
                    }
                });

                if (geminiResponse && geminiResponse.text) {
                    aiResponse = geminiResponse.text;
                } else {
                    throw new Error("Empty response from Google Gemini");
                }

            } catch (geminiError) {
                console.warn("⚠️ Gemini routing failed. Loading secure fallback.", geminiError.message);
                try {
                    const fallbackResponse = await axios.post("https://text.pollinations.ai/", {
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: modifiedPrompt }
                        ],
                        model: "openai",
                        temperature: 0.1
                    });

                    if (fallbackResponse.status === 200) {
                        aiResponse = fallbackResponse.data;
                    } else {
                        aiResponse = "System is currently busy. Please try again in a moment.";
                    }
                } catch (fallbackErr) {
                    aiResponse = "System temporarily offline. Please try again.";
                }
            }
        }
    } catch (error) {
        console.error("AI Generation Error:", error);
        aiResponse = "Server connection lost. Please try again.";
    }

    // Save AI response to memory
    database.conversations[email].push({ sender: 'ai', content: aiResponse });
    res.json({ success: true, response: aiResponse });
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

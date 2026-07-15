const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Ensure fetch is installed (npm i node-fetch)
const { GoogleGenAI } = require('@google/genai'); // Importing the correct Google Gen AI SDK

const app = express();

app.use(cors());
app.use(express.json());

// Mock Databases for Configuration
const database = {
    users: [],
    conversations: {}
};

// Replace with your actual Gemini API Key configuration
const apiKey = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY"; 

// Initializing the Google GenAI client correctly using your API Key
const ai = new GoogleGenAI({ apiKey: apiKey });

// Mock helper function to fetch real web images
async function findRealWebImage(query) {
    try {
        if (!query || query.length < 2) return { found: false };
        
        // Custom search layout logic: You can replace this placeholder with real Google Search custom engine if you have it
        const encodedQuery = encodeURIComponent(query);
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
// 7. PIPELINE CHAT: CORE AGENT QUERY ENGINE
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

    // Daily Limit Check for Non-Premium users
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
    
    // Core Image Keywords
    const imageKeywords = ["image", "photo", "pic", "picture", "tasveer", "taswer"];
    const wantsImage = imageKeywords.some(keyword => promptLower.includes(keyword));

    // Generation Keywords (Create / Make / Draw / Generate)
    const generationKeywords = [
        "generate", "banao", "draw", "create", "make", 
        "design", "banaen", "banaon", "creative", "painting"
    ];
    const wantsAiGeneration = generationKeywords.some(keyword => promptLower.includes(keyword)) && wantsImage;

    try {
        if (pinnedFile) {
            // --- FILE INPUT PIPELINE ---
            aiResponse = `📎 <strong>Asset analyzed:</strong> ${pinnedFile.originalName || "Captured Image"}.<br>The file has been parsed in <strong>${mode}</strong> environment. File URL: <a href="${pinnedFile.url}" target="_blank" rel="noopener noreferrer">View File</a>`;
        
        } else if (wantsAiGeneration) {
            // --- PIPELINE 1: AI IMAGE GENERATION (IMAGEN 3 / FLUX FALLBACK) ---
            let cleanGenPrompt = prompt.replace(/\b(generate|banao|draw|create|make|design|banaen|banaon|show me|give me|of|a|an|please|image|photo|pic|picture|tasveer|taswer|ki|ko|mujhe)\b/gi, "").trim();
            
            // Context Resolver: If prompt is too short, get topic from previous messages
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

                const isRomanUrdu = promptLower.includes("banao") || promptLower.includes("mujhe") || promptLower.includes("tasveer");
                if (isRomanUrdu) {
                    aiResponse = `Maine aapke liye **"${cleanGenPrompt}"** ki AI image generate kar di hai:\n\n<img src="${generatedImageUrl}" alt="${cleanGenPrompt}" style="max-width:100%; width:320px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
                } else {
                    aiResponse = `I have generated the AI image for **"${cleanGenPrompt}"**:\n\n<img src="${generatedImageUrl}" alt="${cleanGenPrompt}" style="max-width:100%; width:320px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
                }
            } catch (genError) {
                aiResponse = `Failed to generate image. Please try again.`;
            }

        } else if (wantsImage) {
            // --- PIPELINE 2: REAL IMAGE SEARCH (GOOGLE / WEB SEARCH) ---
            let cleanQuery = prompt.replace(/\b(show me|give me|give|do|tasveer|image|photo|pic|of|a|an|please|iski|isiki|it|this|that|mujhe|dikhaen|dhundo|search|ki|dikhayein|dikhain|taswer|dekhni hai|dekhni|dikhana|show|dikhao|dikhana)\b/gi, "").trim();
            
            // Context Resolver: If user says "iski pic" after a previous discussion
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
                
                const isRomanUrdu = promptLower.includes("banao") || promptLower.includes("dikhao") || promptLower.includes("tasveer") || promptLower.includes("mujh");
                if (isRomanUrdu) {
                    aiResponse = `Ji bilkul! Ye rahi **${displayName}** ki real photo:\n\n<img src="${realImageUrl}" alt="${displayName}" style="max-width:100%; width:280px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
                } else {
                    aiResponse = `Sure! Here is the real photo of **${displayName}**:\n\n<img src="${realImageUrl}" alt="${displayName}" style="max-width:100%; width:280px; height:auto; border-radius:12px; display:block; margin-top:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />`;
                }
            } else {
                const isRomanUrdu = promptLower.includes("banao") || promptLower.includes("dikhao") || promptLower.includes("tasveer") || promptLower.includes("mujh");
                if (isRomanUrdu) {
                    aiResponse = `Maazrat! Mujhe **${cleanQuery}** ki koi real public photo nahi mil saki. Kya aap kisi aur famous celebrity ya mashhoor cheez ki pic dekhna chahte hain?`;
                } else {
                    aiResponse = `I'm sorry, but I couldn't find a public photo of **${cleanQuery}**. Would you like to view images of another famous person, landmark, or object?`;
                }
            }

        } else {
            // --- PIPELINE 3: GENERAL TEXT CHAT (ENGLISH DEFAULT) ---
            const systemPrompt = `You are MT AI, an elite AI assistant developed by MT.

CRITICAL RULES:
1. DEFAULT LANGUAGE IS ENGLISH: You must answer every single query in clear, fluent, and highly professional English.
2. ADAPTIVE LANGUAGE SWITCHING: If (and only if) the user types their query in Roman Urdu, Urdu, Hindi, or explicitly asks "mujhe is zuban me batao" / "reply in Urdu", you must switch and reply in that specific language (e.g., Roman Urdu). Otherwise, default strictly to English.
3. GROUNDING: Ground every single factual statement (dates, biographies, history, real-world events) directly in Google Search results.
4. MEMORY RECALL: If the user refers to a previous context/image (e.g. "who is he?", "explain this", "iske bare me batao") without specifying the name, analyze the chat history to identify the entity they are referring to and continue the conversation seamlessly.
5. FORMATTING: Use clean, professional headings, and bullet points to structure your response perfectly. No cluttered walls of text.`;

            let modifiedPrompt = prompt;
            const contextTriggers = ["iske bare me", "is ke bare me", "who is he", "who is she", "who is this", "kon hai ye", "tell me about him", "tell me about her", "tell me about it", "explain", "batao", "koun hai", "who is", "tell me about"];
            const isIndirectQuery = contextTriggers.some(trigger => promptLower.includes(trigger)) && prompt.split(" ").length <= 4;

            if (isIndirectQuery && database.conversations[email].length > 1) {
                const previousUserMessages = database.conversations[email]
                    .filter(msg => msg.sender === 'user')
                    .map(msg => msg.content);

                if (previousUserMessages.length >= 2) {
                    const lastTopic = previousUserMessages[previousUserMessages.length - 2];
                    const cleanTopic = lastTopic.replace(/\b(show me|give me|give|do|draw|create|generate|tasveer|image|photo|pic|of|a|an|please|draw a|banao|mujhe|ki|dikhayein|dikhain|taswer|show|dikhao|dikhana)\b/gi, "").trim();
                    modifiedPrompt = `${prompt} (Context: The user is asking about the entity "${cleanTopic}")`;
                }
            }

            const promptLowerForCheck = modifiedPrompt.toLowerCase();
            const isFactualQuery = promptLowerForCheck.includes("imran") || 
                                  promptLowerForCheck.includes("khan") || 
                                  promptLowerForCheck.includes("sharif") ||
                                  promptLowerForCheck.includes("nawaz") ||
                                  promptLowerForCheck.includes("who is") || 
                                  promptLowerForCheck.includes("kon hai") || 
                                  promptLowerForCheck.includes("biography") || 
                                  promptLowerForCheck.includes("born") || 
                                  promptLowerForCheck.includes("date");

            let contents = [];

            if (isFactualQuery) {
                contents = [
                    {
                        role: 'user',
                        parts: [{ text: `Search the web and provide 100% accurate factual details. Follow language instruction: ${modifiedPrompt}` }]
                    }
                ];
            } else {
                const conversationHistory = database.conversations[email].slice(-6);
                contents = conversationHistory.map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content || ' ' }]
                }));
            }

            try {
                if (!apiKey) {
                    throw new Error("Gemini API key is missing.");
                }

                // Call the correct SDK method on 'ai.models' instance
                const geminiResponse = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: contents,
                    config: {
                        systemInstruction: systemPrompt,
                        temperature: 0.1,
                        tools: [{ googleSearch: {} }], // Real-time Search Grounding active
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
                    const fallbackFetch = await fetch("https://text.pollinations.ai/", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: modifiedPrompt }
                            ],
                            model: "openai",
                            temperature: 0.1
                        })
                    });

                    if (fallbackFetch.ok) {
                        aiResponse = await fallbackFetch.text();
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

    res.json({
        success: true,
        response: aiResponse
    });
});

app.listen(3000, () => {
    console.log("Server listening on port 3000");
});

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Main route for chat and smart capabilities
app.post('/api/chat', async (req, res) => {
    const { message, history = [], imageContext = null } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        // Construct a highly intelligent persona prompt (Gemini/ChatGPT/Claude level)
        const systemPrompt = {
            role: "system",
            content: "You are an advanced, super-intelligent AI Assistant, possessing the capabilities of GPT-4o, Gemini Pro, and Claude 3.5 Sonnet combined. You are extremely logical, creative, helpful, and expert in coding, general knowledge, math, translation, and analytical thinking. Always respond accurately, professionally, and comprehensively in the language chosen by the user (Urdu/Hindi/English)."
        };

        // Prepare messages array for Pollinations Text API
        const messages = [systemPrompt, ...history];

        // If user provided an image for analysis
        if (imageContext) {
            messages.push({
                role: "user",
                content: [
                    { type: "text", text: message },
                    { type: "image_url", image_url: { url: imageContext } }
                ]
            });
        } else {
            messages.push({ role: "user", content: message });
        }

        // Calling Pollinations AI (OpenAI Compatible Endpoint)
        const response = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai", // Highly intelligent flagship model
                messages: messages,
                temperature: 0.7
            })
        });

        const data = await response.json();
        const reply = data.choices[0].message.content;

        res.json({ reply });
    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: "Failed to generate smart response." });
    }
});

// Route 1: Image Generation from Prompt (High Quality)
app.post('/api/generate-image', async (req, res) => {
    const { prompt, width = 1024, height = 1024 } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    try {
        // Using Flux (Pollinations) for ultra-realistic and exact prompt matching
        const encodedPrompt = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&nologo=true`;

        res.json({ imageUrl });
    } catch (error) {
        console.error("Generation Error:", error);
        res.status(500).json({ error: "Failed to generate image." });
    }
});

// Route 2: Image-to-Image / Editing (BINA FACE CHANGE KIYE)
app.post('/api/edit-image', async (req, res) => {
    const { imageUrl, prompt, strength = 0.3 } = req.body; // lower strength = preserves face/original structure

    if (!imageUrl || !prompt) {
        return res.status(400).json({ error: "Both imageUrl and prompt are required" });
    }

    try {
        // Call Pollinations Image-to-Image with a lower strength to keep the face intact
        // Lowering strength to 0.25-0.3 ensures the face and key structures do not change, only the requested edits (like clothes, background) are applied
        const response = await fetch("https://gen.pollinations.ai/v1/images/generations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: prompt,
                model: "p-image-edit", // Specific model optimized for editing
                image: imageUrl,       // Original image URL
                strength: parseFloat(strength) // Preserves original face details
            })
        });

        const data = await response.json();
        
        // Extracting edited image URL from response
        const editedImageUrl = data.data && data.data[0] ? data.data[0].url : null;

        if (!editedImageUrl) {
            throw new Error("No image returned from editing API");
        }

        res.json({ editedImageUrl });
    } catch (error) {
        console.error("Editing Error:", error);
        res.status(500).json({ error: "Failed to edit image while preserving face." });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running beautifully on port ${PORT}`);
});

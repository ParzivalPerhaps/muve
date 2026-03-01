import "dotenv/config";

import { GoogleGenerativeAI } from "@google/generative-ai";

const AI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = AI.getGenerativeModel({ model: "gemini-2.5-flash" });


export async function generalImageCall(req, prompt: string) {


    const images = req.body.images;


    const parts: any[] = [
        {
            text: prompt
        }
    ];


    try {


        // Switch images to imageCap if we want a limiter

        const imageCap = images.slice(0, 30);

        for (let i = 0; i < imageCap.length; i++) {
            const imageRes = await fetch(images[i]);
            if (!imageRes.ok) continue;


            const arrayBuffer = await imageRes.arrayBuffer();
            const base64Data = Buffer.from(arrayBuffer).toString("base64");
            const mimeType = imageRes.headers.get("content-type") || "image/jpeg";

            parts.push({
                inlineData: { data: base64Data, mimeType }
            });

        }

        const result = await model.generateContent({
            contents: [{ role: "user", parts }]
        })

        const response = result.response.text();

        return JSON.stringify({ analysis: response })
    }
    catch {
        console.log("error with general image searching api call")
    }






}

export async function imageinGroups(images, prompt: string) {
    const parts: any[] = [
        {
            text: prompt
        }
    ];

    try {
        // Fetch all images in parallel for speed
        const fetchResults = await Promise.allSettled(
            images.map(async (url: string) => {
                const imageRes = await fetch(url);
                if (!imageRes.ok) return null;
                const arrayBuffer = await imageRes.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString("base64");
                const mimeType = imageRes.headers.get("content-type") || "image/jpeg";
                return { inlineData: { data: base64Data, mimeType } };
            })
        );

        for (const result of fetchResults) {
            if (result.status === 'fulfilled' && result.value !== null) {
                parts.push(result.value);
            }
        }

        const result = await model.generateContent({
            contents: [{ role: "user", parts }]
        })

        const response = result.response.text();

        return JSON.stringify({ analysis: response })
    }
    catch (err) {
        console.error("error with general image searching api call:", err);

        return JSON.stringify({ analysis: "[]" });
    }
}


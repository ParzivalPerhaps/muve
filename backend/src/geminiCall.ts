import "dotenv/config";

import { GoogleGenerativeAI } from "@google/generative-ai";

const AI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = AI.getGenerativeModel({ model: "gemini-2.5-flash" });


export default async function generalImageCall (req, prompt: string) {


    const images = req.body.images;
    

   
    const parts: any[] = [
        {
            text: prompt
        }
    ];


    try{
        for (let i = 0; i < images.length; i++) {
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

        return JSON.stringify({analysis:response})
    }
    catch {
        console.log("error with general image searching api call")
    }



    

}
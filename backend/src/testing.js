async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWorkflow() {
    const address = "1400 Heritage Lndg Unit 203, St Charles, MO";
    const userNeeds = "I am a disabled war veteran with ptsd, cataracts, and have trouble walking.";

    console.log("Step 1: Fetching images from /api/images...");

    // Simulate the frontend: first get images from the images endpoint
    const imagesResponse = await fetch("http://127.0.0.1:3001/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address })
    });

    const imagesData = await imagesResponse.json();

    if (!imagesData.imagesArray || imagesData.imagesArray.length === 0) {
        return console.log("Failed to get images. Response:", imagesData);
    }

    console.log(`Got ${imagesData.imagesArray.length} images. Starting analysis...\n`);

    // Now call analyzeProperty with the images array, like the frontend would
    const startResponse = await fetch("http://127.0.0.1:3001/api/analyzeProperty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            address,
            userNeeds,
            images: imagesData.imagesArray
        })
    });

    const startData = await startResponse.json();
    if (!startData.sessionId) return console.log("Failed to get sessionId.");

    const sessionId = startData.sessionId;
    let isProcessing = true;
    let lastImageCount = 0;

    console.log(`Polling for updates on Session ID: ${sessionId}...\n`);

    while (isProcessing) {
        await delay(5000);

        try {
            const checkResponse = await fetch(`http://127.0.0.1:3001/api/evaluationUpdate/${sessionId}`);
            const sessionData = await checkResponse.json();

            // Only print if the number of images processed has gone up
            if (sessionData.image_results && sessionData.image_results.length > lastImageCount) {
                lastImageCount = sessionData.image_results.length;
                console.log(`[Status: ${sessionData.status.toUpperCase()}] Images Processed: ${lastImageCount}`);

                const foundTriggers = sessionData.image_results.filter(img => img.trigger_found !== null);
                if (foundTriggers.length > 0) {
                    console.log(`   -> Found ${foundTriggers.length} potential issues so far.`);
                }
            }

            if (sessionData.status === 'completed' || sessionData.status === 'error') {
                isProcessing = false;
                console.log("\n--- FINAL RESULTS ---");
                console.log(`Score: ${sessionData.final_score}`);
                console.log(`Summary: ${sessionData.final_summary}`);
                console.log("---------------------");
            }
        } catch (err) {
            console.error("Error polling session:", err.message);
        }
    }
}

testWorkflow();
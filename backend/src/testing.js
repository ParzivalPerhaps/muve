async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWorkflow() {
    console.log("Starting full background analysis test...");

    const startResponse = await fetch("http://127.0.0.1:3001/api/analyzeProperty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            address: "3126 S Rita Way, Santa Ana, CA 92704",
            userNeeds: "Uses a wheelchair, needs zero-step entry, wide doorways, and roll-in shower."
        })
    });

    const startData = await startResponse.json();
    if (!startData.sessionId) return console.log("Failed to get sessionId.");

    const sessionId = startData.sessionId;
    let isProcessing = true;
    let lastImageCount = 0;

    console.log(`\nPolling for updates on Session ID: ${sessionId}...\n`);

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
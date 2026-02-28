async function testWorkflow() {
  console.log("Testing /api/images...");
  const imagesResponse = await fetch("http://127.0.0.1:3001/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: "3126 S Rita Way, Santa Ana, CA 92704" })
  });

  const imagesData = await imagesResponse.json();
  console.log("Images Status:", imagesResponse.status);
  console.log("Images found:", imagesData.imagesArray ? imagesData.imagesArray.length : 0);

  if (!imagesData.imagesArray || imagesData.imagesArray.length === 0) {
    console.log("No images found, skipping triggers test.");
    return;
  }

  const testImages = imagesData.imagesArray.slice(0,5);
  console.log(`\nTesting /api/triggersFromImmage/ with ${testImages.length} images...`);

  const triggersResponse = await fetch("http://127.0.0.1:3001/api/triggersFromImmage/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images: testImages })
  });

  const triggersData = await triggersResponse.json();
  console.log("Triggers Status:", triggersResponse.status);
  console.log("Triggers Response:", JSON.stringify(triggersData, null, 2));
}

testWorkflow();
// tsts
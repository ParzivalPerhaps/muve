

async function testAddressImages() {
  
  const response = await fetch("http://127.0.0.1:3001/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: "3126 S Rita Way, Santa Ana, CA 92704" })
  });
  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));
}

testAddressImages();

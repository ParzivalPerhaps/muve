async function testTriggers() {
  const list = [
    "cataracts",
    "paraplegic"
  ];
  const response = await fetch("http://localhost:3001/api/listfromlist/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ list })
  });
  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));
}
testTriggers();

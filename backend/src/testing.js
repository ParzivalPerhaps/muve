async function testTriggers() {
  const images = [
    "https://ssl.cdn-redfin.com/photo/1/bigphoto/190/1293190_8.jpg",
    "https://ssl.cdn-redfin.com/photo/45/bigphoto/445/NP26038445_27_0.jpg"
  ];
  const response = await fetch("http://localhost:3001/api/triggersFromImmage/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images })
  });
  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));
}
testTriggers();

const testUrl = "https://www.redfin.com/CA/Irvine/123-Main-St/home/123456";

fetch("http://localhost:3001/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: testUrl })
})
    .then(res => res.json())
    .then(data => {
        console.log(`Got ${data.images?.length || 0} images`);
        console.log(data.images);
    }).catch(err => console.error("Error:", err));

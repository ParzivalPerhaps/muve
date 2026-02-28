const testUrl = "1346 Montana Dr, Concord, CA 94521";

fetch("http://localhost:3001/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: testUrl })
})
    .then(res => res.json())
    .then(data => {
    console.log(`Got ${data.images?.length || 0} images`);
    console.log(data.images);
    }).catch(err => console.error("Error:", err));

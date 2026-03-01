const url = import.meta.env.VITE_API_URL;


async function doFetch(route:string, init:RequestInit) {
    const res = await fetch(url + "/" + (route.startsWith("/") ? route.substring(1) : route), init);
    return res.json()
}

export const checkAddress = async (address: string) => {
    const w = await doFetch("/api/images", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({address})
    })

    return w;
}
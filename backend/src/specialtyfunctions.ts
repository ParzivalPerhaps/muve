import { GenerativeModel } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SpecialtyFlags {
    elevation: boolean;
    proximity: boolean;
    pollution: boolean;
}

export interface SpecialtyResult {
    category: string;
    findings: string;
}

// ---------------------------------------------------------------------------
// Helper: Geocode address → { lat, lng } via Nominatim
// ---------------------------------------------------------------------------
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'MUVE-AccessibilityChecker/1.0' }
    });
    const data = await res.json() as any[];

    if (!data || data.length === 0) {
        throw new Error(`Could not geocode address: ${address}`);
    }

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ---------------------------------------------------------------------------
// 1. Elevation Challenges
// ---------------------------------------------------------------------------
async function checkElevationChallenges(
    address: string,
    model: GenerativeModel
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking elevation challenges for: ${address}`);

    const { lat, lng } = await geocodeAddress(address);

    // Sample 8 points in a ~200m radius around the property
    const offsetDeg = 0.002; // ~200m
    const samplePoints = [
        { latitude: lat, longitude: lng },                          // center
        { latitude: lat + offsetDeg, longitude: lng },              // N
        { latitude: lat - offsetDeg, longitude: lng },              // S
        { latitude: lat, longitude: lng + offsetDeg },              // E
        { latitude: lat, longitude: lng - offsetDeg },              // W
        { latitude: lat + offsetDeg, longitude: lng + offsetDeg },  // NE
        { latitude: lat - offsetDeg, longitude: lng - offsetDeg },  // SW
        { latitude: lat + offsetDeg, longitude: lng - offsetDeg },  // NW
        { latitude: lat - offsetDeg, longitude: lng + offsetDeg },  // SE
    ];

    // Call Open-Elevation API
    let elevations: number[] = [];
    try {
        const elevRes = await fetch('https://api.open-elevation.com/api/v1/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations: samplePoints })
        });
        const elevData = await elevRes.json() as any;
        elevations = elevData.results.map((r: any) => r.elevation as number);
    } catch (err) {
        console.error('[Specialty] Open-Elevation API error:', err);
        elevations = [];
    }

    const maxElev = Math.max(...elevations);
    const minElev = Math.min(...elevations);
    const elevDiff = maxElev - minElev;

    const prompt = `You are an accessibility expert. A property is located at ${address} (lat: ${lat}, lng: ${lng}).

Elevation samples in a ~200m radius around the property (in meters):
${elevations.map((e, i) => `Point ${i + 1}: ${e.toFixed(1)}m`).join('\n')}

The elevation difference across these points is ${elevDiff.toFixed(1)} meters.

Based on this data, write a concise 2-3 sentence assessment of how challenging the surrounding terrain would be for someone with mobility issues (wheelchair, walker, etc.). Focus on slope steepness, hill challenges, and walkability. Be practical and specific.`;

    const result = await model.generateContent(prompt);
    const findings = result.response.text();

    console.log(`[Specialty] Elevation findings: ${findings}`);
    return { category: 'Elevation & Terrain', findings };
}

// ---------------------------------------------------------------------------
// 2. Proximity to Services
// ---------------------------------------------------------------------------
async function checkProximityServices(
    address: string,
    model: GenerativeModel
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking proximity to services for: ${address}`);

    const { lat, lng } = await geocodeAddress(address);

    // Overpass query: find transit, hospitals, pharmacies, grocery within ~1km
    const overpassQuery = `
    [out:json][timeout:15];
    (
      node["highway"="bus_stop"](around:1000,${lat},${lng});
      node["railway"="station"](around:1000,${lat},${lng});
      node["railway"="tram_stop"](around:1000,${lat},${lng});
      node["amenity"="hospital"](around:1500,${lat},${lng});
      way["amenity"="hospital"](around:1500,${lat},${lng});
      node["amenity"="clinic"](around:1000,${lat},${lng});
      node["amenity"="pharmacy"](around:1000,${lat},${lng});
      node["shop"="supermarket"](around:1000,${lat},${lng});
      node["shop"="convenience"](around:1000,${lat},${lng});
    );
    out body;
  `;

    let poiSummary = '';
    try {
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(overpassQuery)}`
        });
        const overpassData = await overpassRes.json() as any;
        const elements = overpassData.elements || [];

        // Categorize results
        const categories: Record<string, number> = {
            'Bus stops': 0,
            'Train/tram stations': 0,
            'Hospitals': 0,
            'Clinics': 0,
            'Pharmacies': 0,
            'Supermarkets': 0,
            'Convenience stores': 0,
        };

        for (const el of elements) {
            const tags = el.tags || {};
            if (tags.highway === 'bus_stop') categories['Bus stops']++;
            else if (tags.railway === 'station' || tags.railway === 'tram_stop') categories['Train/tram stations']++;
            else if (tags.amenity === 'hospital') categories['Hospitals']++;
            else if (tags.amenity === 'clinic') categories['Clinics']++;
            else if (tags.amenity === 'pharmacy') categories['Pharmacies']++;
            else if (tags.shop === 'supermarket') categories['Supermarkets']++;
            else if (tags.shop === 'convenience') categories['Convenience stores']++;
        }

        poiSummary = Object.entries(categories)
            .map(([name, count]) => `${name}: ${count} within range`)
            .join('\n');
    } catch (err) {
        console.error('[Specialty] Overpass API error:', err);
        poiSummary = 'Unable to retrieve nearby service data.';
    }

    const prompt = `You are an accessibility expert. A property is located at ${address}.

Nearby services found (within ~1km, hospitals within ~1.5km):
${poiSummary}

Based on this data, write a concise 2-3 sentence assessment of how convenient the surrounding area is for someone with mobility challenges who depends on nearby public transit, healthcare, and essential services. Be specific about what's available and any gaps.`;

    const result = await model.generateContent(prompt);
    const findings = result.response.text();

    console.log(`[Specialty] Proximity findings: ${findings}`);
    return { category: 'Nearby Services & Transit', findings };
}

// ---------------------------------------------------------------------------
// 3. Noise & Light Pollution
// ---------------------------------------------------------------------------
async function checkPollutionLevels(
    address: string,
    model: GenerativeModel
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking noise/light pollution for: ${address}`);

    const { lat, lng } = await geocodeAddress(address);

    // Overpass query: find noise/light sources within ~1km
    const overpassQuery = `
    [out:json][timeout:15];
    (
      way["highway"="motorway"](around:1000,${lat},${lng});
      way["highway"="trunk"](around:1000,${lat},${lng});
      way["highway"="primary"](around:800,${lat},${lng});
      node["aeroway"="aerodrome"](around:3000,${lat},${lng});
      way["aeroway"="aerodrome"](around:3000,${lat},${lng});
      way["railway"="rail"](around:500,${lat},${lng});
      node["amenity"="nightclub"](around:500,${lat},${lng});
      node["amenity"="bar"](around:500,${lat},${lng});
      way["landuse"="commercial"](around:500,${lat},${lng});
      way["landuse"="industrial"](around:800,${lat},${lng});
    );
    out body;
  `;

    let pollutionSummary = '';
    try {
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(overpassQuery)}`
        });
        const overpassData = await overpassRes.json() as any;
        const elements = overpassData.elements || [];

        const sources: Record<string, number> = {
            'Major highways nearby': 0,
            'Airports nearby': 0,
            'Railway lines nearby': 0,
            'Bars/nightclubs nearby': 0,
            'Commercial zones nearby': 0,
            'Industrial zones nearby': 0,
        };

        for (const el of elements) {
            const tags = el.tags || {};
            if (tags.highway === 'motorway' || tags.highway === 'trunk' || tags.highway === 'primary') sources['Major highways nearby']++;
            else if (tags.aeroway === 'aerodrome') sources['Airports nearby']++;
            else if (tags.railway === 'rail') sources['Railway lines nearby']++;
            else if (tags.amenity === 'nightclub' || tags.amenity === 'bar') sources['Bars/nightclubs nearby']++;
            else if (tags.landuse === 'commercial') sources['Commercial zones nearby']++;
            else if (tags.landuse === 'industrial') sources['Industrial zones nearby']++;
        }

        pollutionSummary = Object.entries(sources)
            .map(([name, count]) => `${name}: ${count}`)
            .join('\n');
    } catch (err) {
        console.error('[Specialty] Overpass API error:', err);
        pollutionSummary = 'Unable to retrieve pollution source data.';
    }

    const prompt = `You are an accessibility expert. A property is located at ${address}.

Potential noise and light pollution sources found nearby:
${pollutionSummary}

Based on this data, write a concise 2-3 sentence assessment of the noise and light pollution levels in this area. Consider how it would affect someone who is sensitive to loud noises, bright lights, or busy/stimulating environments (e.g., autism spectrum, PTSD, sensory processing disorders). Be practical and specific.`;

    const result = await model.generateContent(prompt);
    const findings = result.response.text();

    console.log(`[Specialty] Pollution findings: ${findings}`);
    return { category: 'Noise & Light Pollution', findings };
}

// ---------------------------------------------------------------------------
// Dispatcher: Run only the flagged specialty checks
// ---------------------------------------------------------------------------
export async function runSpecialtyChecks(
    address: string,
    model: GenerativeModel,
    flags: SpecialtyFlags
): Promise<SpecialtyResult[]> {
    const results: SpecialtyResult[] = [];
    const tasks: Promise<SpecialtyResult>[] = [];

    if (flags.elevation) {
        tasks.push(checkElevationChallenges(address, model));
    }
    if (flags.proximity) {
        tasks.push(checkProximityServices(address, model));
    }
    if (flags.pollution) {
        tasks.push(checkPollutionLevels(address, model));
    }

    if (tasks.length === 0) {
        return results;
    }

    // Run all flagged checks in parallel
    const settled = await Promise.allSettled(tasks);
    for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
            results.push(outcome.value);
        } else {
            console.error('[Specialty] A check failed:', outcome.reason);
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// Helper: Parse SPECIALTY_CHECKS line from checklist
// ---------------------------------------------------------------------------
export function parseSpecialtyFlags(checklist: string): SpecialtyFlags {
    const flags: SpecialtyFlags = { elevation: false, proximity: false, pollution: false };

    const match = checklist.match(/SPECIALTY_CHECKS:\s*(.+)/i);
    if (!match) return flags;

    const tokens = match[1].toLowerCase();
    if (tokens.includes('elevation')) flags.elevation = true;
    if (tokens.includes('proximity')) flags.proximity = true;
    if (tokens.includes('pollution')) flags.pollution = true;

    return flags;
}

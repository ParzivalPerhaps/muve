import { GenerativeModel } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SpecialtyFlags {
    elevation: boolean;
    proximity: boolean;
    pollution: boolean;
    streetLighting: boolean;
    sidewalk: boolean;
    airQuality: boolean;
    emergencyServices: boolean;
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
    model: GenerativeModel,
    coords: { lat: number; lng: number }
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking elevation challenges for: ${address}`);

    const { lat, lng } = coords;

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

Based on this data, write a CONCISE 1-2 sentence assessment of how challenging the surrounding terrain would be for someone with mobility issues (wheelchair, walker, etc.). Focus on slope steepness, hill challenges, and walkability. Be practical and specific.`;

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
    model: GenerativeModel,
    coords: { lat: number; lng: number }
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking proximity to services for: ${address}`);

    const { lat, lng } = coords;

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

Based on this data, write a CONCISE 1-2 sentence assessment of how convenient the surrounding area is for someone with mobility challenges who depends on nearby public transit, healthcare, and essential services. Be specific about what's available and any gaps.`;

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
    model: GenerativeModel,
    coords: { lat: number; lng: number }
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking noise/light pollution for: ${address}`);

    const { lat, lng } = coords;

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

Based on this data, write a CONCISE 1-2 sentence assessment of the noise and light pollution levels in this area. Consider how it would affect someone who is sensitive to loud noises, bright lights, or busy/stimulating environments (e.g., autism spectrum, PTSD, sensory processing disorders). Be practical and specific.`;

    const result = await model.generateContent(prompt);
    const findings = result.response.text();

    console.log(`[Specialty] Pollution findings: ${findings}`);
    return { category: 'Noise & Light Pollution', findings };
}

// ---------------------------------------------------------------------------
// 4. Street Lighting
// ---------------------------------------------------------------------------
async function checkStreetLighting(
    address: string,
    model: GenerativeModel,
    coords: { lat: number; lng: number }
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking street lighting for: ${address}`);

    const { lat, lng } = coords;

    // Overpass query: find street lamps within ~500m
    const overpassQuery = `
    [out:json][timeout:15];
    (
      node["highway"="street_lamp"](around:500,${lat},${lng});
    );
    out body;
  `;

    let lightingSummary = '';
    try {
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(overpassQuery)}`
        });
        const overpassData = await overpassRes.json() as any;
        const elements = overpassData.elements || [];

        const streetLamps = elements.filter((el: any) => el.tags && el.tags.highway === 'street_lamp').length;

        lightingSummary = `Number of street lamps within ~500m: ${streetLamps}`;
    } catch (err) {
        console.error('[Specialty] Overpass API error for street lighting:', err);
        lightingSummary = 'Unable to retrieve street lighting data.';
    }

    const prompt = `You are an accessibility expert. A property is located at ${address}.

Street lighting information found nearby:
${lightingSummary}

Based on this data, write a CONCISE 1-2 sentence assessment of the street lighting in the immediate vicinity. Consider how adequate lighting might impact safety, navigation, and comfort for individuals with visual impairments or those who rely on clear visibility, especially during nighttime. Be practical and specific.`;

    const result = await model.generateContent(prompt);
    const findings = result.response.text();

    console.log(`[Specialty] Street Lighting findings: ${findings}`);
    return { category: 'Street Lighting', findings };
}

// ---------------------------------------------------------------------------
// 5. Sidewalk & Pedestrian Infrastructure
// ---------------------------------------------------------------------------
async function checkSidewalkInfrastructure(
    address: string,
    model: GenerativeModel,
    coords: { lat: number; lng: number }
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking sidewalk infrastructure for: ${address}`);

    const { lat, lng } = coords;

    const overpassQuery = `
    [out:json][timeout:15];
    (
      way["highway"="footway"](around:500,${lat},${lng});
      way["highway"="path"]["foot"="yes"](around:500,${lat},${lng});
      node["footway"="crossing"](around:500,${lat},${lng});
      node["kerb"="lowered"](around:500,${lat},${lng});
      node["kerb"="flush"](around:500,${lat},${lng});
      node["tactile_paving"="yes"](around:500,${lat},${lng});
      node["highway"="crossing"](around:500,${lat},${lng});
    );
    out body;
  `;

    let sidewalkSummary = '';
    try {
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(overpassQuery)}`
        });
        const overpassData = await overpassRes.json() as any;
        const elements = overpassData.elements || [];

        const counts: Record<string, number> = {
            'Footway/path segments': 0,
            'Pedestrian crossings': 0,
            'Lowered/flush kerbs (curb cuts)': 0,
            'Tactile paving strips': 0,
        };

        for (const el of elements) {
            const tags = el.tags || {};
            if (el.type === 'way' && (tags.highway === 'footway' || tags.highway === 'path')) counts['Footway/path segments']++;
            else if (tags.footway === 'crossing' || tags.highway === 'crossing') counts['Pedestrian crossings']++;
            else if (tags.kerb === 'lowered' || tags.kerb === 'flush') counts['Lowered/flush kerbs (curb cuts)']++;
            else if (tags.tactile_paving === 'yes') counts['Tactile paving strips']++;
        }

        sidewalkSummary = Object.entries(counts)
            .map(([name, count]) => `${name}: ${count} within ~500m`)
            .join('\n');
    } catch (err) {
        console.error('[Specialty] Overpass API error for sidewalk check:', err);
        sidewalkSummary = 'Unable to retrieve sidewalk infrastructure data.';
    }

    const prompt = `You are an accessibility expert. A property is located at ${address}.

Pedestrian infrastructure found within ~500m of the property:
${sidewalkSummary}

Based on this data, write a CONCISE 1-2 sentence assessment of how wheelchair- and mobility-device-friendly the immediate pedestrian environment is. Focus on the presence or absence of curb cuts, accessible crossings, and continuous footway coverage. Be practical and specific.`;

    const result = await model.generateContent(prompt);
    const findings = result.response.text();

    console.log(`[Specialty] Sidewalk findings: ${findings}`);
    return { category: 'Sidewalk & Pedestrian Infrastructure', findings };
}

// ---------------------------------------------------------------------------
// 6. Air Quality
// ---------------------------------------------------------------------------
async function checkAirQuality(
    address: string,
    model: GenerativeModel,
    coords: { lat: number; lng: number }
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking air quality for: ${address}`);

    const { lat, lng } = coords;

    let airQualitySummary = '';
    try {
        const aqRes = await fetch(
            `https://api.openaq.org/v2/latest?coordinates=${lat},${lng}&radius=25000&limit=5&order_by=distance`,
            { headers: { 'Accept': 'application/json' } }
        );
        const aqData = await aqRes.json() as any;
        const results = aqData.results || [];

        if (results.length === 0) {
            airQualitySummary = 'No nearby air quality monitoring stations found within 25km.';
        } else {
            const lines: string[] = [];
            for (const station of results) {
                const name = station.name || 'Unknown station';
                const distance = station.distance ? `${(station.distance / 1000).toFixed(1)}km away` : 'distance unknown';
                for (const measurement of (station.measurements || [])) {
                    lines.push(`${name} (${distance}) — ${measurement.parameter.toUpperCase()}: ${measurement.value} ${measurement.unit} (last updated: ${measurement.lastUpdated})`);
                }
            }
            airQualitySummary = lines.length > 0 ? lines.join('\n') : 'Stations found but no measurements available.';
        }
    } catch (err) {
        console.error('[Specialty] OpenAQ API error:', err);
        airQualitySummary = 'Unable to retrieve air quality data.';
    }

    const prompt = `You are an accessibility expert. A property is located at ${address}.

Air quality readings from the nearest monitoring stations:
${airQualitySummary}

Based on this data, write a CONCISE 1-2 sentence assessment of the local air quality and its potential impact on residents with respiratory conditions (asthma, COPD, allergies) or cardiovascular sensitivities. Reference specific pollutant levels where available, and note if data coverage is limited. Be practical and specific.`;

    const result = await model.generateContent(prompt);
    const findings = result.response.text();

    console.log(`[Specialty] Air quality findings: ${findings}`);
    return { category: 'Air Quality', findings };
}

// ---------------------------------------------------------------------------
// 7. Emergency Services Proximity
// ---------------------------------------------------------------------------
async function checkEmergencyServices(
    address: string,
    model: GenerativeModel,
    coords: { lat: number; lng: number }
): Promise<SpecialtyResult> {
    console.log(`[Specialty] Checking emergency services proximity for: ${address}`);

    const { lat, lng } = coords;

    const overpassQuery = `
    [out:json][timeout:15];
    (
      node["amenity"="fire_station"](around:3000,${lat},${lng});
      way["amenity"="fire_station"](around:3000,${lat},${lng});
      node["amenity"="hospital"](around:5000,${lat},${lng});
      way["amenity"="hospital"](around:5000,${lat},${lng});
      node["amenity"="ambulance_station"](around:3000,${lat},${lng});
      node["emergency"="ambulance_station"](around:3000,${lat},${lng});
      node["emergency"="defibrillator"](around:500,${lat},${lng});
    );
    out body;
  `;

    let emergencySummary = '';
    try {
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(overpassQuery)}`
        });
        const overpassData = await overpassRes.json() as any;
        const elements = overpassData.elements || [];

        const counts: Record<string, number> = {
            'Fire stations (within 3km)': 0,
            'Hospitals (within 5km)': 0,
            'Ambulance stations (within 3km)': 0,
            'Defibrillators (within 500m)': 0,
        };

        for (const el of elements) {
            const tags = el.tags || {};
            if (tags.amenity === 'fire_station') counts['Fire stations (within 3km)']++;
            else if (tags.amenity === 'hospital') counts['Hospitals (within 5km)']++;
            else if (tags.amenity === 'ambulance_station' || tags.emergency === 'ambulance_station') counts['Ambulance stations (within 3km)']++;
            else if (tags.emergency === 'defibrillator') counts['Defibrillators (within 500m)']++;
        }

        emergencySummary = Object.entries(counts)
            .map(([name, count]) => `${name}: ${count}`)
            .join('\n');
    } catch (err) {
        console.error('[Specialty] Overpass API error for emergency services:', err);
        emergencySummary = 'Unable to retrieve emergency services data.';
    }

    const prompt = `You are an accessibility expert. A property is located at ${address}.

Emergency services found near the property:
${emergencySummary}

Based on this data, write a CONCISE 1-2 sentence assessment of how well-served the area is by emergency services. Consider the implications for residents who live alone with disabilities, have chronic medical conditions, or require rapid emergency response. Be practical and specific.`;

    const result = await model.generateContent(prompt);
    const findings = result.response.text();

    console.log(`[Specialty] Emergency services findings: ${findings}`);
    return { category: 'Emergency Services Proximity', findings };
}

export async function runSpecialtyChecks(
    address: string,
    model: GenerativeModel,
    flags: SpecialtyFlags
): Promise<SpecialtyResult[]> {
    const results: SpecialtyResult[] = [];

    // Geocode once — shared by all specialty checks
    let coords: { lat: number; lng: number };
    try {
        coords = await geocodeAddress(address);
        console.log(`[Specialty] Geocoded "${address}" → (${coords.lat}, ${coords.lng})`);
    } catch (err) {
        console.warn(`[Specialty] Could not geocode "${address}", skipping specialty checks:`, err);
        return results;
    }

    const tasks: Promise<SpecialtyResult>[] = [];

    if (flags.elevation) {
        tasks.push(checkElevationChallenges(address, model, coords));
    }
    if (flags.proximity) {
        tasks.push(checkProximityServices(address, model, coords));
    }
    if (flags.pollution) {
        tasks.push(checkPollutionLevels(address, model, coords));
    }
    if (flags.streetLighting) {
        tasks.push(checkStreetLighting(address, model, coords));
    }
    if (flags.sidewalk) {
        tasks.push(checkSidewalkInfrastructure(address, model, coords));
    }
    if (flags.airQuality) {
        tasks.push(checkAirQuality(address, model, coords));
    }
    if (flags.emergencyServices) {
        tasks.push(checkEmergencyServices(address, model, coords));
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
    const flags: SpecialtyFlags = { elevation: false, proximity: false, pollution: false, streetLighting: false, sidewalk: false, airQuality: false, emergencyServices: false };

    const match = checklist.match(/SPECIALTY_CHECKS:\s*(.+)/i);
    if (!match) return flags;

    const tokens = match[1].toLowerCase();
    if (tokens.includes('elevation')) flags.elevation = true;
    if (tokens.includes('proximity')) flags.proximity = true;
    if (tokens.includes('pollution')) flags.pollution = true;
    if (tokens.includes('lighting') || tokens.includes('streetlight') || tokens.includes('vision')) flags.streetLighting = true;
    if (tokens.includes('sidewalk')) flags.sidewalk = true;
    if (tokens.includes('air') || tokens.includes('airquality')) flags.airQuality = true;
    if (tokens.includes('emergency')) flags.emergencyServices = true;

    return flags;
}

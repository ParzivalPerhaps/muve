import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasTexture,
  Group,
  MathUtils,
  Quaternion,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import LocationIcon from "../icons/LocationIcon";

type Coordinates = {
  lat: number;
  lon: number;
};

type GeocodeResult = {
  coordinates: Coordinates;
  label: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

const DEFAULT_COORDINATES: Coordinates = {
  lat: 33.611359,
  lon: -117.879669,
};

const GLOBE_TEXTURE_URL = "/globe_texture.jpg";
const FRONT_BIAS_VECTOR = new Vector3(0, 0.18, 1).normalize();
const NORTH_POLE_VECTOR = new Vector3(0, 1, 0);
const WORLD_UP_VECTOR = new Vector3(0, 1, 0);

function createFallbackGlobeTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext("2d");

  if (context) {
    const fillGradient = context.createLinearGradient(0, 0, 0, canvas.height);
    fillGradient.addColorStop(0, "#243d96");
    fillGradient.addColorStop(0.58, "#233d96");
    fillGradient.addColorStop(1, "#223a8f");
    context.fillStyle = fillGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(25, 130, 128, 0.24)";
    context.lineWidth = 2;

    for (let latitude = -75; latitude <= 75; latitude += 15) {
      const y = ((90 - latitude) / 180) * canvas.height;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }

    context.strokeStyle = "rgba(25, 130, 128, 0.18)";
    context.lineWidth = 1.5;

    for (let longitude = -180; longitude <= 180; longitude += 15) {
      const x = ((longitude + 180) / 360) * canvas.width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
    }

    const vignette = context.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.height * 0.15,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.height * 0.75,
    );
    vignette.addColorStop(0, "rgba(255, 255, 255, 0)");
    vignette.addColorStop(1, "rgba(0, 52, 108, 0.22)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function parseCoordinates(value: string): Coordinates | null {
  const coordinateMatch = value.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  );

  if (!coordinateMatch) {
    return null;
  }

  const lat = Number.parseFloat(coordinateMatch[1]);
  const lon = Number.parseFloat(coordinateMatch[2]);

  if (
    Number.isNaN(lat) ||
    Number.isNaN(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  return { lat, lon };
}

async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const manualCoordinates = parseCoordinates(address);
  if (manualCoordinates) {
    return {
      coordinates: manualCoordinates,
      label: `${manualCoordinates.lat.toFixed(
        4,
      )}, ${manualCoordinates.lon.toFixed(4)}`,
    };
  }

  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return null;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
      trimmedAddress,
    )}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Lookup failed: ${response.status}`);
  }

  const results = (await response.json()) as NominatimResult[];
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const [firstResult] = results;
  const lat = Number.parseFloat(firstResult.lat);
  const lon = Number.parseFloat(firstResult.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  return {
    coordinates: { lat, lon },
    label: firstResult.display_name,
  };
}

function latLonToVector3(lat: number, lon: number, radius = 1): Vector3 {
  const latitudeRadians = MathUtils.degToRad(lat);
  const longitudeRadians = MathUtils.degToRad(lon);

  return new Vector3(
    radius * Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
    radius * Math.sin(latitudeRadians),
    -radius * Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
  );
}

function toNorthUpTargetQuaternion({ lat, lon }: Coordinates): Quaternion {
  const targetVector = latLonToVector3(lat, lon).normalize();
  const baseQuaternion = new Quaternion().setFromUnitVectors(
    targetVector,
    FRONT_BIAS_VECTOR,
  );

  const northTangent = NORTH_POLE_VECTOR.clone().sub(
    targetVector.clone().multiplyScalar(NORTH_POLE_VECTOR.dot(targetVector)),
  );

  if (northTangent.lengthSq() < 1e-6) {
    return baseQuaternion;
  }

  northTangent.normalize();
  const rotatedNorth = northTangent.applyQuaternion(baseQuaternion);

  const projectedNorth = rotatedNorth.sub(
    FRONT_BIAS_VECTOR.clone().multiplyScalar(
      rotatedNorth.dot(FRONT_BIAS_VECTOR),
    ),
  );
  const projectedUp = WORLD_UP_VECTOR.clone().sub(
    FRONT_BIAS_VECTOR.clone().multiplyScalar(
      WORLD_UP_VECTOR.dot(FRONT_BIAS_VECTOR),
    ),
  );

  if (projectedNorth.lengthSq() < 1e-6 || projectedUp.lengthSq() < 1e-6) {
    return baseQuaternion;
  }

  projectedNorth.normalize();
  projectedUp.normalize();

  const cross = projectedNorth.clone().cross(projectedUp);
  const dot = MathUtils.clamp(projectedNorth.dot(projectedUp), -1, 1);
  const rollAngle = Math.atan2(cross.dot(FRONT_BIAS_VECTOR), dot);
  const rollQuaternion = new Quaternion().setFromAxisAngle(
    FRONT_BIAS_VECTOR,
    rollAngle,
  );

  return new Quaternion().multiplyQuaternions(rollQuaternion, baseQuaternion);
}

function GlobeScene({ target }: { target: Coordinates }) {
  const globeGroupRef = useRef<Group>(null);
  const { size } = useThree();
  const textureRef = useRef<Texture | null>(null);
  const [globeTexture, setGlobeTexture] = useState<Texture>(() => {
    const fallbackTexture = createFallbackGlobeTexture();
    textureRef.current = fallbackTexture;
    return fallbackTexture;
  });

  const markerPosition = useMemo(
    () => latLonToVector3(target.lat, target.lon, 1.02),
    [target.lat, target.lon],
  );

  const isSmallViewport = size.width < 768;
  const globePosition: [number, number, number] = isSmallViewport
    ? [0, -1.72, 0]
    : [0, -1.4, 0];
  const globeScale: [number, number, number] = isSmallViewport
    ? [3.72, 3.72, 3.72]
    : [4.05, 3.08, 4.05];

  const targetQuaternion = useMemo(
    () => toNorthUpTargetQuaternion({ lat: target.lat, lon: target.lon }),
    [target.lat, target.lon],
  );

  useEffect(() => {
    let cancelled = false;
    const loader = new TextureLoader();

    loader.load(
      GLOBE_TEXTURE_URL,
      (loadedTexture) => {
        if (cancelled) {
          loadedTexture.dispose();
          return;
        }

        loadedTexture.colorSpace = SRGBColorSpace;
        loadedTexture.anisotropy = 8;
        loadedTexture.needsUpdate = true;

        const previousTexture = textureRef.current;
        textureRef.current = loadedTexture;
        setGlobeTexture(loadedTexture);

        if (previousTexture && previousTexture !== loadedTexture) {
          previousTexture.dispose();
        }
      },
      undefined,
      () => {
        // Keep fallback texture if local texture loading fails.
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      textureRef.current?.dispose();
    };
  }, []);

  useFrame((_state, delta) => {
    const globeGroup = globeGroupRef.current;
    if (!globeGroup) {
      return;
    }

    const smoothing = 1 - Math.exp(-delta * 3.2);
    globeGroup.quaternion.slerp(targetQuaternion, smoothing);
  });

  return (
    <>
      <ambientLight intensity={1.08} />
      <directionalLight intensity={0.72} position={[2.8, 3.2, 4]} />
      <directionalLight intensity={0.3} position={[-2.4, -1.6, -3]} />

      <group ref={globeGroupRef} position={globePosition} scale={globeScale}>
        <mesh>
          <sphereGeometry args={[1, 96, 96]} />
          <meshStandardMaterial
            map={globeTexture}
            color="#d8f7ef"
            metalness={0}
            roughness={0.88}
          />
        </mesh>

        <mesh>
          <sphereGeometry args={[1.03, 96, 96]} />
          <meshStandardMaterial
            color="#9fded9"
            emissive="#9fded9"
            emissiveIntensity={0.1}
            transparent
            opacity={0.12}
            metalness={0}
            roughness={1}
          />
        </mesh>

        <mesh position={markerPosition}>
          <sphereGeometry args={[0.03, 24, 24]} />
          <meshStandardMaterial
            color="#78dda2"
            emissive="#78dda2"
            emissiveIntensity={0.9}
            metalness={0}
            roughness={0.35}
          />
        </mesh>
      </group>
    </>
  );
}

function BottomGlobe({ target }: { target: Coordinates }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 bottom-0 h-[38vh] w-[226vw] -translate-x-1/2 md:-bottom-[84vh] md:h-[118vh] md:w-[192vw]"
    >
      <Canvas camera={{ position: [0, 0, 5.4], fov: 40 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#ffffff"]} />
        <GlobeScene target={target} />
      </Canvas>
    </div>
  );
}

export default function AddressLookupPage() {
  const [address, setAddress] = useState("");
  const [resolvedCoordinates, setResolvedCoordinates] =
    useState<Coordinates>(DEFAULT_COORDINATES);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  async function handleConfirmAddress() {
    if (isResolving || address.trim().length === 0) {
      return;
    }

    setLookupError(null);
    setIsResolving(true);

    try {
      const geocodeResult = await geocodeAddress(address);

      if (!geocodeResult) {
        setLookupError(
          "No match found. Try a fuller address or direct coordinates like 37.7749, -122.4194.",
        );
        return;
      }

      setResolvedCoordinates(geocodeResult.coordinates);
    } catch {
      setLookupError(
        "Address lookup is temporarily unavailable. Please try again.",
      );
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <main className="min-h-screen bg-white p-0 font-varela relative flex flex-col overflow-hidden">
      <section className="relative z-10 flex-1 pb-[40vh] md:pb-[46vh]">
        <div
          className="pl-6 pr-6 pt-8 text-[36px] leading-none tracking-[-0.02em] flex text-primary-dark md:pl-[126px] md:pr-[126px] md:pt-[60px]"
          aria-label="muve brand"
        >
          <span className="selection:bg-accent">muve</span>
          <div className="w-[6px] h-[6px] rounded-full ml-1 mt-auto mb-[4px] bg-accent" />
          <span className="ml-auto text-[18px] group cursor-default">
            <span className="inline-block transition-transform duration-300 group-hover:-translate-y-0.5">
              accessibility,{" "}
            </span>
            <span className="text-accent ml-2 inline-block transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:delay-75">
              {" "}
              simplified.
            </span>
          </span>
        </div>

        <div className="mt-12 max-w-[1092px] px-6 md:mt-[106px] md:pl-[126px] md:pr-0">
          <h1 className="m-0 flex items-center gap-4 text-[48px] font-normal selection:bg-accent leading-[1.04] tracking-[-0.01em] text-primary-dark">
            <LocationIcon
              className="h-[24px] w-[24px] shrink-0 text-primary-dark mt-auto mb-1"
              aria-hidden="true"
            />
            <span>where do you want us to look?</span>
          </h1>

          <label className="sr-only" htmlFor="address-input">
            Address
          </label>
          <input
            id="address-input"
            className="mt-5 block w-full rounded-[10px] border border-[#8c908f] px-3 py-[14px] text-[18px] leading-[1.2] text-primary-dark placeholder:text-[#8e9291] focus:border-[#737675] selection:bg-accent focus:outline-none md:rounded-[14px] md:px-5 md:py-4"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="308 Negra Arroyo Lane"
          />
          <p
            onClick={() => {
              setResolvedCoordinates({ lat: 33.43, lon: -101.053 });
            }}
            className="text-primary-dark/60 mt-2 selection:bg-accent"
          >
            This should be the address of an existing home you'd like to
            research
          </p>

          <button
            disabled={address.trim().length === 0 || isResolving}
            className="mt-12 rounded-[10px] cursor-pointer disabled:cursor-not-allowed not-disabled:hover:bg-accent/5 transition-all duration-75 border bg-transparent px-[30px] py-[8px] text-[18px] leading-none text-accent-button transition-all duration-75 disabled:opacity-50"
            type="button"
            onClick={handleConfirmAddress}
          >
            {isResolving ? "resolving..." : "confirm address"}
          </button>

          {lookupError ? (
            <p className="mt-2 text-[14px] text-[#9f4a4a] selection:bg-accent">
              {lookupError}
            </p>
          ) : null}
        </div>
      </section>

      <BottomGlobe target={resolvedCoordinates} />
    </main>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  Group,
  LinearFilter,
  MathUtils,
  Quaternion,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from "three";

export type Coordinates = {
  lat: number;
  lon: number;
};

export type GeocodeResult = {
  coordinates: Coordinates;
  label: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

export const DEFAULT_COORDINATES: Coordinates = {
  lat: 33.611359,
  lon: -117.879669,
};

const GLOBE_TEXTURE_URL = "/globe_texture_upscale.jpg";
const DISPLACEMENT_MAP_URL = "/GDEM-10km-BW.png";
const FRONT_BIAS_VECTOR = new Vector3(0, 0.93, 1).normalize();
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

export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  const manualCoordinates = parseCoordinates(address);
  if (manualCoordinates) {
    return {
      coordinates: manualCoordinates,
      label: `${manualCoordinates.lat.toFixed(4)}, ${manualCoordinates.lon.toFixed(4)}`,
    };
  }

  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return null;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(trimmedAddress)}`,
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
  const displacementRef = useRef<Texture | null>(null);
  const [globeTexture, setGlobeTexture] = useState<Texture>(() => {
    const fallbackTexture = createFallbackGlobeTexture();
    textureRef.current = fallbackTexture;
    return fallbackTexture;
  });
  const [displacementMap, setDisplacementMap] = useState<Texture | null>(null);

  const markerPosition = useMemo(
    () => latLonToVector3(target.lat, target.lon, 1.02),
    [target.lat, target.lon],
  );

  const isSmallViewport = size.width < 768;
  const globePosition: [number, number, number] = isSmallViewport
    ? [0, -1.72, 0]
    : [0, -1.65, 0];
  const globeScale: [number, number, number] = isSmallViewport
    ? [3.72, 3, 3.72]
    : [4.05, 3, 4.05];

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
    let cancelled = false;
    const loader = new TextureLoader();

    loader.load(
      DISPLACEMENT_MAP_URL,
      (loadedTexture) => {
        if (cancelled) {
          loadedTexture.dispose();
          return;
        }

        // Downsample to a small canvas to naturally blur/round the heightmap
        const blurCanvas = document.createElement("canvas");
        const blurSize = 256;
        blurCanvas.width = blurSize * 2;
        blurCanvas.height = blurSize;
        const ctx = blurCanvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(loadedTexture.image, 0, 0, blurSize * 2, blurSize);
        }

        const blurredTexture = new CanvasTexture(blurCanvas);
        blurredTexture.minFilter = LinearFilter;
        blurredTexture.magFilter = LinearFilter;
        blurredTexture.needsUpdate = true;

        loadedTexture.dispose();
        displacementRef.current = blurredTexture;
        setDisplacementMap(blurredTexture);
      },
      undefined,
      () => {
        // Displacement map optional — globe still works without it.
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      textureRef.current?.dispose();
      displacementRef.current?.dispose();
    };
  }, []);

  useFrame((_state, delta) => {
    const globeGroup = globeGroupRef.current;
    if (!globeGroup) {
      return;
    }

    const smoothing = 1 - Math.exp(-delta * 1.2);
    globeGroup.quaternion.slerp(targetQuaternion, smoothing);
  });

  return (
    <>
      <ambientLight intensity={1.08} />
      <directionalLight intensity={0.72} position={[2.8, 3.2, 4]} />
      <directionalLight intensity={0.3} position={[-2.4, -1.6, -3]} />

      <group ref={globeGroupRef} position={globePosition} scale={globeScale}>
        <mesh>
          <sphereGeometry args={[1, 200, 200]} />
          <meshStandardMaterial
            map={globeTexture}
            color="#ffffff"
            metalness={0}
            roughness={0.88}
            {...(displacementMap
              ? {
                  displacementMap,
                  displacementScale: 0.015,
                }
              : {})}
          />
        </mesh>

        {/* Remove for aura light thingy */}
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
          <sphereGeometry args={[0.0015, 32, 32]} />
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

export default function BottomGlobe({
  target,
  className = "",
}: {
  target: Coordinates;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 bottom-0 h-[38vh] w-[226vw] -translate-x-1/2 md:-bottom-[84vh] md:h-[118vh] md:w-[192vw] ${className}`}
    >
      <Canvas camera={{ position: [0, 0, 5.4], fov: 40 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#ffffff"]} />
        <GlobeScene target={target} />
      </Canvas>
    </div>
  );
}

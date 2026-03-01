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

const GLOBE_TEXTURE_URL = "/eeee.jpg";
const DISPLACEMENT_MAP_URL = "/GDEM-10km-BW.png";
const FRONT_BIAS_VECTOR = new Vector3(0, 1.15, 1).normalize();
const NORTH_POLE_VECTOR = new Vector3(0, 1, 0);
const WORLD_UP_VECTOR = new Vector3(0, 1, 0);

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

  // Start as null — globe mesh won't render until the real texture is ready,
  // preventing the blue fallback flash on load.
  const [globeTexture, setGlobeTexture] = useState<Texture | null>(null);
  const [displacementMap, setDisplacementMap] = useState<Texture | null>(null);

  const markerPosition = useMemo(
    () => latLonToVector3(target.lat, target.lon, 1.02),
    [target.lat, target.lon],
  );

  const isSmallViewport = size.width < 768;
  const globePosition: [number, number, number] = isSmallViewport
    ? [0, -1.72, 0]
    : [0, -1.8, 0];
  const globeScale: [number, number, number] = isSmallViewport
    ? [3.2, 3.2, 3.2]
    : [3.5, 3.5, 3.5];

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

        // Bake the aura/vignette overlay directly onto the texture
        const img = loadedTexture.image as HTMLImageElement;
        const bakeCanvas = document.createElement("canvas");
        bakeCanvas.width = img.naturalWidth || img.width || 2048;
        bakeCanvas.height = img.naturalHeight || img.height || 1024;
        const ctx = bakeCanvas.getContext("2d");

        if (ctx) {
          ctx.drawImage(img, 0, 0, bakeCanvas.width, bakeCanvas.height);

          // Replicate the removed overlay mesh: white, emissiveIntensity 0.1, opacity 0.12
          const vignette = ctx.createRadialGradient(
            bakeCanvas.width * 0.5,
            bakeCanvas.height * 0.5,
            0,
            bakeCanvas.width * 0.5,
            bakeCanvas.height * 0.5,
            bakeCanvas.width * 0.5,
          );
          vignette.addColorStop(0, "rgba(255,255,255,0.10)");
          vignette.addColorStop(0.5, "rgba(255,255,255,0.06)");
          vignette.addColorStop(1, "rgba(220,220,255,0.14)");
          ctx.fillStyle = vignette;
          ctx.fillRect(0, 0, bakeCanvas.width, bakeCanvas.height);
        }

        const bakedTexture = new CanvasTexture(bakeCanvas);
        bakedTexture.colorSpace = SRGBColorSpace;
        bakedTexture.anisotropy = 8;
        bakedTexture.needsUpdate = true;

        loadedTexture.dispose();

        const previousTexture = textureRef.current;
        textureRef.current = bakedTexture;
        setGlobeTexture(bakedTexture);

        if (previousTexture && previousTexture !== bakedTexture) {
          previousTexture.dispose();
        }
      },
      undefined,
      () => {
        // Keep globe hidden if texture fails to load — no fallback flash.
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

      {/* Only render once the real texture is ready — no blue flash */}
      {globeTexture && (
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

          <mesh position={markerPosition}>
            <sphereGeometry args={[0.005, 24, 24]} />
            <meshStandardMaterial
              color="#78dda2"
              emissive="#78dda2"
              emissiveIntensity={0.9}
              metalness={0}
              roughness={0.35}
            />
          </mesh>
        </group>
      )}
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
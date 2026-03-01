import { useEffect, useRef, useState } from "react";
import {
  getEvaluationUpdateById,
  type PropertySession,
  type SessionImageResult,
} from "../lib/api";

interface AnalysisPageProps {
  images: string[];
  sessionId: string;
}

/* ---------------------------------------------------------------------------
 * Data helpers
 * -------------------------------------------------------------------------*/

/** Normalize trigger_found into a flat string array. */
function parseTriggers(raw: SessionImageResult["trigger_found"]): string[] {
  if (!raw) return [];
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return raw.flatMap((t) => t.split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * Parse pixel_coordinates into a [x, y] tuple.
 * Returns raw numbers — could be pixels or percentages depending on what
 * Gemini decided to return.
 */
function parseCoords(
  raw: SessionImageResult["pixel_coordinates"],
): [number, number] | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    const nums = raw
      .replace(/[[\]()]/g, "")
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => !isNaN(n));
    if (nums.length >= 2) return [nums[0], nums[1]];
    return null;
  }

  if (Array.isArray(raw) && raw.length >= 2) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (!isNaN(x) && !isNaN(y)) return [x, y];
  }

  return null;
}

/**
 * Convert raw coordinates to percentage-based [x%, y%] (0–100).
 *
 * Heuristic: if both values are ≤ 100 treat them as percentages already.
 * Otherwise divide by the image's natural dimensions.
 */
function toPercent(
  raw: [number, number],
  naturalW: number,
  naturalH: number,
): [number, number] {
  const alreadyPercent = raw[0] <= 100 && raw[1] <= 100;
  const x = alreadyPercent ? raw[0] : (raw[0] / naturalW) * 100;
  const y = alreadyPercent ? raw[1] : (raw[1] / naturalH) * 100;
  // Clamp to image bounds
  return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
}

/* ---------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------*/

export default function AnalysisPage({ images, sessionId }: AnalysisPageProps) {
  const [sessionData, setSessionData] = useState<PropertySession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const pollingRef = useRef(true);

  /* --- Polling ---------------------------------------------------------- */
  useEffect(() => {
    pollingRef.current = true;

    async function poll() {
      if (!pollingRef.current) return;
      try {
        const data = await getEvaluationUpdateById(sessionId);
        setSessionData(data);
        if (data.status === "completed" || data.status === "error") {
          pollingRef.current = false;
          return;
        }
        setTimeout(poll, 400);
      } catch {
        setTimeout(poll, 1000);
      }
    }

    poll();
    return () => {
      pollingRef.current = false;
    };
  }, [sessionId]);

  /* --- Derive the carousel image list -----------------------------------
   * The backend re-scrapes images independently so `image_results` may use
   * different URLs than the `images` prop.  Once we have results, prefer the
   * backend URLs so that lookups always match.
   * -------------------------------------------------------------------- */
  const backendImages: string[] =
    sessionData?.image_results?.map((r) => r.image_url) ?? [];
  const carouselImages = backendImages.length > 0 ? backendImages : images;

  // Reset image dimensions whenever the carousel slot changes
  useEffect(() => {
    setNaturalSize(null);
  }, [currentIndex]);

  // Clamp index if the carousel list changes size
  useEffect(() => {
    if (currentIndex >= carouselImages.length && carouselImages.length > 0) {
      setCurrentIndex(0);
    }
  }, [carouselImages.length, currentIndex]);

  /* --- Current image data ----------------------------------------------- */
  const currentUrl = carouselImages[currentIndex] ?? "";
  const currentResult: SessionImageResult | undefined =
    sessionData?.image_results?.find((r) => r.image_url === currentUrl);
  const hasResult = !!currentResult;
  const triggers = currentResult ? parseTriggers(currentResult.trigger_found) : [];
  const rawCoords = currentResult ? parseCoords(currentResult.pixel_coordinates) : null;

  const pctCoords: [number, number] | null =
    rawCoords && naturalSize
      ? toPercent(rawCoords, naturalSize.w, naturalSize.h)
      : null;

  /* --- Render ----------------------------------------------------------- */
  return (
    <section className="relative z-10 flex-1">
      <div className="max-w-[1092px] px-6 md:pl-[126px] md:pr-0 mt-12 md:mt-[60px] min-[1440px]:mt-[106px]">
        <h1 className="m-0 text-[48px] font-normal selection:bg-accent leading-[1.04] tracking-[-0.01em] text-primary-dark">
          doing some research...
        </h1>

        <div className="mt-8 flex flex-col md:flex-row gap-8">
          {/* ---- Image carousel ----------------------------------------- */}
          <div className="relative w-full md:w-[60%] flex-shrink-0">
            <div className="relative rounded-[14px] overflow-hidden bg-[#f5f5f5]">
              {currentUrl && (
                <img
                  src={currentUrl}
                  alt={`Property photo ${currentIndex + 1}`}
                  className="w-full h-auto block"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setNaturalSize({
                      w: img.naturalWidth,
                      h: img.naturalHeight,
                    });
                  }}
                />
              )}

              {/* Scanning dots — shown while waiting for result */}
              {!hasResult && (
                <>
                  <span className="scan-dot scan-dot-1" />
                  <span className="scan-dot scan-dot-2" />
                  <span className="scan-dot scan-dot-3" />
                  <span className="scan-dot scan-dot-4" />
                  <span className="scan-dot scan-dot-5" />
                </>
              )}

              {/* Numbered pins + connector lines + edge labels */}
              {hasResult && pctCoords && triggers.length > 0 && (
                <PinOverlay
                  triggers={triggers}
                  cx={pctCoords[0]}
                  cy={pctCoords[1]}
                />
              )}
            </div>

            {/* Dot indicators */}
            {carouselImages.length > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                {carouselImages.map((url, i) => {
                  const isCurrent = i === currentIndex;
                  const isProcessed = !!sessionData?.image_results?.find(
                    (r) => r.image_url === url,
                  );
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentIndex(i)}
                      className={`w-[10px] h-[10px] rounded-full border transition-all duration-200 cursor-pointer ${
                        isCurrent
                          ? "bg-primary-dark border-primary-dark"
                          : isProcessed
                            ? "bg-primary-dark/30 border-primary-dark/30"
                            : "bg-transparent border-primary-dark/40"
                      }`}
                      aria-label={`Go to image ${i + 1}`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* ---- Legend sidebar ------------------------------------------ */}
          <div className="flex-1 min-w-0 pt-2">
            {triggers.length > 0 ? (
              <>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-dark/40 mb-4">
                  Legend
                </h3>
                <ol className="space-y-4 list-none p-0 m-0">
                  {triggers.map((trigger, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-[24px] h-[24px] rounded-full bg-accent text-primary-dark text-[12px] font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-[15px] font-medium text-primary-dark leading-snug">
                        {trigger}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : hasResult ? (
              <p className="text-[15px] text-primary-dark/50">
                No issues detected for this image.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="h-[12px] w-[50%] rounded-full bg-primary-dark/5 animate-pulse" />
                <div className="h-[10px] w-[70%] rounded-full bg-primary-dark/5 animate-pulse" />
                <div className="h-[10px] w-[40%] rounded-full bg-primary-dark/5 animate-pulse" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * PinOverlay — renders numbered pins, SVG connector lines, and edge labels
 * over the image.  All positioning is percentage-based relative to the
 * containing image wrapper.
 * -------------------------------------------------------------------------*/

function PinOverlay({
  triggers,
  cx,
  cy,
}: {
  triggers: string[];
  cx: number;
  cy: number;
}) {
  // Decide which edge to anchor labels to (right side unless pin is far right)
  const anchorRight = cx < 70;
  const labelX = anchorRight ? 95 : 5;

  // Spread labels vertically so they don't overlap.
  // Centre the group around 50% if there are many, otherwise start near the top.
  const spacing = Math.min(12, 60 / Math.max(triggers.length, 1));
  const groupHeight = (triggers.length - 1) * spacing;
  const startY = Math.max(6, Math.min(50 - groupHeight / 2, 94 - groupHeight));

  return (
    <>
      {/* SVG connector lines — use the image wrapper as coordinate space */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 5 }}
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {triggers.map((_, i) => {
          const ly = startY + i * spacing;
          // Offset each pin vertically when stacked
          const pinY = cy + (i - (triggers.length - 1) / 2) * 3;
          return (
            <line
              key={i}
              x1={cx}
              y1={pinY}
              x2={labelX}
              y2={ly}
              stroke="#78dda2"
              strokeWidth="0.2"
              strokeDasharray="0.6 0.3"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {/* Numbered pins at coordinates */}
      {triggers.map((_, i) => {
        const offsetY = (i - (triggers.length - 1) / 2) * 28;
        return (
          <div
            key={`pin-${i}`}
            className="absolute flex items-center justify-center w-[24px] h-[24px] -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{
              left: `${cx}%`,
              top: `${cy}%`,
              marginTop: triggers.length > 1 ? `${offsetY}px` : undefined,
              zIndex: 10 + i,
            }}
          >
            <span className="flex items-center justify-center w-[24px] h-[24px] rounded-full bg-accent text-primary-dark text-[12px] font-bold shadow-md border-2 border-white">
              {i + 1}
            </span>
          </div>
        );
      })}

      {/* Edge labels */}
      {triggers.map((trigger, i) => {
        const ly = startY + i * spacing;
        return (
          <div
            key={`label-${i}`}
            className="absolute transition-all duration-300"
            style={{
              ...(anchorRight ? { right: "2%" } : { left: "2%" }),
              top: `${ly}%`,
              transform: "translateY(-50%)",
              zIndex: 20,
            }}
          >
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary-dark/80 text-white text-[11px] font-medium whitespace-nowrap backdrop-blur-sm">
              <span className="flex items-center justify-center w-[16px] h-[16px] rounded-full bg-accent text-primary-dark text-[10px] font-bold leading-none shrink-0">
                {i + 1}
              </span>
              {trigger}
            </span>
          </div>
        );
      })}
    </>
  );
}

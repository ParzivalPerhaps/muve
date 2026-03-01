import { useEffect, useRef, useState } from "react";
import {
  getEvaluationUpdateById,
  type PropertySession,
  type SessionImageResult,
} from "../lib/api";
import ResearchIcon from "../icons/ResearchIcon";

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
  if (typeof raw === "string")
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return raw.flatMap((t) =>
    t
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/* Card transform presets — mirrors the AddressLookupPage fan-out style */
const CARD_TRANSFORMS = [
  { rotate: -4, x: -30, y: 14, z: 3 },
  { rotate: 2, x: 10, y: -6, z: 2 },
  { rotate: 6, x: 50, y: 18, z: 1 },
];

/* ---------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------*/

export default function AnalysisPage({ images, sessionId }: AnalysisPageProps) {
  const [sessionData, setSessionData] = useState<PropertySession | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const prevResultCount = useRef(0);
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

  /* --- Trigger reveal animation when new results arrive ----------------- */
  const results: SessionImageResult[] = sessionData?.image_results ?? [];
  const totalImages = images.length;

  useEffect(() => {
    if (results.length > prevResultCount.current) {
      // Stagger-reveal each new result
      const newCount = results.length;
      const oldCount = prevResultCount.current;
      prevResultCount.current = newCount;

      for (let i = oldCount; i < newCount; i++) {
        const delay = (i - oldCount) * 150;
        setTimeout(() => setRevealedCount((c) => Math.max(c, i + 1)), delay);
      }
    }
  }, [results.length]);

  /* --- Pick the 3 most-recently-revealed results for the card fan ------- */
  const revealedResults = results.slice(0, revealedCount);
  const visibleCards = revealedResults.slice(-3);
  // The "active" card is the most recent (top of the pile)
  const activeResult = visibleCards[visibleCards.length - 1] ?? null;
  const activeTriggers = activeResult
    ? parseTriggers(activeResult.trigger_found)
    : [];

  const isProcessing =
    sessionData?.status !== "completed" && sessionData?.status !== "error";

  /* --- Render ----------------------------------------------------------- */
  return (
    <section className="relative z-10 flex-1">
      <div className="max-w-[1280px] px-6 md:pl-[126px] md:pr-6 mt-12 md:mt-[60px] min-[1440px]:mt-[106px]">
        <h1 className="m-0 flex items-center gap-4 text-[48px] font-normal selection:bg-accent leading-[1.04] tracking-[-0.01em] text-primary-dark">
          <ResearchIcon
            className="h-[24px] w-[24px] shrink-0 text-primary-dark mt-auto mb-1"
            aria-hidden="true"
          />
          <span>doing some research...</span>
        </h1>

        <p className="mt-2 text-[15px] text-primary-dark/50">
          give us a few minutes to fully evaluate this property and the context
          surrounding it.
        </p>

        <div className="mt-8 flex flex-col md:flex-row gap-8 items-start">
          {/* ---- Card fan ------------------------------------------------- */}
          <div className="relative w-full md:w-[65%] flex-shrink-0">
            <div className="relative flex justify-center items-center h-[320px] md:h-[400px]">
              {visibleCards.map((result, i) => {
                const card = CARD_TRANSFORMS[i];
                const isTop = i === visibleCards.length - 1;
                return (
                  <div
                    key={result.image_url}
                    className="absolute w-[280px] h-[190px] md:w-[400px] md:h-[270px] rounded-[14px] overflow-hidden shadow-lg transition-all duration-700 ease-out"
                    style={{
                      zIndex: card.z,
                      transform: `rotate(${card.rotate}deg) translateX(${card.x}px) translateY(${card.y}px)`,
                      opacity: isTop ? 1 : 0.85,
                    }}
                  >
                    <img
                      src={result.image_url}
                      alt="Analyzed property photo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                );
              })}

              {/* Empty placeholder cards while nothing has arrived yet */}
              {visibleCards.length === 0 &&
                CARD_TRANSFORMS.map((card, i) => (
                  <div
                    key={`empty-${i}`}
                    className="absolute w-[280px] h-[190px] md:w-[400px] md:h-[270px] rounded-[14px] border-2 border-dashed border-primary-dark/15 transition-all duration-700 ease-out"
                    style={{
                      zIndex: card.z,
                      transform: `rotate(${card.rotate}deg) translateX(${card.x}px) translateY(${card.y}px)`,
                      opacity: 0.4,
                    }}
                  />
                ))}
            </div>

            {/* Progress counter */}
            <p className="text-center text-[13px] text-primary-dark/40 mt-2">
              {revealedCount} of {totalImages} analyzed
              {isProcessing && (
                <span className="inline-block w-[3px] h-[3px] rounded-full bg-accent ml-2 align-middle animate-pulse" />
              )}
            </p>
          </div>

          {/* ---- Findings sidebar ----------------------------------------- */}
          <div className="flex-1 min-w-0 pt-2">
            {activeTriggers.length > 0 ? (
              <ul className="space-y-3 list-none p-0 m-0">
                {activeTriggers.map((trigger, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-[6px] w-[8px] h-[8px] rounded-full bg-accent shrink-0" />
                    <span className="text-[15px] text-primary-dark leading-snug">
                      {trigger}
                    </span>
                  </li>
                ))}
              </ul>
            ) : activeResult ? (
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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getEvaluationUpdateById,
  type PropertySession,
  type SessionImageResult,
} from "../lib/api";
import ResearchIcon from "../icons/ResearchIcon";

interface AnalysisPageProps {
  images: string[];
  sessionId: string;
  onComplete?: (session: PropertySession) => void;
  hidden?: boolean;
}

/* ---------------------------------------------------------------------------
 * Generate deterministic fan transforms for each card across the full width.
 * Uses a seeded pseudo-random so the layout is stable across re-renders.
 * -------------------------------------------------------------------------*/
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateCardTransforms(count: number) {
  const rand = seededRandom(42);
  return Array.from({ length: count }, (_, i) => {
    // Spread cards across the container but keep them fully visible
    // Cards are ~260px wide on md (~22% of 1180px usable), so cap left at ~75%
    const left = 5 + rand() * 70;
    // Cards are ~175px tall on md (~36% of 480px), so cap top at ~60%
    const top = 5 + rand() * 55;
    return {
      rotate: (rand() - 0.5) * 20, // -10 to +10 deg
      left,
      top,
      zIndex: i + 1,
      delay: i * 120,
    };
  });
}

function hasFlags(result: SessionImageResult): boolean {
  if (!result.trigger_found) return false;
  return result.trigger_found.length > 0;
}

/* ---------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------*/

export default function AnalysisPage({
  images,
  sessionId,
  onComplete,
  hidden = false,
}: AnalysisPageProps) {
  const [sessionData, setSessionData] = useState<PropertySession | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const prevResultCount = useRef(0);
  const pollingRef = useRef(true);
  const completeFiredRef = useRef(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const totalImages = images.length;
  const cardTransforms = useMemo(
    () => generateCardTransforms(totalImages),
    [totalImages],
  );

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
          if (data.status === "completed" && !completeFiredRef.current) {
            completeFiredRef.current = true;
            completeTimerRef.current = setTimeout(() => {
              onCompleteRef.current?.(data);
            }, 1500);
          }
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
      clearTimeout(completeTimerRef.current);
    };
  }, [sessionId]);

  /* --- Trigger reveal animation when new results arrive ----------------- */
  const results: SessionImageResult[] = sessionData?.image_results ?? [];

  useEffect(() => {
    if (results.length > prevResultCount.current) {
      const newCount = results.length;
      const oldCount = prevResultCount.current;
      prevResultCount.current = newCount;

      for (let i = oldCount; i < newCount; i++) {
        const delay = (i - oldCount) * 150;
        setTimeout(() => setRevealedCount((c) => Math.max(c, i + 1)), delay);
      }
    }
  }, [results.length]);

  const revealedResults = results.slice(0, revealedCount);
  const flaggedCount = revealedResults.filter(hasFlags).length;

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

        {/* ---- Fanned cards scattered across the width -------------------- */}
        <div className={`relative mt-8 w-full h-[380px] md:h-[480px] ${hidden ? "hidden md:block" : ""}`}>
          {revealedResults.map((result, i) => {
            const card = cardTransforms[i];

            return (
              <div
                key={result.image_url}
                className="absolute w-[180px] h-[122px] md:w-[260px] md:h-[175px] rounded-[14px] overflow-hidden shadow-lg"
                style={{
                  left: `${card.left}%`,
                  top: `${card.top}%`,
                  zIndex: card.zIndex,
                  opacity: 0,
                  transform: `rotate(0deg) translateX(-120px) scale(0.8)`,
                  animation: `cardSlideIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${card.delay}ms forwards`,
                  // CSS custom properties for the target transform
                  ...({
                    "--card-rotate": `${card.rotate}deg`,
                  } as React.CSSProperties),
                }}
              >
                <img
                  src={result.image_url}
                  alt="Analyzed property photo"
                  className="w-full h-full object-cover"
                />
                {hasFlags(result) && (
                  <span className="absolute top-2 right-2 w-[10px] h-[10px] rounded-full bg-accent shadow-md" />
                )}
              </div>
            );
          })}
        </div>

        <style>{`
          @keyframes cardSlideIn {
            0% {
              opacity: 0;
              transform: rotate(0deg) translateX(-120px) scale(0.8);
            }
            100% {
              opacity: 1;
              transform: rotate(var(--card-rotate)) translateX(0) scale(1);
            }
          }
        `}</style>

        {/* Progress counter */}
        <div className="mt-4 flex items-center text-[13px] text-primary-dark/40">
          <span>
            {revealedCount} of {totalImages} analyzed
            {isProcessing && (
              <span className="inline-block w-[3px] h-[3px] rounded-full bg-accent ml-2 align-middle animate-pulse" />
            )}
          </span>
          {flaggedCount > 0 && (
            <span className="ml-3 text-accent/70">{flaggedCount} flagged</span>
          )}
        </div>
      </div>
    </section>
  );
}

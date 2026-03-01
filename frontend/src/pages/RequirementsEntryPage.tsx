import { useCallback, useRef, useState } from "react";
import FlagIcon from "../icons/FlagIcon";
import { analyzeProperty } from "../lib/api";

const SUGGESTED_TAGS = ["entry stairs", "tight corners", "nearby bus stops"];

interface RequirementsEntryPageProps {
  address: string;
  images: string[];
  onEvaluationStarted: (sessionId: string) => void;
}

export default function RequirementsEntryPage({
  address,
  images,
  onEvaluationStarted,
}: RequirementsEntryPageProps) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState("");
  const [flagShaking, setFlagShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasShaken = useRef(false);
  const shakeTimeout = useRef<ReturnType<typeof setTimeout>>();

  const triggerShake = useCallback(() => {
    if (hasShaken.current) return;
    hasShaken.current = true;
    setFlagShaking(true);
    shakeTimeout.current = setTimeout(() => setFlagShaking(false), 500);
  }, []);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
    triggerShake();
  }

  async function handleRunEvaluation() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const w = await analyzeProperty({
        userNeeds: freeText,
        address,
        images: images,
      });
      onEvaluationStarted(w.sessionId);
    } catch {
      setIsSubmitting(false);
    }
  }

  const hasInput = selectedTags.size > 0 || freeText.trim().length > 0;

  return (
    <section className="relative z-10 flex-1">
      <div className="max-w-[1092px] px-6 md:pl-[126px] md:pr-0 mt-12 md:mt-[60px] min-[1440px]:mt-[106px]">
        <h1 className="m-0 flex items-center gap-4 text-[48px] font-normal selection:bg-accent leading-[1.04] tracking-[-0.01em] text-primary-dark">
          <FlagIcon
            className={`h-[24px] w-[24px] shrink-0 text-primary-dark mt-auto mb-1 ${flagShaking ? "animate-flag-shake" : ""}`}
            aria-hidden="true"
          />
          <span>what do you want us to look for?</span>
        </h1>

        {/* Suggested tags */}
        <div className="mt-5 flex flex-wrap gap-2">
          {SUGGESTED_TAGS.map((tag) => {
            const isSelected = selectedTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`rounded-[10px] cursor-pointer border px-[16px] py-[6px] text-[15px] leading-none transition-all duration-75 ${
                  isSelected
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-[#8c908f] bg-transparent text-primary-dark/70 hover:bg-primary-dark/5"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Free-text input */}
        <input
          className="mt-4 block w-full border-b border-[#8c908f] bg-transparent px-0 py-[10px] text-[16px] leading-[1.4] text-primary-dark placeholder:text-[#8e9291] focus:border-[#737675] selection:bg-accent focus:outline-none"
          value={freeText}
          onChange={(e) => {
            const prev = freeText;
            setFreeText(e.target.value);
            if (prev.length === 0 && e.target.value.length > 0) {
              triggerShake();
            }
          }}
          placeholder="I have a back injury. I'd rather not inflame by using gates/fences."
        />

        {/* Spacer to push address + button toward bottom */}
        <div className="mt-auto" />

        {/* Address label and action button */}
        <div className="mt-[30px] md:mt-[60px]">
          <button
            type="button"
            disabled={!hasInput || isSubmitting}
            onClick={handleRunEvaluation}
            className="rounded-[10px] cursor-pointer disabled:cursor-not-allowed border border-accent bg-transparent px-[24px] py-[8px] text-[16px] leading-none text-accent not-disabled:hover:bg-accent/5 transition-all duration-75 disabled:opacity-50"
          >
            {isSubmitting ? "starting..." : "run evaluation"}
          </button>
        </div>
      </div>
    </section>
  );
}

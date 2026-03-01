import type { PropertySession } from "../lib/api";
import LocationIcon from "../icons/LocationIcon";

interface ReportPageProps {
  session: PropertySession | null;
  address: string;
  images: string[];
  onComplete?: () => void;
}

function StackedThumbs({ urls }: { urls: string[] }) {
  const SHOW = 2;
  const shown = urls.slice(0, SHOW);
  const extra = urls.length - SHOW;
  const rotations = [-3, 5];

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative flex-shrink-0"
        style={{ width: `${shown.length > 1 ? 76 : 52}px`, height: "40px" }}
      >
        {shown.map((url, i) => (
          <div
            key={url}
            className="absolute w-[52px] h-[38px] rounded-[5px] overflow-hidden shadow-sm border border-white/80"
            style={{
              left: `${i * 24}px`,
              zIndex: i + 1,
              transform: `rotate(${rotations[i] ?? 0}deg)`,
            }}
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
      {extra > 0 && <span className="text-[14px] text-accent">+{extra}</span>}
    </div>
  );
}

export default function ReportPage({
  session,
  address,
  onComplete,
}: ReportPageProps) {
  if (!session) return null;

  const score = session.final_score ?? 0;
  const triggeredFlags = session.triggered_flags ?? {};
  const imageResults = session.image_results ?? [];
  const specialtyResults = session.specialty_results ?? [];

  // Build map: flagKey -> array of image URLs that triggered it
  const flagImagesMap: Record<string, string[]> = {};
  for (const result of imageResults) {
    if (!result.trigger_found) continue;
    for (const trigger of result.trigger_found) {
      const key = trigger.trim();
      if (!flagImagesMap[key]) flagImagesMap[key] = [];
      flagImagesMap[key].push(result.image_url);
    }
  }

  const visualFlags = Object.entries(triggeredFlags);

  return (
    <section className="relative z-10 h-full flex flex-col">
      {/* Header + score — pinned, never scrolls */}
      <div className="flex-shrink-0 px-6 md:pl-[126px] md:pr-[126px] mt-12 md:mt-[60px] min-[1440px]:mt-[106px]">
        <h1 className="m-0 flex items-start gap-3 text-[28px] sm:text-[36px] md:text-[48px] font-normal selection:bg-accent leading-[1.04] tracking-[-0.01em] text-primary-dark">
          <LocationIcon
            className="h-[20px] w-[20px] md:h-[24px] md:w-[24px] shrink-0 mt-[10px] md:mt-[12px]"
            aria-hidden="true"
          />
          <span>
            your report for
            <br />
            <span className="text-accent">{address}</span>
          </span>
        </h1>

        <div className="mt-8">
          <p className="text-[72px] sm:text-[80px] font-normal leading-none tracking-[-0.02em] text-primary-dark">
            {score}%
          </p>
          <p className="mt-3 text-[20px] sm:text-[22px] font-normal text-primary-dark">
            concerns
          </p>
        </div>
      </div>

      {/* Divider — full width, pinned */}
      <hr className="flex-shrink-0 mt-6 w-2/3 mr-auto ml-32 border-primary-dark/15" />

      {/* Scrollable area — columns + buttons */}
      <div className="flex-1 overflow-y-auto">

      {/* Two-column findings */}
      <div className="mt-8 px-8 md:pl-[126px] md:pr-[200px] grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-24">
        {/* Left: visual inspection */}
        <div>
          <p className="text-[15px] text-accent mb-5">visual inspection</p>
          <div className="flex flex-col gap-5">
            {visualFlags.length === 0 ? (
              <p className="text-[15px] text-primary-dark/40">
                no visual concerns found
              </p>
            ) : (
              visualFlags.map(([key, displayName]) => {
                const thumbs = flagImagesMap[key] ?? [];
                return (
                  <div key={key} className="flex items-center gap-4">
                    <span className="text-[18px] sm:text-[20px] font-normal text-primary-dark">
                      {displayName}
                    </span>
                    {thumbs.length > 0 && <StackedThumbs urls={thumbs} />}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: context analysis */}
        <div>
          <p className="text-[15px] text-accent mb-5">context analysis</p>
          <div className="flex flex-col gap-5">
            {specialtyResults.length === 0 ? (
              <p className="text-[15px] text-primary-dark/40">
                no context concerns found
              </p>
            ) : (
              specialtyResults.map((sr) => (
                <div key={sr.category}>
                  <p className="text-[18px] sm:text-[20px] font-normal text-primary-dark">
                    {sr.category}
                  </p>
                  <p className="mt-0.5 text-[14px] text-primary-dark/50 leading-snug">
                    {sr.findings}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="mt-16 pb-16 px-6 md:pl-[126px] flex gap-3">
        <button
          type="button"
          className="rounded-[10px] cursor-pointer border border-accent bg-transparent px-[24px] py-[8px] text-[15px] leading-none text-accent hover:bg-accent/5 transition-all duration-75"
        >
          download as pdf
        </button>
        <button
          type="button"
          onClick={onComplete}
          className="rounded-[10px] cursor-pointer border border-primary-dark bg-transparent px-[24px] py-[8px] text-[15px] leading-none text-primary-dark hover:bg-primary-dark/5 transition-all duration-75"
        >
          complete
        </button>
      </div>

      </div>{/* end scrollable area */}
    </section>
  );
}

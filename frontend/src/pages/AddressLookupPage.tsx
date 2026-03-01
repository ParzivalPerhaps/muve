import { useState } from "react";
import LocationIcon from "../icons/LocationIcon";
import { checkAddress } from "../lib/api";
import { geocodeAddress, type Coordinates } from "../components/BottomGlobe";

interface AddressLookupPageProps {
  onAddressConfirmed: (coords: Coordinates, address: string) => void;
  onGlobeHide: () => void;
  onGlobeShow: () => void;
}

const IMAGE_CARDS = [
  { rotate: -6, translateX: -350, translateY: 20, zIndex: 1 },
  { rotate: -2, translateX: -60, translateY: -10, zIndex: 3 },
  { rotate: 5, translateX: 200, translateY: 10, zIndex: 2 },
];

export default function AddressLookupPage({
  onAddressConfirmed,
  onGlobeHide,
  onGlobeShow,
}: AddressLookupPageProps) {
  const [address, setAddress] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imagesRevealed, setImagesRevealed] = useState(false);
  const [resolvedLabel, setResolvedLabel] = useState("");

  async function handleConfirmAddress() {
    if (isResolving || address.trim().length === 0) {
      return;
    }

    setLookupError(null);
    setIsResolving(true);

    try {
      const r = await checkAddress(address);
      console.log(r);

      const imagesArray: string[] = r?.imagesArray ?? [];

      if (imagesArray.length > 0) {
        setImages(imagesArray);
        onGlobeHide();
        // Trigger the fan-out after a brief delay so the DOM has the stacked images
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setImagesRevealed(true);
          });
        });
      }

      const geocodeResult = await geocodeAddress(address);

      if (!geocodeResult) {
        setLookupError(
          "No match found. Try a fuller address or direct coordinates like 37.7749, -122.4194.",
        );
        return;
      }

      setResolvedLabel(geocodeResult.label);
    } catch {
      setLookupError(
        "Address lookup is temporarily unavailable. Please try again.",
      );
    } finally {
      setIsResolving(false);
    }
  }

  function handleConfirmLooksRight() {
    if (!resolvedLabel) return;
    geocodeAddress(address).then((result) => {
      if (result) {
        onAddressConfirmed(result.coordinates, address);
      }
    });
  }

  function handleNotQuite() {
    setImages([]);
    setImagesRevealed(false);
    setResolvedLabel("");
    onGlobeShow();
  }

  const showConfirmation = images.length > 0;
  const displayImages = images.slice(0, 3);

  return (
    <main className="min-h-screen bg-white p-0 font-varela relative flex flex-col overflow-hidden">
      <section className="relative z-10 flex-1">
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

        <div
          className="max-w-[1092px] px-6 md:pl-[126px] md:pr-0 transition-[margin] duration-500 ease-in-out mt-12 md:mt-[106px]"
          style={imagesRevealed ? { marginTop: 28 } : undefined}
        >
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
            disabled={showConfirmation}
          />

          {!showConfirmation && (
            <>
              <p className="text-primary-dark/60 mt-2 selection:bg-accent">
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
            </>
          )}

          {showConfirmation && (
            <>
              <div className="relative mt-0 flex justify-center items-center h-[340px] md:h-[400px]">
                {displayImages.map((url, i) => {
                  const card = IMAGE_CARDS[i];
                  return (
                    <div
                      key={url}
                      className="absolute w-[260px] h-[180px] md:w-[340px] md:h-[230px] rounded-[14px] overflow-hidden shadow-lg transition-all duration-700 ease-out"
                      style={{
                        zIndex: card.zIndex,
                        transform: imagesRevealed
                          ? `rotate(${card.rotate}deg) translateX(${card.translateX}px) translateY(${card.translateY}px)`
                          : "rotate(0deg) translateX(-120px) translateY(40px) scale(0.9)",
                        opacity: imagesRevealed ? 1 : 0,
                        transitionDelay: `${i * 120}ms`,
                      }}
                    >
                      <img
                        src={url}
                        alt={`Property photo ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Confirmation text */}
              <div
                className={`mt-6 transition-all duration-500 ease-out ${
                  imagesRevealed
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: "450ms" }}
              >
                <p className="text-[14px] text-primary-dark/60">
                  found on{" "}
                  <span className="text-accent">
                    redfin <span className="text-[12px]">&#8599;</span>
                  </span>
                </p>
                <h2 className="mt-1 text-[36px] md:text-[42px] font-normal leading-[1.1] tracking-[-0.01em] text-primary-dark">
                  does this look right?
                </h2>
                {resolvedLabel && (
                  <p className="mt-2 text-[16px] text-primary-dark/70">
                    {resolvedLabel}
                  </p>
                )}

                <div className="mt-6 flex gap-4 pb-12">
                  <button
                    type="button"
                    onClick={handleConfirmLooksRight}
                    className="rounded-[10px] cursor-pointer border border-accent bg-transparent px-[24px] py-[8px] text-[16px] leading-none text-accent hover:bg-accent/5 transition-all duration-75"
                  >
                    yep, this looks right
                  </button>
                  <button
                    type="button"
                    onClick={handleNotQuite}
                    className="rounded-[10px] cursor-pointer border border-[#8c908f] bg-transparent px-[24px] py-[8px] text-[16px] leading-none text-primary-dark/70 hover:bg-primary-dark/5 transition-all duration-75"
                  >
                    not quite
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

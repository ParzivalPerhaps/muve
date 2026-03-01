import { useState } from "react";
import AddressLookupPage from "./pages/AddressLookupPage";
import RequirementsEntryPage from "./pages/RequirementsEntryPage";
import AnalysisPage from "./pages/AnalysisPage";
import BottomGlobe, {
  DEFAULT_COORDINATES,
  type Coordinates,
} from "./components/BottomGlobe";

type Step = "address" | "requirements" | "analysis";

function App() {
  const [step, setStep] = useState<Step>("address");
  const [globeHidden, setGlobeHidden] = useState(false);
  const [resolvedCoordinates, setResolvedCoordinates] =
    useState<Coordinates>(DEFAULT_COORDINATES);

  function handleGlobeUpdate(coords: Coordinates) {
    setResolvedCoordinates(coords);
  }

  const [confirmedAddress, setConfirmedAddress] = useState("");
  const [confirmedImages, setConfirmedImages] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState("");

  function handleAddressConfirmed(
    _coords: Coordinates,
    address: string,
    images: string[],
  ) {
    setConfirmedAddress(address);
    setConfirmedImages(images);
    setStep("requirements");
  }

  function handleEvaluationStarted(id: string) {
    setSessionId(id);
    setStep("analysis");
  }

  function handleGlobeHide() {
    setGlobeHidden(true);
  }

  function handleGlobeShow() {
    setGlobeHidden(false);
  }

  const showGlobe = step === "address" && !globeHidden;

  return (
    <div className="relative min-h-screen overflow-hidden bg-white font-varela">
      {/* Static branding header */}
      <div
        className="relative z-20 pl-6 pr-6 pt-8 text-[36px] leading-none tracking-[-0.02em] flex text-primary-dark md:pl-[126px] md:pr-[126px] md:pt-[30px] min-[1440px]:pt-[60px]"
        aria-label="muve brand"
      >
        <a href="/" className="selection:bg-accent">
          muve
        </a>
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

      {/* Page content area */}
      <div className="relative">
        {/* Address page */}
        <div
          className={`transition-transform duration-700 ease-in-out ${
            step === "address" ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <AddressLookupPage
            handleGlobeUpdate={handleGlobeUpdate}
            onAddressConfirmed={handleAddressConfirmed}
            onGlobeHide={handleGlobeHide}
            onGlobeShow={handleGlobeShow}
          />
        </div>

        {/* Requirements page */}
        <div
          className={`absolute inset-0 transition-transform duration-700 ease-in-out ${
            step === "requirements"
              ? "translate-x-0"
              : step === "address"
                ? "translate-x-full"
                : "-translate-x-full"
          }`}
        >
          <RequirementsEntryPage
            address={confirmedAddress}
            images={confirmedImages}
            onEvaluationStarted={handleEvaluationStarted}
          />
        </div>

        {/* Analysis page */}
        <div
          className={`absolute inset-0 transition-transform duration-700 ease-in-out ${
            step === "analysis" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {sessionId && (
            <AnalysisPage images={confirmedImages} sessionId={sessionId} />
          )}
        </div>
      </div>

      <BottomGlobe
        target={resolvedCoordinates}
        className={`transition-transform duration-700 ease-in-out ${
          showGlobe ? "translate-y-0" : "translate-y-full"
        }`}
      />
    </div>
  );
}

export default App;

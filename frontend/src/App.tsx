import { useState } from "react";
import AddressLookupPage, {
  PLACEHOLDER_OPTIONS,
} from "./pages/AddressLookupPage";
import RequirementsEntryPage from "./pages/RequirementsEntryPage";
import AnalysisPage from "./pages/AnalysisPage";
import ReportPage from "./pages/ReportPage";
import BottomGlobe, { type Coordinates } from "./components/BottomGlobe";
import type { PropertySession } from "./lib/api";

type Step = "address" | "requirements" | "analysis" | "report";

function App() {
  const [step, setStep] = useState<Step>("address");
  const [globeHidden, setGlobeHidden] = useState(false);
  const [initialPlaceholder] = useState(
    () =>
      PLACEHOLDER_OPTIONS[
        Math.floor(Math.random() * PLACEHOLDER_OPTIONS.length)
      ],
  );
  const [resolvedCoordinates, setResolvedCoordinates] = useState<Coordinates>({
    lat: initialPlaceholder.lat,
    lon: initialPlaceholder.lon,
  });

  function handleGlobeUpdate(coords: Coordinates) {
    setResolvedCoordinates(coords);
  }

  const [confirmedAddress, setConfirmedAddress] = useState("");
  const [confirmedImages, setConfirmedImages] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [finalSession, setFinalSession] = useState<PropertySession | null>(
    null,
  );

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
    setTimeout(() => {
      setStep((current) => (current === "requirements" ? "analysis" : current));
    }, 3000);
  }

  function handleGlobeHide() {
    setGlobeHidden(true);
  }

  function handleGlobeShow() {
    setGlobeHidden(false);
  }

  function handleAnalysisComplete(session: PropertySession) {
    setFinalSession(session);
    setTimeout(() => setStep("report"), 300);
  }

  function handleReportComplete() {
    window.location.href = "/";
  }

  const showGlobe = step === "address" && !globeHidden;

  return (
    <div className="relative min-h-screen overflow-hidden bg-white font-varela print:overflow-visible">
      {/* Static branding header */}
      <div
        className="relative z-20 pl-6 pr-6 pt-8 text-[36px] leading-none tracking-[-0.02em] flex text-primary-dark md:pl-[126px] md:pr-[126px] md:pt-[30px] min-[1440px]:pt-[60px] print:hidden"
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
      <div className="relative print:overflow-visible">
        {/* Address page */}
        <div
          className={`print:hidden transition-transform duration-700 ease-in-out ${
            step === "address" ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <AddressLookupPage
            handleGlobeUpdate={handleGlobeUpdate}
            onAddressConfirmed={handleAddressConfirmed}
            onGlobeHide={handleGlobeHide}
            onGlobeShow={handleGlobeShow}
            placeholderAddress={initialPlaceholder.address}
            hidden={step !== "address" && step !== "requirements"}
          />
        </div>

        {/* Requirements page */}
        <div
          className={`print:hidden absolute inset-0 transition-transform duration-700 ease-in-out ${
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
          className={`print:hidden absolute inset-0 transition-transform duration-700 ease-in-out ${
            step === "analysis"
              ? "translate-x-0"
              : step === "report"
                ? "-translate-x-full"
                : "translate-x-full"
          }`}
        >
          {sessionId && (
            <AnalysisPage
              images={confirmedImages}
              sessionId={sessionId}
              onComplete={handleAnalysisComplete}
              hidden={step === "report"}
            />
          )}
        </div>

        {/* Report page */}
        <div
          className={`absolute inset-0 print:static print:inset-auto transition-transform duration-700 ease-in-out ${
            step === "report" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <ReportPage
            session={finalSession}
            address={confirmedAddress}
            images={confirmedImages}
            onComplete={handleReportComplete}
          />
        </div>
      </div>

      <BottomGlobe
        target={resolvedCoordinates}
        className={`print:hidden transition-transform duration-700 ease-in-out ${
          showGlobe ? "translate-y-0" : "translate-y-full"
        }`}
      />
    </div>
  );
}

export default App;

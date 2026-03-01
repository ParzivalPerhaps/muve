import { useState } from "react";
import AddressLookupPage from "./pages/AddressLookupPage";
import RequirementsEntryPage from "./pages/RequirementsEntryPage";
import BottomGlobe, {
  DEFAULT_COORDINATES,
  type Coordinates,
} from "./components/BottomGlobe";

type Step = "address" | "requirements";

function App() {
  const [step, setStep] = useState<Step>("address");
  const [globeHidden, setGlobeHidden] = useState(false);
  const [resolvedCoordinates, setResolvedCoordinates] =
    useState<Coordinates>(DEFAULT_COORDINATES);

  function handleGlobeUpdate(coords: Coordinates) {
    setResolvedCoordinates(coords);
  }

  function handleAddressConfirmed() {
    setStep("requirements");
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

      {/* Page content area */}
      <div className="relative">
        <div
          className={`transition-transform duration-700 ease-in-out ${
            step === "requirements" ? "-translate-x-full" : "translate-x-0"
          }`}
        >
          <AddressLookupPage
            handleGlobeUpdate={handleGlobeUpdate}
            onAddressConfirmed={handleAddressConfirmed}
            onGlobeHide={handleGlobeHide}
            onGlobeShow={handleGlobeShow}
          />
        </div>

        <div
          className={`absolute inset-0 transition-transform duration-700 ease-in-out ${
            step === "requirements" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <RequirementsEntryPage />
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

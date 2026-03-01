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

  function handleAddressConfirmed(coords: Coordinates) {
    setResolvedCoordinates(coords);
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
    <div className="relative min-h-screen overflow-hidden">
      <div
        className={`transition-transform duration-700 ease-in-out ${
          step === "requirements" ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <AddressLookupPage
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

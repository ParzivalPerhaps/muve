import { useState } from "react";
import LocationIcon from "../icons/LocationIcon";

export default function AddressLookupPage() {
  const [address, setAddress] = useState("308 Negra Arroyo Lane");

  return (
    <main className="min-h-screen bg-white p-0 font-varela flex flex-col">
      <section className="flex-1">
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

        <div className="mt-12 max-w-[1092px] px-6 md:mt-[106px] md:pl-[126px] md:pr-0">
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
          />
          <p className="text-primary-dark/60 mt-2 selection:bg-accent">
            This should be the address of an existing home you'd like to
            research
          </p>

          <button
            disabled={address.trim().length == 0}
            className="mt-12 rounded-[10px] cursor-pointer disabled:cursor-not-allowed not-disabled:hover:bg-accent/5 transition-all duration-75 border bg-transparent px-[30px] py-[8px] text-[18px] leading-none text-accent-button transition-all duration-75 disabled:opacity-50"
            type="button"
          >
            confirm address
          </button>
        </div>
      </section>
    </main>
  );
}

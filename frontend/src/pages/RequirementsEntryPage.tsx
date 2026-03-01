export default function RequirementsEntryPage() {
  return (
    <main className="min-h-screen bg-white p-0 font-varela relative flex flex-col overflow-hidden">
      <section className="relative z-10 flex-1 pb-[40vh] md:pb-[46vh]">
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
      </section>
    </main>
  );
}

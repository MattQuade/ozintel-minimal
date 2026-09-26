/**
 * Curated subsidy / rebate schemes for Analysis (Decision Brief).
 * Kept as first-class content so the hub still works when live page fetches fail.
 */

export type SchemeCatalogueEntry = {
  id: string;
  name: string;
  jurisdiction: "federal" | "nsw";
  appliesTo: string;
  summary: string;
  stackNote: string;
  url: string;
  /** Rough sizing cues for pubs / small commercial. */
  sizeHint: string;
};

/**
 * Yes — for an eligible NSW pub/business battery quote, the federal Cheaper
 * Home Batteries Program and the NSW Peak Demand Reduction Scheme (PDRS)
 * “Batteries for businesses” incentive can both apply when each scheme’s
 * rules are met (installer/ACP handles certificate discounts on the quote).
 */
export const SCHEME_CATALOGUE: SchemeCatalogueEntry[] = [
  {
    id: "federal-chbp",
    name: "Cheaper Home Batteries Program (federal)",
    jurisdiction: "federal",
    appliesTo: "Eligible home and business battery installs (with solar)",
    summary:
      "Australian Government discount on eligible batteries, delivered through Small-scale Technology Certificates (STCs). Installer usually nets the discount off the quote.",
    stackNote:
      "Can stack with the NSW business battery incentive when both sets of eligibility rules are met (typically batteries in the federal program’s capacity band, often cited up to ~100 kWh usable for stacking).",
    url: "https://www.energy.gov.au/rebates/cheaper-home-batteries-program",
    sizeHint: "Commonly discussed for ~5–100 kWh usable capacity bands.",
  },
  {
    id: "nsw-pdrs-bess-business",
    name: "NSW Batteries for businesses (PDRS)",
    jurisdiction: "nsw",
    appliesTo: "NSW commercial sites (not residential buildings / data centres)",
    summary:
      "NSW Peak Demand Reduction Scheme incentive for behind-the-meter business batteries. Delivered as Peak Reduction Certificates (PRCs) via an Accredited Certificate Provider — shows up as an upfront discount on the installer quote. Higher discount when new or additional solar is installed with the battery.",
    stackNote:
      "Official NSW guidance: yes, you can combine this NSW battery discount with the Australian Government’s Cheaper Home Batteries Program if you meet both schemes’ requirements. For many pubs/hospitality sites, BESS4 covers usable capacity greater than 20 kWh and up to 200 kWh.",
    url: "https://www.energy.nsw.gov.au/business-and-industry/programs-grants-and-schemes/business-equipment/batteries-businesses-incentive",
    sizeHint: "BESS4 ~20–200 kWh usable; larger sites may fall under BESS5.",
  },
  {
    id: "federal-sres-solar",
    name: "Small-scale Renewable Energy Scheme — solar (federal)",
    jurisdiction: "federal",
    appliesTo: "Eligible rooftop solar (homes and businesses)",
    summary:
      "Federal STC discount on eligible solar PV. Separate from battery certificates; usually already baked into a solar+battery quote.",
    stackNote:
      "NSW also states the business battery discount can be combined with Australian Government solar discounts when both apply.",
    url: "https://www.cleanenergyregulator.gov.au/RET/Scheme-participants-and-industry/Agents-and-installers/Small-scale-systems-eligible-for-certificates",
    sizeHint: "Depends on system size and deeming period.",
  },
];

export function stackingAnswerForPubQuote(): string {
  return (
    "Yes — for an eligible NSW pub/business solar+battery quote, the federal " +
    "Cheaper Home Batteries Program and the NSW PDRS Batteries for businesses " +
    "incentive can both reduce the same install when each scheme’s rules are met. " +
    "Ask the installer (via an Accredited Certificate Provider) to show both " +
    "discounts separately on the quote."
  );
}

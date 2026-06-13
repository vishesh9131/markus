// Plan limits. Free tier: 2 workspaces, each up to 2 .mks files of <=5 pages.
// Premium: unlimited.
export const FREE_LIMITS = {
  workspaces: 2,
  docsPerWorkspace: 2,
  pagesPerDoc: 5,
};

export function limitsFor(tier) {
  if (tier === "premium") {
    return { workspaces: Infinity, docsPerWorkspace: Infinity, pagesPerDoc: Infinity };
  }
  return FREE_LIMITS;
}

export const PREMIUM = {
  amountPaise: Number(process.env.PREMIUM_AMOUNT_PAISE || 900),
  months: Number(process.env.PREMIUM_MONTHS || 2),
  get rupees() {
    return this.amountPaise / 100;
  },
};

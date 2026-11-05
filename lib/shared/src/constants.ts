/** View types registered by the OrbitKit plugins, so they can open each other's panels. */
export const VIEW_TYPES = {
  ideaVault: "idea-vault-view",
  literatureTracker: "literature-tracker-view",
  mindfulFocus: "mindful-focus-view",
} as const;

export type OrbitKitViewType = (typeof VIEW_TYPES)[keyof typeof VIEW_TYPES];

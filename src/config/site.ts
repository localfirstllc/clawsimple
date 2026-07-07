export const siteConfig = {
  name: 'ClawSimple',
  url: 'https://clawsimple.com',
  domain: 'clawsimple.com',
  description: 'Managed OpenClaw and Hermes Agent hosting for Telegram bots with platform AI, managed search, and private servers.',
  
  company: {
    name: 'ClawSimple',
    address: 'USA', 
  },

  contact: {
    email: 'hello@clawsimple.com',
    support: 'support@clawsimple.com',
    privacy: 'privacy@clawsimple.com',
  },

  links: {
    twitter: 'https://x.com/clawsimpleapp',
    github: 'https://github.com/localfirstllc/clawsimple',
    discord: 'https://discord.gg/3UbQJF7EaG',
    trustpilot: 'https://www.trustpilot.com/review/clawsimple.com',
  },

  pricing: {
    limits: {
      minModelPriceUsd: 0.001,
      maxModelPriceUsd: 1,
    },
  },
} as const;

export type SiteConfig = typeof siteConfig;

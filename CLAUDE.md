# muve. — Housing Accessibility Scorer

## Overview

**muve.** is a web application that evaluates the accessibility of any residential property by combining property listing images with AI-powered visual analysis. Users enter an address and describe their specific accessibility needs; the system scrapes property photos, generates a tailored checklist, analyzes every image against that checklist, and produces a scored report highlighting problem areas.

---

## Core User Flow (from Figma Mockups)

The UI follows a guided, step-by-step wizard pattern:

| Step | Screen                               | Description                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Address Input** (Desktop-4)        | User types a property address (e.g. "308 Negra Arroyo Lane") and clicks **"confirm address"**.                                                                                                                                                                       |
| 2    | **Loading / Scraping** (Desktop-1)   | Animated "road trip" illustration while the system scrapes Redfin for property images in the background. Displays the entered address and a "going on a road trip…" message.                                                                                         |
| 3    | **Address Confirmation** (Desktop-3) | Shows scraped listing photos and asks **"does this look right?"** with the full address (e.g. "308 Negra Arroyo Lane, Albuquerque, New Mexico"). Two buttons: **"yes, this looks right"** / **"not quite"**.                                                         |
| 4    | **Accessibility Input** (Desktop-2)  | Prompt changes to **"what do you want us to look for?"** User selects from suggested tags (e.g. `entry stairs`, `tight corners`, `nearby bus stops`) and/or types a free-form description (e.g. "I have a back injury. I'd rather not inflammate by gates/fences."). |
| 5    | **Analysis in Progress** (Desktop-5) | Shows **"doing some research…"** with a carousel of the property images being analyzed. AI annotations appear on images (e.g. "tight doorways" callout). Dot indicators show progress through the image set.                                                         |
| 6    | **Report** (Desktop-6)               | Final screen: **"your report for [address]"** — displays the accessibility score and detailed findings. Address shown as a green link.                                                                                                                               |

---

## Architecture & Data Flow

```
┌──────────────┐
│  User Input  │
│  (address +  │
│  a11y needs) │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│              Parallel Processing             │
│                                              │
│  ┌─────────────────┐  ┌───────────────────┐  │
│  │ Scrape Redfin   │  │ Generate Analysis │  │
│  │ for property    │  │ Checklist from    │  │
│  │ images          │  │ user's a11y needs │  │
│  └────────┬────────┘  └────────┬──────────┘  │
│           │                    │              │
│           └────────┬───────────┘              │
│                    ▼                          │
│         ┌──────────────────┐                  │
│         │ AI Image Analysis│                  │
│         │ (Gemini Vision)  │                  │
│         │ Check each image │                  │
│         │ against list     │                  │
│         └────────┬─────────┘                  │
│                  ▼                            │
│         ┌──────────────────┐                  │
│         │ Score & Report   │                  │
│         │ Generation       │                  │
│         └──────────────────┘                  │
└──────────────────────────────────────────────┘
```

---

## Feature Breakdown

### MVP (Core)

- **Address Search & Validation** — Input field with confirmation step showing the matched listing.
- **Redfin Image Scraping** — Programmatically pull all available property photos for the given address.
- **Accessibility Profile Input** — Tag-based selection + free-text field for users to describe their specific needs (mobility, sensory, cognitive, etc.).
- **AI Checklist Generation** — Use Gemini to convert the user's accessibility description into a structured checklist of things to look for in property photos.
- **AI Image Analysis** — Feed each property image + the checklist into Gemini Vision. For each image, identify which checklist items are present/absent/problematic.
- **Scoring Engine** — Aggregate image-level findings into an overall accessibility score.
- **Report View** — Display the score, flag images that caused score deductions, and provide per-category breakdowns.

### Stretch Goals

- **Geospatial / Street View Integration** — Use Google Maps or Street View API to evaluate the surrounding area: sidewalk conditions, proximity to bus stops, nearby stores, terrain/hills, curb cuts.
- **Alternative Image Sources** — Fall back to Zillow, Realtor.com, or Google Street View if Redfin doesn't have a listing.
- **Personal Accessibility Profiles** — Let users save a profile (mobility device type, vision impairment level, dexterity limitations, etc.) so the scoring weights adjust per-user rather than being one-size-fits-all.

---

## Accessibility Categories to Evaluate

These are the domains the AI checklist can draw from based on user needs:

1. **Entrance & Approach** — Step-free entry, ramp availability/slope, door widths (36"+), threshold heights, doorbell reach, pathway surface, parking-to-entrance distance.
2. **Interior Navigation** — Hallway/doorway widths, single-story vs. multi-story layout, flooring transitions, turning radius, staircase config, elevator/stairlift potential.
3. **Kitchen** — Counter heights, cabinet reach zones, appliance controls (front vs. top), knee clearance, faucet type (lever vs. knob), maneuvering space.
4. **Bathrooms** — Roll-in shower vs. tub, grab bars / wall reinforcement, toilet height, vanity clearance, door swing direction, floor slip resistance.
5. **Bedroom & Living Spaces** — Switch/outlet heights, window handle access, closet rod heights, room dimensions for mobility devices.
6. **Outdoor & Structural** — Garage access, yard terrain, mailbox location, deck/patio step-free access, emergency egress, pathway lighting.
7. **Systems & Controls** — Thermostat placement, breaker panel access, smart home compatibility (voice-controlled locks/lights), visual/vibrating alerts for deaf/HoH users.
8. **Broader Context** _(stretch)_ — Accessible transit proximity, sidewalk condition, nearby medical facilities, local ADA compliance, renovation feasibility.
9. **Cognitive & Sensory** — Lighting quality, noise levels, open vs. cluttered layouts, color contrast (walls/floors/doors for low-vision), wayfinding cues.

---

## Technical Considerations

### Gemini API

- **Image cap workaround:** If a listing has many photos, batch them across multiple Gemini calls and merge the sub-reports into a single unified score.

### Redfin Scraping

- Likely needs a headless browser (Puppeteer / Playwright) since Redfin is heavily JS-rendered.
- Handle cases where a listing doesn't exist or has been delisted.

### Frontend

- Clean, minimal wizard-style UI (as shown in mockups).
- Dark outer frame with white content cards.
- Branded header: **muve.** (lowercase, period).
- Green accent color for CTAs and links.
- Loading states with playful illustrations (road trip van animation).
- Image carousel with dot indicators during analysis phase.

---

## Tech Stack

- **Frontend:** React
- **Backend:** Express (Node.js)
- **AI:** Gemini Vision API
- **Scraping:** Headless browser (Puppeteer / Playwright) for Redfin
- **Architecture:** Stateless — no user accounts or persistent storage; each session is a one-off evaluation.

## Scoring System

Scores are on a **0–100 scale** using a category-based points system. Each accessibility category (Entrance, Interior, Kitchen, Bathroom, etc.) contributes a weighted point allocation to the total. Points are deducted per category based on issues detected in the property images, and the final score is the sum of remaining points across all categories.

## Open Questions

- How do we handle addresses with no Redfin listing — skip, or immediately fall back to an alternative source?
- Should the report be shareable / exportable (PDF, link)?
- How should category weights shift based on the user's stated accessibility needs?

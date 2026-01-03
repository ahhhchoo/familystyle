# Family Style - Development Notes for Claude

## Project Overview
**Family Style** - A mobile-first web app (targeting iPhone 16+) for family New Year's resolution and goal tracking. Family members can set goals, check in daily, and see each other's progress over 365 days.

## Tech Stack
- **Next.js 16** (App Router, TypeScript)
- **Firebase** (Auth with Google Sign-in, Firestore database)
- **Vercel** (hosting)
- **Tailwind CSS v4**

## GitHub & Deployment
- Repo: `https://github.com/ahhhchoo/familystyle.git`
- Firebase Project ID: `family-style-999f8`

---

## Current Pages
- `/` - Sign-in screen (Google auth)
- `/join-family` - Create or join family with invite codes
- `/home` - Family member cards in 2x2 grid showing daily completion status
- `/member/[id]` - Individual member's goals with check-in toggles + snap-scroll to personal stats
- `/goals/edit` - Add/edit/delete goals with daily/weekly frequency settings
- `/overview` - 365-day grid showing family success rate
- `/settings` - Family info, invite code sharing, manage members (manager only), leave family, sign out

---

## Key Features Implemented

### Goals System
- Goals can be **daily** or **weekly** (X times per week)
- **Optimistic Weekly Logic** - Weekly goals show as "complete" until mathematically impossible to achieve

### Family Manager Role
- Family creator is automatically the **manager**
- Manager badge shown on settings page
- **Manage Members** section (manager only) shows all family members
- Manager can **remove members** (confirmation modal)
- When removed: member's goals are deactivated so they don't affect family stats

### Microinteractions
1. **Goal Toggle Pulse** - Orange glow when checking a goal
2. **Checkmark Draw** - Animated checkmark drawing when completing
3. **Progress Ring** - Animated fill on PersonCard (only shows when incomplete)
4. **Number Count-up** - Success rate animates from 0 to target (simple count, no rolling)
5. **Today's Dot Pulse** - On year grid, today's dot pulses (800ms pulse, 1s pause)
6. **Snap Scroll Navigation** - "Your Stats" and "Back to goals" buttons scroll between sections

---

## Data Models (Firestore)

### User
```typescript
{
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  familyId: string | null;
  createdAt: Timestamp;
}
```

### Family
```typescript
{
  id: string;
  name: string;
  inviteCode: string;
  members: string[]; // Array of user UIDs
  createdAt: Timestamp;
  createdBy: string; // UID of creator (manager)
}
```

### Goal
```typescript
{
  id: string;
  userId: string;
  familyId: string;
  title: string;
  createdAt: Timestamp;
  isActive: boolean;
  frequency: 'daily' | 'weekly';
  weeklyTarget?: number; // Required if frequency is 'weekly'
}
```

### DailyCheckIn
```typescript
{
  id: string;
  goalId: string;
  userId: string;
  familyId: string;
  date: string; // YYYY-MM-DD format
  completed: boolean;
  completedAt: Timestamp;
}
```

---

## Design System
- **Dark theme** (black background)
- **Colors:**
  - Orange: `#F5A524` (`var(--orange)`)
  - Green: `#30D158` (`var(--green)`)
  - Gray cards: `#1C1C1E` (`var(--gray-dark)`), `#2C2C2E` (`var(--gray-card)`)
  - Gray text: `var(--gray-text)`
- Current user's card has white 10% opacity border
- Progress ring only shows when incomplete

---

## CSS Animations (in globals.css)
- `pulse-dot` keyframes for today's dot (800ms pulse, 1s pause between)

---

## Key Components
- `AnimatedNumber` - Simple count-up animation (1s duration, ease-out-quart)
- `GoalItem` - Goal row with toggle, supports daily/weekly display
- `PersonCard` - Family member card with progress ring
- `SignInScreen` - Google sign-in button

---

## Snap Scroll Pattern
Container:
```tsx
<div className="h-screen overflow-y-auto snap-y snap-mandatory">
```
Sections:
```tsx
<section className="min-h-screen snap-start">
```
Button navigation:
```tsx
document.getElementById('section-id')?.scrollIntoView({ behavior: 'smooth' });
```

---

## NEXT FEATURE TO BUILD: Family Wager

### Concept
Every month, the family wagers a reward (e.g., "omakase this month"). The family only gets the reward if they complete the month with 100% (or a chosen target percentage).

### Requirements
- New snap-scroll screen for monthly wager view
- Monthly stats display (instead of yearly)
- Wager/reward input
- Target percentage setting
- Progress tracking for current month

### Design
**Need to check Figma** - User mentioned they have a design selected in Figma. After restarting OpenCode with Figma MCP connected, look at the selected screen in Figma to get the exact design.

---

## Recent Commits
```
bceb8e7 Fix redirect sign-in race condition
c136d1a Deactivate removed member's goals to prevent affecting family stats
e425e59 Add family manager role with ability to remove members
a7e3604 Make 'Back to goals' button clickable to scroll up
6cc3c45 Make 'Your Stats' clickable to scroll down
1acfbc6 Simplify AnimatedNumber - remove rolling effect, just count up
c007344 Change dot pulse to 1s pause between pulses
d6bdfbc Restore progress ring animation (only shows when incomplete)
```

---

## Known Issues Fixed
1. **Auth redirect race condition** - Fixed by awaiting `getRedirectResult` before setting up auth listener
2. **Removed members affecting stats** - Fixed by deactivating their goals when removed

---

## File Structure
```
src/
  app/
    (auth)/join-family/page.tsx
    (main)/
      goals/edit/page.tsx
      home/page.tsx
      member/[id]/page.tsx
      overview/page.tsx
      settings/page.tsx
      layout.tsx
    globals.css
    layout.tsx
    page.tsx
  components/
    AnimatedNumber.tsx
    GoalItem.tsx
    PersonCard.tsx
    SignInScreen.tsx
  hooks/useAuth.ts
  lib/firebase.ts
  types/index.ts
```

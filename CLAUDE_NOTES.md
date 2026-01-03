# Family Style - Development Notes for Claude

## Project Overview
**Family Style** - A mobile-first web app (targeting iPhone 16+) for family New Year's resolution and goal tracking. Family members can set goals, check in daily, and see each other's progress over 365 days.

## Tech Stack
- **Next.js 16** (App Router, TypeScript)
- **Firebase** (Auth with Google Sign-in, Firestore database, Storage for profile photos)
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
- `/overview` - 365-day grid showing family success rate + snap-scroll to monthly wager cards
- `/settings` - Family info, invite code sharing, manage members (manager only), profile picture upload, leave family, sign out

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

### Monthly Wager Feature (NEW)
- **Location**: Second snap-scroll section on `/overview` page
- **Component**: `MonthlyWagerCard.tsx`
- Monthly family challenge - if 100% goal completion, rotating family member picks reward
- **Monthly Cards show:**
  - Completion percentage with AnimatedNumber
  - Month/year display
  - Assigned user avatar (rotates in reverse alphabetical order by first name)
  - 7-column grid with circles/squares for each day, star on last day
  - Editable reward text (only assigned user for current month can edit)
- **Color rotation by month** (based on months since `family.createdAt`):
  - Blue: `#2B9CFF`
  - Green: `#15B347`
  - Red: `#FF3939`
  - Yellow: `#FBFF28`
- **Shape colors:**
  - Full completion: month's color at 100% opacity
  - Partial completion: month's color at 50% opacity
  - Incomplete/future: `#202020`
- **Animations:**
  - Pulse on today's shape (reuses `pulse-dot` keyframes)
  - Scroll-based wiggle/rotation on all shapes with wave effect
- **Firestore**: `monthlyWagers` collection

### Custom Profile Picture Upload (NEW)
- **Component**: `ProfilePictureUpload.tsx`
- **Location**: Settings page
- Users upload custom photos (stored in Firebase Storage at `profilePhotos/{uid}`)
- Falls back to Google photo if no custom photo
- Real-time updates via `onSnapshot` listeners on home page
- **Field**: `customPhotoURL` on User type

### Human-Readable Firestore Fields (NEW)
Optional fields for easier Firebase console debugging:
- `DailyCheckIn`: `goalTitle`, `userName`
- `Goal`: `userName`
- `MonthlyWager`: `monthDisplay`, `assignedUserName`

### Microinteractions
1. **Goal Toggle Pulse** - Orange glow when checking a goal
2. **Checkmark Draw** - Animated checkmark drawing when completing
3. **Progress Ring** - Animated fill on PersonCard (only shows when incomplete)
4. **Number Count-up** - Success rate animates from 0 to target (simple count, no rolling)
5. **Today's Dot Pulse** - On year grid, today's dot pulses (800ms pulse, 1s pause)
6. **Snap Scroll Navigation** - Buttons scroll between sections
7. **Wager Shape Wiggle** - Scroll-based rotation animation with wave effect (NEW)

---

## Data Models (Firestore)

### User
```typescript
{
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  customPhotoURL?: string; // NEW - Custom uploaded photo
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
  weeklyTarget?: number;
  userName?: string; // NEW - Human-readable field
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
  goalTitle?: string; // NEW - Human-readable field
  userName?: string;  // NEW - Human-readable field
}
```

### MonthlyWager (NEW)
```typescript
{
  id: string;
  month: number; // 0-11
  year: number;
  assignedUserId: string;
  reward: string;
  familyId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  monthDisplay?: string;      // NEW - Human-readable (e.g., "January 2025")
  assignedUserName?: string;  // NEW - Human-readable
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
  - Wager Blue: `#2B9CFF` (`var(--wager-blue)`)
  - Wager Green: `#15B347` (`var(--wager-green)`)
  - Wager Red: `#FF3939` (`var(--wager-red)`)
  - Wager Yellow: `#FBFF28` (`var(--wager-yellow)`)
- Current user's card has white 10% opacity border
- Progress ring only shows when incomplete

---

## CSS Animations (in globals.css)
- `pulse-dot` keyframes for today's dot (800ms pulse, 1s pause between)
- Wager color CSS variables

---

## Key Components
- `AnimatedNumber` - Simple count-up animation (1s duration, ease-out-quart)
- `GoalItem` - Goal row with toggle, supports daily/weekly display, neutral face for incomplete
- `MonthlyWagerCard` - Monthly challenge card with day grid and reward input (NEW)
- `PersonCard` - Family member card with progress ring
- `ProfilePictureUpload` - Custom photo upload with preview (NEW)
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

## Pending Tasks

### Migration Script (Ready to Run)
- **Location**: `/scripts/migrate-readable-fields.ts`
- Backfills human-readable fields to existing Firestore documents
- **To run:**
  1. Download service account key from Firebase Console
  2. Save as `service-account-key.json` in project root
  3. Run: `npx tsx scripts/migrate-readable-fields.ts`

### Potential Future Enhancements
- AnimatedNumber for wager percentage (already using it)
- Celebration animation when hitting 100%
- Day shape tap interaction to see details
- Entry animations for monthly wager shapes

---

## Recent Commits
```
[Latest commits from Monthly Wager feature work]
- Added monthly wager feature with snap-scroll on overview page
- Added custom profile picture upload with Firebase Storage
- Added human-readable fields to Firestore documents
- Fixed profile pictures not updating on home page (added onSnapshot)
- Updated star shape to exact Figma SVG path
- Changed smiley to neutral face in GoalItem

[Previous commits]
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
3. **Profile pictures not updating** - Fixed by adding `onSnapshot` listeners for user documents on home page

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
    MonthlyWagerCard.tsx      # NEW
    PersonCard.tsx
    ProfilePictureUpload.tsx  # NEW
    SignInScreen.tsx
  hooks/useAuth.ts
  lib/firebase.ts
  types/index.ts
scripts/
  migrate-readable-fields.ts  # NEW
```

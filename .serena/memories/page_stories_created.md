# Page Component Stories Created

## Overview
Created Storybook stories for 5 page-level components using Storybook 9 CSF (Meta/StoryObj) pattern with proper mocking and play functions.

## Stories Created

### 1. FactDatabase.stories.tsx
**Location**: `apps/fact-index/src/pages/FactDatabase/FactDatabase.stories.tsx`

**Stories**:
- `Default` - Main database view with 2 sample facts
- `WithLoadingState` - Shows loading spinner
- `Unauthenticated` - Displays when user not logged in

**Mocked**:
- `axios` - HTTP requests
- `useFact` hook - Returns 2 sample facts with filters
- `nprogress` - Progress bar
- `AuthContext` - Authenticated user context

**Features**:
- Search bar, sidebar filters, results table
- Loading states
- Empty state handling
- Infinite scroll setup

---

### 2. FactDetail.stories.tsx
**Location**: `apps/fact-index/src/pages/FactDatabase/FactDetail.stories.tsx`

**Stories**:
- `Default` - Full fact detail view
- `WithFullMetadata` - Verifies all metadata badges
- `WithSourceLink` - Checks source link rendering

**Mocked**:
- `useParams` - Returns fact ID
- `useNavigate` - Navigation hook
- `apiGet` - API client for fetching fact

**Sample Data**:
```
- fact_text: "Trans individuals have existed throughout history..."
- source: Wikipedia link
- subjects: ["history", "cultural"]
- audiences: ["education", "advocacy"]
```

---

### 3. FactEdit.stories.tsx
**Location**: `apps/fact-index/src/pages/FactDatabase/FactEdit.stories.tsx`

**Stories**:
- `CreateMode` - New fact creation form (no pre-fill)
- `EditMode` - Edit existing fact (pre-filled)
- `WithValidation` - Form validation behavior
- `FilledForm` - Test filled form state

**Mocked**:
- `useParams` - Provides fact ID (null for create)
- `useNavigate` - Navigation
- `axios.post/put` - API calls
- `notifications` - Toast messages
- `nprogress` - Progress indicator

**Validation**:
- fact_text: required, min 5 chars
- source: optional, must be valid URL
- reason (edit mode): required

---

### 4. Home.stories.tsx
**Location**: `apps/fact-index/src/pages/Home/Home.stories.tsx`

**Stories**:
- `Authenticated` - User logged in, shows greeting + database button
- `Unauthenticated` - No user, shows login prompt
- `Loading` - Auth check in progress
- `WithCustomUsername` - Custom username display

**Mocked**:
- `AuthContext` - Provides auth state and user info

**Variations**:
- "testuser" (default authenticated)
- "advocateAdmin" (custom username test)
- Loading state
- Unauthenticated state

---

### 5. Login.stories.tsx
**Location**: `apps/fact-index/src/pages/login/login.stories.tsx`

**Stories**:
- `Default` - Normal login page (auth available)
- `Unavailable` - Auth service down
- `WithErrorReason` - Shows error why login failed
- `WithHelpText` - Expandable help instructions
- `Authenticated` - Already logged in

**Mocked**:
- `fetch` - /auth/available endpoint
- `window.location.search` - Query string simulation

**Scenarios**:
- Auth service available
- Auth service unavailable
- Missing Discord server membership
- Missing role error
- Help text toggle

---

## Pattern Consistency

All stories follow the established CSF pattern:
✅ Use `Meta` for story metadata
✅ Use `StoryObj<typeof Component>` for type safety
✅ Implement `play` functions for interactions
✅ Mock external dependencies (API, routing, auth)
✅ Use wrapper components for consistent theming
✅ Include accessibility concepts (role, aria attributes)
✅ Provide console logs for verification

## Mantine Theme Integration

All stories use `mantineTheme` from:
`apps/fact-index/src/lib/mantineTheme.ts`

This ensures:
- Dark/light mode consistency
- Card styling, colors, spacing
- Global styles applied

## Testing Play Functions

Each story includes play functions that:
- Wait for async loads (setTimeo 200ms)
- Verify DOM elements are rendered
- Check text content
- Log success/failure to console
- Use `canvasElement.querySelector()` for DOM access

## Next Steps (Optional)

- Add more loading/error states
- Add infinite scroll trigger testing
- Test form submission flows
- Add accessibility tests with `axe`
- Add visual regression tests with Percy/Chromatic

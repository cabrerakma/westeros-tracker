# Multi-session version: design plan (draft, on the `next` branch)

**Goal:** anyone can create their own session with their own GM and run their own campaign on the same map. The current campaign on `main` keeps running unchanged on GitHub Pages and is never touched by this work.

## Decisions so far

- Work happens only on the `next` branch. `main` is the live campaign; restore point is the tag `stable-2026-11-24`.
- Backend: **not chosen yet** (Supabase or Firebase; this document is backend-neutral).
- GM access: **a passcode per session**, chosen by whoever creates the session. Players open the plain session link and see the map. The GM types the passcode to edit.
- Still no turns, no game rules, no accounts.

## What changes from today

| Today | Multi-session |
| --- | --- |
| One map, `public/campaign.json` | Many sessions, each with its own state, stored in the database |
| GM passcode hard-coded (`password234`) | Passcode per session, checked by the server |
| GM clicks Save to file, replaces the file, pushes | Edits save to the database; everyone sees them live, no publish step |
| Link = the site | Link = `site/#/s/<session-id>` (unlisted, hard to guess) |

## Screens

1. **Home:** "Create a session" and "Open a session" (paste a link or code).
2. **Create:** session name, starting position (War of the Five Kings or blank), GM passcode. Result: the session link to share.
3. **Session:** today's map and panels, loaded from that session. GM mode asks for that session's passcode.

## Data model (one session = one record)

- `id`: random, unguessable (for example 10 characters)
- `name`, `createdAt`
- `gmPasscodeHash`: never the plain passcode
- `state`: the same `GameState` as today (holders, factions, log, battles), so the map code barely changes
- `updatedAt`, plus a version number to catch two GMs saving at once

## The important rule: the passcode must be checked by the server

The page is public, so a passcode check inside the page would only be for show. Writes must go through a server-side rule or function that checks the passcode against the stored hash. Reading a session needs only its link. Without this, anyone could edit any session by calling the database directly.

## Build steps

1. Pick the backend (needs a free account from you).
2. Add a storage layer with two functions, `loadSession(id)` and `saveSession(id, state, passcode)`, so the rest of the app doesn't care what the backend is.
3. Add the Home and Create screens and the `#/s/<id>` routing (hash routing works on GitHub Pages).
4. Replace "Save to file" with automatic saving after each GM edit; keep "Download backup" and "Load from file".
5. Live updates for viewers (subscribe, or poll every few seconds as a simple start).
6. Validation: reject malformed state on the server; rate-limit session creation.
7. Test, then deploy to a **separate** Pages site or path, so the live campaign is not affected.

## Open questions

- Backend choice (above).
- Should old sessions be deleted after a period of no activity?
- Can the current campaign be imported into a new session when it ends? (Likely yes, through Load from file.)
- Where does the new version live: a second Pages site from `next`, or replacing `main` later?

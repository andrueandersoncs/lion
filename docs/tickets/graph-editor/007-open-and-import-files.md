# LION-EDITOR-007 — Implement new, open, and import workflows

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-003, LION-EDITOR-004

## Outcome

Start an editing session from a new document or a local JSON file without requiring an account or backend.

## Scope

- Add New, Open, and Import actions to the editor command surface.
- Use the File System Access API when available and a hidden file input fallback elsewhere.
- Accept `.json` and explicit Lion JSON selections while still validating content, not trusting extensions.
- Read source as text without normalizing formatting.
- Initialize file identity, saved revision, file name, and recent in-session state.
- Guard destructive replacement of a dirty document through the shared unsaved-changes flow.
- Provide useful states for canceled picker, unreadable file, empty file, oversized file, and invalid UTF-8 replacement behavior.

## Acceptance criteria

- New creates a valid starter Lion document and a clean untitled state.
- Open reads a local file with formatting unchanged and establishes a writable handle when supported.
- Import reads through the fallback without claiming direct-save capability.
- Canceling a picker changes nothing.
- Replacing a dirty document requires Save, Discard, or Cancel.
- Opening invalid source enters the invalid-source workflow instead of rejecting the file.

## Verification

- Exercise new, direct open, fallback import, cancellation, invalid source, and dirty-document replacement in supported browsers.
- Confirm a file containing non-ASCII text loads unchanged.
- Verify the actual surface; do not substitute mocked unit output for browser file interaction.

## Non-goals

Project directories, recent-file persistence across sessions, cloud storage, or drag-and-drop editing operations.

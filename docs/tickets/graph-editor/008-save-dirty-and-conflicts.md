# LION-EDITOR-008 — Implement saving, dirty state, and file conflicts

**Status:** Blocked  
**Priority:** P0  
**Depends on:** LION-EDITOR-007

## Outcome

Save the exact current source safely and make unsaved, permission, and external-change states impossible to miss.

## Scope

- Implement Save and Save As for writable file handles.
- Implement Download as the fallback for browsers without direct write support or for imported documents.
- Derive dirty state from canonical revision history.
- Track the last observed file metadata and detect a changed backing file before overwriting when the platform exposes sufficient data.
- Handle permission prompt, denied, revoked, missing, and write-failure states.
- Add navigation and tab-close protection while dirty.
- Preserve invalid source exactly when the user chooses to save it.

## Acceptance criteria

- Successful Save writes exact current text and marks that revision clean.
- Undoing to the saved revision clears dirty state; redoing away from it restores dirty state.
- Save As updates file identity and future Save targets.
- Fallback Download never reports that the original file was overwritten.
- A detected external change blocks silent overwrite and offers Reload, Save As, or Overwrite.
- Permission failures preserve the document and dirty state.
- Browser navigation warns only while dirty.

## Verification

- Exercise direct save, save as, download fallback, invalid-source save, denied permission, revoked permission, and external modification.
- Reopen written files and compare their bytes with editor text.
- Run the real browser workflows plus focused dirty-state model tests.

## Non-goals

Autosave, cloud versions, merge conflict resolution, or multi-file transactions.

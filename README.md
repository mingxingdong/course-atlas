# Course Atlas · Tübingen

A static, privacy-friendly timetable for winter semester 2026/27. All 33 courses and 678 meetings from the finalized timetable are included. Locations use their original German names. The user-confirmed Discrete Methods and Logic seminar corrections are applied.

## Preview

Serve `dist/` with any static web server. No installation or build is needed. All course data is bundled; there are no external fonts, tracking scripts, sign-ins, or API keys. Saved choices remain in each visitor's browser. Share view links include the chosen week, filters and, in My timetable, the selected courses and hidden tutorial groups.

## Publish on GitHub Pages

1. Create a public GitHub repository (for example `course-atlas`).
2. Upload the **contents** of `dist/`, including `.nojekyll`, to the repository root. Keep `index.html` at the root, not inside `dist/`.
3. Open the repository's **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**, choose **main**, and select **/ (root)**. Save.
5. GitHub will provide the public URL. The site works under a repository subpath and needs no custom domain.

For updates, replace the corresponding static files in the same repository. The website URL stays the same.

## Editing course data

`dist/data.json` contains the portable dataset; `dist/data.js` exposes the same object as `window.TIMETABLE_DATA`. Keep the two in sync when updating the published site. Event dates are ISO calendar dates in Europe/Berlin; times are local wall-clock times. Known cancellations are already removed from the event list. `prepare_data.py` reproduces the initial dataset from the original working model in this chat's workspace, applying the confirmed corrections. It is not required for hosting.

## Calendar exports

The visitor can download one combined `.ics` or a ZIP of individual course calendars. A separate Apple Calendar calendar for each course preserves colours. Exports cover the whole semester, respecting the active course/type filters, and hidden tutorial groups in My timetable. Stable UIDs match the earlier calendar exports, and the revision is incremented. DST is converted with Europe/Berlin rules. No personal calendar data is included.

This is an independent student timetable, not an official university service. It does not automatically synchronize with ALMA. The displayed last-updated date and course source links make this explicit.

# Course Atlas · Tübingen

A static, privacy-friendly timetable for winter semester 2026/27. All 33 courses and 678 meetings from the finalized timetable are included. Locations use their original German names. The user-confirmed Discrete Methods and Logic seminar corrections are applied.

## Preview

Serve `dist/` with any static web server. No installation or build is needed. All course data is bundled; there are no external fonts, tracking scripts, sign-ins, or API keys. Saved choices remain in each visitor's browser. Share view links include the chosen week, filters and, in My timetable, the selected courses and chosen tutorial groups.

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

One combined `.ics` contains course names, times and original German locations, without default reminders. Regular sessions use weekly recurrence with exceptions for cancelled dates. Irregular times and block sessions remain separate as needed. The export covers the semester and respects filters and positively selected tutorial groups in My timetable. Modules, credits, lecturers and source links remain available on the website rather than in calendar descriptions. No personal calendar data is included.

## Course selection

Saving a course adds every non-tutorial session, with no tutorials preselected. Choosing a tutorial adds all non-tutorial sessions automatically. Tutorial groups can be selected independently, with no group limit. Clicking a selected tutorial removes only that group. Alternatives remain visible as highlighted choices or dimmed cards, but are not counted or exported unless selected. Saved selections and share links store positive tutorial choices. Legacy saved courses are retained, but their tutorials must be chosen again. Modules with identical credit options are grouped together, with BA and MA codes on separate lines and the credit options displayed once. Different credit options remain separate.

"use strict";
const D = window.TIMETABLE_DATA,
  $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const courses = new Map(D.courses.map((c) => [c.id, c]));
const updatedAt = new Date(D.updated);
$("#data-updated").textContent =
  "Last synced with ALMA: " +
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
    timeZoneName: "short",
  }).format(updatedAt);
$("#data-updated").setAttribute("datetime", D.updated);

const DAY = 86400000,
  parse = (s) => new Date(s + "T12:00:00Z"),
  iso = (d) => d.toISOString().slice(0, 10),
  add = (s, n) => iso(new Date(parse(s).getTime() + n * DAY));
const fmt = (s, opts = { day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(
    parse(s),
  );
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
function readStore(k, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
let selected = new Set(
    readStore("atlas-courses-v1", []).filter((id) => courses.has(id)),
  ),
  tutorials = new Set(readStore("atlas-tutorials-v2", [])),
  mine = false,
  view = readStore("atlas-view-v1", "week");
const params = new URLSearchParams(location.hash.slice(1));
let week = D.weeks.findIndex(
  (w) => today >= w.monday && today <= add(w.monday, 6),
);
if (week < 0) week = today > D.weeks.at(-1).monday ? D.weeks.length - 1 : 0;
if (D.weeks.some((w) => w.monday === params.get("week")))
  week = D.weeks.findIndex((w) => w.monday === params.get("week"));
if (params.has("courses")) {
  selected = new Set(
    params
      .get("courses")
      .split(",")
      .filter((id) => courses.has(id)),
  );
  mine = true;
}
if (params.has("courses"))
  tutorials = new Set(
    (params.get("tutorials") || "").split(",").filter(Boolean),
  );
let creditChoices = readStore("atlas-credits-v1", {});
if (!creditChoices || typeof creditChoices !== "object" || Array.isArray(creditChoices))
  creditChoices = {};
if (params.has("courses")) {
  creditChoices = Object.fromEntries(
    (params.get("credits") || "").split(",").map((entry) => entry.split(":"))
      .filter(([id, value]) => selected.has(id) && value && Number.isFinite(Number(value)))
      .map(([id, value]) => [id, Number(value)]),
  );
}
let moduleChoices = readStore("atlas-modules-v1", {}),
  assessmentChoices = readStore("atlas-assessments-v1", {}),
  moduleOverview = "assigned";
for (const value of [moduleChoices, assessmentChoices]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    moduleChoices = {}; assessmentChoices = {}; break;
  }
}
if (params.has("courses")) {
  moduleChoices = Object.fromEntries((params.get("allocations") || "").split(",")
    .map((entry) => entry.split(":"))
    .filter(([id, code]) => selected.has(id) && courses.get(id).creditOptions.some((m) => m.code === code)));
  try {
    const shared = JSON.parse(params.get("assessments") || "{}");
    assessmentChoices = shared && typeof shared === "object" && !Array.isArray(shared) ? shared : {};
  } catch { assessmentChoices = {}; }
}
let mobileDay = 0;
const sidebarStoreKey = matchMedia("(max-width:740px)").matches
  ? "atlas-sidebar-collapsed-mobile-v1"
  : "atlas-sidebar-collapsed-v1";
let sidebarCollapsed =
  readStore(sidebarStoreKey, matchMedia("(max-width:740px)").matches) === true;
let query = params.get("q") || "",
  programme = (params.get("programme") || "").split(",").filter((p) => ["ASW-BA", "ASW-MA", "ISCL-BA", "ISCL-MA"].includes(p)).join(","),
  moduleCode = params.get("module") || "",
  kind = params.get("kind") || "";
const sessionKey = (e) => e.courseId + ":" + e.series;
function persist() {
  try {
    localStorage.setItem("atlas-courses-v1", JSON.stringify([...selected]));
    localStorage.setItem("atlas-tutorials-v2", JSON.stringify([...tutorials]));
    localStorage.setItem("atlas-view-v1", JSON.stringify(view));
    localStorage.setItem("atlas-credits-v1", JSON.stringify(creditChoices));
    localStorage.setItem("atlas-modules-v1", JSON.stringify(moduleChoices));
    localStorage.setItem("atlas-assessments-v1", JSON.stringify(assessmentChoices));
    localStorage.setItem("atlas-module-overview-v2", JSON.stringify(moduleOverview));
  } catch {
    toast("Browser storage is unavailable. Your choices last for this visit.");
  }
}
function courseMatches(c) {
  return (
    (!programme || c.modules.some((m) => selectedProgrammes().some((prefix) => m.startsWith(prefix + "-")))) &&
    (!moduleCode || c.modules.some((m) => selectedModuleFilters().includes(m))) &&
    (!kind || c.series.some((s) => s.kind === kind)) &&
    (!query ||
      [
        c.name,
        ...c.modules,
        ...c.series.map((s) => s.teacher),
        ...c.series.map((s) => s.room),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()))
  );
}
function matchingCourses() {
  return D.courses.filter(courseMatches);
}
function filteredEvents(allSemester = false) {
  const ids = mine ? selected : new Set(matchingCourses().map((c) => c.id));
  const monday = D.weeks[week].monday;
  return D.events
    .filter(
      (e) =>
        ids.has(e.courseId) &&
        (!mine || selected.has(e.courseId)) &&
        (mine || !kind || e.kind === kind) &&
        (!mine || e.kind !== "Tutorial" || tutorials.has(sessionKey(e))) &&
        (allSemester || (e.date >= monday && e.date <= add(monday, 4))),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        courses
          .get(a.courseId)
          .name.localeCompare(courses.get(b.courseId).name),
    );
}
function creditGroups(c) {
  const groups = new Map();
  for (const m of c.creditOptions) {
    const signature = JSON.stringify(m.options);
    if (!groups.has(signature))
      groups.set(signature, { codes: [], options: m.options });
    groups.get(signature).codes.push(m.code);
  }
  return [...groups.values()];
}
function compactModuleLines(codes) {
  const groups = new Map();
  for (const code of new Set(codes)) {
    const match = code.match(/^(.*-(?:BA|MA)-)(\d+(?:\.\d+)?[a-z]?)$/);
    const prefix = match ? match[1] : "",
      suffix = match ? match[2] : code;
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(suffix);
  }
  return [...groups].map(
    ([prefix, suffixes]) =>
      prefix +
      suffixes
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .join("/"),
  );
}
function creditText(c) {
  return creditGroups(c)
    .map(
      (g) =>
        g.codes.join(" / ") +
        " — " +
        g.options
          .map(
            (o) =>
              o.points.join(" / ") +
              " CP" +
              (o.qualifier ? " (" + o.qualifier + ")" : ""),
          )
          .join("; "),
    )
    .join("\n");
}
function creditHTML(c) {
  return creditGroups(c)
    .map(
      (g) =>
        `<div class="credit-group"><div class="module-codes"><strong>${esc(g.codes.join(" / "))}</strong></div><div class="credit-options">${g.options.map((o) => esc(o.points.join(" / ") + " CP" + (o.qualifier ? " (" + o.qualifier + ")" : ""))).join("<br>")}</div></div>`,
    )
    .join("");
}
// Targets from the supplied Computational Linguistics handbooks (June 2023),
// BA section 3.1 and MA sections 3.1–3.2. ASW MA targets are not verified here.
const moduleTargets = {
  "ASW-BA-01": [6, "Linguistic Fundamentals"],
  "ASW-BA-02": [6, "Methods I"],
  "ASW-BA-03": [6, "Methods II"],
  "ASW-BA-04": [9, "Phonetics and Phonology"],
  "ASW-BA-05": [9, "Syntax and Semantics"],
  "ASW-BA-06": [9, "Psycholinguistics"],
  "ASW-BA-07": [9, "Semantics and Pragmatics"],
  "ASW-BA-08": [12, "Language and Cognition"],
  "ASW-BA-09": [12, "Variation, Evolution and Change"],
  "ASW-BA-10": [9, "Language Use"],
  "ISCL-BA-01": [12, "Introduction to Computational Linguistics"],
  "ISCL-BA-02": [15, "Transferable Professional Skills I"],
  "ISCL-BA-03": [6, "Transferable Professional Skills II"],
  "ISCL-BA-04": [12, "Programming Foundations"],
  "ISCL-BA-05": [6, "Text Technology"],
  "ISCL-BA-06": [6, "Parsing"],
  "ISCL-BA-07": [12, "Advanced Programming"],
  "ISCL-BA-08": [9, "Statistical Methods in Computational Linguistics"],
  "ISCL-BA-09": [9, "Grammar Formalisms"],
  "ISCL-BA-10": [9, "Internship"],
  "ISCL-BA-11": [15, "Specialisation"],
  "ISCL-BA-12": [12, "Final Examination"],
  "ISCL-MA-01": [15, "Core: Orientation"],
  "ISCL-MA-02": [15, "Supplementary: Foundations"],
  "ISCL-MA-03": [15, "Core: Advanced Studies"],
  "ISCL-MA-04": [15, "Supplementary: Interdisciplinary Context"],
  "ISCL-MA-05": [15, "Core: Specialisation"],
  "ISCL-MA-06": [15, "Supplementary: Practice / Interdisciplinary Studies"],
  "ISCL-MA-07": [30, "Thesis and Final Examination"],
};
function chosenModule(c) {
  return c.creditOptions.find((m) => m.code === moduleChoices[c.id]) || c.creditOptions[0];
}
// Tutorial entries are components of a course total, not extra selectable groups.
function assessmentOptions(c) {
  const module = chosenModule(c);
  if (!module) return [];
  const components = module.options.filter((o) => /^tutorial$/i.test(o.qualifier));
  const main = module.options.filter((o) => !/^tutorial$/i.test(o.qualifier));
  let additions = [0];
  for (const component of components)
    additions = additions.flatMap((sum) => component.points.map((n) => sum + n));
  const variants = main.flatMap((o) => o.points.flatMap((points) => additions.map((extra) => ({
    points: points + extra, qualifier: o.qualifier || "", key: JSON.stringify([points + extra, o.qualifier || ""]),
  }))));
  return [...new Map(variants.filter((o) => Number.isFinite(o.points) && o.points > 0).map((o) => [o.key, o])).values()];
}
function ectsOptions(c) {
  const variants = assessmentOptions(c);
  return { values: [...new Set(variants.map((o) => o.points))].sort((a, b) => a - b), defaultValue: variants[0]?.points };
}
function chosenAssessment(c) {
  const variants = assessmentOptions(c), value = Number(creditChoices[c.id]);
  return variants.find((o) => o.key === assessmentChoices[c.id] && o.points === value)
    || variants.find((o) => o.points === value) || variants[0];
}
function chosenCredits(c) { return chosenAssessment(c)?.points; }
function ectsTotal() {
  return [...selected].reduce((sum, id) => sum + (chosenCredits(courses.get(id)) || 0), 0);
}
function progressModule(code) {
  return /^ISCL-MA-(04|06)\.2$/.test(code) ? code.split(".")[0] : code;
}
function moduleProgress() {
  const totals = new Map();
  for (const id of selected) {
    const c = courses.get(id), module = chosenModule(c);
    if (!module) continue;
    const code = progressModule(module.code);
    if (!totals.has(code)) totals.set(code, { credits: 0, courses: [] });
    totals.get(code).credits += chosenCredits(c) || 0;
    totals.get(code).courses.push(c.name);
  }
  return totals;
}
// This is a plan against handbook requirements, not an examination audit.
const baCoreChoices = ["ASW-BA-04", "ASW-BA-05", "ASW-BA-07"];
const baElectives = Object.keys(moduleTargets).filter((code) => /^ASW-BA-0[4-9]$|^ASW-BA-10$/.test(code));
const baCompulsoryGroups = [
  { title: "Foundations", codes: ["ASW-BA-01", "ASW-BA-02", "ASW-BA-03", "ISCL-BA-01", "ISCL-BA-04"] },
  { title: "Computational linguistics and programming", codes: ["ISCL-BA-05", "ISCL-BA-06", "ISCL-BA-07", "ISCL-BA-08", "ISCL-BA-09"] },
  { title: "Professional and language skills", codes: ["ISCL-BA-02", "ISCL-BA-03"] },
  { title: "Practice and specialisation", codes: ["ISCL-BA-10", "ISCL-BA-11"] },
  { title: "Final thesis", codes: ["ISCL-BA-12"] },
];
const baModuleRequirements = {
  "ASW-BA-01": ["Introduction to Linguistics · 6 ECTS; graded examination.", "No prerequisites."],
  "ASW-BA-02": ["Logic · 3 ECTS + Programming and Data Analysis · 3 ECTS.", "No prerequisites. The catalogue currently assigns Programming and Data Analysis to ASW-BA-03; confirm the correct registration allocation with the examination office."],
  "ASW-BA-03": ["Mathematical Methods: Statistics · 6 ECTS; graded examination.", "No prerequisites."],
  "ISCL-BA-01": ["Introduction to Computational Linguistics · 3 ECTS + DSA I seminar · 6 ECTS + DSA I tutorial · 3 ECTS.", "No prerequisites."],
  "ISCL-BA-02": ["15 ECTS from Studium Professionale; ungraded.", "No prerequisites."],
  "ISCL-BA-03": ["6 ECTS of language courses; ungraded. German as a foreign language for non-native German speakers; an eligible new foreign language for native German speakers.", "No prerequisites."],
  "ISCL-BA-04": ["DSA II seminar · 6 ECTS + tutorial · 6 ECTS; examination and programming assignments.", "Prerequisite: ISCL-BA-01."],
  "ISCL-BA-05": ["Text Technology · 6 ECTS; examination and required programming assignments.", "No prerequisites."],
  "ISCL-BA-06": ["Parsing · 6 ECTS; examination and required programming assignments.", "Prerequisites: ASW-BA-01, ISCL-BA-01 and ISCL-BA-04."],
  "ISCL-BA-07": ["DSA III seminar · 6 ECTS + tutorial · 6 ECTS; examination and programming assignments.", "Prerequisites: ISCL-BA-01 and ISCL-BA-04."],
  "ISCL-BA-08": ["Statistical Language Processing seminar · 6 ECTS + tutorial · 3 ECTS; examination and programming assignments.", "Prerequisites: ISCL-BA-06 and ISCL-BA-07."],
  "ISCL-BA-09": ["Grammar Formalisms seminar · 3 ECTS + exercises · 6 ECTS; graded examination in the exercises.", "Prerequisites: ASW-BA-01, ASW-BA-02 and ISCL-BA-01."],
  "ISCL-BA-10": ["Software internship · 9 ECTS. At least 190 programming hours; written documentation and a 20-minute presentation, each weighted 50%.", "Prerequisite: passed intermediate examination (Zwischenprüfung)."],
  "ISCL-BA-11": ["Advanced seminar work · 6 ECTS + graded advanced seminar work · 9 ECTS. Smaller seminars may be combined; assessment usually includes a presentation and paper.", "Prerequisite: passed intermediate examination (Zwischenprüfung)."],
  "ISCL-BA-12": ["B.A. thesis · 12 ECTS; typically 20–25 pages.", "Prerequisites: passed intermediate examination and ISCL-BA-02, 03, 10 and 11."],
  "ASW-BA-04": ["Phonetics and Phonology seminar · 6 ECTS + required tutorial · 3 ECTS; graded seminar examination.", "Prerequisites: ASW-BA-01 and ASW-BA-02."],
  "ASW-BA-05": ["Syntax and Semantics seminar · 6 ECTS + required tutorial · 3 ECTS; graded seminar examination.", "Prerequisites: ASW-BA-01 and ASW-BA-02."],
  "ASW-BA-06": ["Psycholinguistics seminar · 6 ECTS + required tutorial · 3 ECTS; graded seminar examination.", "Prerequisites: ASW-BA-01 and ASW-BA-02. Optional elective; does not replace one of the two required choices from 04/05/07."],
  "ASW-BA-07": ["Semantics and Pragmatics seminar · 6 ECTS + required tutorial · 3 ECTS; graded seminar examination.", "Prerequisites: ASW-BA-01 and ASW-BA-02."],
  "ASW-BA-08": ["Graded Language and Cognition advanced seminar · 6 ECTS + ungraded project · 6 ECTS.", "Prerequisites: ASW-BA-01, ASW-BA-02 and ASW-BA-03."],
  "ASW-BA-09": ["Graded Variation, Evolution and Change advanced seminar · 6 ECTS + ungraded project · 6 ECTS.", "Prerequisites: ASW-BA-01, ASW-BA-02 and ASW-BA-03."],
  "ASW-BA-10": ["Graded Language Use advanced seminar · 6 ECTS + ungraded project · 3 ECTS.", "Prerequisites: ASW-BA-01, ASW-BA-02 and ASW-BA-03."],
};
function baPlan(totals = moduleProgress()) {
  const credits = (code) => totals.get(code)?.credits || 0;
  const capped = (codes) => codes.reduce((sum, code) => sum + Math.min(credits(code), moduleTargets[code][0]), 0);
  const compulsory = baCompulsoryGroups.flatMap((group) => group.codes);
  const elective = capped(baElectives), required = capped(compulsory);
  return { required, elective, degree: required + Math.min(elective, 39),
    coreCovered: baCoreChoices.filter((code) => credits(code) >= moduleTargets[code][0]),
    coreStarted: baCoreChoices.filter((code) => credits(code) > 0),
    outside: [...totals].filter(([code]) => !compulsory.includes(code) && !baElectives.includes(code))
      .reduce((sum, [, entry]) => sum + entry.credits, 0),
  };
}
function moduleProgressCard(code, totals, handbook = false) {
  const entry = totals.get(code), planned = entry?.credits || 0, target = moduleTargets[code];
  const requirements = handbook && baModuleRequirements[code];
  return `<article class="module-progress-item"><div class="module-progress-title"><strong>${esc(code)}</strong><span>${planned}${target ? " / " + target[0] : ""} ECTS</span></div>${target ? `<p>${esc(target[1])}</p><progress max="${target[0]}" value="${Math.min(planned, target[0])}" aria-label="${esc(code)} planned credits">${planned} / ${target[0]}</progress><small>${planned > target[0] ? (planned - target[0]) + " ECTS above credit target" : planned === target[0] ? "Credit target covered in plan · Requirements still apply" : (target[0] - planned) + " ECTS remaining to plan"}</small>` : '<small>Target not verified · Assigned credits only</small>'}${entry ? `<p class="module-course-names">${entry.courses.map(esc).join(" · ")}</p>` : '<p class="module-course-names">No course assigned in this timetable.</p>'}${requirements ? `<details class="module-requirements"><summary>Required components & prerequisites</summary><p>${esc(requirements[0])}</p><p>${esc(requirements[1])}</p></details>` : ""}</article>`;
}
function renderBARequirements(totals) {
  const plan = baPlan(totals);
  const metric = (title, value, target, note) => `<div class="ba-metric"><span>${title}</span><strong>${value} / ${target} ECTS</strong><progress max="${target}" value="${Math.min(value, target)}" aria-label="${title}, planned credits"></progress><small>${note}</small></div>`;
  return `<div class="ba-handbook"><div class="ba-intro"><h3>ISCL B.A. · Degree requirements</h3><p>180 ECTS = 141 compulsory + 39 ASW elective credits. Based on the June 2023 module handbook, §§3–4.</p></div><div class="ba-metrics">${metric("B.A. credits in this plan", plan.degree, 180, "Capped by module and elective-area targets; not certified degree progress.")}${metric("Compulsory modules", plan.required, 141, "Every compulsory module and its required components must be fulfilled.")}${metric("ASW elective area", plan.elective, 39, Math.max(0, 39 - plan.elective) + " ECTS remaining to plan; excess cannot replace compulsory credits.")}</div><div class="ba-core-rule"><h4>Required elective choice · At least two of ASW-BA-04 / 05 / 07</h4><p><strong>${plan.coreCovered.length} / 2 module credit targets covered in this plan</strong> · ${plan.coreStarted.length} started. ${plan.coreCovered.length >= 2 ? "Credit coverage reached; required seminars, tutorials and assessments still need confirmation." : "Still plan " + (2 - plan.coreCovered.length) + " more full module credit target(s) from these three."}</p><div class="ba-choice-status">${baCoreChoices.map((code) => `<span class="${plan.coreCovered.includes(code) ? "covered" : ""}">${code} · ${totals.get(code)?.credits || 0} / 9 ECTS</span>`).join("")}</div></div><p class="ba-planning-note">This view tracks this timetable only, not passed exams or previous credits. Numeric targets do not prove component completion or prerequisite eligibility. Counting partial elective modules toward the final 39 ECTS remains unconfirmed.</p>${plan.outside ? `<p class="ba-planning-note">${plan.outside} ECTS assigned outside the ISCL B.A. structure are excluded from the B.A. totals above.</p>` : ""}<h3 class="ba-section-heading">Compulsory · 141 ECTS</h3>${baCompulsoryGroups.map((group, i) => {
    const target = group.codes.reduce((sum, code) => sum + moduleTargets[code][0], 0);
    const planned = group.codes.reduce((sum, code) => sum + Math.min(totals.get(code)?.credits || 0, moduleTargets[code][0]), 0);
    return `<details class="ba-module-group" ${i === 0 ? "open" : ""}><summary>${group.title}<span>${planned} / ${target} ECTS</span></summary><div class="module-progress-grid">${group.codes.map((code) => moduleProgressCard(code, totals, true)).join("")}</div></details>`;
  }).join("")}<h3 class="ba-section-heading">ASW electives · Choose 39 ECTS</h3><p class="ects-note">Choose at least two of the three core modules below. The other electives are alternatives; you do not need every module.</p><h4 class="ba-subheading">Core choice · At least two required</h4><div class="module-progress-grid">${baCoreChoices.map((code) => moduleProgressCard(code, totals, true)).join("")}</div><h4 class="ba-subheading">Other elective options</h4><div class="module-progress-grid">${baElectives.filter((code) => !baCoreChoices.includes(code)).map((code) => moduleProgressCard(code, totals, true)).join("")}</div><p class="ects-note">Handbook sources: module overview pp. 6–7; compulsory modules pp. 9–24; ASW electives pp. 24–30. Catalogue/module mismatches require confirmation; no source course allocations are changed by this planner.</p></div>`;
}
function renderModuleProgress() {
  // Handbook overviews are retained for review, but are not released yet.
  moduleOverview = "assigned";
  const totals = moduleProgress();
  $("#module-overview").value = moduleOverview;
  $("#module-progress").classList.toggle("handbook-layout", moduleOverview === "BA");
  if (moduleOverview === "BA") {
    $("#module-progress").innerHTML = renderBARequirements(totals);
    return;
  }
  const codes = moduleOverview === "MA"
    ? Object.keys(moduleTargets).filter((code) => code.startsWith("ISCL-MA-")) : [...totals.keys()];
  $("#module-progress").innerHTML = codes.sort().map((code) => moduleProgressCard(code, totals)).join("")
    || '<p class="ects-note">Save a course to start planning modules.</p>';
}
function renderCredits() {
  $("#ects-planner").hidden = selected.size === 0;
  $("#ects-total").textContent = ectsTotal() + " ECTS";
  $("#ects-count").textContent = selected.size + (selected.size === 1 ? " course" : " courses");
  $("#ects-list").innerHTML = [...selected].map((id) => {
    const c = courses.get(id), variants = assessmentOptions(c), chosen = chosenAssessment(c), module = chosenModule(c);
    const creditControl = variants.length > 1
      ? `<label class="ects-select"><span>Assessment</span><select data-assessment="${esc(id)}" aria-label="Assessment and ECTS for ${esc(c.name)}">${variants.map((o) => `<option value="${esc(o.key)}" ${o.key === chosen?.key ? "selected" : ""}>${o.points} ECTS${o.qualifier ? " · " + esc(o.qualifier) : ""}</option>`).join("")}</select></label>`
      : `<span class="ects-fixed">${chosen ? chosen.points + " ECTS" + (chosen.qualifier ? " · " + esc(chosen.qualifier) : "") : "Not specified"}</span>`;
    return `<div class="ects-row" style="--course:${esc(c.color)}"><span class="swatch"></span><button class="ects-course" data-detail="${esc(id)}">${esc(c.name)}</button><div class="course-allocation"><label><span>Module</span><select data-module-choice="${esc(id)}" aria-label="Module for ${esc(c.name)}">${c.creditOptions.map((m) => `<option value="${esc(m.code)}" ${m.code === module?.code ? "selected" : ""}>${esc(m.code)}</option>`).join("")}</select></label>${creditControl}</div></div>`;
  }).join("");
  renderModuleProgress();
}
document.addEventListener("change", (event) => {
  if (event.target.id === "module-overview") {
    if (event.target.value !== "assigned") return;
    moduleOverview = event.target.value; persist(); renderModuleProgress(); return;
  }
  const input = event.target.closest("[data-module-choice], [data-assessment], [data-ects]");
  if (!input) return;
  const id = input.dataset.moduleChoice || input.dataset.assessment || input.dataset.ects, c = courses.get(id);
  if (!c || !selected.has(id)) return;
  if (input.dataset.moduleChoice) {
    if (!c.creditOptions.some((m) => m.code === input.value)) return;
    const previous = chosenAssessment(c);
    moduleChoices[id] = input.value;
    const variants = assessmentOptions(c);
    const next = variants.find((o) => o.key === previous?.key)
      || variants.find((o) => o.points === previous?.points) || variants[0];
    creditChoices[id] = next?.points; assessmentChoices[id] = next?.key;
  } else if (input.dataset.assessment) {
    const option = assessmentOptions(c).find((o) => o.key === input.value);
    if (!option) return;
    creditChoices[id] = option.points; assessmentChoices[id] = option.key;
  } else {
    const value = Number(input.value);
    if (!ectsOptions(c).values.includes(value)) return;
    creditChoices[id] = value; delete assessmentChoices[id];
  }
  persist(); renderCredits(); updateHash();
});
function chosenTutorials(id) {
  return courses
    .get(id)
    .series.filter(
      (s) => s.kind === "Tutorial" && tutorials.has(id + ":" + s.n),
    );
}
function isSaved(e) {
  return (
    selected.has(e.courseId) &&
    (e.kind !== "Tutorial" || tutorials.has(sessionKey(e)))
  );
}
function clearTutorials(id) {
  for (const key of tutorials)
    if (key.startsWith(id + ":")) tutorials.delete(key);
}
function chooseSession(id, n) {
  const c = courses.get(id),
    s = c.series.find((s) => s.n === Number(n));
  if (!s) return;
  selected.add(id);
  if (s.kind === "Tutorial") {
    const key = id + ":" + s.n;
    if (tutorials.has(key)) tutorials.delete(key);
    else tutorials.add(key);
  } else if (
    c.series.some((x) => x.kind === "Tutorial") &&
    !chosenTutorials(id).length
  )
    toast("Seminars added. Choose a highlighted tutorial group.");
  persist();
  render();
}
function displayEvents() {
  return filteredEvents();
}
function selectedProgrammes() {
  return [...new Set(programme.split(",").filter(Boolean))];
}
function selectedModuleFilters() {
  return [...new Set(moduleCode.split(",").filter(Boolean))];
}
function options() {
  const programmes = selectedProgrammes();
  $("#programme-summary").textContent = programmes.length ? programmes.join(", ") : "All programmes";
  $("#programme").innerHTML = `<label class="module-filter-option"><input type="checkbox" data-filter-programme="" ${programmes.length ? "" : "checked"}>All programmes</label>` +
    ["ASW-BA", "ASW-MA", "ISCL-BA", "ISCL-MA"].map((prefix) => `<label class="module-filter-option"><input type="checkbox" data-filter-programme="${prefix}" ${programmes.includes(prefix) ? "checked" : ""}>${prefix}</label>`).join("");
  const codes = [...new Set(D.courses.flatMap((c) => c.modules))]
    .filter((m) => !programme || selectedProgrammes().some((prefix) => m.startsWith(prefix + "-")))
    .sort();
  const selectedCodes = selectedModuleFilters().filter((code) => codes.includes(code));
  moduleCode = selectedCodes.join(",");
  $("#module-summary").textContent = selectedCodes.length ? selectedCodes.join(", ") : "All modules";
  $("#module").innerHTML =
    `<label class="module-filter-option"><input type="checkbox" data-filter-module="" ${selectedCodes.length ? "" : "checked"}>All modules</label>` +
    codes.map((code) => `<label class="module-filter-option"><input type="checkbox" data-filter-module="${esc(code)}" ${selectedCodes.includes(code) ? "checked" : ""}>${esc(code)}</label>`).join("");
}
$("#week-select").innerHTML = D.weeks
  .map(
    (w, i) =>
      `<option value="${i}">${fmt(w.monday)} – ${fmt(add(w.monday, 4))}</option>`,
  )
  .join("");
$("#search").value = query;
$("#programme").value = programme;
$("#kind").value = kind;
options();
let toastTimer;
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3600);
}
function updateHash() {
  const p = new URLSearchParams();
  p.set("week", D.weeks[week].monday);
  if (query) p.set("q", query);
  if (programme) p.set("programme", programme);
  if (moduleCode) p.set("module", moduleCode);
  if (kind) p.set("kind", kind);
  if (mine) {
    p.set("courses", [...selected].join(","));
    p.set("allocations", [...selected].filter((id) => chosenModule(courses.get(id))).map((id) => id + ":" + chosenModule(courses.get(id)).code).join(","));
    p.set("assessments", JSON.stringify(Object.fromEntries([...selected].filter((id) => chosenAssessment(courses.get(id))).map((id) => [id, chosenAssessment(courses.get(id)).key]))));
    p.set("credits", [...selected].filter((id) => chosenCredits(courses.get(id)) !== undefined).map((id) => id + ":" + chosenCredits(courses.get(id))).join(","));
    p.set(
      "tutorials",
      [...tutorials].filter((k) => selected.has(k.split(":")[0])).join(","),
    );
  }
  try {
    history.replaceState(null, "", "#" + p);
  } catch {}
}
function card(e) {
  const c = courses.get(e.courseId),
    saved = isSaved(e),
    tutorial = e.kind === "Tutorial",
    active = selected.has(c.id),
    candidate = tutorial && active && !saved,
    pending = candidate && !chosenTutorials(c.id).length;
  return `<article data-detail="${c.id}" data-series="${e.series}" class="event-card ${candidate ? (pending ? "tutorial-choice" : "tutorial-muted") : ""}" style="--course:${esc(c.color)}"><button class="card-save ${saved ? "saved" : ""}" ${tutorial ? `data-pick="${c.id}" data-series="${e.series}"` : `data-save="${c.id}"`} aria-label="${saved ? "Remove" : "Save"} ${esc(c.name)} ${tutorial ? "tutorial " + e.start : ""}" aria-pressed="${saved}">${saved ? "✓" : "+"}</button><button class="event-open" data-detail="${c.id}" data-series="${e.series}" aria-label="View ${esc(c.name)}, ${esc(e.kind)}, ${e.start} to ${e.end}"><div class="event-meta"><time>${e.start}–${e.end}</time><span class="event-kind">${esc(e.kind)}</span></div><h3>${esc(c.name)}</h3><div class="event-bottom"><p>${esc(e.room)}</p><p class="lecturer">${esc(e.teacher)}</p></div>${candidate ? `<p class="tutorial-prompt">${pending ? "Choose a tutorial group" : "Alternative tutorial"}</p>` : ""}</button><div class="card-footer"><span class="footer-lecturer" title="${esc(e.teacher)}">${esc(e.teacher)}</span><p class="event-modules">${compactModuleLines(
    c.modules,
  )
    .map((line) => `<span class="module-code-group">${esc(line)}</span>`)
    .join("")}</p></div></article>`;
}
// Half-open intervals: a class ending at 12:00 does not conflict with one starting at 12:00.
const minutes = (time) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
function overlapGroups(events) {
  const groups = [];
  for (const event of [...events].sort(
    (a, b) =>
      minutes(a.start) - minutes(b.start) || minutes(b.end) - minutes(a.end),
  )) {
    let group = groups.at(-1);
    if (!group || minutes(event.start) >= group.end) {
      group = {
        start: minutes(event.start),
        end: minutes(event.end),
        events: [],
        lanes: [],
        ends: [],
      };
      groups.push(group);
    }
    group.end = Math.max(group.end, minutes(event.end));
    group.events.push(event);
    let lane = group.ends.findIndex((end) => end <= minutes(event.start));
    if (lane < 0) {
      lane = group.lanes.length;
      group.lanes.push([]);
    }
    group.lanes[lane].push(event);
    group.ends[lane] = minutes(event.end);
  }
  return groups;
}
function conflictCards(events) {
  return overlapGroups(events)
    .map(
      (group) =>
        `<div class="conflict-group" style="--lanes:${group.lanes.length}"><div class="conflict-lanes">${group.lanes.map((lane) => `<div class="conflict-lane">${lane.map(card).join("")}</div>`).join("")}</div></div>`,
    )
    .join("");
}
const clockTime = (value) =>
  String(Math.floor(value / 60)).padStart(2, "0") +
  ":" +
  String(value % 60).padStart(2, "0");
function personalWeek(events, mon, heads) {
  const bands = overlapGroups(events),
    days = Array.from({ length: 5 }, (_, i) =>
      events.filter((e) => e.date === add(mon, i)),
    );
  return `<div class="personal-week"><div class="day-headers">${heads}</div>${bands.map((band) => `<section class="time-section"><h3 class="time-label">${clockTime(band.start)} — ${clockTime(band.end)}</h3><div class="week-row">${days.map((day) => `<div class="day-stack">${conflictCards(day.filter((e) => minutes(e.start) >= band.start && minutes(e.start) < band.end))}</div>`).join("")}</div></section>`).join("")}</div>`;
}
function applySidebar() {
  const sidebar = $("#sidebar");
  sidebar.hidden = sidebarCollapsed;
  sidebar.classList.toggle("open", !sidebarCollapsed);
  $(".app-shell").classList.toggle("sidebar-collapsed", sidebarCollapsed);
  $("#filters-toggle").hidden = !sidebarCollapsed;
  $("#filters-toggle").setAttribute("aria-expanded", String(!sidebarCollapsed));
}
function setSidebar(collapsed) {
  sidebarCollapsed = collapsed;
  applySidebar();
  try {
    localStorage.setItem(
      sidebarStoreKey,
      JSON.stringify(collapsed),
    );
  } catch {}
  fitPersonalCards();
}
function fitPersonalCardContent() {
  for (const card of $$(".personal-planning .event-card")) {
    const open = card.querySelector(".event-open"),
      title = card.querySelector("h3"),
      meta = card.querySelector(".event-meta");
    if (!open || !title || typeof title.getBoundingClientRect !== "function")
      continue;
    card.classList.remove("omit-room", "omit-teacher");
    title.style.setProperty("-webkit-line-clamp", "unset", "important");
    title.style.setProperty("max-height", "none", "important");
    title.style.setProperty("display", "block", "important");
    const lineHeight = parseFloat(getComputedStyle(title).lineHeight) || 13.2,
      natural = Math.max(
        1,
        Math.round(title.getBoundingClientRect().height / lineHeight),
      ),
      available = Math.max(
        0,
        open.getBoundingClientRect().height -
          meta.getBoundingClientRect().height -
          5,
      ),
      lines = Math.max(
        1,
        Math.min(natural, Math.floor(available / lineHeight)),
      ),
      remaining = available - lines * lineHeight;
    for (const property of ["-webkit-line-clamp", "max-height", "display"])
      title.style.removeProperty(property);
    card.style.setProperty("--card-title-lines", lines);
    card.style.setProperty(
      "--card-room-lines",
      Math.max(1, Math.floor(remaining / 10)),
    );
    card.classList.toggle("omit-room", remaining < 10);
  }
}
function personalCardHeight(viewportHeight, gridTop, overhead, rows) {
  // Use the visible viewport after scrolling past the header; retain readable cards
  // when the header or an expanded planner leaves too little room for four rows.
  return Math.max(96, Math.floor(
    (viewportHeight - Math.max(0, gridTop) - overhead - 12) / Math.max(4, rows),
  ));
}
function fitPersonalCards() {
  const grid = $(".personal-week");
  if (
    !grid ||
    typeof grid.getBoundingClientRect !== "function" ||
    !window.innerHeight
  ) {
    fitPersonalCardContent();
    return;
  }
  const sections = [...grid.querySelectorAll(".time-section")];
  let rows = 0,
    cardSpace = 0;
  for (const section of sections) {
    const count = Math.max(
        1,
        ...[...section.querySelectorAll(".conflict-lane")].map(
          (lane) => lane.children.length,
        ),
      ),
      card = section.querySelector(".event-card");
    if (card) {
      rows += count;
      cardSpace += count * card.getBoundingClientRect().height;
    }
  }
  if (!rows) return;
  const rect = grid.getBoundingClientRect(),
    overhead = rect.height - cardSpace,
    height = personalCardHeight(window.innerHeight, rect.top, overhead, rows);
  grid.style.setProperty("--personal-card-height", height + "px");
  grid.style.setProperty(
    "--personal-title-lines",
    Math.max(1, Math.floor((height - 43) / 13.2)),
  );
  fitPersonalCardContent();
}
function render() {
  applySidebar();
  renderCredits();
  $("main").classList.toggle("personal-planning", mine);
  const list = matchingCourses();
  $("#course-count").textContent = list.length;
  $("#saved-count").textContent = selected.size;
  $("#course-list").innerHTML =
    list
      .map(
        (c) =>
          `<div class="course-item" style="--course:${esc(c.color)}"><span class="swatch"></span><button class="course-name" data-detail="${c.id}">${esc(c.name)}</button><button class="save-button ${selected.has(c.id) ? "saved" : ""}" data-save="${c.id}" aria-label="${selected.has(c.id) ? "Remove" : "Save"} ${esc(c.name)}" aria-pressed="${selected.has(c.id)}">${selected.has(c.id) ? "✓" : "+"}</button></div>`,
      )
      .join("") || '<p class="save-empty">No courses match these filters.</p>';
  $("#all-tab").classList.toggle("active", !mine);
  $("#my-tab").classList.toggle("active", mine);
  $("#all-tab").setAttribute("aria-selected", String(!mine));
  $("#my-tab").setAttribute("aria-selected", String(mine));
  $("#week-view").classList.toggle("active", view === "week");
  $("#agenda-view").classList.toggle("active", view === "agenda");
  $("#week-view").setAttribute("aria-pressed", String(view === "week"));
  $("#agenda-view").setAttribute("aria-pressed", String(view === "agenda"));
  const mon = D.weeks[week].monday,
    events = displayEvents(),
    scheduled = filteredEvents(),
    unique = new Set(scheduled.map((e) => e.courseId)).size;
  $("#week-title").textContent =
    fmt(mon, { day: "numeric" }) +
    "–" +
    fmt(add(mon, 4), { day: "numeric", month: "long" });
  if (parse(mon).getUTCMonth() !== parse(add(mon, 4)).getUTCMonth())
    $("#week-title").textContent = fmt(mon) + " – " + fmt(add(mon, 4));
  $("#week-number").textContent =
    "SEMESTER WEEK " + String(week + 1).padStart(2, "0");
  $("#week-select").value = week;
  $("#prev").disabled = week === 0;
  $("#next").disabled = week === D.weeks.length - 1;
  $("#result-info").textContent = "";
  $("#context-note").textContent = mine
    ? "Only selected sessions are shown. Overlapping courses appear side by side."
    : "";
  $("#context-note").parentElement.hidden = !mine;
  $("#export").disabled = filteredEvents(true).length === 0;
  if (!events.length) {
    const emptyMine = mine && !selected.size;
    $("#schedule").innerHTML =
      `<div class="no-events"><span class="empty-icon">${emptyMine ? "＋" : "✳"}</span><h3>${emptyMine ? "Make this semester yours." : "A little room to breathe."}</h3><p>${emptyMine ? "Add courses with +, then come back to see your own timetable." : query || programme || moduleCode || kind ? "No meetings match your filters this week. Try another week or reset your filters." : "No scheduled meetings this week. Cancellations and the semester break are already accounted for."}</p><button class="button dark" id="empty-action">${emptyMine ? "Explore courses" : "Reset filters"}</button></div>`;
    $("#empty-action").onclick = () => {
      if (emptyMine) mine = false;
      else resetFilters();
      render();
    };
  } else if (view === "agenda" || matchMedia("(max-width:740px)").matches) {
    const mobile = matchMedia("(max-width:740px)").matches;
    const mobileNav = mobile
      ? '<div class="mobile-days" aria-label="Choose day">' +
        Array.from(
          { length: 5 },
          (_, i) =>
            `<button data-day="${i}" aria-pressed="${i === mobileDay}" class="${i === mobileDay ? "active" : ""}">${fmt(add(mon, i), { weekday: "short" })}<strong>${fmt(add(mon, i), { day: "numeric" })}</strong></button>`,
        ).join("") +
        "</div>"
      : "";
    $("#schedule").innerHTML =
      mobileNav +
      Array.from({ length: 5 }, (_, i) => i)
        .filter((i) => !mobile || i === mobileDay)
        .map((i) => {
          const date = add(mon, i),
            dayEvents = events.filter((e) => e.date === date);
          return `<section class="agenda-day"><div class="agenda-day-heading"><strong>${fmt(date, { weekday: "long" })}</strong><span>${fmt(date)}${date === today ? " · Today" : ""}</span></div><div class="agenda-cards ${mine ? "personal-agenda" : ""}">${(mine ? conflictCards(dayEvents) : dayEvents.map(card).join("")) || '<p class="day-empty">No scheduled courses.</p>'}</div></section>`;
        })
        .join("");
  } else {
    const heads = Array.from({ length: 5 }, (_, i) => {
      const date = add(mon, i);
      return `<div class="day-header ${date === today ? "today" : ""}"><span>${fmt(date, { weekday: "short" }).toUpperCase()}</span><strong>${fmt(date, { day: "numeric" })}</strong></div>`;
    }).join("");
    const bands = [
      ...new Set(
        events.map((e) =>
          Number(e.start.slice(0, 2)) < 12
            ? 8
            : Math.floor(Number(e.start.slice(0, 2)) / 2) * 2,
        ),
      ),
    ].sort((a, b) => a - b);
    $("#schedule").innerHTML = mine
      ? personalWeek(events, mon, heads)
      : `<div class="day-headers">${heads}</div>` +
        bands
          .map(
            (b) =>
              `<section class="time-section"><h3 class="time-label">${b === 8 ? clockTime(Math.min(...events.filter((e) => minutes(e.start) < 720).map((e) => minutes(e.start)))) : String(b).padStart(2, "0") + ":00"} — ${String(b === 8 ? 12 : b + 2).padStart(2, "0")}:00</h3><div class="week-row">${Array.from(
                { length: 5 },
                (_, i) =>
                  `<div class="day-stack">${events
                    .filter(
                      (e) =>
                        e.date === add(mon, i) &&
                        Number(e.start.slice(0, 2)) >= b &&
                        Number(e.start.slice(0, 2)) < (b === 8 ? 12 : b + 2),
                    )
                    .map(card)
                    .join("")}</div>`,
              ).join("")}</div></section>`,
          )
          .join("");
  }
  updateHash();
  fitPersonalCards();
}
function saveCourse(id) {
  if (selected.has(id)) {
    selected.delete(id);
    clearTutorials(id);
  } else {
    selected.add(id);
    clearTutorials(id);
    if (courses.get(id).series.some((s) => s.kind === "Tutorial"))
      toast("Seminars added. Choose a highlighted tutorial group.");
  }
  persist();
  render();
}
function openDetail(id, series) {
  const c = courses.get(id);
  if (!c) return;
  const sorted = [...c.series].sort(
    (a, b) =>
      (a.weekday ?? 0) - (b.weekday ?? 0) || a.start.localeCompare(b.start),
  );
  $("#detail-content").innerHTML =
    `<div class="detail-top"><span class="course-chip" style="--course:${c.color}">${esc([...new Set(c.series.map((s) => s.kind))].join(" + "))}</span><h2>${esc(c.name)}</h2></div><div class="detail-actions"><button class="button dark" id="detail-save">${selected.has(id) ? "✓ Saved · Remove course" : "+ Add to my timetable"}</button><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">View on ALMA ↗</a>${c.moodleUrl ? `<a href="${esc(c.moodleUrl)}" target="_blank" rel="noopener noreferrer">View on Moodle ↗</a>` : ""}</div><h3 class="detail-heading">SESSIONS THIS SEMESTER</h3>${sorted
      .map((s) => {
        const key = id + ":" + s.n,
          isChosen = selected.has(id) && tutorials.has(key);
        return `<div class="session ${Number(series) === s.n ? "event-highlight" : ""} ${s.kind === "Tutorial" && !isChosen ? "tutorial-session-choice" : ""}"><strong>${s.weekday === null ? "Block course" : esc(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][s.weekday])} ${s.start}–${s.end}</strong><span class="session-type">${esc(s.kind)}</span><p>${esc(s.room)}<br>${esc(s.teacher)}</p><p class="period">${fmt(s.first, { day: "2-digit", month: "short", year: "numeric" })} – ${fmt(s.last, { day: "2-digit", month: "short", year: "numeric" })}${s.isBlock ? " · Specific dates" : ""}</p>${
          s.canceled.filter(
            (x) => iso(new Date(x)) >= s.first && iso(new Date(x)) <= s.last,
          ).length
            ? `<p class="period">No class: ${s.canceled
                .filter(
                  (x) =>
                    iso(new Date(x)) >= s.first && iso(new Date(x)) <= s.last,
                )
                .map((x) => fmt(iso(new Date(x))))
                .join(", ")}</p>`
            : ""
        }${s.kind === "Tutorial" ? `<button class="group-action" data-group="${esc(key)}">${isChosen ? "✓ Selected · Remove this tutorial" : "＋ Choose this tutorial"}</button>` : ""}</div>`;
      })
      .join(
        "",
      )}${c.note ? `<p class="detail-note">${esc(c.note)}</p>` : ""}<h3 class="detail-heading">MODULES & CREDIT OPTIONS</h3>${creditHTML(c)}`;
  $("#detail-save").onclick = () => {
    saveCourse(id);
    openDetail(id, series);
  };
  $("#detail-content")
    .querySelectorAll("[data-group]")
    .forEach(
      (btn) =>
        (btn.onclick = () => {
          chooseSession(id, Number(btn.dataset.group.split(":")[1]));
          openDetail(id, series);
        }),
    );
  if (!$("#detail-dialog").open) $("#detail-dialog").showModal();
}
function resetFilters() {
  query = programme = moduleCode = kind = "";
  $("#search").value = "";
  $("#programme").value = "";
  $("#kind").value = "";
  options();
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("#module-filter")) $("#module-filter").open = false;
  if (!e.target.closest("#programme-filter")) $("#programme-filter").open = false;
  const day = e.target.closest("[data-day]");
  if (day) {
    mobileDay = Number(day.dataset.day);
    render();
    return;
  }
  const pick = e.target.closest("[data-pick]");
  if (pick) {
    chooseSession(pick.dataset.pick, pick.dataset.series);
    return;
  }
  const save = e.target.closest("[data-save]"),
    detail = e.target.closest("[data-detail]");
  if (save) saveCourse(save.dataset.save);
  else if (detail) openDetail(detail.dataset.detail, detail.dataset.series);
});
$$(".dialog-close").forEach(
  (b) => (b.onclick = () => b.closest("dialog").close()),
);
$$("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  }),
);
$("#search").oninput = (e) => {
  query = e.target.value.trim();
  render();
};
$("#programme").onchange = (e) => {
  const input = e.target.closest("[data-filter-programme]");
  if (!input) return;
  const prefix = input.dataset.filterProgramme;
  const choices = new Set(selectedProgrammes());
  if (!prefix) {
    choices.clear();
    $("#programme-filter").open = false;
  }
  else if (input.checked) choices.add(prefix);
  else choices.delete(prefix);
  programme = [...choices].join(",");
  options();
  render();
};
$("#module").onchange = (e) => {
  const input = e.target.closest("[data-filter-module]");
  if (!input) return;
  const code = input.dataset.filterModule;
  const choices = new Set(selectedModuleFilters());
  if (!code) {
    choices.clear();
    $("#module-filter").open = false;
  }
  else if (input.checked) choices.add(code);
  else choices.delete(code);
  moduleCode = [...choices].join(",");
  options();
  render();
};
$("#kind").onchange = (e) => {
  kind = e.target.value;
  render();
};
$("#reset").onclick = () => {
  resetFilters();
  render();
};
$("#all-tab").onclick = () => {
  mine = false;
  render();
};
$("#my-tab").onclick = () => {
  mine = true;
  render();
};
$("#prev").onclick = () => {
  if (week > 0) week--;
  render();
};
$("#next").onclick = () => {
  if (week < D.weeks.length - 1) week++;
  render();
};
$("#week-select").onchange = (e) => {
  week = Number(e.target.value);
  render();
};
$("#current-week").onclick = () => {
  week = D.weeks.findIndex(
    (w) => today >= w.monday && today <= add(w.monday, 6),
  );
  if (week < 0) {
    week = today < D.weeks[0].monday ? 0 : D.weeks.length - 1;
    toast("Outside teaching dates — showing the nearest semester week.");
  }
  render();
};
$("#week-view").onclick = () => {
  view = "week";
  persist();
  render();
};
$("#agenda-view").onclick = () => {
  view = "agenda";
  persist();
  render();
};
$("#filters-toggle").onclick = () => {
  setSidebar(!sidebarCollapsed);
  if (!sidebarCollapsed && matchMedia("(max-width:740px)").matches)
    $("#sidebar").scrollIntoView({ behavior: "smooth", block: "start" });
};
$("#sidebar-close").onclick = () => {
  setSidebar(true);
  $("#filters-toggle").focus();
};
matchMedia("(max-width:740px)").addEventListener("change", render);
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
    !$$("dialog").some((d) => d.open)
  ) {
    e.preventDefault();
    setSidebar(false);
    if (matchMedia("(max-width:740px)").matches)
      $("#sidebar").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#search").focus();
  }
});
$("#share").onclick = async () => {
  if (
    location.protocol === "file:" ||
    ["localhost", "127.0.0.1"].includes(location.hostname)
  ) {
    toast("Local preview — publish the site to get a public sharing link.");
    return;
  }
  updateHash();
  try {
    await navigator.clipboard.writeText(location.href);
    toast("Link copied. It includes this week, filters and saved courses.");
  } catch {
    const input = document.createElement("textarea");
    input.value = location.href;
    document.body.append(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    toast(
      ok
        ? "View link copied."
        : "Copy the URL from your address bar to share this view.",
    );
  }
};
// Calendar export: timezone-aware UTC instants preserve Berlin wall-clock times across DST.
const calEscape = (s) =>
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const encoder = new TextEncoder();
function fold(s) {
  let lines = [],
    line = "";
  for (const ch of s) {
    if (encoder.encode(line + ch).length > 75) {
      lines.push(line);
      line = " " + ch;
    } else line += ch;
  }
  lines.push(line);
  return lines.join("\r\n");
}
function stamp(date, time) {
  const nominal = new Date(date + "T" + time + ":00Z");
  const berlin = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(nominal);
  const [h, m] = berlin.split(":").map(Number),
    [wantedH, wantedM] = time.split(":").map(Number);
  const offset = h * 60 + m - (wantedH * 60 + wantedM);
  return new Date(nominal.getTime() - offset * 60000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(".000", "");
}
function ics(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Course Atlas Tuebingen//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Course Atlas · My timetable",
    "X-WR-TIMEZONE:Europe/Berlin",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];
  const wall = (date, time) =>
    date.replace(/-/g, "") + "T" + time.replace(":", "") + "00";
  const groups = new Map();
  for (const e of events) {
    const weekday = parse(e.date).getUTCDay(),
      key = JSON.stringify([
        e.courseId,
        e.series,
        weekday,
        e.start,
        e.end,
        e.room,
      ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const revision = Number.isFinite(Date.parse(D.updated))
    ? new Date(D.updated)
    : new Date("2026-10-18T00:00:00Z");
  const dtstamp = revision
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const sequence = Math.floor(revision.getTime() / 86400000);
  for (const entries of groups.values()) {
    entries.sort((a, b) => a.date.localeCompare(b.date));
    const e = entries[0],
      last = entries.at(-1),
      c = courses.get(e.courseId),
      ms = parse(e.date).getTime() - 12 * 3600000;
    lines.push(
      "BEGIN:VEVENT",
      `UID:alma-${c.id}-${e.series}-${ms}-${e.start.replace(":", "")}@course-timetable.local`,
      "DTSTAMP:" + dtstamp,
      "SEQUENCE:" + sequence,
      "DTSTART;TZID=Europe/Berlin:" + wall(e.date, e.start),
      "DTEND;TZID=Europe/Berlin:" + wall(e.date, e.end),
      "SUMMARY:" + calEscape(c.name),
      "LOCATION:" + calEscape(e.room),
    );
    if (entries.length > 1) {
      const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
      lines.push(
        "RRULE:FREQ=WEEKLY;BYDAY=" +
          weekdays[parse(e.date).getUTCDay()] +
          ";UNTIL=" +
          stamp(last.date, e.start),
      );
      const dates = new Set(entries.map((x) => x.date)),
        excluded = [];
      for (let date = e.date; date <= last.date; date = add(date, 7))
        if (!dates.has(date)) excluded.push(wall(date, e.start));
      if (excluded.length)
        lines.push("EXDATE;TZID=Europe/Berlin:" + excluded.join(","));
    }
    lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
function download(blob, name) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
$("#export").onclick = () => {
  const events = filteredEvents(true);
  $("#export-summary").textContent =
    `${new Set(events.map((e) => e.courseId)).size} course${new Set(events.map((e) => e.courseId)).size === 1 ? "" : "s"} · ${events.length} meetings · Winter semester 2026/27`;
  $("#export-dialog").showModal();
};
$("#export-ics").onclick = () => {
  const ev = filteredEvents(true);
  download(
    new Blob([ics(ev)], { type: "text/calendar;charset=utf-8" }),
    "Course_Atlas_WiSe_2026-27.ics",
  );
  $("#export-dialog").close();
  toast("Calendar downloaded · " + ev.length + " meetings.");
};

let personalFitQueued = false;
function schedulePersonalFit() {
  if (personalFitQueued || !mine || view !== "week") return;
  personalFitQueued = true;
  const frame = window.requestAnimationFrame || ((callback) => callback());
  frame(() => { personalFitQueued = false; fitPersonalCards(); });
}
window.addEventListener?.("resize", schedulePersonalFit);
window.addEventListener?.("scroll", schedulePersonalFit, { passive: true });
document.addEventListener("toggle", (event) => {
  if (event.target.id === "ects-planner") schedulePersonalFit();
}, true);
render();

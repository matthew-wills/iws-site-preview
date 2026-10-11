/**
 * Assemble the site pages from the templates.
 *
 * CONTACT ADDRESS: the one place to set it is the CONTACT_EMAIL constant
 * below (search for it). It is deliberately unset ("TBD"); never use a
 * personal address. While unset, "Talk to us" links go to the Organisation
 * card on the download page.
 *
 *   node build-site.mjs <appCaseStudiesDir>
 *
 * <appCaseStudiesDir> is the application repository's `case-studies`
 * folder. Every folder under ./case-studies/ here that holds a meta.json
 * and has a folder of the same name over there is built:
 *
 *   shots/<slug>/            the study's screenshots, copied in
 *   exports/<slug>/          its published documents (pdf, png, md)
 *   exports/<slug>/pages/    the page-by-page renders of each document
 *   exports/<slug>/<doc>.html    a viewer per document
 *   reports/<slug>/<style>.json  the rendered reports (generated, see below)
 *   reports/<slug>/<style>.html  a page per report
 *   case-studies/<slug>.html     the study's own page
 *
 * A study whose application folder is missing, or whose reports have not
 * been rendered and cannot be rendered here, is skipped with a printed
 * note rather than failing the build.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** Synoptic is the company and the site's visual brand (the header's mark
 *  and name, with its descriptor). Investigation Workflow Suite (IWS) is
 *  the application: the name suffixed onto every page title and used
 *  wherever the copy means the software. */
const COMPANY = "Synoptic";
const DESCRIPTOR = "Safety Investigation Software";
const BRAND = "Investigation Workflow Suite (IWS)";
/** IWS_PREVIEW=1 builds the development preview: every page gets a
 *  noindex meta and a slim "Development preview" bar above the header.
 *  Without it the output is exactly the production site. */
const PREVIEW = process.env.IWS_PREVIEW === "1";
const PREVIEW_HEAD = `<meta name="robots" content="noindex, nofollow">\n`;
const PREVIEW_BAR = [
  `<style>.preview-bar{margin-inline:-20px;padding:5px 20px;background:var(--warn-soft,#fef3c7);color:var(--ink,#0f172a);border-bottom:1px solid #fcd34d;font:600 0.8rem/1.4 var(--font,system-ui,sans-serif);text-align:center}</style>`,
  `<div class="preview-bar" role="note">Development preview. Not the live site.</div>`,
].join("\n");
const appCaseStudies = process.argv[2];
if (!appCaseStudies) {
  console.error("usage: node build-site.mjs <appCaseStudiesDir>");
  process.exit(1);
}
const appRoot = join(appCaseStudies, "..");
const theme = readFileSync(join(here, "theme.css"), "utf8");
const built = [];
/** The favicon is the application's own icon: the SVG for browsers that
 *  take one, the Windows .ico (16 to 256 px) for the rest. Linked from
 *  every full page, relative to the page's depth. */
const favicons = (rel) => {
  const up = "../".repeat(rel.split(/[\\/]/).length - 1);
  return `<link rel="icon" href="${up}favicon.ico" sizes="any">\n<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">\n`;
};
const VIEWPORT = `<meta name="viewport" content="width=device-width, initial-scale=1">\n`;
const write = (rel, html) => {
  const path = join(here, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html.includes(VIEWPORT) ? html.replace(VIEWPORT, () => VIEWPORT + favicons(rel)) : html);
  built.push(rel.split("\\").join("/"));
};

/** Every page is written as a complete document: GitHub Pages serves
 *  each file as it is, so a page without a doctype, charset and viewport
 *  of its own renders in quirks mode and at desktop width on a phone. */
const document = (title, body, description) => {
  const withoutTitle = body.replace(/<title>[^<]*<\/title>\r?\n?/, "");
  const desc = description ? `<meta name="description" content="${esc(description)}">\n` : "";
  const head = `<!doctype html>\n<html lang="en-AU">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${PREVIEW ? PREVIEW_HEAD : ""}<title>${title}</title>\n${desc}`;
  // The template opens with its <style>; the head closes after it and the
  // body opens, so the markup that follows lands where it should.
  const bodyOpen = `</style>\n</head>\n<body>${PREVIEW ? `\n${PREVIEW_BAR}` : ""}`;
  const page = PREVIEW ? withoutTitle : launchPlaceholders(withoutTitle);
  return `${head}${page.replace("</style>", () => bodyOpen)}\n</body>\n</html>\n`;
};
/** A launch placeholder is a control or a line whose destination is not
 *  decided yet (class launch-placeholder in a template). The preview shows
 *  it as it will be at launch, ringed in amber; a production build shows a
 *  control as a muted, disabled one with a neutral "Available at launch"
 *  note (one note for a run of controls one after another), and a text
 *  placeholder as a neutral "details at launch" line. At launch, the class
 *  comes off and the control gets its href. */
const LP_BUTTON = /<a class="([^"]*?)\s*launch-placeholder" aria-disabled="true">([^<]*)<\/a>/;
const LP_RUN = new RegExp(`(?:[ \\t]*${LP_BUTTON.source}\\r?\\n)+`, "g");
const launchPlaceholders = (html) =>
  html
    .replace(LP_RUN, (run) => {
      const indent = run.match(/^[ \t]*/)[0];
      const controls = [...run.matchAll(new RegExp(LP_BUTTON.source, "g"))].map(
        ([, cls, label]) => `${indent}  <a class="${cls.replace(/\bbtn-primary\b/, "").replace(/\s+/g, " ").trim()} launch-off" aria-disabled="true">${label}</a>`,
      );
      return [`${indent}<div class="launch-slot">`, ...controls, `${indent}  <span class="launch-note">Available at launch</span>`, `${indent}</div>`, ""].join("\n");
    })
    .replace(/<p class="launch-placeholder lp-text">([^<]*?)\.?<\/p>/g, (_, what) => `<p class="launch-later">${what}: details at launch.</p>`);
const unfilled = (html) => html.match(/%%[A-Z_0-9]+%%/g) ?? [];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The site's own header and footer, shared by every page. A template
 *  carries %%HEADER%% and %%FOOTER%%; `prefix` is the path back to the
 *  site root ("", "../" or "../../"), `current` the nav key of the page,
 *  and `links` the footer's own links as [href, label] pairs, written
 *  relative to the page. */
const NAV = [
  ["index.html", "Home", "home"],
  ["product.html", "Product", "product"],
  ["methodology.html", "Methodology", "methodology"],
  ["ai-security.html", "AI and security", "ai"],
  ["case-studies.html", "Case studies", "cases"],
  ["organisations.html", "For organisations", "orgs"],
  ["documentation.html", "Documentation", "docs"],
  ["download.html", "Download", "download"],
];
/** On a phone the nav folds behind a Menu button (theme.css, max-width
 *  700px). The script only switches the folding on, so without script the
 *  nav stays the sideways-scrolling row; on a desktop the button is never
 *  shown and the nav is untouched. */
const NAV_SCRIPT = `  <script>(function () { var top = document.currentScript.parentElement, btn = top.querySelector(".nav-toggle"); top.classList.add("js-nav"); function set(open) { top.classList.toggle("nav-open", open); btn.setAttribute("aria-expanded", String(open)); } btn.addEventListener("click", function () { set(!top.classList.contains("nav-open")); }); document.addEventListener("keydown", function (e) { if (e.key === "Escape" && top.classList.contains("nav-open")) { set(false); btn.focus(); } }); })();</script>`;
const MAKER = `${BRAND} is made by ${COMPANY} ${DESCRIPTOR}.`;
/** Where every "Talk to us" and "Contact us" link on the site goes: one
 *  address, set here once it is decided (plan-public-release.md, step 2).
 *  Until then the links point at the Organisation card on the download
 *  page and the build says so. */
const CONTACT_EMAIL = "";
const CONTACT_HREF = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "download.html#organisation";
if (!CONTACT_EMAIL) console.log("contact: no address set in build-site.mjs; Talk to us links point at download.html#organisation");
const header = (prefix, current) =>
  [
    `<header class="top">`,
    `  <div class="wrap">`,
    `    <a class="brand" href="${prefix}index.html" aria-label="${COMPANY}, home">`,
    // The application's own icon (public/app-icon.svg in the app repo), so
    // the site and the Windows app carry the same mark.
    `      <svg viewBox="4 6 58 54" aria-hidden="true"><defs><linearGradient id="mark-teal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2BB8CF"/><stop offset="1" stop-color="#1490A8"/></linearGradient></defs><path d="M 18 15 C 30 20 21 30 30 34 C 40 38 34 46 41 50" fill="none" stroke="#0F7C93" stroke-width="3.4" stroke-linecap="round"/><path d="M 37.2 49.4 L 44.4 52.2 L 40.2 45.8 Z" fill="#0F7C93"/><rect x="6" y="8" width="24" height="13" rx="4.5" fill="url(#mark-teal)"/><rect x="20" y="27" width="24" height="13" rx="4.5" fill="url(#mark-teal)" opacity="0.82"/><rect x="36" y="46" width="24" height="12.5" rx="6.25" fill="#FFB92E"/><rect x="36" y="46" width="24" height="12.5" rx="6.25" fill="none" stroke="#E08A00" stroke-width="1.6"/></svg>`,
    `      <span class="brand-text">${COMPANY}<span class="brand-tag">${DESCRIPTOR}</span></span>`,
    `    </a>`,
    `    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Menu</button>`,
    `    <nav class="nav" id="site-nav" aria-label="Site">`,
    ...NAV.map(([href, label, key]) => `      <a href="${prefix}${href}"${key === current ? ' aria-current="page"' : ""}>${label}</a>`),
    `    </nav>`,
    `  </div>`,
    NAV_SCRIPT,
    `</header>`,
  ].join("\n");
const footer = (prefix, links = []) =>
  [
    `  <footer>`,
    `    <span class="legal">${MAKER}<br>© 2026 ${COMPANY} ${DESCRIPTOR}</span>`,
    `    <span>${[...links, [`${prefix}changelog.html`, "Changelog"]].map(([href, label]) => `<a href="${href}">${label}</a>`).join(" · ")}</span>`,
    `  </footer>`,
  ].join("\n");
const chrome = (html, prefix, current, links) => html.replace("%%HEADER%%", () => header(prefix, current)).replace("%%FOOTER%%", () => footer(prefix, links));
const meta = (r) =>
  r
    ? `${r.words.toLocaleString("en-AU")} words · ${r.runLog?.engine ?? "endpoint"} · ${r.runLog?.calls?.length ?? "?"} model calls · drafted ${new Date(r.runLog?.drafted_at ?? Date.now()).toLocaleDateString("en-AU")}`
    : "";
const copyInto = (from, to, keep) => {
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from).filter((f) => statSync(join(from, f)).isFile() && keep.test(f));
  for (const f of files) copyFileSync(join(from, f), join(to, f));
  return files;
};

/** The headings for a published document's viewer. The application names
 *  these files the same way for every case study, so the copy is shared;
 *  an unknown name falls back to the name itself. */
const docCopy = {
  report_standard: ["Final investigation report", "Final investigation report, as published", "The full report written to the application’s Word template and converted to PDF: cover, distribution list and the report as drafted, section by section from the record."],
  report_preliminary: ["Preliminary investigation report", "Preliminary investigation report, as published", "The interim report on the same template: what has been established so far and what is still open, with no findings."],
  report_executive: ["Executive briefing", "Executive briefing, as published", "The short report on the same template: the occurrence, what was found and what is being done, in a few pages of plain language for the people who decide."],
  report_atsb: ["Final investigation report, ATSB-inspired layout", "Final investigation report, ATSB-inspired layout, as published", "The final report arranged to the structure of published ATSB final reports, on the same template: summary, occurrence, context, safety analysis, findings, safety issues and actions."],
  report_ntsb: ["Final investigation report, NTSB-inspired layout", "Final investigation report, NTSB-inspired layout, as published", "The final report arranged to the structure of published NTSB reports, on the same template: factual information, analysis, conclusions carrying the findings, the probable cause and the contributing factors, then recommendations."],
  report_aaib: ["Final investigation report, AAIB-inspired layout", "Final investigation report, AAIB-inspired layout, as published", "The final report arranged to the structure of published AAIB reports, on the same template: synopsis, factual information, analysis, conclusions splitting causal from contributory factors, then safety action and recommendations."],
  eii_tables: ["Evidence and Argument Tables", "Evidence and Argument Tables, as published", "One table per object: each test’s result and confidence, the evidence recorded for and against it, and the investigator’s reasoning."],
  evidence_argument_tables: ["Evidence and Argument Tables", "Evidence and Argument Tables, as published", "One table per object: each test’s result and confidence, the evidence recorded for and against it, and the investigator’s reasoning."],
  source_pack: ["Source pack", "Investigation source pack", "Every source document this investigation worked from, in one file and in reading order: the safety report, the records and extracts, and the interview transcripts."],
};
/** The headings for a report style's page, keyed by the folder name the
 *  application's reports sit in. The labels match the covers the
 *  application prints: the standard style is the final investigation
 *  report, and the atsb, ntsb and aaib styles are the same final report
 *  in another organisation's published layout. */
const reportCopy = {
  standard: ["Final investigation report", "Final investigation report", "The full report: executive summary, event overview, analysis, findings summary and appendices, drafted section by section from the record."],
  preliminary: ["Preliminary investigation report", "Preliminary investigation report", "The interim report: what happened, what has been established so far, the risk exposure and the open lines of enquiry. No findings."],
  executive: ["Executive briefing", "Executive briefing", "The occurrence, the findings and the actions on a few pages for the people who decide."],
  atsb: ["Final investigation report, ATSB-inspired layout", "Final investigation report, ATSB-inspired layout", "The final report arranged to the structure of published ATSB final reports: summary, occurrence, context, safety analysis, findings, safety issues and actions."],
  ntsb: ["Final investigation report, NTSB-inspired layout", "Final investigation report, NTSB-inspired layout", "The final report arranged to the structure of published NTSB reports: factual information, analysis, conclusions carrying the findings, the probable cause and the contributing factors, then recommendations."],
  aaib: ["Final investigation report, AAIB-inspired layout", "Final investigation report, AAIB-inspired layout", "The final report arranged to the structure of published AAIB reports: synopsis, factual information, analysis, conclusions splitting causal from contributory factors, then safety action and recommendations."],
};

/** One line of purpose for each output in a study page's outputs block
 *  (%%OUTPUTS%%). Shared by every study; an entry in a study's meta.json
 *  may carry its own "purpose" instead. */
const outputPurpose = {
  evidence_argument_tables: "The working behind every finding, one table per object in the order the map reads: each test’s result and confidence, the argument for and against, and the investigator’s reasoning.",
  report_preliminary: "The interim report, issued while the work is still running: what is known, what is still being looked at and what has already been done. It carries no findings.",
  report_standard: "The full internal report: an executive summary, the occurrence, the analysis lane by lane, the findings and the appendices a reviewer will ask for.",
  report_executive: "A few pages in plain language for the people who decide: what happened, why it happened, what was found and what is being done about it.",
};
/** The final report in another organisation's published layout, for the
 *  layouts table (%%LAYOUTS%%): the short name, and how it differs from
 *  the standard final report, taken from each style's own Purpose line. */
const layoutCopy = {
  atsb: ["ATSB-inspired", "Written for a readership outside the organisation: an investigation summary first, the findings on the seven-term scale, then the safety issues with the action taken against each."],
  ntsb: ["NTSB-inspired", "Factual information, analysis and conclusions, ending in a single probable cause statement with its contributing factors, then the recommendations."],
  aaib: ["AAIB-inspired", "A synopsis first, and conclusions that split the causal factors from the contributory ones before the safety action and recommendations. Written in British English."],
};
const LAYOUTS_NOTE =
  "These layouts follow the published report structure of the Australian Transport Safety Bureau, the US National Transportation Safety Board and the UK Air Accidents Investigation Branch. They are not produced, reviewed or endorsed by those organisations.";

/** A study page's outputs block, from meta.json's "outputs": each entry
 *  names a document and the page shown as its preview, so a preview is
 *  always a page the application generated. Paths are relative to
 *  case-studies/<slug>.html. */
const outputsBlock = (study, pagesRoot, reports, notes) => {
  const { slug } = study;
  const items = (study.outputs ?? []).map((o) => {
    const doc = o.doc;
    const pageFiles = existsSync(join(pagesRoot, doc)) ? readdirSync(join(pagesRoot, doc)).filter((f) => /^p\d+\.png$/.test(f)).sort() : [];
    const pageFile = `p${String(o.page).padStart(2, "0")}.png`;
    if (!pageFiles.includes(pageFile)) notes.push(`outputs: ${doc} has no ${pageFile}`);
    const label = (docCopy[doc] ?? [doc])[0];
    const style = doc.startsWith("report_") ? doc.slice("report_".length) : null;
    const read = style && reports[style] ? `<a class="btn btn-primary" href="../reports/${slug}/${style}.html">Read</a>` : "";
    const view = `<a class="btn${read ? "" : " btn-primary"}" href="../exports/${slug}/${doc}.html">View pages</a>`;
    const pdf = `<a class="btn" href="../exports/${slug}/${doc}.pdf" target="_blank" rel="noopener">PDF</a>`;
    const shown = o.caption ? `page ${o.page} shown: ${esc(o.caption)}` : `page ${o.page} shown`;
    return [
      `      <article class="output">`,
      `        <div class="output__pages">`,
      `          <a href="../exports/${slug}/${doc}.html"><img src="../exports/${slug}/pages/${doc}/p01.png" alt="The cover of the ${esc(label)}" loading="lazy"><span>Cover</span></a>`,
      `          <a href="../exports/${slug}/${doc}.html"><img src="../exports/${slug}/pages/${doc}/${pageFile}" alt="Page ${o.page} of the ${esc(label)}" loading="lazy"><span>Page ${o.page}</span></a>`,
      `        </div>`,
      `        <div class="output__body">`,
      `          <h3>${esc(label)}</h3>`,
      `          <p>${esc(o.purpose ?? outputPurpose[doc] ?? "")}</p>`,
      `          <p class="output__meta">${pageFiles.length} pages · ${shown}</p>`,
      `          <div class="links">${read}${view}${pdf}</div>`,
      `        </div>`,
      `      </article>`,
    ].join("\n");
  });
  return items.length ? `    <div class="outputs block--wide">\n${items.join("\n")}\n    </div>` : "";
};
/** The layouts table, from meta.json's "layouts" (the atsb, ntsb and aaib
 *  report folders): the same final report in other published layouts. */
const layoutsBlock = (study, reports) => {
  const { slug } = study;
  const rows = (study.layouts ?? [])
    .filter((style) => reports[style])
    .map((style) => {
      const [name, line] = layoutCopy[style] ?? [style, ""];
      return `        <tr><th scope="row">${esc(name)}</th><td>${esc(line)}</td><td class="layouts__links"><a href="../reports/${slug}/${style}.html">Read</a> · <a href="../exports/${slug}/report_${style}.pdf" target="_blank" rel="noopener">PDF</a></td></tr>`;
    });
  if (!rows.length) return "";
  return [
    `    <table class="layouts">`,
    `      <thead><tr><th scope="col">Layout</th><th scope="col">How it differs</th><th scope="col">Open</th></tr></thead>`,
    `      <tbody>`,
    ...rows,
    `      </tbody>`,
    `    </table>`,
    `    <p class="layouts__note">${esc(LAYOUTS_NOTE)}</p>`,
  ].join("\n");
};

// ---------------------------------------------------------------- studies

const studyDirs = existsSync(join(here, "case-studies"))
  ? readdirSync(join(here, "case-studies")).filter((f) => statSync(join(here, "case-studies", f)).isDirectory())
  : [];
const studies = [];
for (const slug of studyDirs) {
  const dir = join(here, "case-studies", slug);
  if (!existsSync(join(dir, "meta.json"))) {
    console.log(`skipped ${slug}: no case-studies/${slug}/meta.json`);
    continue;
  }
  if (!existsSync(join(dir, "content.html"))) {
    console.log(`skipped ${slug}: no case-studies/${slug}/content.html`);
    continue;
  }
  const appDir = join(appCaseStudies, slug);
  if (!existsSync(appDir)) {
    console.log(`skipped ${slug}: nothing at ${appDir}`);
    continue;
  }
  const m = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  studies.push({ ...m, slug: m.slug ?? slug, dir, appDir });
}
studies.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slug.localeCompare(b.slug));

/** One study as a card, the whole card a link: photo, industry, name,
 *  occurrence type, one line and "Open the case study". `prefix` is the
 *  path from the page to the site root; `heading` the card's heading
 *  level. The one line is meta.json's `cardLine`, else its `blurb`. */
const studyCard = (s, prefix, heading = "h2") =>
  [
    `      <a class="study" href="${prefix}case-studies/${s.slug}.html">`,
    `        <img src="${prefix}case-studies/${s.slug}/${s.photo}" alt="${esc(s.photoAlt ?? "")}" width="1200" height="800" loading="lazy" decoding="async">`,
    `        <span class="study__body">`,
    `          <span class="study__sector">${esc(s.sector)}</span>`,
    `          <${heading} class="study__title">${esc(s.title)}</${heading}>`,
    s.occurrence ? `          <span class="study__kind">${esc(s.occurrence)}</span>` : "",
    `          <span class="study__line">${esc(s.cardLine ?? s.blurb)}</span>`,
    `          <span class="study__go">Open the case study <span aria-hidden="true">→</span></span>`,
    `        </span>`,
    `      </a>`,
  ]
    .filter(Boolean)
    .join("\n");
/** The other studies, at the foot of each study's page, so a reader can go
 *  straight on to the next one. Generated here, never written per study. */
const otherStudies = (study) => {
  const others = studies.filter((s) => s.slug !== study.slug);
  if (!others.length) return "";
  return [
    `  <section class="block others" id="other-studies">`,
    `    <div class="section-head"><h2>Other case studies</h2></div>`,
    `    <div class="studies studies--small">`,
    others.map((s) => studyCard(s, "../", "h3")).join("\n"),
    `    </div>`,
    `  </section>`,
  ].join("\n");
};

const summaries = [];
for (const study of studies) {
  const { slug, appDir } = study;
  const notes = [];

  // Screenshots: copied in once, and every %%SHOT_NN%% on this study's
  // page rewritten to the path here. The number is the file's prefix.
  const shotFiles = existsSync(join(appDir, "shots")) ? copyInto(join(appDir, "shots"), join(here, "shots", slug), /\.png$/) : [];
  if (!shotFiles.length) notes.push("no screenshots");
  const shotPath = (prefix) => (f) => `${prefix}shots/${slug}/${f}`;
  const withShots = (html, prefix) => shotFiles.reduce((h, f) => h.split(`%%SHOT_${f.slice(0, 2)}%%`).join(shotPath(prefix)(f)), html);

  // The published documents, and the page renders behind each viewer.
  const exportsDir = join(appDir, "exports");
  if (existsSync(exportsDir)) copyInto(exportsDir, join(here, "exports", slug), /\.(pdf|png|md)$/);
  else notes.push("no exports");

  // The rendered reports. The application writes them; render them from
  // here when they are not there yet, and skip the study's report pages
  // if that cannot be done.
  const reportsOut = join(here, "reports", slug);
  const hasJson = () => existsSync(reportsOut) && readdirSync(reportsOut).some((f) => f.endsWith(".json"));
  if (!hasJson()) {
    console.log(`${slug}: rendering reports (npx vite-node scripts/render-case-reports.tsx ${slug})`);
    const r = spawnSync("npx", ["vite-node", "scripts/render-case-reports.tsx", slug, relative(appRoot, reportsOut)], {
      cwd: appRoot,
      shell: true,
      stdio: "inherit",
    });
    if (r.status !== 0) notes.push(`could not render reports; run "npx vite-node scripts/render-case-reports.tsx ${slug} ../iws-site/reports/${slug}" in the application repository`);
  }
  const reports = {};
  if (hasJson()) {
    for (const f of readdirSync(reportsOut).filter((f) => f.endsWith(".json"))) {
      reports[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(reportsOut, f), "utf8"));
    }
  }
  const declaredReports = study.reports ?? Object.keys(reports);
  const missingReports = declaredReports.filter((s) => !reports[s]);
  if (missingReports.length) notes.push(`reports not rendered: ${missingReports.join(", ")}`);
  const caseUrl = `../../case-studies/${slug}.html`;
  const studyLinks = [[`${caseUrl}#published`, "Back to the case study"], ["../../case-studies.html", "All case studies"]];

  // A page per report style: the report as drafted, with the grounding
  // audit, the mechanical record check and the review notes beside it.
  const reportTemplate = readFileSync(join(here, "report.template.html"), "utf8");
  const markdownCss = existsSync(join(reportsOut, "markdown.css")) ? readFileSync(join(reportsOut, "markdown.css"), "utf8") : "";
  const pageHoles = [];
  for (const style of declaredReports.filter((s) => reports[s])) {
    const r = reports[style];
    const [title, heading, blurb] = reportCopy[style] ?? [style, style, ""];
    const html = chrome(reportTemplate, "../../", "cases", studyLinks)
      .replace("%%THEME%%", theme)
      .replace("%%MARKDOWN_CSS%%", markdownCss)
      .replace("%%TITLE%%", title)
      .replaceAll("%%CASE_URL%%", caseUrl)
      .replaceAll("%%CASE_TITLE%%", esc(study.title))
      .replace("%%HEADING%%", heading)
      .replace("%%BLURB%%", blurb)
      .replace("%%META%%", meta(r).split(" · ").map((m) => `<span>${m}</span>`).join(""))
      .replace("%%REPORT%%", r.report)
      .replace("%%AUDIT%%", r.audit || '<p class="hint">No audit was recorded for this run.</p>')
      .replace("%%CHECK%%", r.recordCheck || '<p class="hint">No record check was recorded for this run.</p>')
      .replace("%%NOTES%%", r.reviewNotes || '<p class="hint">No review notes.</p>');
    pageHoles.push(...unfilled(html));
    write(join("reports", slug, `${style}.html`), document(`${title}, ${study.title} | ${BRAND}`, html, blurb));
  }

  // A page-by-page viewer for each published document, from the page
  // renders under exports/pages/<name>/, so a browser that cannot show
  // the PDF (a sandboxed preview) still reads the document as published.
  const docTemplate = readFileSync(join(here, "document.template.html"), "utf8");
  const pagesRoot = join(exportsDir, "pages");
  const wantDocs = [...declaredReports.map((s) => `report_${s}`), ...(study.documents ?? [])];
  const haveDocs = existsSync(pagesRoot) ? readdirSync(pagesRoot).filter((f) => statSync(join(pagesRoot, f)).isDirectory()) : [];
  const docs = wantDocs.filter((d) => haveDocs.includes(d));
  const missingDocs = wantDocs.filter((d) => !haveDocs.includes(d));
  if (missingDocs.length) notes.push(`no page renders for: ${missingDocs.join(", ")}`);
  for (const name of docs) {
    const [title, heading, blurb] = docCopy[name] ?? [name, name, ""];
    const style = name.startsWith("report_") ? name.slice("report_".length) : null;
    const extra = style && reports[style] ? `<a class="btn" href="../../reports/${slug}/${style}.html#audit">The audit and checks</a>` : "";
    // Start from an empty folder: a document that lost pages (a shorter
    // redraft) must not keep the old renders beside the new ones.
    rmSync(join(here, "exports", slug, "pages", name), { recursive: true, force: true });
    const pages = copyInto(join(pagesRoot, name), join(here, "exports", slug, "pages", name), /\.png$/).sort();
    const figures = pages
      .map((f, i) => `    <figure class="page"><img src="pages/${name}/${f}" alt="Page ${i + 1} of ${pages.length}" loading="${i < 2 ? "eager" : "lazy"}"><figcaption>Page ${i + 1} of ${pages.length}</figcaption></figure>`)
      .join("\n");
    const html = chrome(docTemplate, "../../", "cases", studyLinks)
      .replace("%%THEME%%", theme)
      .replace("%%TITLE%%", title)
      .replaceAll("%%CASE_URL%%", caseUrl)
      .replaceAll("%%CASE_TITLE%%", esc(study.title))
      .replace("%%HEADING%%", heading)
      .replace("%%BLURB%%", blurb)
      .replace("%%PDF%%", `${name}.pdf`)
      .replace("%%EXTRA%%", extra)
      .replace("%%PAGES%%", figures);
    pageHoles.push(...unfilled(html));
    write(join("exports", slug, `${name}.html`), document(`${title}, ${study.title} | ${BRAND}`, html, blurb));
  }

  // The study's own page: the shared shell plus this study's fragment. A
  // study held at an older version (meta.json's optional "note") gets that
  // note rendered where its content.html carries %%VERSION_NOTE%%; a study
  // with neither just drops the placeholder.
  const shell = readFileSync(join(here, "case-study.template.html"), "utf8");
  const versionNote = study.note ? `<p class="note">${esc(study.note)}</p>` : "";
  const content = readFileSync(join(study.dir, "content.html"), "utf8")
    .replace("%%VERSION_NOTE%%", () => versionNote)
    .replace("%%OUTPUTS%%", () => outputsBlock(study, pagesRoot, reports, notes))
    .replace("%%LAYOUTS%%", () => layoutsBlock(study, reports));
  const pageTitle = study.pageTitle ?? `Case study: ${study.title}`;
  const page = withShots(
    chrome(shell, "../", "cases", [["../case-studies.html", "All case studies"], ["../download.html", "Download"], ["#top", "Back to top"]])
      .replace("%%THEME%%", theme)
      .replace("%%TITLE%%", esc(pageTitle))
      .replace("%%CONTENT%%", () => content)
      .replace("%%OTHER_STUDIES%%", () => otherStudies(study)),
    "../",
  );
  const holes = [...new Set([...unfilled(page), ...pageHoles])];
  write(join("case-studies", `${slug}.html`), document(`${pageTitle} | ${BRAND}`, page, study.blurb));
  study.reportsBuilt = declaredReports.filter((s) => reports[s]);
  study.docsBuilt = docs;
  study.reportData = reports;
  study.shotFiles = shotFiles;
  summaries.push(
    `${slug}: ${shotFiles.length} shots, ${study.reportsBuilt.length} reports, ${docs.length} documents, unfilled: ${holes.length ? holes.join(",") : "none"}${notes.length ? `, notes: ${notes.join("; ")}` : ""}`,
  );
}

// ------------------------------------------------------------- home page

const featured = studies[0];
if (!featured) {
  console.error("no case study could be built; nothing to feature on the home page");
  process.exit(1);
}
/** The case cards on the Case studies page (h2) and the home page (h3). */
const cards = studies.map((s) => studyCard(s, "", "h2")).join("\n");
const homeCards = studies.map((s) => studyCard(s, "", "h3")).join("\n");
/** The featured study's Evidence and Argument Tables, under whichever
 *  name its exports carry (a study not yet re-drafted has the older one). */
const featuredTables = (featured.docsBuilt ?? []).find((d) => d === "evidence_argument_tables" || d === "eii_tables") ?? "evidence_argument_tables";
/** The top-level pages are filled from the same featured study: its
 *  screenshots, its slug and the case cards. */
const fillFeatured = (templateName, current) =>
  featured.shotFiles
    .reduce(
      (h, f) => h.split(`%%SHOT_${f.slice(0, 2)}%%`).join(`shots/${featured.slug}/${f}`),
      chrome(readFileSync(join(here, templateName), "utf8"), "", current, [["#top", "Back to top"]]).replace("%%THEME%%", theme),
    )
    .replaceAll("%%CONTACT%%", CONTACT_HREF)
    .replaceAll("%%FEATURED_TABLES%%", featuredTables)
    .replaceAll("%%FEATURED_TITLE%%", esc(featured.title))
    .replaceAll("%%FEATURED%%", featured.slug)
    .replace("%%CASE_CARDS%%", () => cards)
    .replace("%%HOME_CASE_CARDS%%", () => homeCards);
const index = fillFeatured("index.template.html", "home");
write(
  "index.html",
  document(
    `${BRAND} | ${COMPANY} ${DESCRIPTOR}`,
    index,
    `${BRAND} is safety investigation software for Windows from ${COMPANY}. It takes an investigation from the evidence through the AcciMap analysis and the assessment of each factor to the report, in one connected investigation record.`,
  ),
);
/** The other top-level pages: template, nav key, title and description. */
const sitePages = [
  ["product", "Product", `What ${BRAND} does at each stage of an investigation: evidence, analysis on the AcciMap, assessment of each factor, and reporting, with what Free and Professional each include.`],
  ["methodology", "Methodology", `An investigation in ${BRAND} starts from the critical event, tests each hypothesis on the AcciMap against the evidence, and derives the findings from the results.`],
  ["ai-security", "AI and security", `What optional AI drafting does in ${BRAND}, how drafts are checked against the investigation record, where investigation data goes under each AI access setting, and how to bring your own AI.`],
  ["case-studies", "Case studies", `Three fictional safety investigations in aviation, maritime and mining, carried out in ${BRAND} from first notification to the published documents.`],
  ["organisations", "For organisations", `How ${BRAND} helps an organisation establish a more consistent investigative process: traceable findings, reasoning kept with the investigation record, and editions adapted to the organisation's own investigation framework.`],
  ["download", "Download", `Download ${BRAND} for Windows 10 and 11: the Free, Professional and Organisation levels, and how to buy and activate a licence.`],
  ["documentation", "Documentation", `How to learn ${BRAND}: the Getting started walkthrough of a first investigation, and the User Guide to every tab, form and setting.`],
  ["getting-started", "Getting started", `Your first investigation in ${BRAND}, step by step on a small fictional occurrence, from the start screen to the Evidence and Argument Tables.`],
];
const navKey = { product: "product", methodology: "methodology", "ai-security": "ai", "case-studies": "cases", organisations: "orgs", download: "download", documentation: "docs", "getting-started": "docs" };

// ------------------------------------------- the Getting started walkthrough
/** The walkthrough's words are the application's own
 *  (src/help/guide/gettingStarted.ts), written here as data by its
 *  scripts/render-getting-started.tsx --json; this lays them out. A
 *  reference in the data is a topic id, resolved to a page here. */
const gs = JSON.parse(readFileSync(join(here, "getting-started.json"), "utf8"));
const GS_PARTS = { "gs:before": "#before", "gs:steps": "#steps", "gs:have": "#have", "gs:next": "#next" };
const GS_SITE = { "site:download": "download.html", "site:levels": "download.html", "site:methodology": "methodology.html", "site:case-study": "case-studies.html" };
const gsHref = (ref) => {
  if (ref in GS_PARTS) return GS_PARTS[ref];
  if (ref.startsWith("guide:")) return `guide.html#manual-${ref.slice(6)}`;
  if (ref in GS_SITE) return GS_SITE[ref];
  throw new Error(`getting-started.json: no page for reference ${ref}`);
};
const gsRun = (run) => {
  if (typeof run === "string") return esc(run);
  if ("kbd" in run) return `<kbd>${esc(run.kbd)}</kbd>`;
  if ("code" in run) return `<code>${esc(run.code)}</code>`;
  if ("enter" in run) return `<em class="enter">${esc(run.enter)}</em>`;
  return `<a href="${gsHref(run.ref)}">${esc(run.text)}</a>`;
};
const gsPara = (para) => para.map(gsRun).join("");
const gsParas = (paras, indent = "          ") => paras.map((p) => `${indent}<p>${gsPara(p)}</p>`).join("\n");
const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen"];
/** A step whose widest picture would be cramped in a half column lays
 *  its text out above the pictures instead of beside them. */
const WIDE_FIGURE = 700;
const gsStep = (step, total) => {
  const wide = step.figures.some((f) => f.displayWidth >= WIDE_FIGURE);
  const [place, ...path] = step.where;
  const where = [esc(place) + (path.length ? ":" : ""), path.map((w) => `<b>${esc(w)}</b>`).join(" &rarr; ")].filter(Boolean).join(" ");
  const figures = step.figures
    .map(
      (f) =>
        `<figure style="max-width: ${f.displayWidth}px"><img class="shot zoomable" src="guide-images/${esc(f.file)}" alt="${esc(f.alt)}" data-caption="${esc(f.caption)}" width="${f.displayWidth}" loading="lazy"><figcaption>${esc(f.caption)}</figcaption></figure>`,
    )
    .join("");
  return [
    `    <li class="step${wide ? " step--wide" : ""}" id="step-${esc(step.id)}">`,
    `      <div class="step__text">`,
    `        <div class="step__main">`,
    `        <p class="step__of">Step ${step.number} of ${total}</p>`,
    `        <div class="step__head"><span class="stage-no">${step.number}</span><h3>${esc(step.title)}</h3></div>`,
    `        <p class="step__where">${where}</p>`,
    gsParas(step.body, "        "),
    `        </div>`,
    `        <div class="see"><span class="see__label">You should now see</span>${step.see.map((p) => `<p>${gsPara(p)}</p>`).join("")}</div>`,
    `      </div>`,
    `      <div class="step__figs">${figures}</div>`,
    `    </li>`,
  ].join("\n");
};
const gsCase = (c) =>
  [
    `      <div class="case">`,
    `        <div class="case__head"><span class="pill">${esc(c.label)}</span><h3>${esc(c.title)}</h3></div>`,
    `        <p class="case__lede">${esc(c.summary)} Copy each piece below as you need it.</p>`,
    `        <div class="case__items">${c.pieces.map((p) => `<div class="case__item"><h4>${esc(p.caption)}</h4><p>${esc(p.text)}</p></div>`).join("")}</div>`,
    `      </div>`,
  ].join("\n");
const gsList = (paras) => `<ul class="plain">${paras.map((p) => `<li>${gsPara(p)}</li>`).join("")}</ul>`;
const gsHoles = {
  GS_TITLE: esc(gs.title),
  GS_LEDE: gsPara(gs.lede),
  GS_BEFORE_TITLE: esc(gs.before.title),
  GS_HAVE_TITLE: esc(gs.have.title),
  GS_NEXT_TITLE: esc(gs.next.title),
  GS_INSTALL: gsParas(gs.before.install),
  GS_PROOF: gsParas(gs.before.standardOfProof),
  // The data opens this paragraph with the question the template already
  // carries as the item's heading.
  GS_LOOK: gsParas(gs.before.lookFirst.map((p) => (typeof p[0] === "string" ? [p[0].replace(/^Rather look first\?\s*/, ""), ...p.slice(1)] : p))),
  GS_CASE: gsCase(gs.before.occurrence),
  GS_STEP_COUNT_WORD: NUMBER_WORDS[gs.steps.length] ?? String(gs.steps.length),
  GS_STEP_INDEX: gs.steps.map((s) => `      <li><a href="#step-${esc(s.id)}">${esc(s.title)}</a></li>`).join("\n"),
  GS_STEPS: gs.steps.map((s) => gsStep(s, gs.steps.length)).join("\n"),
  GS_HAVE: [
    `    <div class="have">`,
    `      <div class="have__col"><h3><span class="pill">Free</span> Yours now</h3>${gsList(gs.have.free)}</div>`,
    `      <div class="have__col"><h3><span class="pill">Professional</span> When you need more</h3>${gsList(gs.have.professional)}</div>`,
    `    </div>`,
    gs.have.note.map((p) => `    <p class="hint have-note">${gsPara(p)}</p>`).join("\n"),
  ].join("\n"),
  GS_NEXT: `    <ul class="next">\n${gs.next.items.map((i) => `      <li><a href="${gsHref(i.ref)}">${esc(i.label)}</a><span>${esc(i.blurb)}</span></li>`).join("\n")}\n    </ul>`,
};
const fillGettingStarted = (html) => Object.entries(gsHoles).reduce((h, [hole, value]) => h.replaceAll(`%%${hole}%%`, () => value), html);

const topPages = sitePages.map(([name, title, description]) => {
  const filled = fillFeatured(`${name}.template.html`, navKey[name]);
  const html = name === "getting-started" ? fillGettingStarted(filled) : filled;
  write(`${name}.html`, document(`${title} | ${BRAND}`, html, description));
  return html;
});

// ------------------------------------------- changelog, guide, manifest

const releases = JSON.parse(readFileSync(join(here, "changelog.json"), "utf8"));
const changeList = (label, items) =>
  items && items.length
    ? `        <div><span class="eyebrow">${label}</span><ul>\n${items.map((i) => `          <li>${i}</li>`).join("\n")}\n        </ul></div>`
    : "";
const releaseHtml = releases
  .map((r) =>
    [
      `    <div class="release">`,
      `      <div><span class="v">${r.version}</span><span class="d">${r.planned ? "Planned, not yet released" : r.date}</span></div>`,
      `      <div class="parts">`,
      [changeList("Added", r.features), changeList("Fixed", r.fixes)].filter(Boolean).join("\n"),
      `      </div>`,
      `    </div>`,
    ].join("\n"),
  )
  .join("\n");
const changelog = chrome(readFileSync(join(here, "changelog.template.html"), "utf8"), "", null, [["download.html", "Download"]]).replace("%%THEME%%", theme).replace("%%RELEASES%%", releaseHtml);
write("changelog.html", document(`Changelog | ${BRAND}`, changelog, `What changed in ${BRAND}, release by release.`));

const fragment = readFileSync(join(here, "guide-fragment.html"), "utf8");
const guide = chrome(readFileSync(join(here, "guide.template.html"), "utf8"), "", "docs", [["#top", "Back to top"]]).replace("%%THEME%%", theme).replace("%%GUIDE%%", () => fragment);
write("guide.html", document(`User Guide | ${BRAND}`, guide, `The ${BRAND} User Guide to every tab, form and setting, the same User Guide the application ships under Help.`));

writeFileSync(join(here, "build-manifest.json"), `${JSON.stringify(built.sort(), null, 2)}\n`);

const siteHoles = [...unfilled(index), ...topPages.flatMap(unfilled), ...unfilled(changelog), ...unfilled(guide)];
for (const line of summaries) console.log(line);
console.log(
  `site: index.html and ${sitePages.map(([n]) => `${n}.html`).join(", ")} (featuring ${featured.slug}), changelog.html ${releases.length} releases, guide.html ${guide.length} chars, ${built.length} pages, unfilled: ${siteHoles.length ? siteHoles.join(",") : "none"}`,
);

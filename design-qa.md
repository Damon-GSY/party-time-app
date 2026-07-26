# Party Time Redesign — Design QA

## Final comparison

- Source: `/Users/damon/.codex/generated_images/019f9d76-a3ac-7cb1-927a-267b13cba140/exec-771c2b2f-c3dd-4794-82e8-cf22831e51a3.png`
- Final implementation: `artifacts/redesign-v2/home-393-final.png`
- Side-by-side evidence: `artifacts/redesign-v2/source-vs-final-393.png`
- Matching frame: 393 × 852 CSS px, reference normalized to the same frame
- Additional widths: `home-375.png`, `home-430.png`, `create-375.png`, `create-393.png`, `create-430.png`, `vote-375.png`, `vote-selected-393.png`, `vote-430.png`
- Interaction states: `success-393.png`, `result-393.png`, `detail-393.png`

## Mandatory visual review

- Hierarchy: the final home now matches the source's large near-white display title, coral month/current date, strong section headings, oversized event glyphs, compact metadata, and pill CTA. The earlier underscaled gray wireframe quality is gone.
- Iconography: all visible icons come from the local Lucide library export. Event, CTA, back, status, and three navigation icons share one rounded 1.8 px stroke language. No emoji, text-symbol icons, CSS drawings, inline SVG, or remote assets are used.
- Material: a generated 720 × 1440 warm-black grain JPEG replaces the flat black field. It is static, about 40 KiB, local, non-interactive, and uses a quality setting high enough to preserve the subtle texture without visible macroblocking.
- Spacing: the title begins at the same visual altitude as the reference; the calendar, active event, recent events, and safe-area navigation use the same broad vertical rhythm. The implementation retains a slightly denser week because it intentionally omits invented lunar-calendar data.
- Color: `#171412`, `#1e1a17`, `#f6f1eb`, `#beb5ae`, `#3c3430`, and `#f27a6a` consistently reproduce the reference's warm dark/coral character. Buttons stay solid and use only a subtle inset highlight.
- Responsive behavior: browser measurements confirm `scrollWidth === innerWidth` at 375, 393, and 430 px. The 375 px header, active event, four-column slots, date fields, and fixed actions do not clip or create horizontal page scrolling.
- Create: fields are 54 px high, labels are clear, selected controls use the dark pressed surface plus coral border, and the only solid coral action is the primary submit. Keyboard-focused fields temporarily move the fixed action out of the way.
- Vote: browser and native date tabs both emphasize the internal date circle; slot numbers use tabular figures, selected slots use coral fill, and clicking a slot updates only that slot plus counters. Focus remains on the selected slot instead of falling back to the page body.
- Result: the best-time module uses a dark surface, coral keyline, and left marker; date and time range are separate non-breaking lines; the statistics are a flat number band rather than a rounded card; the heatmap keeps horizontal scrolling inside its own region.
- Navigation: all six core/tab pages use a custom safe-area-aware shell, so the browser preview no longer diverges from a duplicate native navigation bar. Browser and native `tabBar` reuse the same six local selected/unselected PNG assets and preserve the three stable labeled destinations.

## Interaction and accessibility review

- Browser path completed with real clicks and keyboard operations: home → create → input name and note → choose form controls → create → nickname → cross-date slot selection → submit → Escape close → resubmit → result → heatmap detail → close → edit vote.
- Dialog Escape support is explicit and verified by the `open` attribute changing from present to absent; backdrop and visible close controls remain available.
- Page changes move focus to a programmatically focusable heading without showing a decorative focus ring. Interactive keyboard focus retains the coral 3 px focus-visible ring.
- The vote grid no longer rebuilds on each selection or date switch, so keyboard focus and pressed-state feedback persist.
- Date tabs implement the standard roving pattern: Arrow Left/Right wrap, Home/End jump, and focus, selection, grid content, and `aria-selected` stay synchronized.
- Native date switching cancels stale timers on repeat selection and unload; the hidden grid cannot receive clicks. Native bottom sheets animate out for 180 ms and unmount after a 220 ms safety margin.
- Native create submission stays in its submitting state until redirect instead of flashing back to an enabled button.
- Reduced-motion rules disable page/grid/sheet transforms and continuous loading motion while preserving state changes.

## Verification record

- `node --test tests/*.test.js`: 30/30 passed.
- JavaScript syntax checks cover all mini-program and cloud-function sources.
- JSON parsing, WXML handler contracts, slot contracts, navigation destinations, icon signatures, local-only assets, resource budgets, and forbidden native web runtimes are automated.
- `git diff --check`: passed.
- No remote script, style, icon, texture, GSAP, Lenis, Vanta, Three.js, React, or React Bits dependency is present in the native runtime.
- Browser console and responsive review have no known blocking error.
- Every final evidence image is a real PNG captured from the final source revision; the 375 and 393 screenshots contain no inspection highlights.
- Native WeChat DevTools verification remains environment-blocked because the repository still contains a placeholder AppID and this machine has no WeChat DevTools installation; the browser preview is the executable acceptance surface.

## Iteration history

1. The first redesign established the complete data and interaction flow but visually stopped at a flat, underscaled dark wireframe.
2. Independent visual, motion, and architecture audits identified the real gaps: missing line icons, missing material, weak scale contrast, full-grid DOM replacement, invisible modal exit motion, stale date timers, and keyboard/footer overlap.
3. The second pass added the real icon and texture assets, recalibrated typography and spacing against the reference, and repaired the interaction architecture rather than adding decorative animation libraries.
4. A same-frame side-by-side inspection confirmed no remaining P0/P1 mismatch in hierarchy, iconography, material, responsive layout, or core task flow.

final result: passed

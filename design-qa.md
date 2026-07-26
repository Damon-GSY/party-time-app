# Party Time Editorial Scheduler — Design QA

## Evidence

- Primary source visual truth: `/var/folders/ct/s46m2nn53c53776py7t7kz1r0000gn/T/codex-clipboard-74849b8e-0958-4fe5-ab22-fe98a04ab359.png`
- Supporting direction sources: `/var/folders/ct/s46m2nn53c53776py7t7kz1r0000gn/T/codex-clipboard-5959b859-edca-43e1-979c-db521c6051f4.png` and `/var/folders/ct/s46m2nn53c53776py7t7kz1r0000gn/T/codex-clipboard-4779f482-e42c-4a1e-ab06-796d6dcf7eb3.png`
- Expanded-calendar source truth: `/var/folders/ct/s46m2nn53c53776py7t7kz1r0000gn/T/codex-clipboard-1a7060d1-6414-49a7-b4ee-a476403aada5.png`
- Browser implementation: `artifacts/editorial-scheduler/vote-top-selected-393.png` and `artifacts/editorial-scheduler/result-393.png`
- Expanded-calendar implementation: `artifacts/editorial-scheduler/calendar-expanded-393.png`
- Full-view comparison: `artifacts/editorial-scheduler/source-vs-vote-top-393.png`
- Focused calendar comparison: `artifacts/editorial-scheduler/source-vs-calendar-focus.png`
- Viewport: 393 × 852 CSS px at device scale 1. Responsive overflow checks also ran at 375 × 812 and 430 × 932.
- Source pixels: 460 × 1028, proportionally resized to 393 px wide and top-cropped to 393 × 852 for equal-size comparison.
- Implementation pixels: 393 × 852. The browser capture was JPEG and was losslessly converted to PNG for review.
- State: date selected, one time slot selected, submit enabled, fixed confirmation summary visible.
- Calendar state: current-week card expanded into a 42-cell month view, current day highlighted, previous/next-month dates muted.
- Calendar normalization: the 1196 × 1542 directional calendar poster was cropped to its calendar region and normalized to 349 × 374; the implementation calendar component was captured at the same 349 × 374 size for focused comparison.

## Findings

- No actionable P0/P1/P2 findings remain.
- This is a directional translation rather than a literal clone: the reference's two-column scheduling grid, black selected date, large tabular times, ruled sections, micro-labels, and fixed confirmation bar are preserved, while Party Time's Chinese copy and retro four-color identity remain intact.
- The reference includes unavailable slots, but the product currently has no unavailable-slot business state. Inventing disabled data would break the existing selection contract, so the implementation intentionally exposes only OPEN and SELECTED states.
- Independent visual review initially flagged undersized/low-contrast microcopy and a 16 px native/preview content-width mismatch as P1. State labels are now 11 px at full opacity, supporting text uses darker ink, native and preview both use 14 px page gutters, and the vote footer is 98 px in both surfaces.
- Independent regression review initially flagged native footer safe-area padding as P1. Create, vote, and result footers now declare page-level base, `constant()`, and `env()` bottom padding so page shorthands cannot erase the safe-area inset.
- The expanded calendar introduces no actionable P0/P1/P2 findings. Its thin ruled grid, warm paper surface, strong month label, muted overflow dates, and brick-red current date translate the supplied calendar reference without copying its oversized poster typography into the mobile product.

## Required fidelity review

- Fonts and typography: compact English metadata and all time values use a system monospace stack with tabular figures; Chinese headings retain the native system stack for reliable Mini Program rendering. The hierarchy now mirrors the reference: small technical labels, bold day numbers, and oversized time values.
- Spacing and layout rhythm: the scheduler is a single paper panel with thin ruled divisions, square date cells, a true two-column slot grid, and a persistent bottom summary. The outer app header remains darker and more spacious than the source to preserve Party Time navigation and event context.
- Colors and visual tokens: black/charcoal controls structure and confirmation, sand carries the scheduling surface, brick red marks selected slots, and vintage green remains exclusive to best/group results. Contrast remains sufficient for selected and confirmation states.
- Image quality and asset fidelity: these references contain no required raster illustration or product imagery. Existing local PNG icons and grain texture were retained; no emoji, placeholder, inline SVG, CSS illustration, gradient, or remote asset was added.
- Copy and content: all app-specific Chinese copy and realistic event data remain. English microcopy is limited to the scheduler's instrument-panel labels (`SCHEDULING`, `SLOT_SELECT`, `OPEN`, `SELECTED`, `TOTAL_SELECTION`) to match the visual language without making the workflow harder to understand.
- Focused region comparison: a separate crop was unnecessary because the equal-size 786 × 852 side-by-side comparison keeps the date strip, slot labels, state underline, selected cell, and bottom confirmation summary legible at full view.
- Expanded-calendar fidelity: the focused 698 × 374 comparison keeps both calendar components readable. The implementation deliberately uses a smaller mobile month heading and a single-day highlight rather than the source poster's decorative giant month lettering and repeated red event range.

## Interaction and responsive verification

- Browser path exercised: home → open vote → type nickname → click a slot → switch date with the ArrowRight keyboard key → select another slot → submit → success dialog → result → open a heatmap detail → edit vote.
- Calendar interactions exercised: click to expand, click to collapse, Enter to collapse, Space to expand. `aria-expanded` and the accessible label update with every transition.
- Expanded state rendered exactly 42 date cells, hid the compact week, showed the month grid, and produced no horizontal overflow at 375, 393, or 430 px.
- The selected state, disabled/enabled submit state, dialog, result aggregation, heatmap detail, and fixed bottom action were all observed after real interactions.
- A first browser pass found the confirmation bar scrolling with the content (P1). It was changed from an absolute element inside the scroll container to a viewport-fixed, app-width action bar.
- Post-fix evidence: `artifacts/editorial-scheduler/vote-top-selected-393.png` shows the confirmation bar fixed at the viewport bottom while the two-column grid continues behind it.
- Final calendar evidence: `artifacts/editorial-scheduler/calendar-expanded-final-393.jpg` shows the 7-column ruled month grid, adjacent-month dates, and brick-red current-day state at the target mobile width.
- No horizontal overflow: body, active screen, and viewport widths matched at 375, 393, and 430 px.
- Browser console errors/warnings: none.
- Final browser metrics at 393 px: two slot tracks at 167.5 px each, 11 px state labels, and a fixed footer at top 754 / bottom 852 / height 98.
- `node --test tests/*.test.js`: 36/36 passed, including Monday-first, Sunday-start, cross-year, overflow-date, and unique-current-day month-grid behavior.
- `git diff --check HEAD`: passed.
- Native WeChat DevTools/device capture remains unavailable because the repository uses a placeholder AppID and this machine does not have WeChat DevTools. Native source contracts and the browser acceptance path are the available verification surfaces.

## Comparison history

1. Initial editorial pass introduced the paper scheduler, squared date strip, two-column time grid, brick-red selection, and black confirmation action.
2. Browser testing exposed a P1 fixed-action bug: scrolling a selected slot moved the confirmation bar into the middle of the content.
3. The action bar was anchored to the viewport at the app width; 393 px re-capture confirmed the footer stays at the bottom and does not hide the active grid state.
4. Independent visual review found low-contrast microcopy and native/preview spacing drift. Labels were enlarged/darkened, English decorative labels were hidden from assistive tech, two-date rows now fill the rail, and preview gutters/footer height were synchronized with the Mini Program.
5. Independent regression review found page-level footer shorthands could erase the global safe-area padding. All three fixed action footers now own complete safe-area fallback declarations, with new contract assertions for fixed positioning, safe areas, and selected-state bindings.
6. Equal-size side-by-side comparison confirmed the reference's scheduling density, typographic hierarchy, grid logic, and selection contrast are all represented without breaking Party Time's brand palette or workflow.
7. The home calendar was extended with a full-month state. A first browser pass exposed the compact week remaining visible because author CSS overrode the HTML `hidden` attribute; an explicit hidden-state rule fixed it. Post-fix evidence confirms only the intended month grid is visible when expanded.
8. Independent calendar review found small-screen week overflow, simulated controls, incomplete date announcements, and weak secondary contrast. The compact row now uses a true 7-column grid; native and preview controls are real buttons; the preview month is a sibling `region` with a semantic 42-cell grid; every date exposes its full label/current state; and supporting text meets the strengthened contrast tokens. A 375 px browser pass confirmed a 375 px scroll width, all 42 dates, and correct click/Enter/Space toggling.
9. The first 393 px evidence capture used an incompatible full-page screenshot mode and appeared horizontally cropped despite correct CSS metrics. It was replaced with a true 393 × 852 viewport capture; the final image shows all seven columns, both adjacent-month ranges, the highlighted current date, and both expansion controls.

final result: passed

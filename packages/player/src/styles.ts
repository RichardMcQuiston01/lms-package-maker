/** Stylesheet of the generated player. Plain CSS, no external requests. */
export const playerCss = `:root { color-scheme: light dark; --accent: #2563eb; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 system-ui, sans-serif; display: grid; grid-template-columns: minmax(12rem, 18rem) 1fr; min-height: 100vh; }
.lpm-nav { padding: 1rem; border-right: 1px solid #8884; overflow-y: auto; }
.lpm-nav h1 { font-size: 1.1rem; margin: 0 0 1rem; }
.lpm-nav h2 { font-size: .85rem; text-transform: uppercase; letter-spacing: .05em; margin: 1rem 0 .25rem; opacity: .7; }
.lpm-nav ol { list-style: none; margin: 0; padding: 0; }
.lpm-nav button { width: 100%; text-align: left; padding: .4rem .6rem; border: 0; border-radius: .375rem; background: none; color: inherit; font: inherit; cursor: pointer; }
.lpm-nav button:hover { background: #8882; }
.lpm-nav button[aria-current="page"] { background: var(--accent); color: #fff; }
.lpm-main { padding: 1.5rem 2rem; max-width: 60rem; }
.lpm-main progress { width: 100%; height: .5rem; }
.lpm-page img, .lpm-page video { max-width: 100%; height: auto; }
.lpm-page audio { width: 100%; }
.lpm-quiz { margin-top: 1.5rem; }
.lpm-question { margin: 0 0 1.25rem; padding: 1rem; border: 1px solid #8886; border-radius: .5rem; }
.lpm-question legend { font-weight: 600; padding: 0 .25rem; }
.lpm-points, .lpm-hint { font-weight: 400; font-size: .85rem; opacity: .7; }
.lpm-hint { display: block; margin-bottom: .25rem; }
.lpm-choice { display: flex; gap: .5rem; align-items: flex-start; padding: .25rem 0; cursor: pointer; }
.lpm-choice input { margin-top: .35rem; }
.lpm-question.is-correct { border-color: #15803d; }
.lpm-question.is-wrong { border-color: #b91c1c; }
.lpm-feedback { font-weight: 600; margin: .5rem 0 0; }
.lpm-question.is-correct .lpm-feedback { color: #15803d; }
.lpm-question.is-wrong .lpm-feedback { color: #b91c1c; }
.lpm-explanation { margin: .25rem 0 0; opacity: .85; }
.lpm-quiz-actions { display: flex; gap: .75rem; }
.lpm-quiz-actions button { padding: .5rem 1rem; border: 1px solid #8886; border-radius: .375rem; background: var(--accent); color: #fff; font: inherit; cursor: pointer; }
.lpm-quiz-actions button[data-action="retry"] { background: none; color: inherit; }
.lpm-quiz-result { margin-top: .75rem; font-weight: 600; }
.lpm-controls { display: flex; justify-content: space-between; margin-top: 2rem; }
.lpm-controls button { padding: .5rem 1rem; border: 1px solid #8886; border-radius: .375rem; background: none; color: inherit; font: inherit; cursor: pointer; }
#lpm-quiz-summary { font-weight: 600; margin: 0 0 .5rem; }
#lpm-status { min-height: 1.5rem; opacity: .8; }
button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
@media (max-width: 40rem) { body { grid-template-columns: 1fr; } .lpm-nav { border-right: 0; border-bottom: 1px solid #8884; } }
`;

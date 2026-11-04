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
.lpm-controls { display: flex; justify-content: space-between; margin-top: 2rem; }
.lpm-controls button { padding: .5rem 1rem; border: 1px solid #8886; border-radius: .375rem; background: none; color: inherit; font: inherit; cursor: pointer; }
#lpm-status { min-height: 1.5rem; opacity: .8; }
button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
@media (max-width: 40rem) { body { grid-template-columns: 1fr; } .lpm-nav { border-right: 0; border-bottom: 1px solid #8884; } }
`;

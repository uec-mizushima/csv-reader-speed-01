# csv-reader-speed-01 entry

A fast drop-in replacement for csv-reader 1.0.0: `solve.js` exports `run(input)`
returning exactly csv-reader's reading of `{text, header}` as
`{columns, rows, errors}`, and `main.ts` is the harness driver that answers
every case in `/input/cases.json` into `/output/answers.json`.

# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/uec-mizushima/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/uec-mizushima/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0: `solve.js` exports `run(input)`
returning exactly csv-reader's reading of `{text, header}` as
`{columns, rows, errors}`, and `main.ts` is the harness driver that answers
every case in `/input/cases.json` into `/output/answers.json`.

## Run it

```sh
node main.ts
```

(with `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` standing in for `/input` and
`/output` outside the harness container)

---
<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>

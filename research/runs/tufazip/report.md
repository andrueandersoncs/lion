# TufaZip, and what Lion can learn from it

Run `tufazip` (2026-11-19), steps `39-tz-frame` and `39a-tz-sources`. It records what a review of the TufaZip write-up found, which first ran in a session that saved nothing to the model.

## The answer

TufaZip is Tufa Labs' lossless compressor for enwik9, the billion-byte Wikipedia file of Matt Mahoney's Large Text Compression Benchmark. A Transformer predicts each next token and an arithmetic coder turns the predictions into bits. The encoder and the decoder start from the same random weights and take the same training step after every token, so the learned weights are never stored. The benchmark counts the decompressor and every file it needs in the score (`tz-r1`), so a pretrained prior has to save more text than its weights cost.

Three things carry over to Lion, and the model checks each:

1. **Count what a change adds.** The benchmark counts the decoder against what it saves. Lion's measuring guideline already asks the same of a feature: "A feature usually adds code. Pay for it in the same change" (`tz-l1`). Belief `tz-decoder` holds.
2. **Rebuild the state from the steps.** TufaZip needs updates that repeat exactly (`tz-d2`). Lion promises more than the same answer for the same order of steps: the same answer in any order (`order-ab`, `order-ba`). The research model and the project record are rebuilt by replay and never committed.
3. **One fixed test can be gamed.** The write-up warns that hill climbing "a single objective through automated research loops can improve a score without explaining why a change worked" (`tz-g1`), and Wikipedia says the same of overfitting (`tz-g3`). Lion's skills have no held-out case: a search of every skill for one finds nothing (`tz-l2`, belief `tz-held-out` holds). lion-research has one frozen case, `verifies-company-figures`, which its improvement loop was run against, and its other case, `researches-recent-outage`, searches the live web, so it cannot be run again to compare.

The model adds one idea, `held-out-eval`: keep an eval case that the skills' improvement loop never tunes against, and count a direction as paying off only when that case does not get worse. Its verdict is "worth adopting". In lion-reasoning it would mark a score as held out, beside `carried` and `regressed`, rather than add a concept.

## The figures

`research/probes/tz-figures.json` works out eleven figures of the page from its results table: what C2 saved and what it cost, the net 0.56% (`tz-p1`), the 1.21% that a longer replay window saved (`tz-p2`), the bytes in megabytes, and that each row's payload and decoder add up to its total. All eleven hold at the precision the page writes them (`tz-f1`, `tz-f2`, belief `tz-figures`). Changing two of the page's figures by one in the last place makes the program name both.

## What does not carry over

Neural prediction, learning while compressing, and tokenization. Lion does not learn, and the weights of its rows count candidates, not probabilities.

## Limits

- The three beliefs were written after the first session had read the page, so they confirm rather than predict.
- That held-out evaluation gives a score the tuning never saw rests on one secondary source, Wikipedia (`tz-h1`).
- That the skills lack one rests on a search for the words, not on a program that tunes a direction and watches a held-out score.

## Sources

- Tommy He, Tufa Labs, [tufazip: Learning to Compress a Billion Bytes of Wikipedia](https://tufalabs.ai/research/tufazip/) (2026-10-14)
- Matt Mahoney, [Rules for the Large Text Compression Benchmark](https://www.mattmahoney.net/dc/textrules.html)
- Wikipedia, [Training, validation, and test data sets](https://en.wikipedia.org/wiki/Training,_validation,_and_test_data_sets)
- Lion's `guidelines/measuring.md`, a search of `skills/`, and `research/probes/tz-figures.json`

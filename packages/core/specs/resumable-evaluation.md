## Core Feature

### Resumable Evaluation

Implement a function evaluate() which takes in an oplog (Operation Log).
When evaluating an effectful operation, the oplog is checked for both operation_started and operation_completed.
If there is no operation_started for the operation, then one is added and the oplog returned as the result of evaluation.
If there is no operation_completed for the operation, then the evaluation is "paused" and the oplog is returned as is as the result of evaluation.
In order to "continue" evaluation, a new oplog must be constructed with an operation_completed entry and passed back to the evaluate() function.
> There can only be EXACTLY one operation_completed entry for a given operation_started entry
When continuing an evaluation, all non-effectful expressions are re-evaluated, all effectful operations are hydrated from the oplog.

### Which operations are effectful and how can we tell?

A conservative approach to determining effectfulness must be taken.
All operations passed into the environment are considered effectful by default.
If an operation belongs to a stdlib module, a lookup can be done to determine its effectfulness.
User-provided operations are all considered effectful with no way to opt-out of this behavior (for now).
> The reasoning here is that it's currently impossible to break evaluation and I'd like to keep it that way until I can think of a better solution

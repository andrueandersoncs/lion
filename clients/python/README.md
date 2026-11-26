# lionlang-client (Python SDK)

Zero-dependency Python client for `lion serve` (HTTP + SSE `watch` + lossless exact `fractions.Fraction` wire codec).

```python
from fractions import Fraction
from lion_client import LionClient

client = LionClient("http://127.0.0.1:4100")
client.commit(["begin", ["relation", "price", ["sku", "amount"]], ["fact", ["price", "a1", Fraction(1, 3)]]])
res = client.eval(["query", ["price", "a1", "?amt"]])
assert res["value"] == [{"amt": Fraction(1, 3)}]
```

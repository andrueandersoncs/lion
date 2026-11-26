import random
import unittest
from fractions import Fraction

from lion_client.wire import decode_wire, encode_wire


class WireCodecTest(unittest.TestCase):
    def test_rational_and_escape_roundtrip_property(self) -> None:
        rng = random.Random(42)
        for _ in range(200):
            n = rng.randint(-10000, 10000)
            d = rng.randint(1, 500)
            frac = Fraction(n, d)
            payload = {
                "ratio": frac,
                "list": [1, "x", None, True, frac],
                "collision": {"$lion/rational": ["literal", "user"]},
                "escaped": {"$lion/escaped": {"k": frac}},
            }
            restored = decode_wire(encode_wire(payload))
            self.assertEqual(restored, payload)


if __name__ == "__main__":
    unittest.main()

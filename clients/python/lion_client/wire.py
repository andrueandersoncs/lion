"""Lossless JSON wire codec mapping Lion `$lion/rational` <-> Python `fractions.Fraction`."""

from __future__ import annotations

from fractions import Fraction
from typing import Any

RATIONAL_TAG = "$lion/rational"
ESCAPED_TAG = "$lion/escaped"


def encode_wire(value: Any) -> Any:
    """Encodes Python values (including `Fraction`) into Lion's lossless wire JSON shape."""
    if isinstance(value, Fraction):
        return {RATIONAL_TAG: [str(value.numerator), str(value.denominator)]}
    if isinstance(value, list):
        return [encode_wire(item) for item in value]
    if isinstance(value, tuple):
        return [encode_wire(item) for item in value]
    if isinstance(value, dict):
        out = {str(k): encode_wire(v) for k, v in value.items()}
        if len(out) == 1 and (RATIONAL_TAG in out or ESCAPED_TAG in out):
            return {ESCAPED_TAG: out}
        return out
    return value


def decode_wire(value: Any) -> Any:
    """Decodes Lion wire JSON values, restoring `$lion/rational` to `fractions.Fraction`."""
    if isinstance(value, list):
        return [decode_wire(item) for item in value]
    if isinstance(value, dict):
        if len(value) == 1 and RATIONAL_TAG in value:
            pair = value[RATIONAL_TAG]
            if not isinstance(pair, list) or len(pair) != 2:
                raise ValueError(f"Invalid wire rational payload: {pair!r}")
            return Fraction(int(pair[0]), int(pair[1]))
        if len(value) == 1 and ESCAPED_TAG in value:
            inner = value[ESCAPED_TAG]
            if not isinstance(inner, dict):
                raise ValueError(f"Invalid wire escaped payload: {inner!r}")
            return {k: decode_wire(v) for k, v in inner.items()}
        return {k: decode_wire(v) for k, v in value.items()}
    return value

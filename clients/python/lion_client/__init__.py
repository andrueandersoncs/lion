"""Zero-dependency Python client SDK for Lion."""

from .client import LionClient, LionClientError, LionConflictError, LionLimitError, LionPermissionError
from .wire import decode_wire, encode_wire

__all__ = [
    "LionClient",
    "LionClientError",
    "LionConflictError",
    "LionLimitError",
    "LionPermissionError",
    "decode_wire",
    "encode_wire",
]

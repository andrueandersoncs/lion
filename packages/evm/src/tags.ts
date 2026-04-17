/**
 * TLV tag bytes shared between the TS encoder and the Solidity LionVM.
 *
 * Wire format (big-endian, no padding):
 *
 *   0x01 INT    : 32-byte two's-complement int256
 *   0x02 BOOL   : 1 byte (0 = false, 1 = true)
 *   0x03 SYM    : uint16 length + utf-8 bytes (variable reference)
 *   0x04 BYTES  : uint16 length + raw bytes (string / bytes literal)
 *   0x05 LIST   : uint16 count  + concatenated child expressions
 *   0x06 NIL    : 0 bytes payload
 *   0x07 LAMBDA : runtime-only; never emitted by the encoder
 */
export const TAG = {
	INT: 0x01,
	BOOL: 0x02,
	SYM: 0x03,
	BYTES: 0x04,
	LIST: 0x05,
	NIL: 0x06,
	LAMBDA: 0x07,
} as const;

export type Tag = (typeof TAG)[keyof typeof TAG];

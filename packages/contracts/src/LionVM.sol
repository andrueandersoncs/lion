// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LionVM — a tree-walking interpreter for Lion over EVM calldata.
///
/// Wire format (TLV):
///   0x01 INT    : 32 bytes big-endian int256
///   0x02 BOOL   : 1 byte (0 = false, 1 = true)
///   0x03 SYM    : uint16 length + utf8 bytes (variable reference / head)
///   0x04 BYTES  : uint16 length + raw bytes (string / bytes literal)
///   0x05 LIST   : uint16 count  + concatenated child expressions
///   0x06 NIL    : 0 bytes payload
///
/// Runtime values are encoded the same way, with one extra tag:
///   0x07 LAMBDA : uint16 paramCount + (paramSymBytes[]) + uint16 bodyLen + bodyBytes + uint32 envId
///
/// A program is a single expression (usually a LIST). It is executed by
/// `execute(bytes program)` which returns the encoded final value.
contract LionVM {
    // ───────────────────────── Tag constants ─────────────────────────
    uint8 internal constant T_INT    = 0x01;
    uint8 internal constant T_BOOL   = 0x02;
    uint8 internal constant T_SYM    = 0x03;
    uint8 internal constant T_BYTES  = 0x04;
    uint8 internal constant T_LIST   = 0x05;
    uint8 internal constant T_NIL    = 0x06;
    uint8 internal constant T_LAMBDA = 0x07;

    // ───────────────────────── Events ─────────────────────────
    event LionLog(bytes value);
    event LionResult(bytes value);

    // ───────────────────────── Errors ─────────────────────────
    error BadTag(uint8 tag);
    error TruncatedInput();
    error Unbound(string name);
    error TypeError(string what);
    error ArityError(string fn, uint256 got, uint256 want);
    error CallFailed(bytes reason);
    error BadProgram();

    // ─────────────────────── Environment model ───────────────────────
    // Frames live in memory for the duration of one `execute` call.
    // We allocate via a heap-backed array that we grow manually, and pass
    // frame *indices* around instead of pointers so lambdas can capture
    // lexical scope cheaply.
    struct Frame {
        bytes[] names;   // symbol names (raw utf8 bytes, no tag)
        bytes[] values;  // tagged runtime values
        uint32 parent;   // parent frame index, or type(uint32).max for root
    }

    uint32 internal constant NO_PARENT = type(uint32).max;

    // Ephemeral VM state (cleared each execute call).
    // Using storage is expensive; we use a struct passed through evaluator.
    struct VM {
        Frame[] frames;         // heap of frames
        uint32  rootEnv;        // always 0
    }

    // ─────────────────────── Public entrypoint ───────────────────────
    function execute(bytes calldata program) external returns (bytes memory out) {
        VM memory vm;
        vm.frames = new Frame[](0);
        vm.rootEnv = _newFrame(vm, NO_PARENT);

        out = _eval(vm, program, vm.rootEnv);
        emit LionResult(out);
    }

    /// Read-only execution. Cannot use `call` with value, but can `staticcall`.
    function simulate(bytes calldata program) external view returns (bytes memory out) {
        VM memory vm;
        vm.frames = new Frame[](0);
        vm.rootEnv = _newFrame(vm, NO_PARENT);
        out = _evalView(program, vm, vm.rootEnv);
    }

    // Internal view-gated eval — delegates to _eval but external calls that
    // require non-static context must revert at call sites. For simplicity we
    // reuse _eval; operations that mutate chain state will revert inside
    // staticcall naturally via the EVM.
    function _evalView(bytes calldata p, VM memory vm, uint32 env)
        internal view returns (bytes memory)
    {
        // We can't call the non-view `_eval` from view context without a
        // staticcall dance. For the prototype, `simulate` only makes sense
        // for programs that avoid `call` with value. Solidity will enforce
        // purity at the low level when this is entered via a staticcall.
        // We use assembly to launder mutability: safe because this function
        // is itself marked view and runs in the EVM's static context.
        bytes memory prog = p;
        function(bytes memory, VM memory, uint32) internal returns (bytes memory) f
            = _evalBytes;
        function(bytes memory, VM memory, uint32) internal view returns (bytes memory) g;
        assembly { g := f }
        return g(prog, vm, env);
    }

    // ─────────────────────── Frame helpers ───────────────────────
    function _newFrame(VM memory vm, uint32 parent) internal pure returns (uint32 idx) {
        Frame[] memory old = vm.frames;
        Frame[] memory nu  = new Frame[](old.length + 1);
        for (uint256 i = 0; i < old.length; i++) nu[i] = old[i];
        nu[old.length].names  = new bytes[](0);
        nu[old.length].values = new bytes[](0);
        nu[old.length].parent = parent;
        vm.frames = nu;
        idx = uint32(old.length);
    }

    function _bind(VM memory vm, uint32 env, bytes memory name, bytes memory val) internal pure {
        Frame memory f = vm.frames[env];
        // Update in place if exists
        for (uint256 i = 0; i < f.names.length; i++) {
            if (_eqBytes(f.names[i], name)) {
                f.values[i] = val;
                vm.frames[env] = f;
                return;
            }
        }
        bytes[] memory nNames  = new bytes[](f.names.length + 1);
        bytes[] memory nValues = new bytes[](f.values.length + 1);
        for (uint256 i = 0; i < f.names.length; i++) {
            nNames[i] = f.names[i];
            nValues[i] = f.values[i];
        }
        nNames[f.names.length]   = name;
        nValues[f.values.length] = val;
        f.names = nNames;
        f.values = nValues;
        vm.frames[env] = f;
    }

    function _lookup(VM memory vm, uint32 env, bytes memory name)
        internal pure returns (bool found, bytes memory val)
    {
        uint32 cur = env;
        while (cur != NO_PARENT) {
            Frame memory f = vm.frames[cur];
            for (uint256 i = 0; i < f.names.length; i++) {
                if (_eqBytes(f.names[i], name)) return (true, f.values[i]);
            }
            cur = f.parent;
        }
        return (false, bytes(""));
    }

    // ─────────────────────── Core evaluator ───────────────────────
    // `program` is a tagged expression. Returns tagged runtime value.
    function _eval(VM memory vm, bytes calldata program, uint32 env)
        internal returns (bytes memory)
    {
        return _evalBytes(bytes(program), vm, env);
    }

    function _evalBytes(bytes memory program, VM memory vm, uint32 env)
        internal returns (bytes memory)
    {
        if (program.length == 0) revert BadProgram();
        uint8 tag = uint8(program[0]);

        if (tag == T_INT || tag == T_BOOL || tag == T_BYTES || tag == T_NIL || tag == T_LAMBDA) {
            return program; // self-evaluating
        }
        if (tag == T_SYM) {
            bytes memory name = _payload(program);
            (bool ok, bytes memory val) = _lookup(vm, env, name);
            if (!ok) revert Unbound(string(name));
            return val;
        }
        if (tag == T_LIST) {
            return _evalList(program, vm, env);
        }
        revert BadTag(tag);
    }

    function _evalList(bytes memory list, VM memory vm, uint32 env)
        internal returns (bytes memory)
    {
        // Empty list → nil
        bytes[] memory items = _listItems(list);
        if (items.length == 0) return abi.encodePacked(T_NIL);

        // Dispatch on head symbol if any
        bytes memory head = items[0];
        if (uint8(head[0]) == T_SYM) {
            bytes memory name = _payload(head);
            bytes32 h = keccak256(name);

            if (h == keccak256("quote"))  return _sfQuote(items);
            if (h == keccak256("begin"))  return _sfBegin(items, vm, env);
            if (h == keccak256("define")) return _sfDefine(items, vm, env);
            if (h == keccak256("if"))     return _sfIf(items, vm, env);
            if (h == keccak256("lambda")) return _sfLambda(items, env);
            // else: fall through to function-call path
        }

        // Evaluate args once.
        bytes[] memory args = new bytes[](items.length - 1);
        for (uint256 i = 1; i < items.length; i++) {
            args[i - 1] = _evalBytes(items[i], vm, env);
        }

        // If head is a symbol, prefer user binding (shadowing); if not bound,
        // fall back to builtin dispatch. This lets "+", "call", etc. work
        // without being pre-bound in the environment.
        if (uint8(items[0][0]) == T_SYM) {
            bytes memory name = _payload(items[0]);
            (bool found, bytes memory fn_) = _lookup(vm, env, name);
            if (found) {
                return _applyLambda(fn_, args, vm);
            }
            (bool handled, bytes memory out) = _callBuiltin(name, args);
            if (handled) return out;
            revert Unbound(string(name));
        }

        // Non-symbol head (e.g. inline lambda, or expression producing lambda):
        // evaluate it and apply.
        bytes memory fn = _evalBytes(items[0], vm, env);
        return _applyLambda(fn, args, vm);
    }

    // ─────────────────────── Special forms ───────────────────────
    function _sfQuote(bytes[] memory items) internal pure returns (bytes memory) {
        if (items.length != 2) revert ArityError("quote", items.length - 1, 1);
        return items[1];
    }

    function _sfBegin(bytes[] memory items, VM memory vm, uint32 env)
        internal returns (bytes memory last)
    {
        last = abi.encodePacked(T_NIL);
        for (uint256 i = 1; i < items.length; i++) {
            last = _evalBytes(items[i], vm, env);
        }
    }

    function _sfDefine(bytes[] memory items, VM memory vm, uint32 env)
        internal returns (bytes memory)
    {
        if (items.length != 3) revert ArityError("define", items.length - 1, 2);
        if (uint8(items[1][0]) != T_SYM) revert TypeError("define: name must be symbol");
        bytes memory name = _payload(items[1]);
        bytes memory val  = _evalBytes(items[2], vm, env);
        _bind(vm, env, name, val);
        return val;
    }

    function _sfIf(bytes[] memory items, VM memory vm, uint32 env)
        internal returns (bytes memory)
    {
        if (items.length < 3 || items.length > 4)
            revert ArityError("if", items.length - 1, 3);
        bytes memory cond = _evalBytes(items[1], vm, env);
        if (_truthy(cond)) {
            return _evalBytes(items[2], vm, env);
        } else if (items.length == 4) {
            return _evalBytes(items[3], vm, env);
        }
        return abi.encodePacked(T_NIL);
    }

    // (lambda (p1 p2 ...) body)
    function _sfLambda(bytes[] memory items, uint32 env) internal pure returns (bytes memory) {
        if (items.length != 3) revert ArityError("lambda", items.length - 1, 2);
        if (uint8(items[1][0]) != T_LIST) revert TypeError("lambda: params must be list");

        bytes[] memory params = _listItems(items[1]);
        // Encode: T_LAMBDA | uint16 nParams | (uint16 len + paramName)... | uint16 bodyLen | body | uint32 envId
        bytes memory acc = abi.encodePacked(T_LAMBDA, uint16(params.length));
        for (uint256 i = 0; i < params.length; i++) {
            if (uint8(params[i][0]) != T_SYM) revert TypeError("lambda: param must be symbol");
            bytes memory pname = _payload(params[i]);
            acc = abi.encodePacked(acc, uint16(pname.length), pname);
        }
        bytes memory body = items[2];
        acc = abi.encodePacked(acc, uint16(body.length), body, uint32(env));
        return acc;
    }

    // ─────────────────────── Function application ───────────────────────
    function _apply(
        bytes memory fn,
        bytes[] memory args,
        VM memory vm,
        uint32 env,
        bytes memory headExpr
    ) internal returns (bytes memory) {
        // Builtin lookup by head symbol name (if head was a symbol)
        if (uint8(headExpr[0]) == T_SYM) {
            bytes memory name = _payload(headExpr);
            (bool found, ) = _lookup(vm, env, name);
            if (!found) {
                // not shadowed → try builtin
                bytes memory out;
                bool handled;
                (handled, out) = _callBuiltin(name, args);
                if (handled) return out;
            }
        }

        // Lambda application
        if (uint8(fn[0]) != T_LAMBDA) revert TypeError("apply: not callable");
        return _applyLambda(fn, args, vm);
    }

    function _applyLambda(bytes memory fn, bytes[] memory args, VM memory vm)
        internal returns (bytes memory)
    {
        // Decode lambda payload
        uint256 p = 1;
        uint16 nParams = _readU16(fn, p); p += 2;
        if (nParams != args.length) revert ArityError("lambda", args.length, nParams);

        bytes[] memory pnames = new bytes[](nParams);
        for (uint256 i = 0; i < nParams; i++) {
            uint16 plen = _readU16(fn, p); p += 2;
            pnames[i] = _sliceMem(fn, p, plen); p += plen;
        }
        uint16 bodyLen = _readU16(fn, p); p += 2;
        bytes memory body = _sliceMem(fn, p, bodyLen); p += bodyLen;
        uint32 closureEnv = _readU32(fn, p);

        // Build new frame as child of closureEnv
        uint32 callFrame = _newFrame(vm, closureEnv);
        for (uint256 i = 0; i < nParams; i++) {
            _bind(vm, callFrame, pnames[i], args[i]);
        }
        return _evalBytes(body, vm, callFrame);
    }

    // ─────────────────────── Builtins ───────────────────────
    function _callBuiltin(bytes memory name, bytes[] memory args)
        internal returns (bool handled, bytes memory out)
    {
        bytes32 h = keccak256(name);

        // Arithmetic
        if (h == keccak256("+")) return (true, _intOp(args, 0));
        if (h == keccak256("-")) return (true, _intOp(args, 1));
        if (h == keccak256("*")) return (true, _intOp(args, 2));
        if (h == keccak256("/")) return (true, _intOp(args, 3));
        if (h == keccak256("%")) return (true, _intOp(args, 4));

        // Comparison → bool
        if (h == keccak256("="))  return (true, _boolVal(_cmp(args, 0)));
        if (h == keccak256("<"))  return (true, _boolVal(_cmp(args, 1)));
        if (h == keccak256(">"))  return (true, _boolVal(_cmp(args, 2)));
        if (h == keccak256("<=")) return (true, _boolVal(_cmp(args, 3)));
        if (h == keccak256(">=")) return (true, _boolVal(_cmp(args, 4)));

        // Logic
        if (h == keccak256("and")) {
            for (uint256 i = 0; i < args.length; i++)
                if (!_truthy(args[i])) return (true, _boolVal(false));
            return (true, _boolVal(true));
        }
        if (h == keccak256("or")) {
            for (uint256 i = 0; i < args.length; i++)
                if (_truthy(args[i])) return (true, _boolVal(true));
            return (true, _boolVal(false));
        }
        if (h == keccak256("not")) {
            if (args.length != 1) revert ArityError("not", args.length, 1);
            return (true, _boolVal(!_truthy(args[0])));
        }

        // Bytes primitives
        if (h == keccak256("concat")) {
            bytes memory acc;
            for (uint256 i = 0; i < args.length; i++) acc = abi.encodePacked(acc, _asBytes(args[i]));
            return (true, abi.encodePacked(T_BYTES, uint16(acc.length), acc));
        }
        if (h == keccak256("length")) {
            if (args.length != 1) revert ArityError("length", args.length, 1);
            uint256 L = _asBytes(args[0]).length;
            return (true, _intVal(int256(L)));
        }
        if (h == keccak256("slice")) {
            if (args.length != 3) revert ArityError("slice", args.length, 3);
            bytes memory src = _asBytes(args[0]);
            uint256 start = uint256(_asInt(args[1]));
            uint256 len   = uint256(_asInt(args[2]));
            bytes memory s = _sliceMem(src, start, len);
            return (true, abi.encodePacked(T_BYTES, uint16(s.length), s));
        }
        if (h == keccak256("keccak256")) {
            if (args.length != 1) revert ArityError("keccak256", args.length, 1);
            bytes32 k = keccak256(_asBytes(args[0]));
            bytes memory raw = abi.encodePacked(k);
            return (true, abi.encodePacked(T_BYTES, uint16(32), raw));
        }

        // Conversions / ABI helpers
        if (h == keccak256("selector")) {
            // (selector "balanceOf(address)") → 4-byte bytes value
            if (args.length != 1) revert ArityError("selector", args.length, 1);
            bytes memory sig = _asBytes(args[0]);
            bytes4 sel = bytes4(keccak256(sig));
            bytes memory raw = abi.encodePacked(sel);
            return (true, abi.encodePacked(T_BYTES, uint16(4), raw));
        }
        if (h == keccak256("pad32")) {
            // Right-align int or bytes into 32 bytes → bytes value
            if (args.length != 1) revert ArityError("pad32", args.length, 1);
            uint8 t = uint8(args[0][0]);
            bytes memory raw;
            if (t == T_INT) {
                raw = abi.encode(_asInt(args[0]));
            } else if (t == T_BYTES) {
                bytes memory b = _asBytes(args[0]);
                if (b.length > 32) revert TypeError("pad32: too long");
                bytes memory padded = new bytes(32);
                for (uint256 i = 0; i < b.length; i++) padded[32 - b.length + i] = b[i];
                raw = padded;
            } else if (t == T_BOOL) {
                raw = abi.encode(_truthy(args[0]) ? uint256(1) : uint256(0));
            } else revert TypeError("pad32: bad type");
            return (true, abi.encodePacked(T_BYTES, uint16(32), raw));
        }
        if (h == keccak256("bytes->int")) {
            if (args.length != 1) revert ArityError("bytes->int", args.length, 1);
            bytes memory b = _asBytes(args[0]);
            // right-aligned: last 32 bytes interpreted as int256 big-endian
            int256 v;
            assembly {
                let L := mload(b)
                let ptr := add(b, 32)
                if gt(L, 32) {
                    ptr := add(ptr, sub(L, 32))
                    L := 32
                }
                v := mload(sub(ptr, sub(32, L)))
            }
            return (true, _intVal(v));
        }
        if (h == keccak256("address")) {
            // (address "0x...") → bytes value 20 bytes
            if (args.length != 1) revert ArityError("address", args.length, 1);
            bytes memory hexStr = _asBytes(args[0]);
            address a = _parseAddr(hexStr);
            bytes memory raw = abi.encodePacked(a);
            return (true, abi.encodePacked(T_BYTES, uint16(20), raw));
        }

        // External calls
        if (h == keccak256("call")) {
            if (args.length != 3) revert ArityError("call", args.length, 3);
            address to = _bytesToAddr(_asBytes(args[0]));
            bytes memory data = _asBytes(args[1]);
            uint256 val = uint256(_asInt(args[2]));
            (bool ok, bytes memory ret) = to.call{value: val}(data);
            if (!ok) revert CallFailed(ret);
            return (true, abi.encodePacked(T_BYTES, uint16(ret.length), ret));
        }
        if (h == keccak256("staticcall")) {
            if (args.length != 2) revert ArityError("staticcall", args.length, 2);
            address to = _bytesToAddr(_asBytes(args[0]));
            bytes memory data = _asBytes(args[1]);
            (bool ok, bytes memory ret) = to.staticcall(data);
            if (!ok) revert CallFailed(ret);
            return (true, abi.encodePacked(T_BYTES, uint16(ret.length), ret));
        }

        // Logging
        if (h == keccak256("log")) {
            bytes memory acc;
            for (uint256 i = 0; i < args.length; i++) acc = abi.encodePacked(acc, _asBytes(args[i]));
            emit LionLog(acc);
            return (true, abi.encodePacked(T_NIL));
        }

        return (false, "");
    }

    // ─────────────────────── Helpers: encode/decode values ───────────────────────
    function _intVal(int256 v) internal pure returns (bytes memory) {
        return abi.encodePacked(T_INT, v);
    }
    function _boolVal(bool v) internal pure returns (bytes memory) {
        return abi.encodePacked(T_BOOL, v ? uint8(1) : uint8(0));
    }

    function _truthy(bytes memory v) internal pure returns (bool) {
        uint8 t = uint8(v[0]);
        if (t == T_BOOL) return uint8(v[1]) != 0;
        if (t == T_NIL)  return false;
        if (t == T_INT)  return _asInt(v) != 0;
        return true;
    }

    function _asInt(bytes memory v) internal pure returns (int256 r) {
        if (uint8(v[0]) != T_INT) revert TypeError("expected int");
        assembly { r := mload(add(v, 33)) } // skip 32 len + 1 tag
    }

    function _asBytes(bytes memory v) internal pure returns (bytes memory) {
        uint8 t = uint8(v[0]);
        if (t == T_BYTES) {
            uint16 L = _readU16(v, 1);
            return _sliceMem(v, 3, L);
        }
        if (t == T_INT) {
            int256 n = _asInt(v);
            return abi.encode(n); // 32 bytes
        }
        if (t == T_BOOL) {
            return abi.encode(_truthy(v) ? uint256(1) : uint256(0));
        }
        revert TypeError("expected bytes");
    }

    function _intOp(bytes[] memory args, uint8 op) internal pure returns (bytes memory) {
        if (args.length == 0) revert ArityError("intop", 0, 1);
        int256 acc = _asInt(args[0]);
        if (args.length == 1 && op == 1) return _intVal(-acc); // unary minus
        for (uint256 i = 1; i < args.length; i++) {
            int256 x = _asInt(args[i]);
            if (op == 0) acc = acc + x;
            else if (op == 1) acc = acc - x;
            else if (op == 2) acc = acc * x;
            else if (op == 3) acc = acc / x;
            else if (op == 4) acc = acc % x;
        }
        return _intVal(acc);
    }

    function _cmp(bytes[] memory args, uint8 op) internal pure returns (bool) {
        if (args.length < 2) revert ArityError("cmp", args.length, 2);
        int256 prev = _asInt(args[0]);
        for (uint256 i = 1; i < args.length; i++) {
            int256 cur = _asInt(args[i]);
            bool ok;
            if (op == 0) ok = prev == cur;
            else if (op == 1) ok = prev < cur;
            else if (op == 2) ok = prev > cur;
            else if (op == 3) ok = prev <= cur;
            else ok = prev >= cur;
            if (!ok) return false;
            prev = cur;
        }
        return true;
    }

    // ─────────────────────── Byte-level helpers ───────────────────────
    function _payload(bytes memory v) internal pure returns (bytes memory) {
        uint8 t = uint8(v[0]);
        if (t == T_SYM || t == T_BYTES) {
            uint16 L = _readU16(v, 1);
            return _sliceMem(v, 3, L);
        }
        if (t == T_LIST) {
            // payload is everything after tag+count; rarely used directly
            return _sliceMem(v, 3, v.length - 3);
        }
        revert TypeError("no payload");
    }

    /// Parse a LIST value into its sub-expressions, each fully tagged.
    function _listItems(bytes memory list) internal pure returns (bytes[] memory out) {
        if (uint8(list[0]) != T_LIST) revert TypeError("expected list");
        uint16 n = _readU16(list, 1);
        out = new bytes[](n);
        uint256 p = 3;
        for (uint256 i = 0; i < n; i++) {
            uint256 start = p;
            uint256 end   = _skipExpr(list, p);
            out[i] = _sliceMem(list, start, end - start);
            p = end;
        }
    }

    /// Return index just past the expression starting at `p`.
    function _skipExpr(bytes memory buf, uint256 p) internal pure returns (uint256) {
        uint8 t = uint8(buf[p]);
        if (t == T_INT)  return p + 1 + 32;
        if (t == T_BOOL) return p + 1 + 1;
        if (t == T_NIL)  return p + 1;
        if (t == T_SYM || t == T_BYTES) {
            uint16 L = _readU16(buf, p + 1);
            return p + 1 + 2 + L;
        }
        if (t == T_LIST) {
            uint16 n = _readU16(buf, p + 1);
            uint256 q = p + 1 + 2;
            for (uint256 i = 0; i < n; i++) q = _skipExpr(buf, q);
            return q;
        }
        if (t == T_LAMBDA) {
            // rarely encountered in program bytes, but handle just in case
            uint16 nP = _readU16(buf, p + 1);
            uint256 q = p + 3;
            for (uint256 i = 0; i < nP; i++) {
                uint16 L = _readU16(buf, q);
                q += 2 + L;
            }
            uint16 bodyLen = _readU16(buf, q);
            q += 2 + bodyLen + 4; // body + envId
            return q;
        }
        revert BadTag(t);
    }

    function _readU16(bytes memory b, uint256 p) internal pure returns (uint16 v) {
        v = (uint16(uint8(b[p])) << 8) | uint16(uint8(b[p + 1]));
    }
    function _readU32(bytes memory b, uint256 p) internal pure returns (uint32 v) {
        v = (uint32(uint8(b[p])) << 24)
          | (uint32(uint8(b[p + 1])) << 16)
          | (uint32(uint8(b[p + 2])) << 8)
          |  uint32(uint8(b[p + 3]));
    }

    function _sliceMem(bytes memory b, uint256 start, uint256 len)
        internal pure returns (bytes memory out)
    {
        if (start + len > b.length) revert TruncatedInput();
        out = new bytes(len);
        for (uint256 i = 0; i < len; i++) out[i] = b[start + i];
    }

    function _eqBytes(bytes memory a, bytes memory b) internal pure returns (bool) {
        if (a.length != b.length) return false;
        return keccak256(a) == keccak256(b);
    }

    // ─────────────────────── Address parsing ───────────────────────
    function _bytesToAddr(bytes memory raw) internal pure returns (address a) {
        if (raw.length == 20) {
            assembly { a := shr(96, mload(add(raw, 32))) }
        } else if (raw.length == 32) {
            // abi.encode'd address or uint256
            assembly { a := mload(add(raw, 32)) }
        } else {
            revert TypeError("bad address bytes");
        }
    }

    function _parseAddr(bytes memory hexStr) internal pure returns (address) {
        // Accept "0x" prefix + 40 hex chars
        if (hexStr.length != 42 || hexStr[0] != 0x30 || (hexStr[1] != 0x78 && hexStr[1] != 0x58))
            revert TypeError("bad hex address");
        uint256 v = 0;
        for (uint256 i = 2; i < 42; i++) {
            v = v * 16 + _hexNibble(uint8(hexStr[i]));
        }
        return address(uint160(v));
    }

    function _hexNibble(uint8 c) internal pure returns (uint256) {
        if (c >= 0x30 && c <= 0x39) return c - 0x30;
        if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10;
        if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10;
        revert TypeError("bad hex");
    }

    // Allow receiving ETH so `call` with value works from within programs.
    receive() external payable {}
    fallback() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/LionVM.sol";

/// Dummy target contract for external-call tests
contract Counter {
    uint256 public count;
    function get() external view returns (uint256) { return count; }
    function add(uint256 n) external returns (uint256) { count += n; return count; }
    function echoAddr(address a) external pure returns (address) { return a; }
}

contract LionVMTest is Test {
    LionVM vm_;
    Counter counter;

    function setUp() public {
        vm_ = new LionVM();
        counter = new Counter();
    }

    // ─────────────── Encoder (Solidity-side for tests) ───────────────
    uint8 constant T_INT   = 0x01;
    uint8 constant T_BOOL  = 0x02;
    uint8 constant T_SYM   = 0x03;
    uint8 constant T_BYTES = 0x04;
    uint8 constant T_LIST  = 0x05;
    uint8 constant T_NIL   = 0x06;

    function I(int256 n) internal pure returns (bytes memory) {
        return abi.encodePacked(T_INT, n);
    }
    function B(bool b) internal pure returns (bytes memory) {
        return abi.encodePacked(T_BOOL, b ? uint8(1) : uint8(0));
    }
    function S(string memory s) internal pure returns (bytes memory) {
        bytes memory raw = bytes(s);
        return abi.encodePacked(T_SYM, uint16(raw.length), raw);
    }
    function BS(bytes memory raw) internal pure returns (bytes memory) {
        return abi.encodePacked(T_BYTES, uint16(raw.length), raw);
    }
    function STR(string memory s) internal pure returns (bytes memory) {
        return BS(bytes(s));
    }
    function L(bytes[] memory items) internal pure returns (bytes memory acc) {
        acc = abi.encodePacked(T_LIST, uint16(items.length));
        for (uint256 i = 0; i < items.length; i++) acc = bytes.concat(acc, items[i]);
    }
    function L2(bytes memory a, bytes memory b) internal pure returns (bytes memory) {
        bytes[] memory x = new bytes[](2); x[0]=a; x[1]=b; return L(x);
    }
    function L3(bytes memory a, bytes memory b, bytes memory c) internal pure returns (bytes memory) {
        bytes[] memory x = new bytes[](3); x[0]=a; x[1]=b; x[2]=c; return L(x);
    }
    function L4(bytes memory a, bytes memory b, bytes memory c, bytes memory d) internal pure returns (bytes memory) {
        bytes[] memory x = new bytes[](4); x[0]=a; x[1]=b; x[2]=c; x[3]=d; return L(x);
    }

    function expectInt(bytes memory result, int256 want) internal pure {
        require(uint8(result[0]) == T_INT, "not int");
        int256 got;
        assembly { got := mload(add(result, 33)) }
        require(got == want, "int mismatch");
    }

    function expectBool(bytes memory result, bool want) internal pure {
        require(uint8(result[0]) == T_BOOL, "not bool");
        require((uint8(result[1]) != 0) == want, "bool mismatch");
    }

    // ─────────────────────── Tests ───────────────────────

    function test_Primitive() public {
        expectInt(vm_.execute(I(42)), 42);
        expectBool(vm_.execute(B(true)), true);
    }

    function test_Arithmetic() public {
        // (+ 1 2 3) = 6
        expectInt(vm_.execute(L4(S("+"), I(1), I(2), I(3))), 6);
        // (- 10 3) = 7
        expectInt(vm_.execute(L3(S("-"), I(10), I(3))), 7);
        // (* 4 5) = 20
        expectInt(vm_.execute(L3(S("*"), I(4), I(5))), 20);
        // (/ 20 4) = 5
        expectInt(vm_.execute(L3(S("/"), I(20), I(4))), 5);
    }

    function test_Compare() public {
        expectBool(vm_.execute(L3(S("="), I(5), I(5))), true);
        expectBool(vm_.execute(L3(S("<"), I(1), I(2))), true);
        expectBool(vm_.execute(L3(S(">"), I(1), I(2))), false);
    }

    function test_If() public {
        // (if (> 10 5) 100 200) = 100
        bytes memory cond = L3(S(">"), I(10), I(5));
        expectInt(vm_.execute(L4(S("if"), cond, I(100), I(200))), 100);
        bytes memory cond2 = L3(S("<"), I(10), I(5));
        expectInt(vm_.execute(L4(S("if"), cond2, I(100), I(200))), 200);
    }

    function test_DefineAndLookup() public {
        // (begin (define x 7) (+ x 3)) = 10
        bytes memory def = L3(S("define"), S("x"), I(7));
        bytes memory use = L3(S("+"), S("x"), I(3));
        bytes[] memory items = new bytes[](3);
        items[0] = S("begin"); items[1] = def; items[2] = use;
        expectInt(vm_.execute(L(items)), 10);
    }

    function test_LambdaAndCall() public {
        // (begin (define sq (lambda (x) (* x x))) (sq 9)) = 81
        bytes memory params = L2(S("x"), "");  // placeholder, build properly
        bytes[] memory p = new bytes[](1); p[0] = S("x");
        params = L(p);
        bytes memory body   = L3(S("*"), S("x"), S("x"));
        bytes memory lam    = L3(S("lambda"), params, body);
        bytes memory def    = L3(S("define"), S("sq"), lam);
        bytes memory call_  = L2(S("sq"), I(9));

        bytes[] memory prog = new bytes[](3);
        prog[0] = S("begin"); prog[1] = def; prog[2] = call_;
        expectInt(vm_.execute(L(prog)), 81);
    }

    function test_Recursion() public {
        // (begin
        //   (define fact (lambda (n)
        //     (if (<= n 1) 1 (* n (fact (- n 1))))))
        //   (fact 6)) = 720
        bytes[] memory p = new bytes[](1); p[0] = S("n");
        bytes memory params = L(p);

        bytes memory cond = L3(S("<="), S("n"), I(1));
        bytes memory recCall = L2(S("fact"), L3(S("-"), S("n"), I(1)));
        bytes memory elseB   = L3(S("*"), S("n"), recCall);
        bytes memory body    = L4(S("if"), cond, I(1), elseB);
        bytes memory lam     = L3(S("lambda"), params, body);
        bytes memory def     = L3(S("define"), S("fact"), lam);
        bytes memory call_   = L2(S("fact"), I(6));

        bytes[] memory prog = new bytes[](3);
        prog[0] = S("begin"); prog[1] = def; prog[2] = call_;
        expectInt(vm_.execute(L(prog)), 720);
    }

    function test_Closure() public {
        // (begin
        //   (define make-adder (lambda (n) (lambda (x) (+ x n))))
        //   (define add5 (make-adder 5))
        //   (add5 10)) = 15
        bytes[] memory pn = new bytes[](1); pn[0] = S("n");
        bytes[] memory px = new bytes[](1); px[0] = S("x");

        bytes memory inner = L3(S("lambda"), L(px), L3(S("+"), S("x"), S("n")));
        bytes memory outer = L3(S("lambda"), L(pn), inner);
        bytes memory defMA = L3(S("define"), S("make-adder"), outer);
        bytes memory defA5 = L3(S("define"), S("add5"), L2(S("make-adder"), I(5)));
        bytes memory callE = L2(S("add5"), I(10));

        bytes[] memory prog = new bytes[](4);
        prog[0] = S("begin"); prog[1] = defMA; prog[2] = defA5; prog[3] = callE;
        expectInt(vm_.execute(L(prog)), 15);
    }

    function test_ExternalStaticCall() public {
        // Seed counter
        counter.add(42);

        // (staticcall <counter-addr-bytes> (selector "get()"))
        bytes memory addrBytes = BS(abi.encodePacked(address(counter)));
        bytes memory sel = L2(S("selector"), STR("get()"));
        bytes memory call_ = L3(S("staticcall"), addrBytes, sel);

        // result is (bytes) → convert to int
        bytes memory prog = L2(S("bytes->int"), call_);
        expectInt(vm_.execute(prog), 42);
    }

    function test_ExternalCallMutates() public {
        // (call <counter> (concat (selector "add(uint256)") (pad32 7)) 0)
        bytes memory addrBytes = BS(abi.encodePacked(address(counter)));
        bytes memory selAdd = L2(S("selector"), STR("add(uint256)"));
        bytes memory padded = L2(S("pad32"), I(7));
        bytes memory callData = L3(S("concat"), selAdd, padded);
        bytes memory call_ = L4(S("call"), addrBytes, callData, I(0));
        bytes memory prog = L2(S("bytes->int"), call_);

        expectInt(vm_.execute(prog), 7);
        assertEq(counter.count(), 7);
    }

    function test_ComposedProgram() public {
        // Combined: define helper, check via staticcall, then write.
        // (begin
        //   (define C <counter-bytes>)
        //   (call C (concat (selector "add(uint256)") (pad32 100)) 0)
        //   (bytes->int (staticcall C (selector "get()"))))
        bytes memory addrBytes = BS(abi.encodePacked(address(counter)));
        bytes memory defC = L3(S("define"), S("C"), addrBytes);
        bytes memory selAdd = L2(S("selector"), STR("add(uint256)"));
        bytes memory padded = L2(S("pad32"), I(100));
        bytes memory data   = L3(S("concat"), selAdd, padded);
        bytes memory mutate = L4(S("call"), S("C"), data, I(0));
        bytes memory readBack = L2(S("bytes->int"),
            L3(S("staticcall"), S("C"), L2(S("selector"), STR("get()"))));

        bytes[] memory prog = new bytes[](4);
        prog[0] = S("begin"); prog[1] = defC; prog[2] = mutate; prog[3] = readBack;
        expectInt(vm_.execute(L(prog)), 100);
    }
}

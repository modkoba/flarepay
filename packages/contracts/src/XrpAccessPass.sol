// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * XrpAccessPass — on-chain access granted by a native XRP payment.
 *
 * This is the thing a server cannot do. Kelvin-style credit balances live in a
 * database, so only Kelvin can honour them; any other contract has to take
 * Kelvin's word for it, which on-chain means it cannot be used at all. Here the
 * grant is contract state, so *any* contract on Flare can gate on it — see
 * PremiumVault below, which has no relationship with this one beyond reading it.
 *
 * The XRP never touches Flare. FlarePayEscrow proves the payment landed on the
 * XRP Ledger; this contract reads that proof and writes the consequence.
 *
 * Recipient binding: the Flare address is fixed into the charge's metadata at
 * creation time, as "pass:0x<lowercase hex>". Rather than parse a string
 * on-chain, claim() rebuilds the expected metadata from the supplied recipient
 * and compares hashes — so nobody can redirect somebody else's grant, and
 * claim() stays permissionless (anyone may submit it, including a relayer
 * paying the gas, which is how a payer with no FLR ever gets access).
 */

interface IFlarePayEscrow {
    function charges(uint256 chargeId)
        external
        view
        returns (
            address merchant,
            bytes32 merchantAddressHash,
            uint64 usdCents,
            uint256 rateValue,
            int8 rateDecimals,
            uint256 quotedDrops,
            uint16 toleranceBips,
            uint32 destinationTag,
            uint64 createdAt,
            uint64 expiresAt,
            bool settled,
            bytes32 settledTxId,
            string memory metadata
        );
}

contract XrpAccessPass {
    IFlarePayEscrow public immutable escrow;

    /// Seconds of access granted per USD cent paid — set once at deploy.
    uint256 public immutable secondsPerCent;

    /// holder => unix timestamp the pass lapses at.
    mapping(address => uint64) public expiresAt;

    /// Replay guard: a settled charge can only ever be claimed once.
    mapping(uint256 => bool) public claimed;

    event AccessGranted(uint256 indexed chargeId, address indexed holder, uint64 expiresAt, uint64 usdCents);

    error NotSettled(uint256 chargeId);
    error AlreadyClaimed(uint256 chargeId);
    error RecipientMismatch(uint256 chargeId, string metadata);

    constructor(address escrowAddress, uint256 secondsPerCent_) {
        escrow = IFlarePayEscrow(escrowAddress);
        secondsPerCent = secondsPerCent_;
    }

    /// True while `who` holds unexpired access. This is the whole public API
    /// other contracts need.
    function hasAccess(address who) public view returns (bool) {
        return expiresAt[who] > block.timestamp;
    }

    /**
     * Turn a settled charge into access. Permissionless by design: the payer
     * has no FLR, so somebody else submits this — and cannot steal the grant,
     * because the recipient was pinned on-chain before payment.
     */
    function claim(uint256 chargeId, address recipient) external {
        if (claimed[chargeId]) revert AlreadyClaimed(chargeId);

        // Read in its own frame: destructuring all 13 charge fields inline
        // overflows the stack, so only the three we need cross back.
        (uint64 usdCents, bool settled, string memory metadata) = _readCharge(chargeId);
        if (!settled) revert NotSettled(chargeId);

        if (keccak256(bytes(metadata)) != keccak256(bytes(_expectedMetadata(recipient)))) {
            revert RecipientMismatch(chargeId, metadata);
        }

        claimed[chargeId] = true;

        // Extend from now, or from the current expiry if the pass is still live,
        // so topping up early never costs the holder time.
        uint64 base = expiresAt[recipient] > block.timestamp ? expiresAt[recipient] : uint64(block.timestamp);
        uint64 until_ = base + uint64(uint256(usdCents) * secondsPerCent);
        expiresAt[recipient] = until_;

        emit AccessGranted(chargeId, recipient, until_, usdCents);
    }

    /// Pull only the charge fields this contract cares about.
    function _readCharge(uint256 chargeId)
        internal
        view
        returns (uint64 usdCents, bool settled, string memory metadata)
    {
        (, , usdCents, , , , , , , , settled, , metadata) = escrow.charges(chargeId);
    }

    /// The exact metadata string a charge must carry to grant `recipient`.
    function _expectedMetadata(address recipient) internal pure returns (string memory) {
        return string(abi.encodePacked("pass:", _toHexString(recipient)));
    }

    /// Lowercase 0x-prefixed address, matching what the server writes.
    function _toHexString(address value) internal pure returns (string memory) {
        bytes16 digits = "0123456789abcdef";
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        uint160 raw = uint160(value);
        for (uint256 i = 41; i > 1; --i) {
            buffer[i] = digits[raw & 0xf];
            raw >>= 4;
        }
        return string(buffer);
    }
}

/**
 * A deliberately unrelated contract, to make the point that the grant is
 * composable. It knows nothing about payments, XRP, or FlarePay — it only reads
 * the pass. No server-side balance can ever be used this way.
 */
contract PremiumVault {
    XrpAccessPass public immutable pass;
    uint256 public reads;

    error NoAccess(address caller);

    constructor(address passAddress) {
        pass = XrpAccessPass(passAddress);
    }

    /// Reverts for anyone without a live pass; succeeds for anyone with one.
    function premiumValue() external returns (uint256) {
        if (!pass.hasAccess(msg.sender)) revert NoAccess(msg.sender);
        reads += 1;
        return uint256(keccak256(abi.encodePacked(block.number, msg.sender))) % 1000;
    }

    /// Read-only probe so a UI can show the gate without spending gas.
    function canRead(address who) external view returns (bool) {
        return pass.hasAccess(who);
    }
}

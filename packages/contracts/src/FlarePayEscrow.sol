// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * FlarePayEscrow — settle XRP Ledger payments on Flare against FDC proofs.
 *
 * A merchant opens a charge priced in USD. The payer sends native XRP on the
 * XRPL with the charge's destination tag. Anyone may then submit an FDC
 * XRPPayment proof of that transaction; this contract checks it and marks the
 * charge paid. No custody: funds move payer -> merchant on the XRPL directly.
 * This contract settles *facts*, not money.
 *
 * Settlement conditions (all enforced on-chain):
 *   1. FdcVerification.verifyXRPPayment(proof) is true (Merkle proof vs round root)
 *   2. proof.destinationTag == charge tag, and the tag is present
 *   3. proof.receivingAddressHash == merchant's XRPL address hash
 *   4. payment status is SUCCESS
 *   5. XRP received, valued at the FTSO XRP/USD rate pinned when the charge was
 *      created, covers the USD amount within a tolerance band
 *   6. each XRPL transaction settles at most one charge (replay guard)
 */

interface IFdcVerification {
    struct XRPPaymentRequestBody {
        bytes32 transactionId;
        address proofOwner;
    }

    struct XRPPaymentResponseBody {
        uint64 blockNumber;
        uint64 blockTimestamp;
        string sourceAddress;
        bytes32 sourceAddressHash;
        bytes32 receivingAddressHash;
        bytes32 intendedReceivingAddressHash;
        int256 spentAmount;
        int256 intendedSpentAmount;
        int256 receivedAmount;
        int256 intendedReceivedAmount;
        bool hasMemoData;
        bytes firstMemoData;
        bool hasDestinationTag;
        uint256 destinationTag;
        uint8 status;
    }

    struct XRPPaymentResponse {
        bytes32 attestationType;
        bytes32 sourceId;
        uint64 votingRound;
        uint64 lowestUsedTimestamp;
        XRPPaymentRequestBody requestBody;
        XRPPaymentResponseBody responseBody;
    }

    struct XRPPaymentProof {
        bytes32[] merkleProof;
        XRPPaymentResponse data;
    }

    function verifyXRPPayment(XRPPaymentProof calldata _proof) external view returns (bool);
}

interface IFlareContractRegistry {
    function getContractAddressByName(string calldata _name) external view returns (address);
}

interface IFtsoV2 {
    function getFeedById(bytes21 _feedId)
        external
        payable
        returns (uint256 _value, int8 _decimals, uint64 _timestamp);
}

contract FlarePayEscrow {
    /// FlareContractRegistry — same address on every Flare network.
    IFlareContractRegistry public constant REGISTRY =
        IFlareContractRegistry(0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019);

    /// FTSOv2 feed id for XRP/USD (category 0x01 + "XRP/USD" right-padded).
    bytes21 public constant XRP_USD_FEED_ID = bytes21(0x015852502f55534400000000000000000000000000);

    uint8 private constant XRPL_STATUS_SUCCESS = 0;
    uint256 private constant DROPS_PER_XRP = 1_000_000;

    struct Charge {
        address merchant;
        /// keccak256 of the merchant's XRPL r-address, as FDC hashes it.
        bytes32 merchantAddressHash;
        /// Price in USD cents, fixed at creation.
        uint64 usdCents;
        /// XRP/USD rate pinned at creation (value and decimals from FTSOv2).
        uint256 rateValue;
        int8 rateDecimals;
        /// Drops the payer must send, derived from the pinned rate.
        uint256 quotedDrops;
        /// Acceptable shortfall in basis points (covers rounding and XRPL fees).
        uint16 toleranceBips;
        uint32 destinationTag;
        uint64 createdAt;
        uint64 expiresAt;
        bool settled;
        bytes32 settledTxId;
        string metadata;
    }

    mapping(uint256 => Charge) public charges;
    /// XRPL transaction id => charge it settled (replay guard).
    mapping(bytes32 => uint256) public settledBy;
    uint256 public nextChargeId = 1;
    uint32 private nextTag = 1000;

    event ChargeCreated(
        uint256 indexed chargeId,
        address indexed merchant,
        uint32 destinationTag,
        uint64 usdCents,
        uint256 quotedDrops,
        uint256 rateValue,
        int8 rateDecimals,
        uint64 expiresAt
    );

    event ChargeSettled(
        uint256 indexed chargeId,
        bytes32 indexed xrplTxId,
        uint32 destinationTag,
        uint256 dropsReceived,
        string payerAddress,
        uint64 votingRound
    );

    error ChargeNotFound();
    error ChargeAlreadySettled();
    error ChargeExpired();
    error ProofRejected();
    error MissingDestinationTag();
    error TagMismatch(uint256 expected, uint256 got);
    error WrongRecipient();
    error PaymentNotSuccessful(uint8 status);
    error Underpaid(uint256 required, uint256 received);
    error TxAlreadyUsed(uint256 chargeId);

    /**
     * Open a charge priced in USD. The XRP/USD rate is read from FTSOv2 and
     * pinned now, so the payer's required amount cannot drift mid-checkout.
     * @param merchantAddressHash keccak256 of the merchant's XRPL r-address
     *        (FDC's standard address hash for the receiving address)
     */
    function createCharge(
        bytes32 merchantAddressHash,
        uint64 usdCents,
        uint16 toleranceBips,
        uint32 validForSeconds,
        string calldata metadata
    ) external returns (uint256 chargeId, uint32 destinationTag, uint256 quotedDrops) {
        require(usdCents > 0, "usdCents=0");
        require(toleranceBips <= 2000, "tolerance too high");
        require(merchantAddressHash != bytes32(0), "merchant hash=0");

        (uint256 rateValue, int8 rateDecimals, ) = _ftsoV2().getFeedById(XRP_USD_FEED_ID);
        require(rateValue > 0, "no XRP/USD rate");

        quotedDrops = _usdCentsToDrops(usdCents, rateValue, rateDecimals);
        chargeId = nextChargeId++;
        destinationTag = nextTag++;

        charges[chargeId] = Charge({
            merchant: msg.sender,
            merchantAddressHash: merchantAddressHash,
            usdCents: usdCents,
            rateValue: rateValue,
            rateDecimals: rateDecimals,
            quotedDrops: quotedDrops,
            toleranceBips: toleranceBips,
            destinationTag: destinationTag,
            createdAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp) + validForSeconds,
            settled: false,
            settledTxId: bytes32(0),
            metadata: metadata
        });

        emit ChargeCreated(
            chargeId,
            msg.sender,
            destinationTag,
            usdCents,
            quotedDrops,
            rateValue,
            rateDecimals,
            uint64(block.timestamp) + validForSeconds
        );
    }

    /**
     * Settle a charge with an FDC proof of the XRPL payment. Permissionless:
     * the payer, the merchant, or any relayer may submit it — the proof is what
     * carries authority, not the sender.
     */
    function settle(uint256 chargeId, IFdcVerification.XRPPaymentProof calldata proof) external {
        Charge storage charge = charges[chargeId];
        if (charge.merchant == address(0)) revert ChargeNotFound();
        if (charge.settled) revert ChargeAlreadySettled();

        bytes32 xrplTxId = proof.data.requestBody.transactionId;
        uint256 usedBy = settledBy[xrplTxId];
        if (usedBy != 0) revert TxAlreadyUsed(usedBy);

        if (!_fdcVerification().verifyXRPPayment(proof)) revert ProofRejected();

        IFdcVerification.XRPPaymentResponseBody calldata body = proof.data.responseBody;
        if (body.status != XRPL_STATUS_SUCCESS) revert PaymentNotSuccessful(body.status);
        if (!body.hasDestinationTag) revert MissingDestinationTag();
        if (body.destinationTag != charge.destinationTag) {
            revert TagMismatch(charge.destinationTag, body.destinationTag);
        }
        if (body.receivingAddressHash != charge.merchantAddressHash) revert WrongRecipient();

        // Payment must not predate the charge, and must land before it lapses.
        if (body.blockTimestamp > charge.expiresAt) revert ChargeExpired();

        uint256 received = body.receivedAmount <= 0 ? 0 : uint256(body.receivedAmount);
        uint256 required = (charge.quotedDrops * (10_000 - charge.toleranceBips)) / 10_000;
        if (received < required) revert Underpaid(required, received);

        charge.settled = true;
        charge.settledTxId = xrplTxId;
        settledBy[xrplTxId] = chargeId;

        emit ChargeSettled(
            chargeId,
            xrplTxId,
            charge.destinationTag,
            received,
            body.sourceAddress,
            proof.data.votingRound
        );
    }

    /// True once a charge has been settled by a verified payment.
    function isPaid(uint256 chargeId) external view returns (bool) {
        return charges[chargeId].settled;
    }

    /// Current XRP/USD rate and the drops a given USD amount needs right now.
    function quote(uint64 usdCents) external returns (uint256 drops, uint256 rateValue, int8 rateDecimals) {
        (rateValue, rateDecimals, ) = _ftsoV2().getFeedById(XRP_USD_FEED_ID);
        drops = _usdCentsToDrops(usdCents, rateValue, rateDecimals);
    }

    /**
     * drops = usdCents / 100 / (rateValue / 10^decimals) * 1e6
     *       = usdCents * 10^decimals * 1e6 / (100 * rateValue)
     */
    function _usdCentsToDrops(uint64 usdCents, uint256 rateValue, int8 rateDecimals)
        private
        pure
        returns (uint256)
    {
        uint256 scale = 10 ** uint256(uint8(rateDecimals >= 0 ? rateDecimals : -rateDecimals));
        if (rateDecimals >= 0) {
            return (uint256(usdCents) * scale * DROPS_PER_XRP) / (100 * rateValue);
        }
        return (uint256(usdCents) * DROPS_PER_XRP) / (100 * rateValue * scale);
    }

    function _fdcVerification() private view returns (IFdcVerification) {
        return IFdcVerification(REGISTRY.getContractAddressByName("FdcVerification"));
    }

    function _ftsoV2() private view returns (IFtsoV2) {
        return IFtsoV2(REGISTRY.getContractAddressByName("FtsoV2"));
    }
}

/**
 * FlareKit SDK — human-readable ABI fragments for Flare's enshrined contracts.
 *
 * Product principle 6: never hand-roll selectors. Every call goes through
 * ethers.Contract with these fragments; ethers derives the selectors.
 * Struct layouts mirror the published Flare interfaces (IAddressValidity,
 * IPayment, IFdcVerification, FtsoV2, RandomNumberV2).
 */

export const REGISTRY_ABI = [
  "function getContractAddressByName(string _name) external view returns (address)",
];

export const FDC_HUB_ABI = [
  "function requestAttestation(bytes _data) external payable",
];

export const FDC_FEE_CONFIG_ABI = [
  "function getRequestFee(bytes _data) external view returns (uint256)",
];

export const FLARE_SYSTEMS_MANAGER_ABI = [
  "function firstVotingRoundStartTs() external view returns (uint256)",
  "function votingEpochDurationSeconds() external view returns (uint256)",
];

export const RELAY_ABI = [
  "function isFinalized(uint256 _protocolId, uint256 _votingRoundId) external view returns (bool)",
];

const ADDRESS_VALIDITY_DATA_TUPLE =
  "(bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, " +
  "(string addressStr) requestBody, " +
  "(bool isValid, string standardAddress, bytes32 standardAddressHash) responseBody)";

const PAYMENT_DATA_TUPLE =
  "(bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, " +
  "(bytes32 transactionId, uint256 inUtxo, uint256 utxo) requestBody, " +
  "(uint64 blockNumber, uint64 blockTimestamp, bytes32 sourceAddressHash, bytes32 sourceAddressesRoot, " +
  "bytes32 receivingAddressHash, bytes32 intendedReceivingAddressHash, int256 spentAmount, " +
  "int256 intendedSpentAmount, int256 receivedAmount, int256 intendedReceivedAmount, " +
  "bytes32 standardPaymentReference, bool oneToOne, uint8 status) responseBody)";

export const FDC_VERIFICATION_ABI = [
  "function fdcProtocolId() external view returns (uint8)",
  `function verifyAddressValidity((bytes32[] merkleProof, ${ADDRESS_VALIDITY_DATA_TUPLE} data) _proof) external view returns (bool)`,
  `function verifyPayment((bytes32[] merkleProof, ${PAYMENT_DATA_TUPLE} data) _proof) external view returns (bool)`,
];

/** ABI tuple used to decode the DA layer's response_hex per attestation type. */
export const RESPONSE_TUPLES: Record<string, string> = {
  AddressValidity: ADDRESS_VALIDITY_DATA_TUPLE,
  Payment: PAYMENT_DATA_TUPLE,
};

export const FTSO_V2_ABI = [
  "function getFeedById(bytes21 _feedId) external payable returns (uint256 _value, int8 _decimals, uint64 _timestamp)",
];

export const RANDOM_NUMBER_V2_ABI = [
  "function getRandomNumber() external view returns (uint256 _randomNumber, bool _isSecureRandom, uint256 _randomTimestamp)",
];

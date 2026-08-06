import { ethers } from "ethers";

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const provider = new ethers.JsonRpcProvider(RPC);

async function main() {
  const network = await provider.getNetwork();
  console.log("Network:", network);
  const blockNum = await provider.getBlockNumber();
  console.log("Current block:", blockNum);

  const FdcHub = "0x48aC463d7975828989331F4De43341627b9c5f1D";
  const FdcVerification = "0x906507E0B64bcD494Db73bd0459d1C667e14B933";
  const FdcRequestFee = "0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e";

  const hubCode = await provider.getCode(FdcHub);
  const verifCode = await provider.getCode(FdcVerification);
  const feeCode = await provider.getCode(FdcRequestFee);

  console.log("FdcHub deployed:", hubCode !== "0x");
  console.log("FdcVerification deployed:", verifCode !== "0x");
  console.log("FeeConfig deployed:", feeCode !== "0x");

  const hub = new ethers.Contract(
    FdcHub,
    [
      "function fdcRequestFeeConfigurations() external view returns (address)",
      "function fdcInflationConfigurations() external view returns (address)",
      "function requestsOffsetSeconds() external view returns (uint8)",
    ],
    provider
  );

  try {
    const feeAddr = await hub.fdcRequestFeeConfigurations();
    console.log("Fee config address:", feeAddr);
  } catch (e) {
    console.log("Fee config error:", (e as Error).message);
  }

  try {
    const infAddr = await hub.fdcInflationConfigurations();
    console.log("Inflation config address:", infAddr);
  } catch (e) {
    console.log("Inflation config error:", (e as Error).message);
  }

  try {
    const offset = await hub.requestsOffsetSeconds();
    console.log("Requests offset:", offset.toString());
  } catch (e) {
    console.log("Offset error:", (e as Error).message);
  }

  // Check FdcVerification methods
  const verif = new ethers.Contract(
    FdcVerification,
    [
      "function fdcProtocolId() external view returns (uint8)",
      "function relay() external view returns (address)",
      "function verifyPayment(bytes32[], tuple(bytes32,bytes32,uint64,uint64,tuple(bytes32,bytes32,uint256,uint256),tuple(uint64,uint64,bytes32,bytes32,bytes32,bytes32,int256,int256,int256,int256,bytes32,bool,uint8))) external view returns (bool)",
    ],
    provider
  );

  try {
    const protocolId = await verif.fdcProtocolId();
    console.log("FDC protocol ID:", protocolId.toString());
  } catch (e) {
    console.log("Protocol ID error:", (e as Error).message);
  }

  try {
    const relayAddr = await verif.relay();
    console.log("Relay address:", relayAddr);
  } catch (e) {
    console.log("Relay error:", (e as Error).message);
  }

  // Try to get fee for a simple Payment attestation request
  const feeContract = new ethers.Contract(
    FdcRequestFee,
    ["function getRequestFee(bytes) external view returns (uint256)"],
    provider
  );

  // Payment attestation type = keccak256("Payment")
  const paymentAttestationType = ethers.keccak256(ethers.toUtf8Bytes("Payment"));
  console.log("Payment attestation type:", paymentAttestationType);

  // Source ID for BTC = keccak256("BTC") but it's actually just padded
  const btcSourceId = ethers.zeroPadValue(ethers.toUtf8Bytes("BTC"), 32);
  console.log("BTC source ID:", btcSourceId);

  // MIC = keccak256(abi.encode(expected response)) - we don't know this yet
  // For now try with zeros
  const dummyRequestBody =
    "0x" +
    ethers.zeroPadValue(ethers.toUtf8Bytes("BTC"), 32).slice(2) + // transactionId placeholder
    "00".repeat(32) + // inUtxo = 0
    "00".repeat(32); // utxo = 0

  // Build abiEncodedRequest: attestationType(32) + sourceId(32) + MIC(32) + requestBody
  const dummyAttestationType = ethers.zeroPadValue(ethers.toUtf8Bytes("Payment"), 32);
  const dummyMIC = "0x" + "00".repeat(32);
  const dummyRequest =
    dummyAttestationType + btcSourceId + dummyMIC.slice(2) + dummyRequestBody.slice(2);

  try {
    const fee = await feeContract.getRequestFee(dummyRequest);
    console.log("Fee for Payment/BTC:", ethers.formatEther(fee), "FLR");
  } catch (e) {
    console.log("Fee query error:", (e as Error).message.split("(")[0]);
  }

  // Also check if the FdcVerification address from "by hand" guide is valid
  const altVerif = "0x075bf301fF07C4920e5261f93a0609640F53487D";
  const altCode = await provider.getCode(altVerif);
  console.log("Alt verif (0x075bf...) deployed:", altCode !== "0x");

  // Check the "by hand" guide FdcHub address
  const altHub = "0x1c78A073E3BD2aCa4cc327d55FB0cD4f0549B55b";
  const altHubCode = await provider.getCode(altHub);
  console.log("Alt hub (0x1c78...) deployed (old Coston?):", altHubCode !== "0x");

  // Get a sample block to see timestamps
  const block = await provider.getBlock(blockNum);
  console.log("Latest block timestamp:", block?.timestamp);
}

main().catch(console.error);

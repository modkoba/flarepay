import { ethers } from "ethers";

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const provider = new ethers.JsonRpcProvider(RPC);
const FdcVerification = "0x906507E0B64bcD494Db73bd0459d1C667e14B933";

async function testRawCall(selector: string, label: string) {
  // Minimal valid calldata: just the selector + zeros
  const callData = selector + "0000000000000000000000000000000000000000000000000000000000000020";

  try {
    const result = await provider.call({ to: FdcVerification, data: callData });
    console.log(`  ${label}: ${result}`);
    return result;
  } catch (e: any) {
    const msg = e.info?.errorName || e.message.split("(")[0];
    console.log(`  ${label}: ${msg}`);
    return null;
  }
}

async function main() {
  console.log("Testing raw contract calls...\n");

  // Try basic view functions first
  await testRawCall("0xf4debe36", "verifyAddressValidity");
  await testRawCall("0x0ba6148d", "verifyAddressValidity variant 2");
  await testRawCall("0x2cc4bf9b", "verifyAddressValidity variant 3");

  // Try other functions
  await testRawCall("0x4e9e8e99", "fdcProtocolId"); // keccak256('fdcProtocolId()')
  await testRawCall("0x5228ece8", "relay"); // keccak256('relay()')

  // Try payment verification
  const paymentSelectors = [
    { sel: "0x3d2fc78d", label: "verifyPayment (no tuple)" },
    { sel: "0xa98b6dce", label: "verifyPayment variant" },
  ];

  for (const s of paymentSelectors) {
    await testRawCall(s.sel, s.label);
  }

  // Try confirmedBlockHeightExists
  await testRawCall("0x1f4ce9d2", "verifyConfirmedBlockHeightExists");
}

main().catch(console.error);

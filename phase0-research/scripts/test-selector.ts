import { ethers } from "ethers";

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const provider = new ethers.JsonRpcProvider(RPC);
const FdcVerification = "0x906507E0B64bcD494Db73bd0459d1C667e14B933";

const MERKLE_PROOF = [
  "0x49e9c323dd16637a45766557be22854ffea2d216a5b497f0363a31bf6f7aa5e7",
  "0x7e876559d026a8fcf0435b1cc242f4c0b5e02a8a72e295462c496c2882da6161",
  "0x410c7e28040fe6269148908fdbc61ecf88be6f8059b911c0222e6d967c7a4216",
];

async function testCall(selector: string, label: string, calldata: string) {
  try {
    const result = await provider.call({ to: FdcVerification, data: calldata });
    console.log(`  ${label}: ${result}`);
    return result;
  } catch (e: any) {
    const msg = e.info?.errorName || e.shortMessage || e.message.split("(")[0];
    console.log(`  ${label}: ${msg}`);
    if (e.info?.data) console.log(`    revert data: ${e.info.data}`);
    return null;
  }
}

async function main() {
  console.log("Testing verifyAddressValidity...\n");

  const coder = ethers.AbiCoder.defaultAbiCoder();

  // IAddressValidity types:
  // RequestBody = (string addressStr)
  // ResponseBody = (bool isValid, string standardAddress, bytes32 standardAddressHash)
  // Response = (bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp,
  //             RequestBody requestBody, ResponseBody responseBody)
  // Proof = (bytes32[] merkleProof, Response data)

  // Encode from innermost out - wrap tuples in arrays for AbiCoder

  // 1. RequestBody: (string)
  const requestBodyHex = coder.encode(["string"], ["rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj"]);

  // 2. ResponseBody: (bool, string, bytes32) - wrap in array
  const responseBodyHex = coder.encode(["(bool,string,bytes32)"], [[false, "", ethers.ZeroHash]]);
  console.log("ResponseBody:", responseBodyHex.slice(0, 80));

  // 3. Response: (bytes32, bytes32, uint64, uint64, string, (bool,string,bytes32))
  const responseHex = coder.encode(
    ["(bytes32,bytes32,uint64,uint64,string,(bool,string,bytes32))"],
    [
      [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x7465737458525000000000000000000000000000000000000000000000000000",
        1406877n,
        18446744073709551615n,
        "rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj",
        [false, "", ethers.ZeroHash],
      ],
    ]
  );
  console.log("Response:", responseHex.slice(0, 120));

  // 4. Full Proof: (bytes32[], bytes32, bytes32, uint64, uint64, string, (bool,string,bytes32))
  const proofHex = coder.encode(
    [
      "(bytes32[],bytes32,bytes32,uint64,uint64,string,(bool,string,bytes32))",
    ],
    [
      [
        MERKLE_PROOF,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x7465737458525000000000000000000000000000000000000000000000000000",
        1406877n,
        18446744073709551615n,
        "rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj",
        [false, "", ethers.ZeroHash],
      ],
    ]
  );
  console.log("Proof:", proofHex.slice(0, 120));
  console.log("");

  // Function signatures to try
  const signatures = [
    "verifyAddressValidity((bytes32[],bytes32,bytes32,uint64,uint64,string,(bool,string,bytes32)))",
    "verifyAddressValidity((bytes32[],bytes32,bytes32,uint64,uint64,(string),(bool,string,bytes32)))",
    "verifyAddressValidity((bytes32[],(bytes32,bytes32,uint64,uint64,string,(bool,string,bytes32))))",
  ];

  for (const sig of signatures) {
    const sel = ethers.keccak256(ethers.toUtf8Bytes(sig)).slice(0, 10);
    console.log(`Trying: ${sel}`);
    const calldata = sel + proofHex.slice(2);
    await testCall(sel, sig.slice(0, 50), calldata);
    console.log("");
  }
}

main().catch(console.error);

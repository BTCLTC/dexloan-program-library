const anchor = require("@project-serum/anchor");
const fs = require("fs");
const bs58 = require("bs58");
const { MetadataProgram } = require("@metaplex-foundation/mpl-token-metadata");

const connection = new anchor.web3.Connection("https://ssc-dao.genesysgo.net/");

async function getMintsByUpdateAuthority(updateAuthority) {
  const accounts = await connection.getProgramAccounts(MetadataProgram.PUBKEY, {
    filters: [
      {
        memcmp: {
          offset: 1,
          bytes: updateAuthority,
        },
      },
    ],
    dataSlice: {
      offset: 1 + 32,
      length: 32,
    },
  });

  const mints = accounts
    .map((value) => bs58.encode(value.account.data))
    .reduce((acc, curr) => {
      acc[curr] = curr;
      return acc;
    }, {});

  let currentMintsList = [];

  try {
    currentMintsList = require("../app/public/whitelist.json");
  } catch {}

  const allMints = [...currentMintsList];

  for (const strpubkey in mints) {
    if (!allMints[strpubkey]) {
      console.log("Missing mint: ", strpubkey);
      allMints.push(strpubkey);
    }
  }

  console.log(`${allMints.length - currentMintsList.length} mints added.`);

  fs.writeFileSync(
    "./app/public/whitelist.json",
    JSON.stringify(allMints, null, 2)
  );
}

// Primary update authority 5fm1MDn52ygECVK5Aqixb9CCwbmpUb3omjetmvtDbD3r
// Gumdrop Fg3fDz9fQMFrhmo2pg3BMgXjTFEN8rMZNzv1sKthwfkJ
getMintsByUpdateAuthority("Fg3fDz9fQMFrhmo2pg3BMgXjTFEN8rMZNzv1sKthwfkJ");

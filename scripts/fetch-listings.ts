import * as anchor from "@project-serum/anchor";
import bs58 from "bs58";
import fs from "fs";
import path from "path";

import idl from "../target/idl/dexloan_listings.json";
import type { DexloanListings } from "../target/types/dexloan_listings";
import { ListingState } from "../app/common/types";
import { LISTINGS_PROGRAM_ID } from "../app/common/constants";

const connection = new anchor.web3.Connection("https://ssc-dao.genesysgo.net/");

const provider = new anchor.Provider(
  connection,
  anchor.Wallet,
  anchor.Provider.defaultOptions()
);

const program = new anchor.Program<DexloanListings>(
  idl as any,
  LISTINGS_PROGRAM_ID,
  provider
);

function getState(state) {
  switch (state) {
    case ListingState.Active:
      return "Active";
    case ListingState.Listed:
      return "Listed";
  }
}

async function main() {
  const filename = new Date().toISOString();
  const outDir = "outputs";

  const listed = await program.account.listing.all([
    {
      memcmp: {
        // filter active
        offset: 7 + 1,
        bytes: bs58.encode(
          new anchor.BN(ListingState.Listed).toArrayLike(Buffer)
        ),
      },
    },
  ]);

  const active = await program.account.listing.all([
    {
      memcmp: {
        // filter active
        offset: 7 + 1,
        bytes: bs58.encode(
          new anchor.BN(ListingState.Active).toArrayLike(Buffer)
        ),
      },
    },
  ]);

  const listings = [...listed, ...active].map((listing) => ({
    publicKey: listing.publicKey.toBase58(),
    borrower: listing.account.borrower.toBase58(),
    lender: listing.account.lender.toBase58(),
    mint: listing.account.mint.toBase58(),
    state: getState(listing.account.state),
    amount: listing.account.amount.toNumber(),
  }));

  console.log(
    `Writing ${listings.length} listings to output file ${filename}.json`
  );

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  fs.writeFileSync(
    path.join(__dirname, "..", outDir, `${filename}.json`),
    JSON.stringify(listings, null, 2)
  );
}

main();

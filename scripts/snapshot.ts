import fs from "fs";
import path from "path";
import * as anchor from "@project-serum/anchor";

import { IDL, DexloanListings } from "../target/types/dexloan_listings";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "H6FCxCy2KCPJwCoUb9eQCSv41WZBKQaYfB6x5oFajzfj"
);

const connection = new anchor.web3.Connection("https://ssc-dao.genesysgo.net/");

async function main() {
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(anchor.web3.Keypair.generate()),
    anchor.AnchorProvider.defaultOptions()
  );
  const program = new anchor.Program<DexloanListings>(
    IDL,
    PROGRAM_ID,
    provider
  );

  const listings = await program.account.listing.all();

  fs.writeFileSync(
    path.join(__dirname, `snapshots/${new Date().toISOString()}`),
    JSON.stringify(listings, null, 2)
  );
}

main();

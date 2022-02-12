const anchor = require("@project-serum/anchor");
const fs = require("fs");
const bs58 = require("bs58");
const { Metadata } = require("@metaplex-foundation/mpl-token-metadata");

const mints = require("../app/public/whitelist");
const connection = new anchor.web3.Connection("https://ssc-dao.genesysgo.net/");

async function parseMints() {
  const chickens = [];
  const coops = [];

  console.log(`Processing ${mints.length} mints...`);

  for (const mint of mints) {
    const metadataPDA = await Metadata.getPDA(new anchor.web3.PublicKey(mint));
    const metadata = await Metadata.load(connection, metadataPDA);

    if (metadata.data.data.symbol === "CHKN") {
      chickens.push(metadata);
    } else if (metadata.data.data.symbol === "CHKCOP") {
      coops.push(metadata);
    } else {
      console.log("Wrong symbol!");
      console.log(metadata.toJSON());
      console.log("==========================");
    }
  }

  console.log("DONE.");
  console.log(`parsed ${chickens.length} chickens and ${coops.length} coops.`);
}

parseMints();

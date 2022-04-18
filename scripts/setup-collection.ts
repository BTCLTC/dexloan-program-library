import * as anchor from "@project-serum/anchor";
import { actions, NodeWallet } from "@metaplex/js";
import { createSetAndVerifyCollectionInstruction } from "@metaplex-foundation/mpl-token-metadata";

export async function mintNFT(
  connection: anchor.web3.Connection,
  keypair: anchor.web3.Keypair
) {
  const wallet = new NodeWallet(keypair);

  const nftResponse = await actions.mintNFT({
    connection,
    wallet,
    uri: "https://arweave.net/xOiXewpYgD6P520b1HWawtVNUBw_zrVT3z_pLCLpfl4",
  });

  console.log("NFT created:", nftResponse);
  const collectionNFTResponse = await actions.mintNFT({
    connection,
    wallet,
    uri: "https://arweave.net/JvzXTWnmiidDMYCOBZ9tZ6548sZAZItJbE8yuZteWoY",
  });

  console.log("collection NFT created:", collectionNFTResponse);
  const transaction = new anchor.web3.Transaction();

  transaction.add(
    createSetAndVerifyCollectionInstruction({
      metadata: nftResponse.metadata,
      collectionAuthority: wallet.publicKey,
      payer: wallet.publicKey,
      updateAuthority: wallet.publicKey,
      collectionMint: collectionNFTResponse.mint,
      collection: collectionNFTResponse.metadata,
      collectionMasterEditionAccount: collectionNFTResponse.edition,
    })
  );
  console.log("set and verify collection instruction...");
  await connection.sendTransaction(transaction, [keypair]);

  return {
    metadata: nftResponse.metadata,
    mint: nftResponse.mint,
    collection: collectionNFTResponse.metadata,
  };
}

async function main() {
  console.log("Setting up collection...");
  const connection = new anchor.web3.Connection(
    "https://psytrbhymqlkfrhudd.dev.genesysgo.net:8899/"
  );

  const wallet = getKeypair();

  const ownerAirdrop = await connection.requestAirdrop(
    wallet.publicKey,
    anchor.web3.LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(ownerAirdrop);
  console.log("Airdrop confirmed");
  const { metadata, mint, collection } = await mintNFT(connection, wallet);

  const tokenAccounts = await connection.getTokenAccountsByOwner(
    wallet.publicKey,
    { mint }
  );

  console.log("mint: ", mint.toBase58());
  console.log("metadata: ", metadata.toBase58());
  console.log("collection: ", collection.toBase58());
  console.log("tokenAccount: ", tokenAccounts[0].publicKey.toBase58());
}

function getKeypair() {
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array([
      110, 65, 80, 184, 150, 13, 135, 242, 51, 172, 90, 171, 254, 44, 9, 99, 19,
      122, 128, 213, 27, 240, 79, 16, 191, 201, 151, 247, 218, 150, 129, 164, 2,
      61, 82, 21, 88, 55, 224, 214, 253, 228, 213, 106, 13, 180, 49, 132, 238,
      255, 53, 205, 49, 29, 34, 134, 192, 183, 32, 29, 119, 105, 8, 47,
    ])
  );
}

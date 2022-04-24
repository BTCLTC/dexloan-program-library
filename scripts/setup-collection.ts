import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { NodeWallet, actions } from "@metaplex/js";
import {
  createSetAndVerifyCollectionInstruction,
  Metadata,
  PROGRAM_ADDRESS,
} from "@metaplex-foundation/mpl-token-metadata";

export async function mintNFT(
  connection: anchor.web3.Connection,
  keypair: anchor.web3.Keypair
) {
  const wallet = new NodeWallet(keypair);

  // const nft = await actions.mintNFT({
  //   connection,
  //   wallet,
  //   uri: "https://api.jsonbin.io/b/6261adabbc312b30ebeae11c",
  //   maxSupply: 0,
  // });

  // const collection = await actions.mintNFT({
  //   connection,
  //   wallet,
  //   uri: "https://api.jsonbin.io/b/6261adc280883c3054e50cdc",
  //   maxSupply: 0,
  // });

  const tokenAccounts = await connection.getTokenAccountsByOwner(
    wallet.publicKey,
    { programId: splToken.TOKEN_PROGRAM_ID }
  );
  console.log("tokenAccounts: ", tokenAccounts);
  const mint = new anchor.web3.PublicKey(
    "DTEtZLK8ScwGgjCK8nSbF78gGk6rTWLxkvc4qnYkWijj"
  );
  const collection = new anchor.web3.PublicKey(
    "Hqxffvgbxfb8iKhyxCvvbdMZ8EEdBjBtsEU8tmYqQdFm"
  );

  const [metadata] = await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      new anchor.web3.PublicKey(PROGRAM_ADDRESS).toBuffer(),
      new anchor.web3.PublicKey(mint).toBuffer(),
    ],
    new anchor.web3.PublicKey(PROGRAM_ADDRESS)
  );

  const [collectionMetadata] = await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      new anchor.web3.PublicKey(PROGRAM_ADDRESS).toBuffer(),
      new anchor.web3.PublicKey(collection).toBuffer(),
    ],
    new anchor.web3.PublicKey(PROGRAM_ADDRESS)
  );

  const [collectionEdition] = await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      new anchor.web3.PublicKey(PROGRAM_ADDRESS).toBuffer(),
      new anchor.web3.PublicKey(mint).toBuffer(),
      Buffer.from("edition"),
    ],
    new anchor.web3.PublicKey(PROGRAM_ADDRESS)
  );
  console.log("metadata: ", metadata.toBase58());
  console.log("collectionMetadata: ", collectionMetadata.toBase58());
  console.log("collectionMint: ", collection.toBase58());
  const metadataData = await connection.getAccountInfo(metadata);
  console.log("metadataData: ", metadataData);
  const collectionData = await connection.getAccountInfo(collectionMetadata);
  console.log("collectionData: ", collectionData);
  // const transaction = new anchor.web3.Transaction();

  // transaction.add(
  //   createSetAndVerifyCollectionInstruction({
  //     metadata,
  //     collectionAuthority: wallet.publicKey,
  //     payer: wallet.publicKey,
  //     updateAuthority: wallet.publicKey,
  //     collectionMint: collection,
  //     collection: collectionMetadata,
  //     collectionMasterEditionAccount: collectionEdition,
  //   })
  // );

  // const txId = await connection.sendTransaction(transaction, [keypair]);
  // console.log("set and verify collection instruction...: ", txId);
}

async function main() {
  console.log("Setting up collection...");
  const connection = new anchor.web3.Connection(
    "https://psytrbhymqlkfrhudd.dev.genesysgo.net:8899/"
  );

  const wallet = getKeypair();
  console.log("wallet:", wallet.publicKey.toBase58());

  await mintNFT(connection, wallet);
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

main();

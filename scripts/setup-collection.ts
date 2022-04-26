import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { NodeWallet, actions } from "@metaplex/js";
import {
  createSetAndVerifyCollectionInstruction,
  Metadata,
  PROGRAM_ADDRESS,
} from "@metaplex-foundation/mpl-token-metadata";
import TransactionFactory from "@project-serum/anchor/dist/cjs/program/namespace/transaction";

export async function mintNFT(
  connection: anchor.web3.Connection,
  keypair: anchor.web3.Keypair
) {
  const wallet = new NodeWallet(keypair);

  const tokenAccounts = await connection.getTokenAccountsByOwner(
    wallet.publicKey,
    { programId: splToken.TOKEN_PROGRAM_ID }
  );

  const mint = new anchor.web3.PublicKey(
    "DTEtZLK8ScwGgjCK8nSbF78gGk6rTWLxkvc4qnYkWijj"
  );
  const collection = new anchor.web3.PublicKey(
    "Hqxffvgbxfb8iKhyxCvvbdMZ8EEdBjBtsEU8tmYqQdFm"
  );

  const decodedTokenAccounts = tokenAccounts.value.map(
    ({ account, pubkey }) => ({
      pubkey,
      account: splToken.AccountLayout.decode(
        account.data.slice(0, splToken.AccountLayout.span)
      ),
    })
  );

  const mintTokenAccount = decodedTokenAccounts.find(
    (a) =>
      new anchor.web3.PublicKey(a.account.mint).toBase58() === mint.toBase58()
  );

  console.log(
    "mintTokenAccount:",
    new anchor.web3.PublicKey(mintTokenAccount.pubkey).toBase58()
  );

  const borrowerKeypair = getBorrowerKeypair();
  const associatedAccount = await splToken.Token.getAssociatedTokenAddress(
    splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    splToken.TOKEN_PROGRAM_ID,
    mint,
    borrowerKeypair.publicKey
  );

  const transaction = new anchor.web3.Transaction();

  transaction.add(
    splToken.Token.createTransferCheckedInstruction(
      splToken.TOKEN_PROGRAM_ID,
      mintTokenAccount.pubkey,
      mint,
      associatedAccount,
      keypair.publicKey,
      [],
      1,
      0
    )
  );

  console.log("associatedAccount:", associatedAccount.toBase58());

  const txId = await connection.sendTransaction(transaction, [keypair]);
  console.log("set and verify collection instruction...: ", txId);
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

function getBorrowerKeypair() {
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array([
      237, 50, 194, 26, 173, 162, 184, 234, 193, 49, 117, 10, 221, 52, 172, 120,
      102, 242, 188, 25, 179, 76, 233, 48, 216, 59, 223, 185, 197, 29, 123, 115,
      181, 43, 8, 99, 89, 211, 80, 79, 246, 128, 250, 237, 37, 83, 168, 203,
      217, 187, 136, 111, 194, 228, 110, 199, 54, 201, 93, 28, 32, 184, 212, 29,
    ])
  );
}

main();

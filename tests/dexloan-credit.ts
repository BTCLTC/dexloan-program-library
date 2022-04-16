import assert from "assert";
import * as anchor from "@project-serum/anchor";
import type { DexloanCredit } from "../target/types/dexloan_credit";
import { mintNFT } from "./setup";

describe("Dexloan Credit", async () => {
  const connection = new anchor.web3.Connection(
    "http://localhost:8899",
    anchor.Provider.defaultOptions().preflightCommitment
  );

  const ownerKeypair = anchor.web3.Keypair.generate();
  const borrowerKeypair = anchor.web3.Keypair.generate();
  const wallet = new anchor.Wallet(ownerKeypair);
  const provider = new anchor.Provider(
    connection,
    wallet,
    anchor.Provider.defaultOptions()
  );
  const idl = require("../target/idl/dexloan_credit.json");
  const programID = new anchor.web3.PublicKey(idl.metadata.address);
  const program = new anchor.Program<DexloanCredit>(idl, programID, provider);

  let poolAccount: anchor.web3.PublicKey;
  let mint: anchor.web3.PublicKey;
  let metadata: anchor.web3.PublicKey;
  let collection: anchor.web3.PublicKey;

  before(async () => {
    const ownerAirdrop = await connection.requestAirdrop(
      ownerKeypair.publicKey,
      anchor.web3.LAMPORTS_PER_SOL * 2
    );
    await connection.confirmTransaction(ownerAirdrop);
    const borrowerAirdrop = await connection.requestAirdrop(
      borrowerKeypair.publicKey,
      anchor.web3.LAMPORTS_PER_SOL * 2
    );
    await connection.confirmTransaction(borrowerAirdrop);

    ({ metadata, mint, collection } = await mintNFT(
      connection,
      borrowerKeypair
    ));
  });

  it("Creates a new collection pool", async () => {
    [poolAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("pool"),
        ownerKeypair.publicKey.toBuffer(),
        collection.toBuffer(),
      ],
      program.programId
    );

    const transaction = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: ownerKeypair.publicKey,
        toPubkey: poolAccount,
        lamports: anchor.web3.LAMPORTS_PER_SOL / 2,
      })
    );

    await anchor.web3.sendAndConfirmTransaction(connection, transaction, [
      ownerKeypair,
    ]);

    const options = new PoolOptions();
    options.collection = collection;
    options.floorPrice = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
    options.basisPoints = 1_000;

    await program.methods
      .createPool(options)
      .accounts({
        poolAccount,
        owner: ownerKeypair.publicKey,
      })
      .rpc();

    const account = await program.account.pool.fetch(poolAccount);
    assert.equal(account.owner.toBase58(), ownerKeypair.publicKey.toBase58());
    assert.equal(account.collection.toBase58(), collection.toBase58());
    assert.equal(account.floorPrice.toNumber(), 1_000_000);
    assert.equal(account.basisPoints, 1_000);
  });

  it("Creates a loan", async () => {
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      borrowerKeypair.publicKey,
      { mint }
    );

    const [listingAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("listing"),
        mint.toBuffer(),
        borrowerKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [escrowAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("escrow"), mint.toBuffer()],
      program.programId
    );

    await program.methods
      .borrowFromPool()
      .accounts({
        pool: poolAccount,
        borrower: borrowerKeypair.publicKey,
        borrowerDepositTokenAccount: tokenAccounts[0].address,
        listingAccount: listingAddress,
        escrowAccount: escrowAddress,
        mint,
        metadataAccount: metadata,
      })
      .rpc();
  });
});

class PoolOptions {
  public collection: anchor.web3.PublicKey;
  public floorPrice: anchor.BN;
  public basisPoints: number;
}

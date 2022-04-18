import assert from "assert";
import * as anchor from "@project-serum/anchor";
import type { DexloanCredit } from "../target/types/dexloan_credit";

describe("Dexloan Credit", async () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .DexloanCredit as anchor.Program<DexloanCredit>;

  const ownerKeypair = anchor.web3.Keypair.generate();
  const borrowerKeypair = anchor.web3.Keypair.generate();

  let collection: anchor.web3.PublicKey;

  it("Initializes a new collection pool", async () => {
    const options = new PoolOptions();
    options.collection = collection;
    options.floorPrice = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
    options.basisPoints = 1_000;

    // Create pool account
    const tx = await program.methods.createPool(options).accounts({
      owner: ownerKeypair.publicKey,
    });
    const keys = await tx.pubkeys();
    await tx.rpc();

    // Transfer SOL to pool account
    const transaction = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: ownerKeypair.publicKey,
        toPubkey: keys.poolAccount,
        lamports: anchor.web3.LAMPORTS_PER_SOL / 2,
      })
    );
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      transaction,
      [ownerKeypair]
    );

    const account = await program.account.pool.fetch(keys.poolAccount);

    assert.equal(account.owner.toBase58(), ownerKeypair.publicKey.toBase58());
    assert.equal(account.collection.toBase58(), collection.toBase58());
    assert.equal(account.floorPrice.toNumber(), 1_000_000);
    assert.equal(account.basisPoints, 1_000);
  });

  // it("Creates a loan", async () => {
  //   const tokenAccounts =
  //     await program.provider.connection.getTokenAccountsByOwner(
  //       borrowerKeypair.publicKey,
  //       { mint }
  //     );

  //   const [listingAddress] = await anchor.web3.PublicKey.findProgramAddress(
  //     [
  //       Buffer.from("listing"),
  //       mint.toBuffer(),
  //       borrowerKeypair.publicKey.toBuffer(),
  //     ],
  //     program.programId
  //   );

  //   const [escrowAddress] = await anchor.web3.PublicKey.findProgramAddress(
  //     [Buffer.from("escrow"), mint.toBuffer()],
  //     program.programId
  //   );

  //   await program.methods
  //     .borrowFromPool()
  //     .accounts({
  //       pool: poolAccount,
  //       borrower: borrowerKeypair.publicKey,
  //       borrowerDepositTokenAccount: tokenAccounts[0].address,
  //       listingAccount: listingAddress,
  //       escrowAccount: escrowAddress,
  //       mint,
  //       metadataAccount: metadata,
  //     })
  //     .rpc();
  // });
});

class PoolOptions {
  public collection: anchor.web3.PublicKey;
  public floorPrice: anchor.BN;
  public basisPoints: number;
}

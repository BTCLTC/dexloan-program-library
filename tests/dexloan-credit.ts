import assert from "assert";
import * as anchor from "@project-serum/anchor";
import type { DexloanCredit } from "../target/types/dexloan_credit";

describe("Dexloan Credit", () => {
  const connection = new anchor.web3.Connection(
    "http://localhost:8899",
    anchor.Provider.defaultOptions().preflightCommitment
  );

  const ownerKeypair = anchor.web3.Keypair.generate();
  // @ts-expect-error
  const wallet = new anchor.Wallet(ownerKeypair);
  const provider = new anchor.Provider(
    connection,
    wallet,
    anchor.Provider.defaultOptions()
  );
  const idl = require("../target/idl/dexloan_credit.json");
  const programID = new anchor.web3.PublicKey(idl.metadata.address);
  const program = new anchor.Program<DexloanCredit>(idl, programID, provider);
  const collection = anchor.web3.Keypair.generate();

  it("Creates a new liquidity pool", async () => {
    const ownerAirdrop = await connection.requestAirdrop(
      ownerKeypair.publicKey,
      anchor.web3.LAMPORTS_PER_SOL * 5
    );
    await connection.confirmTransaction(ownerAirdrop);

    const [poolAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("pool"),
        ownerKeypair.publicKey.toBuffer(),
        collection.publicKey.toBuffer(),
      ],
      program.programId
    );

    const options = new PoolOptions();
    options.collection = collection.publicKey;
    options.floorPrice = new anchor.BN(1_000_000);
    options.basisPoints = 1_000;

    await program.rpc.createPool(options, {
      accounts: {
        poolAccount,
        owner: ownerKeypair.publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    const account = await program.account.pool.fetch(poolAccount);
    assert.equal(account.owner.toBase58(), ownerKeypair.publicKey.toBase58());
    assert.equal(
      account.collection.toBase58(),
      collection.publicKey.toBase58()
    );
    assert.equal(account.floorPrice.toNumber(), 1_000_000);
    assert.equal(account.basisPoints, 1_000);
  });
});

class PoolOptions {
  public collection: anchor.web3.PublicKey;
  public floorPrice: anchor.BN;
  public basisPoints: number;
}

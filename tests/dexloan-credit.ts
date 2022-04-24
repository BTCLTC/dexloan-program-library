import assert from "assert";
import * as anchor from "@project-serum/anchor";
import { NodeWallet } from "@metaplex/js";
import { IDL } from "../target/types/dexloan_credit";

const DEXLOAN_CREDIT_PROGRAM_ID = new anchor.web3.PublicKey(
  "gHR5K5YWRDouD6ZiFM3QeGoNYxkLRtvXLpSokk5dxAE"
);

const COLLECTION_MINT = new anchor.web3.PublicKey(
  "Hqxffvgbxfb8iKhyxCvvbdMZ8EEdBjBtsEU8tmYqQdFm"
);

describe("Dexloan Credit", async () => {
  // Configure the client to use the local cluster.
  const ownerKeypair = getKeypair();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection("http://localhost:8899"),
    new NodeWallet(ownerKeypair),
    anchor.AnchorProvider.defaultOptions()
  );
  anchor.setProvider(provider);

  const program = new anchor.Program(
    IDL,
    DEXLOAN_CREDIT_PROGRAM_ID,
    anchor.getProvider()
  );

  before(async () => {
    const txId = await anchor
      .getProvider()
      .connection.requestAirdrop(
        ownerKeypair.publicKey,
        anchor.web3.LAMPORTS_PER_SOL * 2
      );

    await anchor.getProvider().connection.confirmTransaction(txId);
  });

  it("Initializes a new lending pool", async () => {
    const options = new PoolOptions();
    options.collection = COLLECTION_MINT;
    options.floorPrice = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
    options.basisPoints = 1_000;

    const [poolAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("pool"),
        COLLECTION_MINT.toBuffer(),
        ownerKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Create pool account
    const tx = await program.methods.createPool(options).accounts({
      poolAccount,
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
    assert.equal(account.collection.toBase58(), COLLECTION_MINT.toBase58());
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

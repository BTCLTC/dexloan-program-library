import assert from "assert";
import * as anchor from "@project-serum/anchor";
import { DexloanPools, IDL } from "../target/types/dexloan_pools";
import { NodeWallet } from "./helpers";

const DEXLOAN_POOLS_PROGRAM_ID = new anchor.web3.PublicKey(
  "gHR5K5YWRDouD6ZiFM3QeGoNYxkLRtvXLpSokk5dxAE"
);

const COLLECTION_MINT = new anchor.web3.PublicKey(
  "Hqxffvgbxfb8iKhyxCvvbdMZ8EEdBjBtsEU8tmYqQdFm"
);

const MINT = new anchor.web3.PublicKey(
  "DTEtZLK8ScwGgjCK8nSbF78gGk6rTWLxkvc4qnYkWijj"
);

const METADATA = new anchor.web3.PublicKey(
  "4ndCC5sE947RUoR3xEVwMTFdiRk3MtTK4ADjwZqQKxhw"
);

describe.only("Dexloan Pools", async () => {
  const ownerKeypair = getOwnerKeypair();
  const connection = new anchor.web3.Connection("http://localhost:8899");

  it("Initializes a new lending pool", async () => {
    const provider = new anchor.AnchorProvider(
      connection,
      new NodeWallet(ownerKeypair),
      anchor.AnchorProvider.defaultOptions()
    );

    const program = new anchor.Program<DexloanPools>(
      IDL,
      DEXLOAN_POOLS_PROGRAM_ID,
      provider
    );

    const options = new PoolOptions();
    options.floorPrice = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
    options.basisPoints = 1_000;

    const txId = await provider.connection.requestAirdrop(
      ownerKeypair.publicKey,
      anchor.web3.LAMPORTS_PER_SOL * 5
    );

    await provider.connection.confirmTransaction(txId);

    const [poolAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("pool"),
        ownerKeypair.publicKey.toBuffer(),
        COLLECTION_MINT.toBuffer(),
      ],
      program.programId
    );

    // Create pool account
    const tx = await program.methods.createPool(options).accounts({
      poolAccount,
      collection: COLLECTION_MINT,
      authority: ownerKeypair.publicKey,
    });
    const keys = await tx.pubkeys();
    await tx.rpc();

    // Transfer SOL to pool account
    const transaction = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: ownerKeypair.publicKey,
        toPubkey: keys.poolAccount,
        lamports: anchor.web3.LAMPORTS_PER_SOL * 4,
      })
    );

    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      transaction,
      [ownerKeypair]
    );

    const account = await program.account.pool.fetch(keys.poolAccount);

    assert.equal(
      account.authority.toBase58(),
      ownerKeypair.publicKey.toBase58()
    );
    assert.equal(account.collection.toBase58(), COLLECTION_MINT.toBase58());
    assert.equal(account.floorPrice.toNumber(), anchor.web3.LAMPORTS_PER_SOL);
    assert.equal(account.basisPoints, 1_000);
  });

  it("Creates a loan", async () => {
    const borrowerKeypair = anchor.web3.Keypair.generate();
    const provider = new anchor.AnchorProvider(
      connection,
      new NodeWallet(borrowerKeypair),
      anchor.AnchorProvider.defaultOptions()
    );

    const program = new anchor.Program<DexloanPools>(
      IDL,
      DEXLOAN_POOLS_PROGRAM_ID,
      provider
    );

    const txId = await provider.connection.requestAirdrop(
      borrowerKeypair.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );

    await provider.connection.confirmTransaction(txId);

    const [poolAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("pool"),
        ownerKeypair.publicKey.toBuffer(),
        COLLECTION_MINT.toBuffer(),
      ],
      program.programId
    );

    const [listingAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("listing"),
        MINT.toBuffer(),
        borrowerKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [escrowAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("escrow"), MINT.toBuffer()],
      program.programId
    );

    const tokenAccount = new anchor.web3.PublicKey(
      "CJAcnATPYjUPzCZmzfksjqkXc13Wdm9Ni2vBbVcL3ttX"
    );

    await program.methods
      .borrowFromPool()
      .accounts({
        pool: poolAccount,
        borrower: borrowerKeypair.publicKey,
        borrowerDepositTokenAccount: tokenAccount,
        listingAccount: listingAddress,
        escrowAccount: escrowAddress,
        mint: MINT,
        metadataAccount: METADATA,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .rpc();
  });
});

class PoolOptions {
  public floorPrice: anchor.BN;
  public basisPoints: number;
}

function getOwnerKeypair() {
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

import assert from "assert";
import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import * as helpers from "./helpers";

describe("dexloan", () => {
  // Configure the client to use the local cluster.
  const connection = new anchor.web3.Connection(
    "http://localhost:8899",
    anchor.Provider.defaultOptions().preflightCommitment
  );
  const keypair = anchor.web3.Keypair.generate();
  const provider = helpers.getProvider(connection, keypair);
  const program = helpers.getProgram(provider);

  before(async () => {
    await helpers.requestAirdrop(connection, provider.wallet.publicKey);
  });

  it("Creates a dexloan listing", async () => {
    // Create the Mint Account for the NFT
    const mintAccount = await splToken.Token.createMint(
      connection,
      keypair,
      keypair.publicKey,
      null,
      0,
      splToken.TOKEN_PROGRAM_ID
    );

    const associatedAddress =
      await mintAccount.getOrCreateAssociatedAccountInfo(keypair.publicKey);

    await mintAccount.mintTo(
      associatedAddress.address,
      keypair.publicKey,
      [],
      1
    );

    // Reset mint_authority to null from the user to prevent further minting
    await mintAccount.setAuthority(
      mintAccount.publicKey,
      null,
      "MintTokens",
      keypair.publicKey,
      []
    );

    const [listing, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("listing"), mintAccount.publicKey.toBuffer()],
      program.programId
    );

    const [escrow, escrowBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("escrow"), mintAccount.publicKey.toBuffer()],
      program.programId
    );

    const loanAmount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
    const loanDuration = new anchor.BN(30 * 24 * 60 * 60 * 1000);
    const basisPoints = new anchor.BN(500);

    await program.rpc.list(
      bump,
      escrowBump,
      loanAmount,
      loanDuration,
      basisPoints,
      {
        accounts: {
          escrow,
          listing,
          borrower: provider.wallet.publicKey,
          borrowerTokens: associatedAddress.address,
          mint: mintAccount.publicKey,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    const listingAccount = await program.account.listing.fetch(listing);
    console.log("listingAccount: ", listingAccount);
    assert.equal(listingAccount.basisPoints, basisPoints.toNumber());
  });
});

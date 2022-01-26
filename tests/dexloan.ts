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

  let associatedAddress;
  let mint;

  before(async () => {
    await helpers.requestAirdrop(connection, provider.wallet.publicKey);

    // Create the Mint Account for the NFT
    mint = await splToken.Token.createMint(
      connection,
      keypair,
      keypair.publicKey,
      null,
      0,
      splToken.TOKEN_PROGRAM_ID
    );

    associatedAddress = await mint.getOrCreateAssociatedAccountInfo(
      keypair.publicKey
    );

    await mint.mintTo(associatedAddress.address, keypair.publicKey, [], 1);

    // Reset mint_authority to null from the user to prevent further minting
    await mint.setAuthority(
      mint.publicKey,
      null,
      "MintTokens",
      keypair.publicKey,
      []
    );
  });

  it("Creates a dexloan listing", async () => {
    const [listing, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("listing"), mint.publicKey.toBuffer()],
      program.programId
    );

    const [escrow, escrowBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("escrow"), mint.publicKey.toBuffer()],
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
          mint: mint.publicKey,
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

  it("Allows loans to be given", async () => {
    const lenderKeypair = anchor.web3.Keypair.generate();
    await helpers.requestAirdrop(connection, lenderKeypair.publicKey);
    const lenderProvider = helpers.getProvider(connection, lenderKeypair);
    const lenderProgram = helpers.getProgram(lenderProvider);

    const [listing] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("listing"), mint.publicKey.toBuffer()],
      lenderProgram.programId
    );

    const [loan, loanBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("loan"), listing.toBuffer()],
      lenderProgram.programId
    );

    await lenderProgram.rpc.makeLoan(loanBump, {
      accounts: {
        listing,
        loan,
        borrower: keypair.publicKey,
        lender: lenderKeypair.publicKey,
        mint: mint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    });

    const loanAccount = await program.account.loan.fetch(loan);
    console.log("loanAccount: ", loanAccount);
  });
});

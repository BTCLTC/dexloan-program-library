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
  const borrowerKeypair = anchor.web3.Keypair.generate();
  const borrowerProvider = helpers.getProvider(connection, borrowerKeypair);
  const borrowerProgram = helpers.getProgram(borrowerProvider);

  const lenderKeypair = anchor.web3.Keypair.generate();
  const lenderProvider = helpers.getProvider(connection, lenderKeypair);
  const lenderProgram = helpers.getProgram(lenderProvider);

  let associatedAddress;
  let mint: splToken.Token;

  const loanAmount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
  const loanDuration = new anchor.BN(30 * 24 * 60 * 60); // 30 days
  const basisPoints = new anchor.BN(500);

  before(async () => {
    await helpers.requestAirdrop(connection, borrowerKeypair.publicKey);
    await helpers.requestAirdrop(connection, lenderKeypair.publicKey);

    // Create the Mint Account for the NFT
    mint = await splToken.Token.createMint(
      connection,
      borrowerKeypair,
      borrowerKeypair.publicKey,
      null,
      0,
      splToken.TOKEN_PROGRAM_ID
    );

    associatedAddress = await mint.getOrCreateAssociatedAccountInfo(
      borrowerKeypair.publicKey
    );

    await mint.mintTo(
      associatedAddress.address,
      borrowerKeypair.publicKey,
      [],
      1
    );

    // Reset mint_authority to null from the user to prevent further minting
    await mint.setAuthority(
      mint.publicKey,
      null,
      "MintTokens",
      borrowerKeypair.publicKey,
      []
    );
  });

  it("Creates a dexloan listing", async () => {
    const [listingAccount, bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("listing"), mint.publicKey.toBuffer()],
        borrowerProgram.programId
      );

    const [escrowAccount, escrowBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("escrow"), mint.publicKey.toBuffer()],
        borrowerProgram.programId
      );

    await borrowerProgram.rpc.list(
      bump,
      escrowBump,
      loanAmount,
      loanDuration,
      basisPoints,
      {
        accounts: {
          escrowAccount,
          listingAccount,
          borrower: borrowerKeypair.publicKey,
          borrowerDepositTokenAccount: associatedAddress.address,
          mint: mint.publicKey,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    );

    const listing = await borrowerProgram.account.listing.fetch(listingAccount);
    const borrowerTokenAccount = await mint.getAccountInfo(
      associatedAddress.address
    );
    const escrowTokenAccount = await mint.getAccountInfo(listing.escrow);

    // assert.equal(listing.active, false);
    assert.equal(listing.authority, borrowerKeypair.publicKey.toString());
    assert.equal(listing.basisPoints, basisPoints.toNumber());
    assert.equal(listing.duration.toNumber(), loanDuration.toNumber());
    assert.equal(listing.mint.toBase58(), mint.publicKey.toBase58());
    assert.equal(borrowerTokenAccount.amount.toNumber(), 0);
    assert.equal(escrowTokenAccount.amount.toNumber(), 1);
    assert.equal(escrowTokenAccount.mint.toBase58(), mint.publicKey.toBase58());
    assert.equal(listing.state, 0);
    assert.equal(escrowTokenAccount.owner.toBase58(), escrowAccount.toBase58());
  });

  it("Allows loans to be given", async () => {
    const [listingAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("listing"), mint.publicKey.toBuffer()],
      lenderProgram.programId
    );
    const [loanAccount, loanBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("loan"), listingAccount.toBuffer()],
        lenderProgram.programId
      );

    const borrowerPreLoanBalance = await connection.getBalance(
      borrowerKeypair.publicKey
    );

    await lenderProgram.rpc.makeLoan(loanBump, {
      accounts: {
        listingAccount,
        loanAccount,
        borrower: borrowerKeypair.publicKey,
        lender: lenderKeypair.publicKey,
        mint: mint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    });

    const loan = await borrowerProgram.account.loan.fetch(loanAccount);
    const listing = await borrowerProgram.account.listing.fetch(listingAccount);
    const borrowerPostLoanBalance = await connection.getBalance(
      borrowerKeypair.publicKey
    );

    assert.equal(
      borrowerPreLoanBalance + loanAmount.toNumber(),
      borrowerPostLoanBalance
    );
    // assert.equal(listing.active, true);
    assert.equal(loan.listing.toBase58(), listingAccount.toBase58());
    assert.equal(loan.lender.toBase58(), lenderKeypair.publicKey.toBase58());
    assert.equal(listing.state, 1);
    assert(
      loan.startDate.toNumber() > 0 && loan.startDate.toNumber() < Date.now()
    );
  });

  it("Allows loans to be repaid", async () => {
    const [listingAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("listing"), mint.publicKey.toBuffer()],
      lenderProgram.programId
    );
    const [loanAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("loan"), listingAccount.toBuffer()],
      lenderProgram.programId
    );
    const [escrowAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("escrow"), mint.publicKey.toBuffer()],
      lenderProgram.programId
    );

    const lenderPreRepaymentBalance = await connection.getBalance(
      lenderKeypair.publicKey
    );

    await borrowerProgram.rpc.repayLoan({
      accounts: {
        listingAccount,
        loanAccount,
        escrowAccount,
        borrower: borrowerKeypair.publicKey,
        borrowerDepositTokenAccount: associatedAddress.address,
        lender: lenderKeypair.publicKey,
        mint: mint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    });

    const listing = await borrowerProgram.account.listing.fetch(listingAccount);
    const lenderPostRepaymentBalance = await connection.getBalance(
      lenderKeypair.publicKey
    );
    const borrowerTokenAccount = await mint.getAccountInfo(
      associatedAddress.address
    );
    const escrowTokenAccount = await mint.getAccountInfo(listing.escrow);

    assert.equal(borrowerTokenAccount.amount.toNumber(), 1);
    assert.equal(escrowTokenAccount.amount.toNumber(), 0);
    assert(
      lenderPostRepaymentBalance ===
        lenderPreRepaymentBalance + loanAmount.toNumber()
    );
    assert.equal(listing.state, 3);
  });
});

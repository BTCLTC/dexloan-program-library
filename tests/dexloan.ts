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

  it("Creates a dexloan listing", async () => {
    const options = {
      basisPoints: 500,
      loanAmount: anchor.web3.LAMPORTS_PER_SOL,
      loanDuration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.createListing(connection, options);

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );
    const borrowerTokenAccount = await borrower.mint.getAccountInfo(
      borrower.associatedAddress.address
    );
    const escrowTokenAccount = await borrower.mint.getAccountInfo(
      listing.escrow
    );

    assert.equal(listing.authority, borrower.keypair.publicKey.toString());
    assert.equal(listing.basisPoints, options.basisPoints);
    assert.equal(listing.duration.toNumber(), options.loanDuration);
    assert.equal(listing.mint.toBase58(), borrower.mint.publicKey.toBase58());
    assert.equal(borrowerTokenAccount.amount.toNumber(), 0);
    assert.equal(escrowTokenAccount.amount.toNumber(), 1);
    assert.equal(
      escrowTokenAccount.mint.toBase58(),
      borrower.mint.publicKey.toBase58()
    );
    assert.equal(listing.state, 0);
    assert.equal(
      escrowTokenAccount.owner.toBase58(),
      borrower.escrowAccount.toBase58()
    );
  });

  it("Allows loans to be given", async () => {
    const options = {
      basisPoints: 500,
      loanAmount: anchor.web3.LAMPORTS_PER_SOL,
      loanDuration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.createListing(connection, options);
    const borrowerPreLoanBalance = await connection.getBalance(
      borrower.keypair.publicKey
    );

    const lender = await helpers.createLoan(connection, borrower);

    const loan = await borrower.program.account.loan.fetch(lender.loanAccount);
    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );
    const borrowerPostLoanBalance = await connection.getBalance(
      borrower.keypair.publicKey
    );

    assert.equal(
      borrowerPreLoanBalance + options.loanAmount,
      borrowerPostLoanBalance
    );
    assert.equal(loan.listing.toBase58(), borrower.listingAccount.toBase58());
    assert.equal(loan.lender.toBase58(), lender.keypair.publicKey.toBase58());
    assert.equal(listing.state, 1);
    assert(
      loan.startDate.toNumber() > 0 && loan.startDate.toNumber() < Date.now()
    );
  });

  it("Allows loans to be repaid", async () => {
    const options = {
      basisPoints: 500,
      loanAmount: anchor.web3.LAMPORTS_PER_SOL,
      loanDuration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.createListing(connection, options);

    const lender = await helpers.createLoan(connection, borrower);
    const lenderPreRepaymentBalance = await connection.getBalance(
      lender.keypair.publicKey
    );

    await borrower.program.rpc.repayLoan({
      accounts: {
        listingAccount: borrower.listingAccount,
        loanAccount: lender.loanAccount,
        escrowAccount: borrower.escrowAccount,
        borrower: borrower.keypair.publicKey,
        borrowerDepositTokenAccount: borrower.associatedAddress.address,
        lender: lender.keypair.publicKey,
        mint: borrower.mint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    });

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );
    const lenderPostRepaymentBalance = await connection.getBalance(
      lender.keypair.publicKey
    );
    const borrowerTokenAccount = await borrower.mint.getAccountInfo(
      borrower.associatedAddress.address
    );
    const escrowTokenAccount = await borrower.mint.getAccountInfo(
      listing.escrow
    );

    assert.equal(borrowerTokenAccount.amount.toNumber(), 1);
    assert.equal(escrowTokenAccount.amount.toNumber(), 0);
    assert(
      lenderPostRepaymentBalance ===
        lenderPreRepaymentBalance + options.loanAmount
    );
    assert.equal(listing.state, 2);
  });

  it("Allows loans to be cancelled", async () => {
    const options = {
      basisPoints: 500,
      loanAmount: anchor.web3.LAMPORTS_PER_SOL,
      loanDuration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.createListing(connection, options);

    await borrower.program.rpc.cancelListing({
      accounts: {
        listingAccount: borrower.listingAccount,
        escrowAccount: borrower.escrowAccount,
        borrower: borrower.keypair.publicKey,
        borrowerDepositTokenAccount: borrower.associatedAddress.address,
        mint: borrower.mint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
      },
    });

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );
    const borrowerTokenAccount = await borrower.mint.getAccountInfo(
      borrower.associatedAddress.address
    );
    const escrowTokenAccount = await borrower.mint.getAccountInfo(
      listing.escrow
    );

    assert.equal(borrowerTokenAccount.amount.toNumber(), 1);
    assert.equal(escrowTokenAccount.amount.toNumber(), 0);
    assert.equal(listing.state, 3);
  });
});

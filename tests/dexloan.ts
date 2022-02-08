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
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.initListing(connection, options);

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );
    const borrowerTokenAccount = await borrower.mint.getAccountInfo(
      borrower.associatedAddress.address
    );
    const escrowTokenAccount = await borrower.mint.getAccountInfo(
      listing.escrow
    );

    assert.equal(listing.borrower, borrower.keypair.publicKey.toString());
    assert.equal(listing.basisPoints, options.basisPoints);
    assert.equal(listing.duration.toNumber(), options.duration);
    assert.equal(listing.mint.toBase58(), borrower.mint.publicKey.toBase58());
    assert.equal(borrowerTokenAccount.amount.toNumber(), 0);
    assert.equal(escrowTokenAccount.amount.toNumber(), 1);
    assert.equal(
      escrowTokenAccount.mint.toBase58(),
      borrower.mint.publicKey.toBase58()
    );
    assert.equal(listing.state, 1);
    assert.equal(
      escrowTokenAccount.owner.toBase58(),
      borrower.escrowAccount.toBase58()
    );
  });

  it("Allows loans to be given", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.initListing(connection, options);
    const borrowerPreLoanBalance = await connection.getBalance(
      borrower.keypair.publicKey
    );

    const lender = await helpers.createLoan(connection, borrower);

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );
    const borrowerPostLoanBalance = await connection.getBalance(
      borrower.keypair.publicKey
    );

    assert.equal(
      borrowerPreLoanBalance + options.amount,
      borrowerPostLoanBalance
    );
    assert.equal(
      listing.lender.toBase58(),
      lender.keypair.publicKey.toBase58()
    );
    assert.equal(listing.state, 2);
    assert(
      listing.startDate.toNumber() > 0 &&
        listing.startDate.toNumber() < Date.now()
    );
  });

  it("Allows loans to be repaid", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL * 2,
      basisPoints: 700,
      duration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.initListing(connection, options);
    const lender = await helpers.createLoan(connection, borrower);
    const lenderPreRepaymentBalance = await connection.getBalance(
      lender.keypair.publicKey
    );

    await borrower.program.rpc.repayLoan({
      accounts: {
        listingAccount: borrower.listingAccount,
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
    assert(lenderPostRepaymentBalance > lenderPreRepaymentBalance);
    assert.equal(listing.state, 3);
  });

  it("Allows loans to be cancelled", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.initListing(connection, options);

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
    assert.equal(listing.state, 4);
  });

  it("Allows loans an overdue loan to be repossessed", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 1, // 1 second
    };
    const borrower = await helpers.initListing(connection, options);

    const lender = await helpers.createLoan(connection, borrower);

    await wait(1); // ensure 1 second passes

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );

    const token = new splToken.Token(
      lender.provider.connection,
      listing.mint,
      splToken.TOKEN_PROGRAM_ID,
      lender.keypair
    );

    const tokenAccountInfo = await token.getOrCreateAssociatedAccountInfo(
      lender.keypair.publicKey
    );

    await lender.program.rpc.repossessCollateral({
      accounts: {
        escrowAccount: listing.escrow,
        lender: lender.keypair.publicKey,
        lenderTokenAccount: tokenAccountInfo.address,
        listingAccount: borrower.listingAccount,
        mint: listing.mint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });

    const escrowTokenAccount = await borrower.mint.getAccountInfo(
      listing.escrow
    );
    const lenderTokenAccount = await borrower.mint.getAccountInfo(
      tokenAccountInfo.address
    );
    const defaultedListing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );

    assert.equal(escrowTokenAccount.amount.toNumber(), 0);
    assert.equal(lenderTokenAccount.amount.toNumber(), 1);
    assert.equal(defaultedListing.state, 5);
  });

  it("Will not allow a loan to be repossessed if not overdue", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 60 * 60, // 1 hour
    };
    const borrower = await helpers.initListing(connection, options);

    const lender = await helpers.createLoan(connection, borrower);

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );

    const token = new splToken.Token(
      lender.provider.connection,
      listing.mint,
      splToken.TOKEN_PROGRAM_ID,
      lender.keypair
    );

    const tokenAccountInfo = await token.getOrCreateAssociatedAccountInfo(
      lender.keypair.publicKey
    );

    try {
      await lender.program.rpc.repossessCollateral({
        accounts: {
          escrowAccount: listing.escrow,
          lender: lender.keypair.publicKey,
          lenderTokenAccount: tokenAccountInfo.address,
          listingAccount: borrower.listingAccount,
          mint: listing.mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      });

      assert.ok(false);
    } catch (error) {
      assert.ok(error.toString(), "This loan is not overdue");
    }
  });

  it("Will only allow lender to repossess an overdue loan", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 1, // 1 second
    };
    const borrower = await helpers.initListing(connection, options);

    const lender = await helpers.createLoan(connection, borrower);

    await wait(1); // ensure 1 second passes

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );

    const token = new splToken.Token(
      lender.provider.connection,
      listing.mint,
      splToken.TOKEN_PROGRAM_ID,
      lender.keypair
    );

    const tokenAccountInfo = await token.getOrCreateAssociatedAccountInfo(
      lender.keypair.publicKey
    );

    // Creates another signer
    const keypair = anchor.web3.Keypair.generate();
    const provider = helpers.getProvider(connection, keypair);
    const program = helpers.getProgram(provider);
    await helpers.requestAirdrop(connection, keypair.publicKey);

    try {
      await program.rpc.repossessCollateral({
        accounts: {
          escrowAccount: listing.escrow,
          lender: lender.keypair.publicKey,
          lenderTokenAccount: tokenAccountInfo.address,
          listingAccount: borrower.listingAccount,
          mint: listing.mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      });

      assert.ok(false);
    } catch (error) {
      assert.equal(error.toString(), "Error: Signature verification failed");
    }

    try {
      await program.rpc.repossessCollateral({
        accounts: {
          escrowAccount: listing.escrow,
          lender: keypair.publicKey,
          lenderTokenAccount: tokenAccountInfo.address,
          listingAccount: borrower.listingAccount,
          mint: listing.mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      });

      assert.ok(false);
    } catch (error) {
      assert.equal(error.toString(), "A raw constraint was violated");
    }
  });
});

async function wait(seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

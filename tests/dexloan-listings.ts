import assert from "assert";
import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import * as helpers from "./helpers";

describe("dexloan_listings", () => {
  // Configure the client to use the local cluster.
  const connection = new anchor.web3.Connection(
    "http://localhost:8899",
    anchor.AnchorProvider.defaultOptions().preflightCommitment
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
    const borrowerTokenAccount = await splToken.getAccount(
      connection,
      borrower.associatedAddress
    );
    const escrowTokenAccount = await splToken.getAccount(
      connection,
      listing.escrow
    );

    assert.equal(listing.borrower, borrower.keypair.publicKey.toString());
    assert.equal(listing.basisPoints, options.basisPoints);
    assert.equal(listing.duration.toNumber(), options.duration);
    assert.equal(listing.mint.toBase58(), borrower.mint.toBase58());
    assert.equal(borrowerTokenAccount.amount, BigInt(0));
    assert.equal(escrowTokenAccount.amount, BigInt(1));
    assert.equal(escrowTokenAccount.mint.toBase58(), borrower.mint.toBase58());
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
        borrowerDepositTokenAccount: borrower.associatedAddress,
        lender: lender.keypair.publicKey,
        mint: borrower.mint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    });

    const lenderPostRepaymentBalance = await connection.getBalance(
      lender.keypair.publicKey
    );
    const borrowerTokenAccount = await splToken.getAccount(
      connection,
      borrower.associatedAddress
    );
    const escrowTokenAccount = await splToken.getAccount(
      connection,
      borrower.escrowAccount
    );

    assert.equal(borrowerTokenAccount.amount, BigInt(1));
    assert.equal(escrowTokenAccount.amount, BigInt(0));
    assert(lenderPostRepaymentBalance > lenderPreRepaymentBalance);
  });

  it("Allows listings to be cancelled", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.initListing(connection, options);

    await borrower.program.methods
      .cancelListing()
      .accounts({
        listingAccount: borrower.listingAccount,
        escrowAccount: borrower.escrowAccount,
        borrower: borrower.keypair.publicKey,
        borrowerDepositTokenAccount: borrower.associatedAddress,
        mint: borrower.mint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
      })
      .rpc();

    const borrowerTokenAccount = await splToken.getAccount(
      connection,
      borrower.associatedAddress
    );
    const escrowTokenAccount = await splToken.getAccount(
      connection,
      borrower.escrowAccount
    );

    assert.equal(borrowerTokenAccount.amount, BigInt(1));
    assert.equal(escrowTokenAccount.amount, BigInt(0));
  });

  it("Allows listings to be reinitialized after being cancelled", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 30 * 24 * 60 * 60, // 30 days
    };
    const borrower = await helpers.initListing(connection, options);

    await borrower.program.methods
      .cancelListing()
      .accounts({
        listingAccount: borrower.listingAccount,
        escrowAccount: borrower.escrowAccount,
        borrower: borrower.keypair.publicKey,
        borrowerDepositTokenAccount: borrower.associatedAddress,
        mint: borrower.mint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
      })
      .rpc();

    const borrowerTokenAccount = await splToken.getAccount(
      connection,
      borrower.associatedAddress
    );
    const escrowTokenAccount = await splToken.getAccount(
      connection,
      borrower.escrowAccount
    );

    assert.equal(borrowerTokenAccount.amount, BigInt(1));
    assert.equal(escrowTokenAccount.amount, BigInt(0));

    const listingOptions = new helpers.ListingOptions();
    listingOptions.amount = new anchor.BN(options.amount);
    listingOptions.basisPoints = new anchor.BN(options.basisPoints);
    listingOptions.duration = new anchor.BN(options.duration);

    await borrower.program.methods
      .initListing(listingOptions)
      .accounts({
        escrowAccount: borrower.escrowAccount,
        listingAccount: borrower.listingAccount,
        borrower: borrower.keypair.publicKey,
        borrowerDepositTokenAccount: borrower.associatedAddress,
        mint: borrower.mint,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );
    assert.equal(listing.state, 1);
    assert.equal(
      listing.borrower.toBase58(),
      borrower.keypair.publicKey.toBase58()
    );
  });

  it("Does NOT allow an active listing to be reinitialized", async () => {
    const options = {
      amount: anchor.web3.LAMPORTS_PER_SOL,
      basisPoints: 500,
      duration: 60,
    };
    const borrower = await helpers.initListing(connection, options);
    await helpers.createLoan(connection, borrower);

    const listing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );

    const listingOptions = new helpers.ListingOptions();
    listingOptions.amount = new anchor.BN(options.amount);
    listingOptions.basisPoints = new anchor.BN(options.basisPoints);
    listingOptions.duration = new anchor.BN(options.duration);

    try {
      await borrower.program.methods
        .initListing(listingOptions)
        .accounts({
          borrower: borrower.keypair.publicKey,
          borrowerDepositTokenAccount: borrower.associatedAddress,
          escrowAccount: listing.escrow,
          listingAccount: borrower.listingAccount,
          mint: listing.mint,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.ok(false);
    } catch (error) {
      assert.ok(error.toString().includes("custom program error: 0x0"));
    }
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

    const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
      connection,
      lender.keypair,
      listing.mint,
      lender.keypair.publicKey
    );

    await lender.program.methods
      .repossessCollateral()
      .accounts({
        escrowAccount: listing.escrow,
        lender: lender.keypair.publicKey,
        lenderTokenAccount: tokenAccount.address,
        listingAccount: borrower.listingAccount,
        mint: listing.mint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const escrowTokenAccount = await splToken.getAccount(
      connection,
      listing.escrow
    );
    const lenderTokenAccount = await splToken.getAccount(
      connection,
      tokenAccount.address
    );
    const defaultedListing = await borrower.program.account.listing.fetch(
      borrower.listingAccount
    );
    assert.equal(escrowTokenAccount.amount, BigInt(0));
    assert.equal(lenderTokenAccount.amount, BigInt(1));
    assert.equal(defaultedListing.state, 5);
  });

  it("Will allow accounts to be closed once overdue loans are repossessed", async () => {
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

    const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
      connection,
      lender.keypair,
      listing.mint,
      lender.keypair.publicKey
    );

    await lender.program.methods
      .repossessCollateral()
      .accounts({
        escrowAccount: listing.escrow,
        lender: lender.keypair.publicKey,
        lenderTokenAccount: tokenAccount.address,
        listingAccount: borrower.listingAccount,
        mint: listing.mint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    await borrower.program.methods
      .closeAccount()
      .accounts({
        borrower: borrower.keypair.publicKey,
        listingAccount: borrower.listingAccount,
      })
      .rpc();

    try {
      await borrower.program.account.listing.fetch(borrower.listingAccount);
    } catch (err) {
      assert.equal(
        err.message,
        `Account does not exist ${borrower.listingAccount.toBase58()}`
      );
    }
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

    const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
      connection,
      lender.keypair,
      listing.mint,
      lender.keypair.publicKey
    );

    try {
      await lender.program.methods
        .repossessCollateral()
        .accounts({
          escrowAccount: listing.escrow,
          lender: lender.keypair.publicKey,
          lenderTokenAccount: tokenAccount.address,
          listingAccount: borrower.listingAccount,
          mint: listing.mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

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

    // Creates another signer
    const keypair = anchor.web3.Keypair.generate();
    const provider = helpers.getProvider(connection, keypair);
    const program = helpers.getProgram(provider);
    await helpers.requestAirdrop(connection, keypair.publicKey);

    const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      listing.mint,
      keypair.publicKey
    );

    try {
      await program.methods
        .repossessCollateral()
        .accounts({
          escrowAccount: listing.escrow,
          lender: lender.keypair.publicKey,
          lenderTokenAccount: tokenAccount.address,
          listingAccount: borrower.listingAccount,
          mint: listing.mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      assert.ok(false);
    } catch (error) {
      assert.ok(
        error.toString().includes("Error: Signature verification failed")
      );
    }

    try {
      await program.methods
        .repossessCollateral()
        .accounts({
          escrowAccount: listing.escrow,
          lender: keypair.publicKey,
          lenderTokenAccount: tokenAccount.address,
          listingAccount: borrower.listingAccount,
          mint: listing.mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      assert.ok(false);
    } catch (error) {
      assert.ok(error.toString().includes("A raw constraint was violated"));
    }
  });
});

async function wait(seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

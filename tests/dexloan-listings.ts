import assert from "assert";
import {
  Metadata,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import * as helpers from "./helpers";

describe("dexloan_listings", () => {
  // Configure the client to use the local cluster.
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    anchor.AnchorProvider.defaultOptions().preflightCommitment
  );

  describe("Loans", () => {
    describe("Loan repossessions", () => {
      let borrower: helpers.LoanBorrower;
      let lender: helpers.LoanLender;
      let options;

      it("Creates a dexloan loan", async () => {
        options = {
          amount: anchor.web3.LAMPORTS_PER_SOL / 100,
          basisPoints: 500,
          duration: 1, // 1 second
        };

        borrower = await helpers.initLoan(connection, options);

        const borrowerTokenAccount = await splToken.getAccount(
          connection,
          borrower.depositTokenAccount
        );
        const loan = await borrower.program.account.loan.fetch(
          borrower.loanAccount
        );
        const tokenManager = await borrower.program.account.tokenManager.fetch(
          borrower.tokenManager
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: false,
          loan: false,
        });
        assert.equal(
          borrowerTokenAccount.delegate.toBase58(),
          borrower.tokenManager.toBase58()
        );
        assert.equal(
          loan.borrower.toBase58(),
          borrower.keypair.publicKey.toBase58()
        );
        assert.equal(loan.basisPoints, options.basisPoints);
        assert.equal(loan.duration.toNumber(), options.duration);
        assert.equal(loan.mint.toBase58(), borrower.mint.toBase58());
        assert.equal(borrowerTokenAccount.amount, BigInt(1));
        assert.deepEqual(loan.state, { listed: {} });
      });

      it("Freezes tokens after initialization", async () => {
        const receiver = helpers.getLenderKeypair();

        const receiverTokenAccount = (
          await splToken.getOrCreateAssociatedTokenAccount(
            connection,
            receiver,
            borrower.mint,
            receiver.publicKey
          )
        ).address;

        await helpers.wait(1);

        try {
          await splToken.transfer(
            connection,
            borrower.keypair,
            borrower.depositTokenAccount,
            receiverTokenAccount,
            borrower.keypair.publicKey,
            1
          );
          assert.ok(false);
        } catch (err) {
          assert.ok(err.logs.includes("Program log: Error: Account is frozen"));
        }
      });

      it("Allows loans to be given", async () => {
        const borrowerPreLoanBalance = await connection.getBalance(
          borrower.keypair.publicKey
        );

        lender = await helpers.giveLoan(connection, borrower);
        const loan = await borrower.program.account.loan.fetch(
          borrower.loanAccount
        );
        const tokenManager = await borrower.program.account.tokenManager.fetch(
          borrower.tokenManager
        );
        const borrowerPostLoanBalance = await connection.getBalance(
          borrower.keypair.publicKey
        );
        const borrowerTokenAccount = await splToken.getAccount(
          connection,
          borrower.depositTokenAccount
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: false,
          loan: true,
        });
        assert.equal(borrowerTokenAccount.amount, BigInt(1));
        assert.equal(
          borrowerPreLoanBalance + options.amount,
          borrowerPostLoanBalance
        );
        assert.equal(
          loan.lender.toBase58(),
          lender.keypair.publicKey.toBase58()
        );
        assert.deepEqual(loan.state, { active: {} });
        assert(
          loan.startDate.toNumber() > 0 &&
            loan.startDate.toNumber() < Date.now()
        );
      });

      it("Will only allow lender to repossess an overdue loan", async () => {
        // Creates another signer
        const keypair = anchor.web3.Keypair.generate();
        const provider = helpers.getProvider(connection, keypair);
        const program = helpers.getProgram(provider);
        await helpers.requestAirdrop(connection, keypair.publicKey);

        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
          connection,
          keypair,
          borrower.mint,
          keypair.publicKey
        );

        try {
          await program.methods
            .repossess()
            .accounts({
              borrower: borrower.keypair.publicKey,
              depositTokenAccount: borrower.depositTokenAccount,
              lender: lender.keypair.publicKey,
              lenderTokenAccount: tokenAccount.address,
              loan: borrower.loanAccount,
              tokenManager: borrower.tokenManager,
              mint: borrower.mint,
              edition: borrower.edition,
              metadataProgram: METADATA_PROGRAM_ID,
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
      });

      it("Allows an overdue loan to be repossessed by the lender", async () => {
        const loan = await borrower.program.account.loan.fetch(
          borrower.loanAccount
        );
        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
          connection,
          lender.keypair,
          loan.mint,
          lender.keypair.publicKey
        );

        try {
          await lender.program.methods
            .repossess()
            .accounts({
              borrower: borrower.keypair.publicKey,
              depositTokenAccount: borrower.depositTokenAccount,
              lender: lender.keypair.publicKey,
              lenderTokenAccount: tokenAccount.address,
              loan: borrower.loanAccount,
              tokenManager: borrower.tokenManager,
              mint: loan.mint,
              edition: borrower.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc();
        } catch (err) {
          console.log(err.logs);
          throw err;
        }

        const lenderTokenAccount = await splToken.getAccount(
          connection,
          tokenAccount.address
        );
        const tokenManager = await borrower.program.account.tokenManager.fetch(
          borrower.tokenManager
        );
        const defaultedListing = await borrower.program.account.loan.fetch(
          borrower.loanAccount
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: false,
          loan: false,
        });
        assert.equal(lenderTokenAccount.amount, BigInt(1));
        assert.deepEqual(defaultedListing.state, { defaulted: {} });
      });

      it("Will allow accounts to be closed once overdue loans are repossessed", async () => {
        try {
          await borrower.program.methods
            .closeLoan()
            .accounts({
              borrower: borrower.keypair.publicKey,
              depositTokenAccount: borrower.depositTokenAccount,
              loan: borrower.loanAccount,
              tokenManager: borrower.tokenManager,
              mint: borrower.mint,
              edition: borrower.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
            })
            .rpc();
        } catch (err) {
          console.log(err.logs);
          assert.fail(err);
        }

        try {
          await borrower.program.account.loan.fetch(borrower.loanAccount);
        } catch (err) {
          assert.equal(
            err.message,
            `Account does not exist ${borrower.loanAccount.toBase58()}`
          );
        }
      });
    });

    describe("Loan repayments", () => {
      let borrower: Awaited<ReturnType<typeof helpers.initLoan>>;
      let lender: Awaited<ReturnType<typeof helpers.giveLoan>>;
      let options;

      it("Creates a dexloan loan", async () => {
        options = {
          amount: anchor.web3.LAMPORTS_PER_SOL / 10,
          basisPoints: 700,
          duration: 30 * 24 * 60 * 60, // 30 days
        };

        borrower = await helpers.initLoan(connection, options);
        const borrowerTokenAccount = await splToken.getAccount(
          connection,
          borrower.depositTokenAccount
        );
        const loan = await borrower.program.account.loan.fetch(
          borrower.loanAccount
        );
        const tokenManager = await borrower.program.account.tokenManager.fetch(
          borrower.tokenManager
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: false,
          loan: false,
        });
        assert.equal(
          borrowerTokenAccount.delegate.toBase58(),
          borrower.tokenManager.toBase58()
        );
        assert.equal(
          loan.borrower.toBase58(),
          borrower.keypair.publicKey.toBase58()
        );
        assert.equal(loan.basisPoints, options.basisPoints);
        assert.equal(loan.duration.toNumber(), options.duration);
        assert.equal(loan.mint.toBase58(), borrower.mint.toBase58());
        assert.equal(borrowerTokenAccount.amount, BigInt(1));
        assert.deepEqual(loan.state, { listed: {} });
      });

      it("Allows unactive loans to be closed", async () => {
        try {
          await borrower.program.methods
            .closeLoan()
            .accounts({
              loan: borrower.loanAccount,
              tokenManager: borrower.tokenManager,
              borrower: borrower.keypair.publicKey,
              depositTokenAccount: borrower.depositTokenAccount,
              mint: borrower.mint,
              edition: borrower.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
            })
            .rpc();
        } catch (error) {
          console.log(error.logs);
          assert.fail(error);
        }

        const borrowerTokenAccount = await splToken.getAccount(
          connection,
          borrower.depositTokenAccount
        );
        assert.equal(borrowerTokenAccount.delegate, null);
        assert.equal(borrowerTokenAccount.amount, BigInt(1));
      });

      it("Allows loans to be reinitialized after being closed", async () => {
        const amount = new anchor.BN(options.amount);
        const basisPoints = new anchor.BN(options.basisPoints);
        const duration = new anchor.BN(options.duration);

        await borrower.program.methods
          .initLoan(amount, basisPoints, duration)
          .accounts({
            loan: borrower.loanAccount,
            tokenManager: borrower.tokenManager,
            depositTokenAccount: borrower.depositTokenAccount,
            mint: borrower.mint,
            borrower: borrower.keypair.publicKey,
            edition: borrower.edition,
            metadataProgram: METADATA_PROGRAM_ID,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        const loan = await borrower.program.account.loan.fetch(
          borrower.loanAccount
        );
        const borrowerTokenAccount = await splToken.getAccount(
          connection,
          borrower.depositTokenAccount
        );

        assert.equal(borrowerTokenAccount.amount, BigInt(1));
        assert.equal(
          borrowerTokenAccount.delegate.toBase58(),
          borrower.tokenManager.toBase58()
        );
        assert.deepEqual(loan.state, { listed: {} });
        assert.equal(
          loan.borrower.toBase58(),
          borrower.keypair.publicKey.toBase58()
        );
      });

      it("Allows loans to be given", async () => {
        const borrowerPreLoanBalance = await connection.getBalance(
          borrower.keypair.publicKey
        );

        lender = await helpers.giveLoan(connection, borrower);
        const loan = await borrower.program.account.loan.fetch(
          borrower.loanAccount
        );
        const borrowerPostLoanBalance = await connection.getBalance(
          borrower.keypair.publicKey
        );
        const borrowerTokenAccount = await splToken.getAccount(
          connection,
          borrower.depositTokenAccount
        );
        const tokenManager = await borrower.program.account.tokenManager.fetch(
          borrower.tokenManager
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: false,
          loan: true,
        });
        assert.equal(borrowerTokenAccount.amount, BigInt(1));
        assert.equal(
          borrowerPreLoanBalance + options.amount,
          borrowerPostLoanBalance
        );
        assert.equal(
          loan.lender.toBase58(),
          lender.keypair.publicKey.toBase58()
        );
        assert.deepEqual(loan.state, { active: {} });
        assert(
          loan.startDate.toNumber() > 0 &&
            loan.startDate.toNumber() < Date.now()
        );
      });

      it("Will not allow a loan to be repossessed if not overdue", async () => {
        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
          connection,
          lender.keypair,
          borrower.mint,
          lender.keypair.publicKey
        );

        try {
          await lender.program.methods
            .repossess()
            .accounts({
              borrower: borrower.keypair.publicKey,
              depositTokenAccount: borrower.depositTokenAccount,
              lender: lender.keypair.publicKey,
              lenderTokenAccount: tokenAccount.address,
              loan: borrower.loanAccount,
              tokenManager: borrower.tokenManager,
              mint: borrower.mint,
              edition: borrower.edition,
              metadataProgram: METADATA_PROGRAM_ID,
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

      it("Allows loans to be repaid", async () => {
        const borrower = await helpers.initLoan(connection, options);
        const lender = await helpers.giveLoan(connection, borrower);
        const lenderPreRepaymentBalance = await connection.getBalance(
          lender.keypair.publicKey
        );

        await borrower.program.methods
          .repayLoan()
          .accounts({
            loan: borrower.loanAccount,
            tokenManager: borrower.tokenManager,
            borrower: borrower.keypair.publicKey,
            depositTokenAccount: borrower.depositTokenAccount,
            lender: lender.keypair.publicKey,
            mint: borrower.mint,
            edition: borrower.edition,
            metadataProgram: METADATA_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();

        const lenderPostRepaymentBalance = await connection.getBalance(
          lender.keypair.publicKey
        );
        const borrowerTokenAccount = await splToken.getAccount(
          connection,
          borrower.depositTokenAccount
        );
        const tokenManager = await borrower.program.account.tokenManager.fetch(
          borrower.tokenManager
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: false,
          loan: false,
        });
        assert.equal(borrowerTokenAccount.amount, BigInt(1));
        assert.equal(borrowerTokenAccount.delegate, null);
        assert(lenderPostRepaymentBalance > lenderPreRepaymentBalance);
      });

      it("Prevents reinitialization", async () => {
        const amount = anchor.web3.LAMPORTS_PER_SOL;
        const basisPoints = 500;
        const duration = 60;

        const borrower = await helpers.initLoan(connection, {
          amount,
          basisPoints,
          duration,
        });
        await helpers.giveLoan(connection, borrower);

        try {
          await borrower.program.methods
            .initLoan(
              new anchor.BN(amount),
              new anchor.BN(basisPoints),
              new anchor.BN(1)
            )
            .accounts({
              loan: borrower.loanAccount,
              tokenManager: borrower.tokenManager,
              depositTokenAccount: borrower.depositTokenAccount,
              mint: borrower.mint,
              borrower: borrower.keypair.publicKey,
              edition: borrower.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();
          assert.fail();
        } catch (error) {
          assert.ok(error.toString().includes("custom program error: 0x0"));
        }
      });
    });
  });

  describe("Call Options", () => {
    describe("Exercise call option", () => {
      let options;
      let seller: Awaited<ReturnType<typeof helpers.initCallOption>>;
      let buyer: Awaited<ReturnType<typeof helpers.buyCallOption>>;

      it("Creates a dexloan call option", async () => {
        options = {
          amount: 1_000_000,
          strikePrice: anchor.web3.LAMPORTS_PER_SOL,
          expiry: Math.round(Date.now() / 1000) + 30 * 24 * 60 * 2, // 2 days
        };
        seller = await helpers.initCallOption(connection, options);

        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );
        const sellerTokenAccount = await splToken.getAccount(
          connection,
          seller.depositTokenAccount
        );

        assert.equal(
          sellerTokenAccount.delegate,
          seller.callOptionAccount.toBase58()
        );
        assert.equal(
          callOption.seller.toBase58(),
          seller.keypair.publicKey.toBase58()
        );
        assert.equal(callOption.strikePrice.toNumber(), options.strikePrice);
        assert.equal(callOption.expiry.toNumber(), options.expiry);
        assert.equal(callOption.mint.toBase58(), seller.mint.toBase58());
        assert.deepEqual(callOption.state, { listed: {} });
        assert.equal(sellerTokenAccount.amount, BigInt(1));
      });

      it("Freezes tokens after initialization", async () => {
        const receiver = helpers.getLenderKeypair();

        const receiverTokenAccount = (
          await splToken.getOrCreateAssociatedTokenAccount(
            connection,
            receiver,
            seller.mint,
            receiver.publicKey
          )
        ).address;

        await helpers.wait(1);

        try {
          await splToken.transfer(
            connection,
            seller.keypair,
            seller.depositTokenAccount,
            receiverTokenAccount,
            seller.keypair.publicKey,
            1
          );
          assert.ok(false);
        } catch (err) {
          assert.ok(err.logs.includes("Program log: Error: Account is frozen"));
        }
      });

      it("Buys a call option", async () => {
        buyer = await helpers.buyCallOption(connection, seller);

        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );

        assert.equal(
          callOption.seller.toBase58(),
          seller.keypair.publicKey.toBase58()
        );
        assert.deepEqual(callOption.state, { active: {} });
      });

      it("Can't be closed if active", async () => {
        try {
          await seller.program.methods
            .closeCallOption()
            .accounts({
              callOption: seller.callOptionAccount,
              seller: seller.keypair.publicKey,
              mint: seller.mint,
              edition: seller.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            })
            .rpc();
          assert.fail("Active call option was closed!");
        } catch (err) {
          assert.ok(true);
        }
      });

      it("Exercises a call option", async () => {
        const beforeExerciseBalance = await connection.getBalance(
          buyer.keypair.publicKey
        );

        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
          connection,
          buyer.keypair,
          seller.mint,
          buyer.keypair.publicKey
        );

        const [metadataAddress] = await helpers.findMetadataAddress(
          seller.mint
        );

        const accountInfo = await connection.getAccountInfo(metadataAddress);
        const [metadata] = Metadata.fromAccountInfo(accountInfo);

        try {
          await buyer.program.methods
            .exerciseCallOption()
            .accounts({
              seller: seller.keypair.publicKey,
              buyer: buyer.keypair.publicKey,
              callOption: seller.callOptionAccount,
              tokenManager: seller.tokenManager,
              buyerTokenAccount: tokenAccount.address,
              depositTokenAccount: seller.depositTokenAccount,
              mint: seller.mint,
              edition: seller.edition,
              metadata: metadataAddress,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .remainingAccounts(
              metadata.data.creators.map((creator) => ({
                pubkey: creator.address,
                isSigner: false,
                isWritable: true,
              }))
            )
            .rpc();
        } catch (err) {
          console.log(err);
          assert.fail(err.message);
        }

        const afterExerciseBalance = await connection.getBalance(
          buyer.keypair.publicKey
        );
        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );
        const buyerTokenAccount = await splToken.getAccount(
          connection,
          tokenAccount.address
        );

        assert.equal(
          beforeExerciseBalance - anchor.web3.LAMPORTS_PER_SOL - 5000,
          afterExerciseBalance
        );
        assert.deepEqual(callOption.state, { exercised: {} });
        assert.equal(buyerTokenAccount.amount, BigInt(1));
      });

      it("Can be closed after being exercised", async () => {
        await seller.program.methods
          .closeCallOption()
          .accounts({
            seller: seller.keypair.publicKey,
            callOption: seller.callOptionAccount,
            depositTokenAccount: seller.depositTokenAccount,
            mint: seller.mint,
            edition: seller.edition,
            metadataProgram: METADATA_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();

        try {
          await seller.program.account.callOption.fetch(
            seller.callOptionAccount
          );
          assert.fail();
        } catch (error) {
          assert.ok(error.message.includes("Account does not exist"));
        }
        const sellerTokenAccount = await splToken.getAccount(
          connection,
          seller.depositTokenAccount
        );

        assert.equal(sellerTokenAccount.amount, BigInt(0));
        assert.equal(sellerTokenAccount.delegate, null);
      });
    });

    describe("Call option expiry", () => {
      let options;
      let seller: Awaited<ReturnType<typeof helpers.initCallOption>>;
      let buyer: Awaited<ReturnType<typeof helpers.buyCallOption>>;

      it("Creates a dexloan call option", async () => {
        options = {
          amount: 1_000_000,
          strikePrice: anchor.web3.LAMPORTS_PER_SOL,
          expiry: Math.round(Date.now() / 1000) + 20, // 20 seconds
        };
        seller = await helpers.initCallOption(connection, options);

        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );
        const sellerTokenAccount = await splToken.getAccount(
          connection,
          seller.depositTokenAccount
        );

        assert.equal(
          sellerTokenAccount.delegate,
          seller.callOptionAccount.toBase58()
        );
        assert.equal(
          callOption.seller.toBase58(),
          seller.keypair.publicKey.toBase58()
        );
        assert.equal(callOption.strikePrice.toNumber(), options.strikePrice);
        assert.equal(callOption.expiry.toNumber(), options.expiry);
        assert.equal(callOption.mint.toBase58(), seller.mint.toBase58());
        assert.deepEqual(callOption.state, { listed: {} });
        assert.equal(sellerTokenAccount.amount, BigInt(1));
      });

      it("Buys a call option", async () => {
        buyer = await helpers.buyCallOption(connection, seller);

        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );

        assert.equal(
          callOption.seller.toBase58(),
          seller.keypair.publicKey.toBase58()
        );
        assert.deepEqual(callOption.state, { active: {} });
      });

      it("Cannot be exercised if expired", async () => {
        console.log("waiting...");
        await helpers.wait(20);

        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
          connection,
          buyer.keypair,
          seller.mint,
          buyer.keypair.publicKey
        );

        try {
          await buyer.program.methods
            .exerciseCallOption()
            .accounts({
              seller: seller.keypair.publicKey,
              buyer: buyer.keypair.publicKey,
              buyerTokenAccount: tokenAccount.address,
              callOption: seller.callOptionAccount,
              tokenManager: seller.tokenManager,
              mint: seller.mint,
              edition: seller.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc();
          assert.fail();
        } catch (error) {
          console.log(error.logs);
          assert.ok(true);
        }
      });

      it("Can be closed by seller when expired", async () => {
        await seller.program.methods
          .closeCallOption()
          .accounts({
            seller: seller.keypair.publicKey,
            callOption: seller.callOptionAccount,
            depositTokenAccount: seller.depositTokenAccount,
            mint: seller.mint,
            edition: seller.edition,
            metadataProgram: METADATA_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();

        try {
          await seller.program.account.callOption.fetch(
            seller.callOptionAccount
          );
          assert.fail();
        } catch (error) {
          assert.ok(error.message.includes("Account does not exist"));
        }
        const sellerTokenAccount = await splToken.getAccount(
          connection,
          seller.depositTokenAccount
        );

        assert.equal(sellerTokenAccount.amount, BigInt(1));
        assert.equal(sellerTokenAccount.delegate, null);
      });
    });
  });

  describe("Hires", () => {
    describe("Specified borrower", async () => {
      let lender: Awaited<ReturnType<typeof helpers.initHire>>;
      let borrower: Awaited<ReturnType<typeof helpers.takeHire>>;
      let options;

      it("Initializes a hire with a borrower", async () => {
        options = {
          amount: 0,
          expiry: Date.now() / 1000 + 20,
          borrower: helpers.getBorrowerKeypair().publicKey,
        };
        lender = await helpers.initHire(connection, options);

        const hire = await lender.program.account.hire.fetch(
          lender.hireAccount
        );

        const tokenAddress = (
          await connection.getTokenLargestAccounts(lender.mint)
        ).value[0].address;

        const tokenAccount = await splToken.getAccount(
          connection,
          tokenAddress
        );

        assert.ok(tokenAccount.isFrozen);
        assert.ok(tokenAccount.delegate.equals(lender.hireAccount));
        assert.equal(hire.amount.toNumber(), options.amount);
        assert.equal(
          hire.lender.toBase58(),
          lender.keypair.publicKey.toBase58()
        );
        assert.equal(hire.borrower.toBase58(), options.borrower.toBase58());
        assert.deepEqual(hire.state, { listed: {} });
      });

      it("Does not allow a different address to take the hire", async () => {
        const newKeypair = anchor.web3.Keypair.generate();
        await helpers.requestAirdrop(connection, newKeypair.publicKey);
        const provider = helpers.getProvider(connection, newKeypair);
        const program = helpers.getProgram(provider);

        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
          connection,
          newKeypair,
          lender.mint,
          newKeypair.publicKey
        );

        const metadataAccountInfo = await connection.getAccountInfo(
          lender.metadata
        );
        const [metadata] = Metadata.fromAccountInfo(metadataAccountInfo);

        try {
          await program.methods
            .takeHire(0)
            .accounts({
              borrower: newKeypair.publicKey,
              lender: lender.keypair.publicKey,
              hire: lender.hireAccount,
              tokenManager: lender.tokenManager,
              depositTokenAccount: lender.depositTokenAccount,
              hireTokenAccount: tokenAccount.address,
              mint: lender.mint,
              edition: lender.edition,
              metadata: lender.metadata,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            })
            .remainingAccounts(
              metadata.data.creators.map((creator) => ({
                pubkey: creator.address,
                isSigner: false,
                isWritable: true,
              }))
            )
            .rpc();
          assert.fail("Expected to fail");
        } catch (err) {
          console.log(err.logs);
          assert.ok(true);
        }
      });

      it("Allows a hire to be taken by the borrower", async () => {
        const days = 1;
        const estimatedCurrentExpiry = Date.now() / 1000 + 86_400 * days;

        borrower = await helpers.takeHire(connection, lender, days);

        const hire = await lender.program.account.hire.fetch(
          lender.hireAccount
        );

        const tokenAccount = await splToken.getAccount(
          connection,
          borrower.hireTokenAccount
        );

        assert.deepEqual(hire.state, { hired: {} });
        assert.equal(tokenAccount.isFrozen, true);
        assert.equal(tokenAccount.amount, BigInt(1));
        assert.equal(
          hire.borrower.toBase58(),
          borrower.keypair.publicKey.toBase58()
        );
        hire.currentExpiry.toNumber() >= estimatedCurrentExpiry &&
          hire.currentExpiry.toNumber() <= estimatedCurrentExpiry + 10;
      });

      it("Does not allow hire token account to be closed", async () => {
        try {
          await splToken.closeAccount(
            connection,
            borrower.keypair,
            borrower.hireTokenAccount,
            lender.depositTokenAccount,
            borrower.keypair
          );
          assert.fail();
        } catch (err) {
          assert.ok(
            err.logs.includes(
              "Program log: Error: Non-native account can only be closed if its balance is zero"
            )
          );
        }
      });

      it("Does not allow a hire to be recovered before expiry", async () => {
        try {
          await helpers.recoverHire(lender, borrower);
          assert.fail();
        } catch (err) {
          console.log(err.logs);
          assert.ok(err);
        }
      });
    });

    describe("Open hire", async () => {
      let options;
      let lender: helpers.HireLender;
      let borrower: helpers.HireBorrower;

      it("Initializes an open hire", async () => {
        options = {
          amount: 10_000,
          expiry: Date.now() / 1000 + 86_400 * 180,
        };
        lender = await helpers.initHire(connection, options);

        const hire = await lender.program.account.hire.fetch(
          lender.hireAccount
        );

        const tokenAddress = (
          await connection.getTokenLargestAccounts(lender.mint)
        ).value[0].address;

        const tokenAccount = await splToken.getAccount(
          connection,
          tokenAddress
        );

        assert.ok(tokenAccount.isFrozen);
        assert.ok(tokenAccount.delegate.equals(lender.hireAccount));
        assert.equal(hire.amount.toNumber(), options.amount);
        assert.equal(
          hire.lender.toBase58(),
          lender.keypair.publicKey.toBase58()
        );
        assert.equal(hire.borrower, null);
        assert.deepEqual(hire.state, { listed: {} });
      });

      it("Allows a hire to be taken for x days", async () => {
        const days = 2;
        const estimatedCurrentExpiry = Date.now() / 1000 + 86_400 * days;
        borrower = await helpers.takeHire(connection, lender, days);

        const hire = await lender.program.account.hire.fetch(
          lender.hireAccount
        );
        const tokenAddress = (
          await connection.getTokenLargestAccounts(lender.mint)
        ).value[0].address;

        const tokenAccount = await splToken.getAccount(
          connection,
          tokenAddress
        );

        assert.deepEqual(hire.state, { hired: {} });
        assert.equal(tokenAccount.isFrozen, true);
        assert.equal(tokenAccount.amount, BigInt(1));
        assert.equal(
          hire.borrower.toBase58(),
          borrower.keypair.publicKey.toBase58()
        );
        assert.ok(
          hire.currentExpiry.toNumber() >= estimatedCurrentExpiry &&
            hire.currentExpiry.toNumber() <= estimatedCurrentExpiry + 10
        );
      });
    });

    describe("Loans with Hires", () => {
      let borrower: helpers.LoanBorrower;
      let lender: helpers.LoanLender;
      let thirdPartyKeypair: anchor.web3.Keypair;

      it("Allows collateralized NFTs to be listed for hire", async () => {
        borrower = await helpers.initLoan(connection, {
          amount: anchor.web3.LAMPORTS_PER_SOL / 100,
          basisPoints: 500,
          duration: 1,
        });
        lender = await helpers.giveLoan(connection, borrower);

        const amount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
        const expiry = new anchor.BN(Date.now() / 1000 + 86_400 * 3);

        const hireAddress = await helpers.findHireAddress(
          borrower.mint,
          borrower.keypair.publicKey
        );

        const tokenManagerAddress = await helpers.findTokenManagerAddress(
          borrower.mint,
          borrower.keypair.publicKey
        );

        await borrower.program.methods
          .initHire({ amount, expiry, borrower: null })
          .accounts({
            hire: hireAddress,
            tokenManager: tokenManagerAddress,
            lender: borrower.keypair.publicKey,
            depositTokenAccount: borrower.depositTokenAccount,
            mint: borrower.mint,
            edition: borrower.edition,
            metadataProgram: METADATA_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();

        const hire = await lender.program.account.hire.fetch(hireAddress);
        const tokenManager = await lender.program.account.tokenManager.fetch(
          tokenManagerAddress
        );

        assert.deepEqual(tokenManager.accounts, {
          loan: true,
          hire: false,
          callOption: false,
        });
        assert.equal(hire.borrower, null);
        assert.deepEqual(hire.state, { listed: {} });
      });

      it("Allows collateralized NFTs to be hired", async () => {
        thirdPartyKeypair = helpers.getThirdPartyKeypair();
        console.log("third party: ", thirdPartyKeypair.publicKey.toBase58());

        const program = helpers.getProgram(
          helpers.getProvider(connection, thirdPartyKeypair)
        );
        const hireAddress = await helpers.findHireAddress(
          borrower.mint,
          borrower.keypair.publicKey
        );
        const hireEscrowAddress = await helpers.findHireEscrowAddress(
          borrower.mint,
          borrower.keypair.publicKey
        );
        const tokenManagerAddress = await helpers.findTokenManagerAddress(
          borrower.mint,
          borrower.keypair.publicKey
        );
        const hireTokenAccount =
          await splToken.getOrCreateAssociatedTokenAccount(
            connection,
            thirdPartyKeypair,
            borrower.mint,
            thirdPartyKeypair.publicKey
          );
        const [metadataAddress] = await helpers.findMetadataAddress(
          borrower.mint
        );

        try {
          await program.methods
            .takeHire(2)
            .accounts({
              borrower: thirdPartyKeypair.publicKey,
              lender: borrower.keypair.publicKey,
              hire: hireAddress,
              hireEscrow: hireEscrowAddress,
              tokenManager: tokenManagerAddress,
              depositTokenAccount: borrower.depositTokenAccount,
              hireTokenAccount: hireTokenAccount.address,
              mint: borrower.mint,
              edition: borrower.edition,
              metadata: metadataAddress,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            })
            .rpc();
        } catch (error) {
          console.log(error.logs);
          throw error;
        }

        const hire = await lender.program.account.hire.fetch(hireAddress);
        const tokenManager = await lender.program.account.tokenManager.fetch(
          tokenManagerAddress
        );
        const tokenAccount = await splToken.getAccount(
          connection,
          hireTokenAccount.address
        );

        assert.deepEqual(tokenManager.accounts, {
          loan: true,
          hire: true,
          callOption: false,
        });
        assert.equal(
          hire.borrower.toBase58(),
          thirdPartyKeypair.publicKey.toBase58()
        );
        assert.deepEqual(hire.state, { hired: {} });
        assert.equal(tokenAccount.amount, BigInt(1));
        assert.ok(tokenAccount.isFrozen);
        assert.ok(tokenAccount.delegate.equals(tokenManagerAddress));
        assert.equal(tokenAccount.delegatedAmount, BigInt(1));
      });

      it("Will settle hire fees when collateral is repossessed", async () => {
        await helpers.wait(10); // Wait to allow some rent to accrue

        const hireAddress = await helpers.findHireAddress(
          borrower.mint,
          borrower.keypair.publicKey
        );
        const hireEscrowAddress = await helpers.findHireEscrowAddress(
          borrower.mint,
          borrower.keypair.publicKey
        );
        const hireTokenAccount =
          await splToken.getOrCreateAssociatedTokenAccount(
            connection,
            thirdPartyKeypair,
            borrower.mint,
            thirdPartyKeypair.publicKey
          );
        const lenderTokenAccount =
          await splToken.getOrCreateAssociatedTokenAccount(
            connection,
            lender.keypair,
            borrower.mint,
            lender.keypair.publicKey
          );

        try {
          await lender.program.methods
            .repossessWithHire()
            .accounts({
              hire: hireAddress,
              hireEscrow: hireEscrowAddress,
              hireTokenAccount: hireTokenAccount.address,
              borrower: borrower.keypair.publicKey,
              lender: lender.keypair.publicKey,
              lenderTokenAccount: lenderTokenAccount.address,
              loan: borrower.loanAccount,
              tokenManager: borrower.tokenManager,
              mint: borrower.mint,
              edition: borrower.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .remainingAccounts([
              {
                isSigner: false,
                isWritable: true,
                pubkey: thirdPartyKeypair.publicKey,
              },
            ])
            .rpc();
        } catch (err) {
          console.log(err.logs);
          throw err;
        }

        const updatedLendertokenAccount = await splToken.getAccount(
          connection,
          lenderTokenAccount.address
        );
        const updatedHireTokenAccount = await splToken.getAccount(
          connection,
          hireTokenAccount.address
        );
        const tokenManager = await borrower.program.account.tokenManager.fetch(
          borrower.tokenManager
        );
        const defaultedLoan = await borrower.program.account.loan.fetch(
          borrower.loanAccount
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: false,
          loan: false,
        });
        assert.equal(updatedLendertokenAccount.amount, BigInt(1));
        assert.equal(updatedHireTokenAccount.amount, BigInt(0));
        assert.deepEqual(defaultedLoan.state, { defaulted: {} });
      });
    });
  });
});

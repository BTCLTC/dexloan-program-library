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

  describe("Loan repossessions", () => {
    let borrower: Awaited<ReturnType<typeof helpers.initLoan>>;
    let lender: Awaited<ReturnType<typeof helpers.giveLoan>>;
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

      assert.equal(
        borrowerTokenAccount.delegate,
        borrower.loanAccount.toBase58()
      );
      assert.equal(loan.borrower, borrower.keypair.publicKey.toBase58());
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
      const borrowerPostLoanBalance = await connection.getBalance(
        borrower.keypair.publicKey
      );
      const borrowerTokenAccount = await splToken.getAccount(
        connection,
        borrower.depositTokenAccount
      );
      assert.ok(true);
      assert.equal(borrowerTokenAccount.amount, BigInt(1));
      assert.equal(
        borrowerPreLoanBalance + options.amount,
        borrowerPostLoanBalance
      );
      assert.equal(loan.lender.toBase58(), lender.keypair.publicKey.toBase58());
      assert.deepEqual(loan.state, { active: {} });
      assert(
        loan.startDate.toNumber() > 0 && loan.startDate.toNumber() < Date.now()
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
          .repossessCollateral()
          .accounts({
            borrower: borrower.keypair.publicKey,
            depositTokenAccount: borrower.depositTokenAccount,
            lender: lender.keypair.publicKey,
            lenderTokenAccount: tokenAccount.address,
            loanAccount: borrower.loanAccount,
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
          .repossessCollateral()
          .accounts({
            borrower: borrower.keypair.publicKey,
            depositTokenAccount: borrower.depositTokenAccount,
            lender: lender.keypair.publicKey,
            lenderTokenAccount: tokenAccount.address,
            loanAccount: borrower.loanAccount,
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
      const defaultedListing = await borrower.program.account.loan.fetch(
        borrower.loanAccount
      );
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
            loanAccount: borrower.loanAccount,
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

      assert.ok(true);
      assert.equal(
        borrowerTokenAccount.delegate,
        borrower.loanAccount.toBase58()
      );
      assert.equal(loan.borrower, borrower.keypair.publicKey.toBase58());
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
            loanAccount: borrower.loanAccount,
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
          loanAccount: borrower.loanAccount,
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
        borrower.loanAccount.toBase58()
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
      assert.ok(true);
      assert.equal(borrowerTokenAccount.amount, BigInt(1));
      assert.equal(
        borrowerPreLoanBalance + options.amount,
        borrowerPostLoanBalance
      );
      assert.equal(loan.lender.toBase58(), lender.keypair.publicKey.toBase58());
      assert.deepEqual(loan.state, { active: {} });
      assert(
        loan.startDate.toNumber() > 0 && loan.startDate.toNumber() < Date.now()
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
          .repossessCollateral()
          .accounts({
            borrower: borrower.keypair.publicKey,
            depositTokenAccount: borrower.depositTokenAccount,
            lender: lender.keypair.publicKey,
            lenderTokenAccount: tokenAccount.address,
            loanAccount: borrower.loanAccount,
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
          loanAccount: borrower.loanAccount,
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

      const loan = await borrower.program.account.loan.fetch(
        borrower.loanAccount
      );

      try {
        await borrower.program.methods
          .initLoan(
            new anchor.BN(amount),
            new anchor.BN(basisPoints),
            new anchor.BN(1)
          )
          .accounts({
            loanAccount: borrower.loanAccount,
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
              callOptionAccount: seller.callOptionAccount,
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
              callOptionAccount: seller.callOptionAccount,
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
            callOptionAccount: seller.callOptionAccount,
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
              callOptionAccount: seller.callOptionAccount,
              mint: seller.mint,
              edition: seller.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc();

          assert.fail("Expected error");
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
            callOptionAccount: seller.callOptionAccount,
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
});

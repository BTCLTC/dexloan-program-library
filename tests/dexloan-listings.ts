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
    "http://127.0.0.1:8899",
    anchor.AnchorProvider.defaultOptions().preflightCommitment
  );

  describe.only("Collections", () => {
    const keypair = anchor.web3.Keypair.fromSecretKey(
      new Uint8Array([
        124, 208, 255, 155, 233, 90, 118, 131, 46, 39, 251, 139, 128, 39, 102,
        95, 152, 29, 11, 251, 94, 142, 210, 207, 43, 45, 190, 97, 177, 241, 91,
        213, 133, 38, 232, 90, 89, 239, 206, 32, 37, 195, 180, 213, 193, 236,
        43, 164, 196, 151, 160, 8, 134, 116, 139, 146, 73, 139, 186, 20, 80,
        144, 207, 225,
      ])
    );
    const provider = helpers.getProvider(connection, keypair);
    const program = helpers.getProgram(provider);

    it("Initializes a collection", async () => {
      await helpers.requestAirdrop(connection, keypair.publicKey);
      const nft = await helpers.mintNFT(connection, keypair);

      const collection = await helpers.findCollectionAddress(
        nft.collection.address
      );

      await program.methods
        .initCollection()
        .accounts({
          collection,
          authority: keypair.publicKey,
          collectionMint: nft.collection.address,
        })
        .rpc();
    });
  });

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
          loan: true,
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
        const receiver = anchor.web3.Keypair.generate();
        await helpers.requestAirdrop(connection, receiver.publicKey);

        const receiverTokenAccount = await splToken.createAccount(
          connection,
          receiver,
          borrower.mint,
          receiver.publicKey
        );

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
          loan: true,
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
      let seller: helpers.CallOptionSeller;
      let buyer: helpers.CallOptionBuyer;

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
        const tokenManager = await seller.program.account.tokenManager.fetch(
          seller.tokenManager
        );
        const sellerTokenAccount = await splToken.getAccount(
          connection,
          seller.depositTokenAccount
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: true,
          loan: false,
        });
        assert.equal(
          sellerTokenAccount.delegate.toBase58(),
          seller.tokenManager.toBase58()
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
        const receiver = anchor.web3.Keypair.generate();
        await helpers.requestAirdrop(connection, receiver.publicKey);

        const receiverTokenAccount = await splToken.createAccount(
          connection,
          receiver,
          seller.mint,
          receiver.publicKey
        );

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
              tokenManager: seller.tokenManager,
              seller: seller.keypair.publicKey,
              depositTokenAccount: seller.depositTokenAccount,
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
          assert(err instanceof anchor.AnchorError);
          assert.equal(err.error.errorCode.number, 6009);
          assert.equal(err.error.errorCode.code, "OptionNotExpired");
        }
      });

      it("Exercises a call option", async () => {
        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
          connection,
          buyer.keypair,
          seller.mint,
          buyer.keypair.publicKey
        );

        const [metadataAddress] = await helpers.findMetadataAddress(
          seller.mint
        );
        const metadata = await Metadata.fromAccountAddress(
          connection,
          metadataAddress
        );

        const beforeBuyerBalance = await connection.getBalance(
          buyer.keypair.publicKey
        );
        const beforeSellerBalance = await connection.getBalance(
          seller.keypair.publicKey
        );

        let txFee;

        try {
          const signature = await buyer.program.methods
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

          const latestBlockhash = await connection.getLatestBlockhash();
          await connection.confirmTransaction({
            signature,
            ...latestBlockhash,
          });
          const tx = await connection.getTransaction(signature, {
            commitment: "confirmed",
          });
          txFee = tx.meta.fee;
        } catch (err) {
          assert.fail(err);
        }

        const afterBuyerBalance = await connection.getBalance(
          buyer.keypair.publicKey
        );
        const afterSellerBalance = await connection.getBalance(
          seller.keypair.publicKey
        );
        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );
        const buyerTokenAccount = await splToken.getAccount(
          connection,
          tokenAccount.address
        );

        const creatorFees =
          (metadata.data.sellerFeeBasisPoints / 10_000) *
          callOption.strikePrice.toNumber();

        const estimatedBuyerBalance =
          beforeBuyerBalance - options.strikePrice - txFee;

        const estimatedSellerBalance =
          beforeSellerBalance + (options.strikePrice - creatorFees);

        assert.equal(estimatedBuyerBalance, afterBuyerBalance, "buyer balance");
        assert.equal(
          estimatedSellerBalance,
          afterSellerBalance,
          "seller balance"
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
            tokenManager: seller.tokenManager,
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
          sellerTokenAccount.delegate.toBase58(),
          seller.tokenManager.toBase58()
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
        const sellerBeforeBalance = await connection.getBalance(
          seller.keypair.publicKey
        );

        buyer = await helpers.buyCallOption(connection, seller);

        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );
        const sellerAfterBalance = await connection.getBalance(
          seller.keypair.publicKey
        );
        const estimatedSellerBalance = sellerBeforeBalance + options.amount;
        assert.equal(
          sellerAfterBalance,
          estimatedSellerBalance,
          "seller balance"
        );
        assert.equal(
          callOption.seller.toBase58(),
          seller.keypair.publicKey.toBase58()
        );
        assert.deepEqual(callOption.state, { active: {} });
      });

      it("Cannot be exercised if expired", async () => {
        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );
        const now = Date.now() / 1000;
        const timeUntilExpiry = Math.ceil(callOption.expiry.toNumber() - now);
        await helpers.wait(timeUntilExpiry + 1);

        try {
          const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
            connection,
            buyer.keypair,
            seller.mint,
            buyer.keypair.publicKey
          );

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
            tokenManager: seller.tokenManager,
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
      let lender: helpers.HireLender;
      let borrowerTokenAccount: anchor.web3.PublicKey;
      let options;
      let privateBorrower = anchor.web3.Keypair.generate();

      it("Initializes a hire with a borrower", async () => {
        options = {
          amount: 0,
          expiry: Date.now() / 1000 + 84_600 * 3,
          borrower: privateBorrower.publicKey,
        };
        lender = await helpers.initHire(connection, options);

        const hire = await lender.program.account.hire.fetch(lender.hire);
        const tokenAddress = (
          await connection.getTokenLargestAccounts(lender.mint)
        ).value[0].address;
        const tokenAccount = await splToken.getAccount(
          connection,
          tokenAddress
        );

        assert.ok(tokenAccount.isFrozen);
        assert.ok(
          tokenAccount.delegate.toBase58(),
          lender.tokenManager.toBase58()
        );
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
        const metadata = await Metadata.fromAccountAddress(
          connection,
          lender.metadata
        );

        try {
          await program.methods
            .takeHire(1)
            .accounts({
              borrower: newKeypair.publicKey,
              lender: lender.keypair.publicKey,
              hire: lender.hire,
              hireEscrow: lender.hireEscrow,
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
          assert(err instanceof anchor.AnchorError);
          assert.equal(err.error.errorCode.number, 2502);
          assert.equal(err.error.errorCode.code, "RequireKeysEqViolated");
        }
      });

      it("Allows a hire to be taken by the borrower", async () => {
        await helpers.requestAirdrop(connection, privateBorrower.publicKey);
        const provider = helpers.getProvider(connection, privateBorrower);
        const program = helpers.getProgram(provider);

        borrowerTokenAccount = await splToken.createAccount(
          connection,
          privateBorrower,
          lender.mint,
          privateBorrower.publicKey
        );
        const metadata = await Metadata.fromAccountAddress(
          connection,
          lender.metadata
        );

        const days = 1;
        const estimatedCurrentExpiry = Math.round(
          Date.now() / 1000 + 86_400 * days
        );

        await program.methods
          .takeHire(days)
          .accounts({
            borrower: privateBorrower.publicKey,
            lender: lender.keypair.publicKey,
            hire: lender.hire,
            hireEscrow: lender.hireEscrow,
            tokenManager: lender.tokenManager,
            depositTokenAccount: lender.depositTokenAccount,
            hireTokenAccount: borrowerTokenAccount,
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

        const hire = await lender.program.account.hire.fetch(lender.hire);
        const tokenAccount = await splToken.getAccount(
          connection,
          borrowerTokenAccount
        );

        assert.deepEqual(hire.state, { hired: {} });
        assert.equal(tokenAccount.isFrozen, true, "isFrozen");
        assert.equal(tokenAccount.amount, BigInt(1));
        assert.equal(
          hire.borrower.toBase58(),
          privateBorrower.publicKey.toBase58(),
          "borrower"
        );
        assert.ok(
          hire.currentExpiry.toNumber() >= estimatedCurrentExpiry - 2 &&
            hire.currentExpiry.toNumber() <= estimatedCurrentExpiry + 2,
          "currentExpiry"
        );
      });

      it("Does not allow hire token account to be closed", async () => {
        try {
          await splToken.closeAccount(
            connection,
            privateBorrower,
            borrowerTokenAccount,
            lender.depositTokenAccount,
            privateBorrower
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
          await lender.program.methods
            .recoverHire()
            .accounts({
              borrower: privateBorrower.publicKey,
              lender: lender.keypair.publicKey,
              hire: lender.hire,
              hireEscrow: lender.hireEscrow,
              tokenManager: lender.tokenManager,
              depositTokenAccount: lender.depositTokenAccount,
              hireTokenAccount: borrowerTokenAccount,
              mint: lender.mint,
              edition: lender.edition,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            })
            .rpc();
          assert.fail();
        } catch (err) {
          assert(err instanceof anchor.AnchorError);
          assert.equal(err.error.errorCode.number, 6001);
          assert.equal(err.error.errorCode.code, "NotExpired");
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

        const hire = await lender.program.account.hire.fetch(lender.hire);
        const tokenAddress = (
          await connection.getTokenLargestAccounts(lender.mint)
        ).value[0].address;
        const tokenAccount = await splToken.getAccount(
          connection,
          tokenAddress
        );

        assert.ok(tokenAccount.isFrozen);
        assert.ok(
          tokenAccount.delegate.toBase58(),
          lender.tokenManager.toBase58()
        );
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
        const estimatedCurrentExpiry = Math.round(
          Date.now() / 1000 + 86_400 * days
        );
        borrower = await helpers.takeHire(connection, lender, days);

        const hire = await lender.program.account.hire.fetch(lender.hire);
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
          hire.currentExpiry.toNumber() >= estimatedCurrentExpiry - 2 &&
            hire.currentExpiry.toNumber() <= estimatedCurrentExpiry + 2
        );
      });
    });

    describe("Loan repayment with active hire", () => {
      let borrower: helpers.LoanBorrower;
      let lender: helpers.LoanLender;
      let thirdPartyKeypair = anchor.web3.Keypair.generate();
      let options = {
        amount: anchor.web3.LAMPORTS_PER_SOL,
        basisPoints: 1000,
        duration: 86_400 * 365, // 1 year
      };

      it("Allows collateralized NFTs to be listed for hire", async () => {
        borrower = await helpers.initLoan(connection, options);
        lender = await helpers.giveLoan(connection, borrower);

        const amount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL / 100);
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
          hire: true,
          callOption: false,
        });
        assert.equal(hire.borrower, null);
        assert.deepEqual(hire.state, { listed: {} });
      });

      it("Allows collateralized NFTs to be hired", async () => {
        await helpers.requestAirdrop(connection, thirdPartyKeypair.publicKey);
        const provider = helpers.getProvider(connection, thirdPartyKeypair);
        const program = helpers.getProgram(provider);
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
        const estimatedLenderBalance =
          lenderPreRepaymentBalance +
          options.amount +
          (options.amount * options.basisPoints) / 10_000;
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
        assert.equal(lenderPostRepaymentBalance, estimatedLenderBalance);
      });
    });

    describe("Repossession with active hire", () => {
      let borrower: helpers.LoanBorrower;
      let lender: helpers.LoanLender;
      let thirdPartyKeypair = anchor.web3.Keypair.generate();

      it("Allows collateralized NFTs to be listed for hire", async () => {
        borrower = await helpers.initLoan(connection, {
          amount: anchor.web3.LAMPORTS_PER_SOL / 100,
          basisPoints: 500,
          duration: 1,
        });
        lender = await helpers.giveLoan(connection, borrower);

        const amount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL / 100);
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
          hire: true,
          callOption: false,
        });
        assert.equal(hire.borrower, null);
        assert.deepEqual(hire.state, { listed: {} });
      });

      it("Allows collateralized NFTs to be hired", async () => {
        await helpers.requestAirdrop(connection, thirdPartyKeypair.publicKey);
        const provider = helpers.getProvider(connection, thirdPartyKeypair);
        const program = helpers.getProgram(provider);
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
              borrower: borrower.keypair.publicKey,
              lender: lender.keypair.publicKey,
              lenderTokenAccount: lenderTokenAccount.address,
              tokenAccount: hireTokenAccount.address,
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

    describe("Repossession with listed hire", () => {
      let borrower: helpers.LoanBorrower;
      let lender: helpers.LoanLender;

      it("Allows collateralized NFTs to be listed for hire", async () => {
        borrower = await helpers.initLoan(connection, {
          amount: anchor.web3.LAMPORTS_PER_SOL / 100,
          basisPoints: 500,
          duration: 1,
        });
        lender = await helpers.giveLoan(connection, borrower);

        const amount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL / 100);
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
          hire: true,
          callOption: false,
        });
        assert.equal(hire.borrower, null);
        assert.deepEqual(hire.state, { listed: {} });
      });

      it("Will settle hire fees when collateral is repossessed", async () => {
        const hireAddress = await helpers.findHireAddress(
          borrower.mint,
          borrower.keypair.publicKey
        );
        const hireEscrowAddress = await helpers.findHireEscrowAddress(
          borrower.mint,
          borrower.keypair.publicKey
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
              borrower: borrower.keypair.publicKey,
              lender: lender.keypair.publicKey,
              lenderTokenAccount: lenderTokenAccount.address,
              tokenAccount: borrower.depositTokenAccount,
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
        } catch (err) {
          console.log(err.logs);
          throw err;
        }

        const updatedLendertokenAccount = await splToken.getAccount(
          connection,
          lenderTokenAccount.address
        );
        const updatedBorrowerTokenAccount = await splToken.getAccount(
          connection,
          borrower.depositTokenAccount
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
        assert.equal(updatedBorrowerTokenAccount.amount, BigInt(0));
        assert.deepEqual(defaultedLoan.state, { defaulted: {} });
      });
    });

    describe("exercise option with active hire", () => {
      let seller: helpers.CallOptionSeller;
      let buyer: helpers.CallOptionBuyer;
      let hireTokenAccount: anchor.web3.PublicKey;
      let thirdPartyKeypair = anchor.web3.Keypair.generate();
      let callOptionOptions = {
        amount: 1_000_000,
        strikePrice: anchor.web3.LAMPORTS_PER_SOL,
        expiry: Math.round(Date.now() / 1000) + 30 * 24 * 60 * 2, // 2 days
      };
      let hireOptions = {
        amount: new anchor.BN(anchor.web3.LAMPORTS_PER_SOL / 100),
        expiry: new anchor.BN(Date.now() / 1000 + 86_400 * 3),
        borrower: null,
      };

      it("Allows active options to be listed for hire", async () => {
        seller = await helpers.initCallOption(connection, callOptionOptions);
        buyer = await helpers.buyCallOption(connection, seller);

        const hireAddress = await helpers.findHireAddress(
          seller.mint,
          seller.keypair.publicKey
        );
        await seller.program.methods
          .initHire(hireOptions)
          .accounts({
            hire: hireAddress,
            tokenManager: seller.tokenManager,
            lender: seller.keypair.publicKey,
            depositTokenAccount: seller.depositTokenAccount,
            mint: seller.mint,
            edition: seller.edition,
            metadataProgram: METADATA_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: splToken.TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          })
          .rpc();

        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );
        const hire = await seller.program.account.hire.fetch(hireAddress);
        const tokenManager = await seller.program.account.tokenManager.fetch(
          seller.tokenManager
        );
        const sellerTokenAccount = await splToken.getAccount(
          connection,
          seller.depositTokenAccount
        );

        assert.deepEqual(tokenManager.accounts, {
          hire: true,
          callOption: true,
          loan: false,
        });
        assert.equal(
          sellerTokenAccount.delegate.toBase58(),
          seller.tokenManager.toBase58()
        );
        assert.equal(
          callOption.seller.toBase58(),
          seller.keypair.publicKey.toBase58()
        );
        assert.equal(
          callOption.strikePrice.toNumber(),
          callOptionOptions.strikePrice
        );
        assert.equal(callOption.expiry.toNumber(), callOptionOptions.expiry);
        assert.equal(callOption.mint.toBase58(), seller.mint.toBase58());
        assert.deepEqual(callOption.state, { active: {} });
        assert.equal(sellerTokenAccount.amount, BigInt(1));
        assert.equal(hire.borrower, null);
        assert.equal(hire.expiry.toNumber(), hireOptions.expiry);
        assert.deepEqual(hire.state, { listed: {} });
      });

      it("Allows listed NFTs to be hired", async () => {
        await helpers.requestAirdrop(connection, thirdPartyKeypair.publicKey);
        const provider = helpers.getProvider(connection, thirdPartyKeypair);
        const program = helpers.getProgram(provider);
        const hireAddress = await helpers.findHireAddress(
          seller.mint,
          seller.keypair.publicKey
        );
        const hireEscrowAddress = await helpers.findHireEscrowAddress(
          seller.mint,
          seller.keypair.publicKey
        );
        const tokenManagerAddress = await helpers.findTokenManagerAddress(
          seller.mint,
          seller.keypair.publicKey
        );
        hireTokenAccount = await splToken.createAccount(
          connection,
          thirdPartyKeypair,
          seller.mint,
          thirdPartyKeypair.publicKey
        );
        const [metadataAddress] = await helpers.findMetadataAddress(
          seller.mint
        );

        try {
          await program.methods
            .takeHire(2)
            .accounts({
              hireTokenAccount,
              borrower: thirdPartyKeypair.publicKey,
              lender: seller.keypair.publicKey,
              hire: hireAddress,
              hireEscrow: hireEscrowAddress,
              tokenManager: tokenManagerAddress,
              depositTokenAccount: seller.depositTokenAccount,
              mint: seller.mint,
              edition: seller.edition,
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

        const hire = await seller.program.account.hire.fetch(hireAddress);
        const tokenManager = await seller.program.account.tokenManager.fetch(
          tokenManagerAddress
        );
        const tokenAccount = await splToken.getAccount(
          connection,
          hireTokenAccount
        );

        assert.deepEqual(tokenManager.accounts, {
          loan: false,
          hire: true,
          callOption: true,
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

      it("Allows hired NFTs with active call options to be exercised", async () => {
        const hireAddress = await helpers.findHireAddress(
          seller.mint,
          seller.keypair.publicKey
        );
        const hireEscrowAddress = await helpers.findHireEscrowAddress(
          seller.mint,
          seller.keypair.publicKey
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
        const metadata = await Metadata.fromAccountAddress(
          connection,
          metadataAddress
        );
        const beforeBuyerBalance = await connection.getBalance(
          buyer.keypair.publicKey
        );
        const beforeSellerBalance = await connection.getBalance(
          seller.keypair.publicKey
        );

        let txFee;

        try {
          const remainingAccounts = metadata.data.creators
            .map((creator) => ({
              pubkey: creator.address,
              isSigner: false,
              isWritable: true,
            }))
            .concat([
              {
                pubkey: thirdPartyKeypair.publicKey,
                isWritable: true,
                isSigner: false,
              },
            ]);

          const signature = await buyer.program.methods
            .exerciseCallOptionWithHire()
            .accounts({
              seller: seller.keypair.publicKey,
              buyer: buyer.keypair.publicKey,
              callOption: seller.callOptionAccount,
              hire: hireAddress,
              hireEscrow: hireEscrowAddress,
              tokenManager: seller.tokenManager,
              buyerTokenAccount: tokenAccount.address,
              tokenAccount: hireTokenAccount,
              mint: seller.mint,
              edition: seller.edition,
              metadata: metadataAddress,
              metadataProgram: METADATA_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: splToken.TOKEN_PROGRAM_ID,
              clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .remainingAccounts(remainingAccounts)
            .rpc();

          const latestBlockhash = await connection.getLatestBlockhash();
          await connection.confirmTransaction({
            signature,
            ...latestBlockhash,
          });
          const tx = await connection.getTransaction(signature, {
            commitment: "confirmed",
          });
          txFee = tx.meta.fee;
        } catch (err) {
          console.log(err.logs);
          assert.fail(err);
        }

        const afterBuyerBalance = await connection.getBalance(
          buyer.keypair.publicKey
        );
        const afterSellerBalance = await connection.getBalance(
          seller.keypair.publicKey
        );
        const callOption = await seller.program.account.callOption.fetch(
          seller.callOptionAccount
        );
        const hireAccount = await connection.getAccountInfo(hireAddress);
        const tokenManager = await seller.program.account.tokenManager.fetch(
          seller.tokenManager
        );
        const buyerTokenAccount = await splToken.getAccount(
          connection,
          tokenAccount.address
        );
        const creatorFees =
          (metadata.data.sellerFeeBasisPoints / 10_000) *
          callOption.strikePrice.toNumber();

        const estimatedBuyerBalance =
          beforeBuyerBalance - callOptionOptions.strikePrice - txFee;
        const estimatedSellerBalance =
          beforeSellerBalance + (callOptionOptions.strikePrice - creatorFees);

        assert.equal(estimatedBuyerBalance, afterBuyerBalance, "buyer balance");
        assert.ok(
          afterSellerBalance >= estimatedSellerBalance,
          "seller balance"
        );
        assert.deepEqual(callOption.state, { exercised: {} });
        assert.equal(buyerTokenAccount.amount, BigInt(1));
        assert.equal(hireAccount, null);
        assert.deepEqual(tokenManager.accounts, {
          hire: false,
          callOption: false,
          loan: false,
        });
      });
    });
  });
});

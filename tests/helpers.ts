import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import {
  Metadata,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import { IDL, DexloanListings } from "../target/types/dexloan_listings";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "8hSdpqHU7jz4C6C1kHUPQNMqBcC76n1BFXbHaTwd9X4c"
);

export function getProgram(
  provider: anchor.AnchorProvider
): anchor.Program<DexloanListings> {
  return new anchor.Program(IDL, PROGRAM_ID, provider);
}

export function getProvider(
  connection: anchor.web3.Connection,
  keypair: anchor.web3.Keypair
): anchor.AnchorProvider {
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(
    connection,
    wallet,
    anchor.AnchorProvider.defaultOptions()
  );
}

export async function requestAirdrop(
  connection: anchor.web3.Connection,
  publicKey: anchor.web3.PublicKey
): Promise<void> {
  const blockhashWithExpiryBlockHeight = await connection.getLatestBlockhash();
  const signature = await connection.requestAirdrop(
    publicKey,
    anchor.web3.LAMPORTS_PER_SOL * 2
  );
  await connection.confirmTransaction({
    signature,
    ...blockhashWithExpiryBlockHeight,
  });
}

export async function findListingAddress(
  mint: anchor.web3.PublicKey,
  borrower: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [listingAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("listing"), mint.toBuffer(), borrower.toBuffer()],
    PROGRAM_ID
  );

  return listingAccount;
}

export async function findTokenManagerAddress(
  mint: anchor.web3.PublicKey,
  issuer: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [tokenManagerAddress] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("token_manager"), mint.toBuffer(), issuer.toBuffer()],
    PROGRAM_ID
  );

  return tokenManagerAddress;
}

export async function findLoanAddress(
  mint: anchor.web3.PublicKey,
  borrower: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [loanAddress] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("loan"), mint.toBuffer(), borrower.toBuffer()],
    PROGRAM_ID
  );

  return loanAddress;
}

export async function findCallOptionAddress(
  mint: anchor.web3.PublicKey,
  seller: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [callOptionAddress] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("call_option"), mint.toBuffer(), seller.toBuffer()],
    PROGRAM_ID
  );

  return callOptionAddress;
}

export async function findHireAddress(
  mint: anchor.web3.PublicKey,
  lender: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [hireAddress] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("hire"), mint.toBuffer(), lender.toBuffer()],
    PROGRAM_ID
  );

  return hireAddress;
}

export async function findHireEscrowAddress(
  mint: anchor.web3.PublicKey,
  lender: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [hireEscrowAddress] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("hire_escrow"), mint.toBuffer(), lender.toBuffer()],
    PROGRAM_ID
  );

  return hireEscrowAddress;
}

export async function findMetadataAddress(mint: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
}

// Don't worry these keypairs are only for testing!
export function getBorrowerKeypair() {
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array([
      71, 35, 95, 48, 212, 238, 241, 57, 118, 77, 120, 148, 138, 225, 184, 200,
      163, 169, 55, 8, 181, 69, 2, 6, 107, 129, 115, 87, 113, 58, 117, 26, 57,
      7, 172, 250, 17, 17, 24, 22, 59, 192, 224, 136, 245, 121, 67, 41, 137,
      218, 59, 249, 200, 31, 142, 149, 179, 204, 75, 22, 43, 108, 22, 243,
    ])
  );
}

export function getLenderKeypair() {
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array([
      114, 81, 242, 139, 161, 245, 117, 122, 191, 227, 244, 80, 105, 25, 54,
      130, 50, 10, 108, 40, 18, 31, 172, 3, 70, 36, 143, 141, 249, 8, 119, 33,
      254, 50, 70, 83, 150, 213, 73, 182, 129, 95, 147, 188, 176, 50, 61, 176,
      36, 62, 183, 123, 23, 105, 183, 6, 188, 94, 237, 150, 115, 108, 2, 187,
    ])
  );
}

export function getThirdPartyKeypair() {
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array([
      172, 52, 187, 213, 156, 166, 82, 226, 150, 59, 75, 132, 21, 42, 250, 2,
      158, 157, 186, 190, 211, 49, 59, 27, 3, 86, 103, 28, 40, 101, 9, 116, 31,
      40, 124, 145, 153, 59, 204, 5, 53, 8, 156, 208, 12, 27, 28, 187, 132, 148,
      4, 42, 128, 61, 200, 133, 253, 113, 253, 109, 138, 65, 47, 247,
    ])
  );
}

export type LoanBorrower = Awaited<ReturnType<typeof initLoan>>;
export type LoanLender = Awaited<ReturnType<typeof giveLoan>>;

export async function initLoan(
  connection: anchor.web3.Connection,
  options: {
    amount: number;
    basisPoints: number;
    duration: number;
  }
) {
  const keypair = getBorrowerKeypair();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);
  console.log("borrower: ", keypair.publicKey.toBase58());
  const metaplex = Metaplex.make(connection).use(keypairIdentity(keypair));

  const { nft } = await metaplex
    .nfts()
    .create({
      uri: "https://arweave.net/123",
      name: "My NFT",
      sellerFeeBasisPoints: 500,
    })
    .run();

  const loanAccount = await findLoanAddress(
    nft.mint.address,
    keypair.publicKey
  );

  const tokenManager = await findTokenManagerAddress(
    nft.mint.address,
    keypair.publicKey
  );

  await wait(2);

  const largestAccounts = await connection.getTokenLargestAccounts(
    nft.mint.address
  );
  const depositTokenAccount = largestAccounts.value[0].address;

  const amount = new anchor.BN(options.amount);
  const basisPoints = new anchor.BN(options.basisPoints);
  const duration = new anchor.BN(options.duration);

  try {
    await program.methods
      .initLoan(amount, basisPoints, duration)
      .accounts({
        tokenManager,
        depositTokenAccount,
        loan: loanAccount,
        mint: nft.mint.address,
        borrower: keypair.publicKey,
        edition: nft.edition.address,
        metadataProgram: METADATA_PROGRAM_ID,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  } catch (error) {
    console.log(error.logs);
    throw error;
  }

  return {
    keypair,
    provider,
    program,
    loanAccount,
    tokenManager,
    depositTokenAccount,
    edition: nft.edition.address,
    mint: nft.mint.address,
  };
}

export async function giveLoan(
  connection: anchor.web3.Connection,
  borrower: Awaited<ReturnType<typeof initLoan>>
) {
  const keypair = getLenderKeypair();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);
  console.log("lender: ", keypair.publicKey.toBase58());

  try {
    await program.methods
      .giveLoan()
      .accounts({
        tokenManager: borrower.tokenManager,
        loan: borrower.loanAccount,
        borrower: borrower.keypair.publicKey,
        lender: keypair.publicKey,
        mint: borrower.mint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .rpc();
  } catch (error) {
    console.log(error.logs);
    throw error;
  }

  return {
    keypair,
    provider,
    program,
  };
}

export type CallOptionSeller = Awaited<ReturnType<typeof initCallOption>>;
export type CallOptionBuyer = Awaited<ReturnType<typeof buyCallOption>>;

export async function initCallOption(
  connection: anchor.web3.Connection,
  options: {
    amount: number;
    strikePrice: number;
    expiry: number;
  }
) {
  const keypair = getBorrowerKeypair();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);

  const metaplex = Metaplex.make(connection).use(keypairIdentity(keypair));

  const { nft } = await metaplex
    .nfts()
    .create({
      uri: "https://arweave.net/123",
      name: "My NFT",
      sellerFeeBasisPoints: 500,
    })
    .run();

  await wait(2);

  const largestAccounts = await connection.getTokenLargestAccounts(
    nft.mint.address
  );
  const depositTokenAccount = largestAccounts.value[0].address;

  const callOptionAccount = await findCallOptionAddress(
    nft.mint.address,
    keypair.publicKey
  );

  const tokenManager = await findTokenManagerAddress(
    nft.mint.address,
    keypair.publicKey
  );

  const amount = new anchor.BN(options.amount);
  const strikePrice = new anchor.BN(options.strikePrice);
  const expiry = new anchor.BN(options.expiry);

  try {
    await program.methods
      .initCallOption(amount, strikePrice, expiry)
      .accounts({
        tokenManager,
        callOption: callOptionAccount,
        mint: nft.mint.address,
        edition: nft.edition.address,
        seller: keypair.publicKey,
        depositTokenAccount: depositTokenAccount,
        metadataProgram: METADATA_PROGRAM_ID,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .rpc();
  } catch (error) {
    console.log(error.logs);
    throw error;
  }

  return {
    keypair,
    provider,
    program,
    tokenManager,
    callOptionAccount,
    depositTokenAccount,
    mint: nft.mint.address,
    edition: nft.edition.address,
  };
}

export async function buyCallOption(
  connection: anchor.web3.Connection,
  seller: Awaited<ReturnType<typeof initCallOption>>
) {
  const keypair = getLenderKeypair();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);
  // await requestAirdrop(connection, keypair.publicKey);
  console.log("buyer: ", keypair.publicKey.toBase58());

  try {
    await program.methods
      .buyCallOption()
      .accounts({
        seller: seller.keypair.publicKey,
        buyer: keypair.publicKey,
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
  } catch (error) {
    console.log(error.logs);
    throw error;
  }

  return {
    keypair,
    provider,
    program,
  };
}

export type HireLender = Awaited<ReturnType<typeof initHire>>;
export type HireBorrower = Awaited<ReturnType<typeof takeHire>>;

export async function initHire(
  connection: anchor.web3.Connection,
  options: {
    amount: number;
    expiry: number;
    borrower?: anchor.web3.PublicKey;
  }
) {
  const keypair = getBorrowerKeypair();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);

  const metaplex = Metaplex.make(connection).use(keypairIdentity(keypair));

  const { nft } = await metaplex
    .nfts()
    .create({
      uri: "https://arweave.net/123",
      name: "My NFT",
      sellerFeeBasisPoints: 500,
    })
    .run();

  await wait(2);

  const largestAccounts = await connection.getTokenLargestAccounts(
    nft.mint.address
  );
  const depositTokenAccount = largestAccounts.value[0].address;

  const hire = await findHireAddress(nft.mint.address, keypair.publicKey);
  const tokenManager = await findTokenManagerAddress(
    nft.mint.address,
    keypair.publicKey
  );

  const amount = new anchor.BN(options.amount);
  const expiry = new anchor.BN(options.expiry);
  const borrower = options.borrower ?? null;

  try {
    await program.methods
      .initHire({ amount, expiry, borrower })
      .accounts({
        hire,
        tokenManager,
        lender: keypair.publicKey,
        depositTokenAccount: depositTokenAccount,
        mint: nft.mint.address,
        edition: nft.edition.address,
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

  return {
    keypair,
    program,
    provider,
    tokenManager,
    hireAccount: hire,
    depositTokenAccount,
    mint: nft.mint.address,
    edition: nft.edition.address,
    metadata: nft.metadataAddress,
  };
}

export async function takeHire(
  connection: anchor.web3.Connection,
  lender: Awaited<ReturnType<typeof initHire>>,
  days: number
) {
  const keypair = getLenderKeypair();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);

  const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    keypair,
    lender.mint,
    keypair.publicKey
  );

  const metadataAccountInfo = await connection.getAccountInfo(lender.metadata);
  const [metadata] = Metadata.fromAccountInfo(metadataAccountInfo);

  try {
    await program.methods
      .takeHire(days)
      .accounts({
        borrower: keypair.publicKey,
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
  } catch (err) {
    console.log(err.logs);
    throw err;
  }

  return {
    keypair,
    provider,
    program,
    hireTokenAccount: tokenAccount.address,
  };
}

export async function recoverHire(lender: HireLender, borrower: HireBorrower) {
  try {
    await lender.program.methods
      .recoverHire()
      .accounts({
        borrower: borrower.keypair.publicKey,
        lender: lender.keypair.publicKey,
        hire: lender.hireAccount,
        tokenManager: lender.tokenManager,
        depositTokenAccount: lender.depositTokenAccount,
        hireTokenAccount: borrower.hireTokenAccount,
        mint: lender.mint,
        edition: lender.edition,
        metadataProgram: METADATA_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .rpc();
  } catch (err) {
    console.log(err.logs);
    throw err;
  }
}

export async function wait(seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

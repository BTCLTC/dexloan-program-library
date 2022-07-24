import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import { PROGRAM_ID as METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { IDL, DexloanListings } from "../target/types/dexloan_listings";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "H6FCxCy2KCPJwCoUb9eQCSv41WZBKQaYfB6x5oFajzfj"
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

export async function findLoanAddress(
  mint: anchor.web3.PublicKey,
  borrower: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [listingAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("loan"), mint.toBuffer(), borrower.toBuffer()],
    PROGRAM_ID
  );

  return listingAccount;
}

export async function findCallOptionAddress(
  mint: anchor.web3.PublicKey,
  seller: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const [callOptionAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("call_option"), mint.toBuffer(), seller.toBuffer()],
    PROGRAM_ID
  );

  return callOptionAccount;
}

export async function findMetadataAddress(mint: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
}

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
  await requestAirdrop(connection, keypair.publicKey);

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
        loanAccount,
        depositTokenAccount,
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
    depositTokenAccount,
    edition: nft.edition.address,
    mint: nft.mint.address,
  };
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

export async function giveLoan(connection: anchor.web3.Connection, borrower) {
  const keypair = getLenderKeypair();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);
  console.log("lender: ", keypair.publicKey.toBase58());
  await requestAirdrop(connection, keypair.publicKey);

  try {
    await program.methods
      .giveLoan()
      .accounts({
        loanAccount: borrower.loanAccount,
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
  // await requestAirdrop(connection, keypair.publicKey);

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

  const amount = new anchor.BN(options.amount);
  const strikePrice = new anchor.BN(options.strikePrice);
  const expiry = new anchor.BN(options.expiry);

  try {
    await program.methods
      .initCallOption(amount, strikePrice, expiry)
      .accounts({
        callOptionAccount,
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
    callOptionAccount,
    depositTokenAccount,
    mint: nft.mint.address,
    edition: nft.edition.address,
  };
}

export async function buyCallOption(
  connection: anchor.web3.Connection,
  seller
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

export async function wait(seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

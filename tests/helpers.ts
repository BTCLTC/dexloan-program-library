import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
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
  const airdropSignature = await connection.requestAirdrop(
    publicKey,
    anchor.web3.LAMPORTS_PER_SOL * 20
  );
  await connection.confirmTransaction(airdropSignature);
}

export async function mintNFT(
  connection: anchor.web3.Connection,
  keypair: anchor.web3.Keypair
): Promise<{
  mint: anchor.web3.PublicKey;
  associatedAddress: anchor.web3.PublicKey;
}> {
  // Create the Mint Account for the NFT
  const mint = await splToken.createMint(
    connection,
    keypair,
    keypair.publicKey,
    null,
    0
  );

  const associatedAddress = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    keypair,
    mint,
    keypair.publicKey
  );

  await splToken.mintTo(
    connection,
    keypair,
    mint,
    associatedAddress.address,
    keypair,
    1
  );

  // Reset mint_authority to null from the user to prevent further minting
  await splToken.setAuthority(
    connection,
    keypair,
    mint,
    keypair.publicKey,
    0,
    null
  );

  return { mint, associatedAddress: associatedAddress.address };
}

export class ListingOptions {
  public amount;
  public basisPoints;
  public duration;
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

export async function initListing(
  connection: anchor.web3.Connection,
  options: {
    amount: number;
    basisPoints: number;
    duration: number;
  }
) {
  const keypair = anchor.web3.Keypair.generate();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);
  await requestAirdrop(connection, keypair.publicKey);

  const { mint, associatedAddress } = await mintNFT(connection, keypair);

  const listingAccount = await findListingAddress(mint, keypair.publicKey);

  const [escrowAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("escrow"), mint.toBuffer()],
    program.programId
  );

  const listingOptions = new ListingOptions();
  listingOptions.amount = new anchor.BN(options.amount);
  listingOptions.basisPoints = new anchor.BN(options.basisPoints);
  listingOptions.duration = new anchor.BN(options.duration);

  await program.methods
    .initListing(listingOptions)
    .accounts({
      mint,
      escrowAccount,
      listingAccount,
      borrower: keypair.publicKey,
      borrowerDepositTokenAccount: associatedAddress,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  return {
    mint,
    keypair,
    provider,
    program,
    listingAccount,
    escrowAccount,
    associatedAddress,
  };
}

export async function createLoan(connection: anchor.web3.Connection, borrower) {
  const keypair = anchor.web3.Keypair.generate();
  const provider = getProvider(connection, keypair);
  const program = getProgram(provider);
  await requestAirdrop(connection, keypair.publicKey);

  await program.methods
    .makeLoan()
    .accounts({
      listingAccount: borrower.listingAccount,
      borrower: borrower.keypair.publicKey,
      lender: keypair.publicKey,
      mint: borrower.mint,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    })
    .rpc();

  return {
    keypair,
    provider,
    program,
  };
}

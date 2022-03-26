import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { DexloanListings } from "../target/types/dexloan_listings";

export function getProgram(
  provider: anchor.Provider
): anchor.Program<DexloanListings> {
  const idl = require("../target/idl/dexloan_listings.json");
  const programID = new anchor.web3.PublicKey(idl.metadata.address);
  return new anchor.Program(idl, programID, provider);
}

export function getProvider(
  connection: anchor.web3.Connection,
  keypair: anchor.web3.Keypair
): anchor.Provider {
  // @ts-expect-error
  const wallet = new anchor.Wallet(keypair);
  return new anchor.Provider(
    connection,
    wallet,
    anchor.Provider.defaultOptions()
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
): Promise<{ mint: splToken.Token; associatedAddress: splToken.AccountInfo }> {
  // Create the Mint Account for the NFT
  const mint = await splToken.Token.createMint(
    connection,
    keypair,
    keypair.publicKey,
    null,
    0,
    splToken.TOKEN_PROGRAM_ID
  );

  const associatedAddress = await mint.getOrCreateAssociatedAccountInfo(
    keypair.publicKey
  );

  await mint.mintTo(associatedAddress.address, keypair.publicKey, [], 1);

  // Reset mint_authority to null from the user to prevent further minting
  await mint.setAuthority(
    mint.publicKey,
    null,
    "MintTokens",
    keypair.publicKey,
    []
  );

  return { mint, associatedAddress };
}

export class ListingOptions {
  public amount;
  public basisPoints;
  public duration;
  public discriminator;
}

function getDiscriminator(excluded: number) {
  let n = Math.floor(Math.random() * 255);
  if (n >= excluded) n++;
  return n;
}

export async function findListingAddress(
  connection: anchor.web3.Connection,
  mint: anchor.web3.PublicKey,
  borrower: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey,
  excluded: number = 256
): Promise<[anchor.web3.PublicKey, number]> {
  const discriminator = getDiscriminator(excluded);

  const [listingAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from("listing"),
      mint.toBuffer(),
      borrower.toBuffer(),
      new anchor.BN(discriminator).toBuffer(),
    ],
    programId
  );

  const account = await connection.getAccountInfo(listingAccount);

  if (account === null) {
    return [listingAccount, discriminator];
  }

  return findListingAddress(
    connection,
    mint,
    borrower,
    programId,
    discriminator
  );
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

  const [listingAccount, discriminator] = await findListingAddress(
    connection,
    mint.publicKey,
    keypair.publicKey,
    program.programId
  );

  const [escrowAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("escrow"), mint.publicKey.toBuffer()],
    program.programId
  );

  const listingOptions = new ListingOptions();
  listingOptions.amount = new anchor.BN(options.amount);
  listingOptions.basisPoints = new anchor.BN(options.basisPoints);
  listingOptions.duration = new anchor.BN(options.duration);
  listingOptions.discriminator = discriminator;

  await program.rpc.initListing(listingOptions, {
    accounts: {
      escrowAccount,
      listingAccount,
      borrower: keypair.publicKey,
      borrowerDepositTokenAccount: associatedAddress.address,
      mint: mint.publicKey,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: anchor.web3.SystemProgram.programId,
    },
  });

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

  await program.rpc.makeLoan({
    accounts: {
      listingAccount: borrower.listingAccount,
      borrower: borrower.keypair.publicKey,
      lender: keypair.publicKey,
      mint: borrower.mint.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });

  return {
    keypair,
    provider,
    program,
  };
}

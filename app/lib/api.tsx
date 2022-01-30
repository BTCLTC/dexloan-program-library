import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { TokenAccount } from "@metaplex-foundation/mpl-core";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import idl from "../target/idl/dexloan.json";
import type { Dexloan } from "../target/types/dexloan";

export function getProgram(provider: anchor.Provider): anchor.Program<Dexloan> {
  const programID = new anchor.web3.PublicKey(idl.metadata.address);
  return new anchor.Program(idl as any, programID, provider);
}

export function getProvider(
  connection: anchor.web3.Connection,
  wallet: typeof anchor.Wallet
): anchor.Provider {
  return new anchor.Provider(
    connection,
    wallet,
    anchor.Provider.defaultOptions()
  );
}

export enum ListingState {
  Listed = 0,
  Active = 1,
  Repaid = 2,
  Cancelled = 3,
  Defaulted = 4,
}

export async function getListings(
  connection: anchor.web3.Connection,
  filter: anchor.web3.GetProgramAccountsFilter[] = []
) {
  const program = getProgram(getProvider(connection, anchor.Wallet));
  const listings = await program.account.listing.all(filter);

  const metadataAddresses = await Promise.all(
    listings.map((listing) => Metadata.getPDA(listing.account.mint))
  );

  const rawMetadataAccounts = await connection.getMultipleAccountsInfo(
    metadataAddresses
  );

  const combinedAccounts = rawMetadataAccounts.map((account, index) => {
    if (account) {
      try {
        const metadata = new Metadata(
          metadataAddresses[index],
          account as anchor.web3.AccountInfo<Buffer>
        );

        return {
          metadata,
          listing: listings[index],
        };
      } catch {
        return null;
      }
    }
    return null;
  });

  return combinedAccounts;
}

export async function getLoans(
  connection: anchor.web3.Connection,
  filter: anchor.web3.GetProgramAccountsFilter[] = []
) {
  const program = getProgram(getProvider(connection, anchor.Wallet));
  const loans = await program.account.loan.all(filter);

  const listings: any[] = await program.account.listing.fetchMultiple(
    loans.map((loan) => loan.account.listing)
  );

  const metadataAddresses = await Promise.all(
    listings.map((listing) => Metadata.getPDA(listing.mint))
  );

  const rawMetadataAccounts = await connection.getMultipleAccountsInfo(
    metadataAddresses
  );

  const combinedAccounts = rawMetadataAccounts.map((account, index) => {
    if (account) {
      try {
        const metadata = new Metadata(
          metadataAddresses[index],
          account as anchor.web3.AccountInfo<Buffer>
        );

        return {
          metadata,
          loan: loans[index],
          listing: listings[index],
        };
      } catch {
        return null;
      }
    }
    return null;
  });

  return combinedAccounts;
}

export async function getNFTs(
  connection: anchor.web3.Connection,
  pubkey: anchor.web3.PublicKey
): Promise<{ accountInfo: TokenAccount; metadata: Metadata }[]> {
  const rawTokenAccounts = await connection.getTokenAccountsByOwner(pubkey, {
    programId: splToken.TOKEN_PROGRAM_ID,
  });

  const tokenAccounts: TokenAccount[] = await Promise.all(
    rawTokenAccounts.value.map(
      ({ pubkey, account }) => new TokenAccount(pubkey, account)
    )
  ).then((accounts) =>
    accounts.filter((account) => account.data.amount.toNumber() === 1)
  );

  const metadataAddresses = await Promise.all(
    tokenAccounts.map((account) => Metadata.getPDA(account.data.mint))
  );

  const rawMetadataAccounts = await connection.getMultipleAccountsInfo(
    metadataAddresses
  );

  const combinedAccounts = rawMetadataAccounts.map((account, index) => {
    if (account) {
      try {
        const metadata = new Metadata(
          metadataAddresses[index],
          account as anchor.web3.AccountInfo<Buffer>
        );

        return {
          metadata,
          accountInfo: tokenAccounts[index],
        };
      } catch {
        return null;
      }
    }
    return null;
  });

  return combinedAccounts
    .filter(Boolean)
    .filter(
      (account) =>
        account?.metadata.data &&
        account?.metadata.data.data?.uri &&
        account?.metadata.data.data.uri.trim().length
    ) as { accountInfo: TokenAccount; metadata: Metadata }[];
}

export interface ListingOptions {
  amount: number;
  duration: number;
  basisPoints: number;
}

export async function createListing(
  connection: anchor.web3.Connection,
  wallet: AnchorWallet,
  mint: anchor.web3.PublicKey,
  borrowerDepositTokenAccount: anchor.web3.PublicKey,
  options: ListingOptions
) {
  const loanAmount = new anchor.BN(options.amount);
  const loanDuration = new anchor.BN(options.duration);
  const basisPoints = new anchor.BN(options.basisPoints);

  const provider = getProvider(connection, wallet as typeof anchor.Wallet);
  const program = getProgram(provider);

  const [listingAccount, bump] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("listing"), mint.toBuffer()],
    program.programId
  );

  const [escrowAccount, escrowBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("escrow"), mint.toBuffer()],
      program.programId
    );

  await program.rpc.makeListing(
    bump,
    escrowBump,
    loanAmount,
    loanDuration,
    basisPoints,
    {
      accounts: {
        escrowAccount,
        listingAccount,
        mint,
        borrowerDepositTokenAccount,
        borrower: wallet.publicKey,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    }
  );
}

export async function createLoan(
  connection: anchor.web3.Connection,
  wallet: AnchorWallet,
  mint: anchor.web3.PublicKey,
  borrower: anchor.web3.PublicKey,
  listing: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  const provider = getProvider(connection, wallet as typeof anchor.Wallet);
  const program = getProgram(provider);

  const [loanAccount, loanBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("loan"), listing.toBuffer()],
      program.programId
    );

  await program.rpc.makeLoan(loanBump, {
    accounts: {
      borrower,
      loanAccount,
      mint,
      listingAccount: listing,
      lender: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });

  return loanAccount;
}

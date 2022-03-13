import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { TokenAccount } from "@metaplex-foundation/mpl-core";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { AnchorWallet, WalletContextState } from "@solana/wallet-adapter-react";
import idl from "../idl.json";
import type { DexloanListings } from "../dexloan";

export function getProgram(
  provider: anchor.Provider
): anchor.Program<DexloanListings> {
  // @ts-ignore
  const programID = new anchor.web3.PublicKey(
    "H6FCxCy2KCPJwCoUb9eQCSv41WZBKQaYfB6x5oFajzfj"
  );
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
  Initialized = 0,
  Listed = 1,
  Active = 2,
  Repaid = 3,
  Cancelled = 4,
  Defaulted = 5,
}

export async function getListing(
  connection: anchor.web3.Connection,
  listing: anchor.web3.PublicKey
) {
  const program = getProgram(getProvider(connection, anchor.Wallet));
  const listingAccount = await program.account.listing.fetch(listing);

  const whitelist = (await import("../public/whitelist.json")).default;

  if (!whitelist.includes(listingAccount.mint.toBase58())) {
    throw new Error("Mint not whitelisted");
  }

  const metadataPDA = await Metadata.getPDA(listingAccount.mint);
  const metadataAccount = await Metadata.load(connection, metadataPDA);

  return {
    metadata: metadataAccount,
    listing: listingAccount,
  };
}

export async function getListings(
  connection: anchor.web3.Connection,
  filter: anchor.web3.GetProgramAccountsFilter[] = []
) {
  const program = getProgram(getProvider(connection, anchor.Wallet));
  const listings = await program.account.listing.all(filter);

  const whitelist = (await import("../public/whitelist.json")).default;

  const filteredListings = listings
    .filter((listing) => whitelist.includes(listing.account.mint.toBase58()))
    .sort((a, b) => a.account.amount.toNumber() - b.account.amount.toNumber());

  const metadataAddresses = await Promise.all(
    filteredListings.map((listing) => Metadata.getPDA(listing.account.mint))
  );

  const rawMetadataAccounts = await connection.getMultipleAccountsInfo(
    metadataAddresses
  );

  return rawMetadataAccounts
    .map((account, index) => {
      if (account) {
        try {
          const metadata = new Metadata(
            metadataAddresses[index],
            account as anchor.web3.AccountInfo<Buffer>
          );

          return {
            metadata,
            listing: filteredListings[index],
          };
        } catch {
          return null;
        }
      }
      return null;
    })
    .filter(Boolean);
}

export interface NFTResult {
  accountInfo: TokenAccount;
  metadata: Metadata;
}

export async function getNFTs(
  connection: anchor.web3.Connection,
  pubkey: anchor.web3.PublicKey
): Promise<NFTResult[]> {
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

  const whitelist = (await import("../public/whitelist.json")).default;

  const filteredAccounts = tokenAccounts.filter((account) =>
    whitelist.includes(account.data.mint.toBase58())
  );

  const metadataAddresses = await Promise.all(
    filteredAccounts.map((account) => Metadata.getPDA(account.data.mint))
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
          accountInfo: filteredAccounts[index],
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
    ) as NFTResult[];
}

class ListingOptions {
  public amount: anchor.BN;
  public duration: anchor.BN;
  public basisPoints: number;

  constructor(options: {
    amount: number;
    duration: number;
    basisPoints: number;
  }) {
    this.amount = new anchor.BN(options.amount);
    this.duration = new anchor.BN(options.duration);
    this.basisPoints = options.basisPoints;
  }
}

export async function createListing(
  connection: anchor.web3.Connection,
  wallet: AnchorWallet,
  mint: anchor.web3.PublicKey,
  borrowerDepositTokenAccount: anchor.web3.PublicKey,
  options: {
    amount: number;
    duration: number;
    basisPoints: number;
  }
) {
  const provider = getProvider(connection, wallet as typeof anchor.Wallet);
  const program = getProgram(provider);

  const [listingAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("listing"), mint.toBuffer(), wallet.publicKey.toBuffer()],
    program.programId
  );

  const [escrowAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("escrow"), mint.toBuffer()],
    program.programId
  );

  const listingOptions = new ListingOptions(options);

  let listing;

  try {
    listing = await program.account.listing.fetch(listingAccount);
  } catch {}

  const accounts = {
    escrowAccount,
    listingAccount,
    mint,
    borrowerDepositTokenAccount,
    borrower: wallet.publicKey,
    tokenProgram: splToken.TOKEN_PROGRAM_ID,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    systemProgram: anchor.web3.SystemProgram.programId,
  };

  if (!listing) {
    await program.rpc.initListing(listingOptions, { accounts });
  } else {
    await program.rpc.makeListing(listingOptions, {
      accounts,
    });
  }
}

export async function createLoan(
  connection: anchor.web3.Connection,
  wallet: AnchorWallet,
  mint: anchor.web3.PublicKey,
  borrower: anchor.web3.PublicKey,
  listing: anchor.web3.PublicKey
): Promise<void> {
  const provider = getProvider(connection, wallet as typeof anchor.Wallet);
  const program = getProgram(provider);

  await program.rpc.makeLoan({
    accounts: {
      borrower,
      mint,
      listingAccount: listing,
      lender: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });
}

export async function cancelListing(
  connection: anchor.web3.Connection,
  wallet: AnchorWallet,
  mint: anchor.web3.PublicKey,
  listingAccount: anchor.web3.PublicKey,
  escrowAccount: anchor.web3.PublicKey
): Promise<void> {
  const provider = getProvider(connection, wallet as typeof anchor.Wallet);
  const program = getProgram(provider);

  const tokenAccount = await connection.getTokenAccountsByOwner(
    wallet.publicKey,
    {
      mint,
    }
  );

  await program.rpc.cancelListing({
    accounts: {
      escrowAccount,
      listingAccount,
      mint,
      borrowerDepositTokenAccount: tokenAccount.value[0].pubkey,
      borrower: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
    },
  });
}

export async function repayLoan(
  connection: anchor.web3.Connection,
  wallet: AnchorWallet,
  mint: anchor.web3.PublicKey,
  lender: anchor.web3.PublicKey,
  listingAccount: anchor.web3.PublicKey,
  escrowAccount: anchor.web3.PublicKey
): Promise<void> {
  const provider = getProvider(connection, wallet as typeof anchor.Wallet);
  const program = getProgram(provider);

  const [borrowerDepositTokenAccount] =
    await anchor.web3.PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        splToken.TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      splToken.ASSOCIATED_TOKEN_PROGRAM_ID
    );

  await program.rpc.repayLoan({
    accounts: {
      lender,
      listingAccount,
      escrowAccount,
      mint,
      borrowerDepositTokenAccount,
      borrower: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });
}

export async function getOrCreateTokenAccount(
  connection: anchor.web3.Connection,
  wallet: WalletContextState,
  mint: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  if (!wallet.publicKey) {
    throw new Error("Wallet public key is not set");
  }

  const [tokenAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [
      wallet.publicKey.toBuffer(),
      splToken.TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    splToken.ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const receiverAccount = await connection.getAccountInfo(tokenAccount);

  if (!receiverAccount) {
    const transaction = new anchor.web3.Transaction({
      feePayer: wallet.publicKey,
    });

    transaction.add(
      splToken.Token.createAssociatedTokenAccountInstruction(
        splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
        splToken.TOKEN_PROGRAM_ID,
        mint,
        tokenAccount,
        wallet.publicKey,
        wallet.publicKey
      )
    );

    const txId = await wallet.sendTransaction(transaction, connection);

    await connection.confirmTransaction(txId);
  }

  return tokenAccount;
}

export async function repossessCollateral(
  connection: anchor.web3.Connection,
  anchorWallet: AnchorWallet,
  mint: anchor.web3.PublicKey,
  escrowAccount: anchor.web3.PublicKey,
  lenderTokenAccount: anchor.web3.PublicKey,
  listingAccount: anchor.web3.PublicKey
) {
  const provider = getProvider(
    connection,
    anchorWallet as typeof anchor.Wallet
  );
  const program = getProgram(provider);

  await program.rpc.repossessCollateral({
    accounts: {
      escrowAccount,
      mint,
      lenderTokenAccount,
      listingAccount,
      lender: anchorWallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
  });
}

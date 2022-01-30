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

export async function getListings(
  program: anchor.Program<Dexloan>,
  state: number = 0
) {
  return program.account.listing.all([
    {
      memcmp: {
        offset: 0,
        bytes: bs58.encode(Buffer.from([state])),
      },
    },
  ]);
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

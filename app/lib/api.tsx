import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import {
  Metadata,
  MetadataData,
} from "@metaplex-foundation/mpl-token-metadata";
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

interface AccountInfo extends anchor.web3.AccountInfo<Buffer> {
  address: anchor.web3.PublicKey;
  mint: anchor.web3.PublicKey;
  owner: anchor.web3.PublicKey;
  amount: anchor.BN;
}

export async function decodeAccountInfo({
  pubkey,
  account,
}: {
  pubkey: anchor.web3.PublicKey;
  account: anchor.web3.AccountInfo<Buffer>;
}): Promise<AccountInfo> {
  const accountInfo = splToken.AccountLayout.decode(account.data);

  accountInfo.address = pubkey;
  accountInfo.mint = new anchor.web3.PublicKey(accountInfo.mint);
  accountInfo.owner = new anchor.web3.PublicKey(accountInfo.owner);
  accountInfo.amount = splToken.u64.fromBuffer(accountInfo.amount);

  return accountInfo;
}

export async function loadMetadata(
  connection: anchor.web3.Connection,
  accountInfo: AccountInfo
): Promise<{ accountInfo: AccountInfo; metadata?: MetadataData }> {
  try {
    const metadataPDA = await Metadata.getPDA(accountInfo.mint);
    const metadata = await Metadata.load(connection, metadataPDA);
    return {
      accountInfo,
      metadata: metadata.data,
    };
  } catch {
    // Ignore
    return {
      accountInfo,
    };
  }
}

export async function getNFTs(
  connection: anchor.web3.Connection,
  wallet: AnchorWallet
): Promise<{ accountInfo: AccountInfo; metadata: MetadataData }[]> {
  const tokenAccounts = await connection.getTokenAccountsByOwner(
    wallet.publicKey,
    {
      programId: splToken.TOKEN_PROGRAM_ID,
    }
  );

  const decodedAccounts = await Promise.all(
    tokenAccounts.value.map(decodeAccountInfo)
  );

  const metadataAccounts = await Promise.all(
    decodedAccounts.map((account) => loadMetadata(connection, account))
  );

  return metadataAccounts.filter(
    (account) =>
      account.metadata &&
      account.metadata.data?.uri &&
      account.metadata.data.uri.trim().length
  ) as {
    accountInfo: AccountInfo;
    metadata: MetadataData;
  }[];
}

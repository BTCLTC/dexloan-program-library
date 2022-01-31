import * as anchor from "@project-serum/anchor";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { useQuery } from "react-query";
import * as api from "../lib/api";

export function useNFTByOwnerQuery(
  connection: anchor.web3.Connection,
  pubkey: anchor.web3.PublicKey | null
) {
  return useQuery(
    ["wallet-nfts", pubkey?.toBase58()],
    () => {
      if (pubkey) {
        return api.getNFTs(connection, pubkey);
      }
    },
    {
      enabled: Boolean(pubkey),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
}

export type NFTResult = api.NFTResult;

export function useMetadataFileQuery(uri?: string) {
  return useQuery(
    ["metadataFile", uri],
    () => {
      if (uri) {
        return fetch(uri).then((response) => {
          return response.json().then((data) => data);
        });
      }
    },
    {
      enabled: Boolean(uri),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
}

export function useListingsQuery(connection: anchor.web3.Connection) {
  return useQuery(["listings"], () =>
    api.getListings(connection, [
      {
        memcmp: {
          // filter listed
          offset: 7 + 1,
          bytes: bs58.encode(
            new anchor.BN(api.ListingState.Listed).toArrayLike(Buffer)
          ),
        },
      },
    ])
  );
}

export function useLoansQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    ["loans"],
    () => {
      if (wallet) {
        return api.getLoans(connection, [
          {
            memcmp: {
              // filter lender
              offset: 7 + 8 + 1,
              bytes: wallet?.publicKey.toBase58(),
            },
          },
        ]);
      }
    },
    {
      enabled: Boolean(wallet?.publicKey),
    }
  );
}

export function useBorrowingsQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    ["borrowings"],
    () => {
      if (wallet) {
        return api.getListings(connection, [
          {
            memcmp: {
              // filter active
              offset: 7 + 1,
              bytes: bs58.encode(
                new anchor.BN(api.ListingState.Active).toArrayLike(Buffer)
              ),
            },
          },
          {
            memcmp: {
              // filter authority
              offset: 7 + 1 + 8 + 1,
              bytes: wallet?.publicKey.toBase58(),
            },
          },
        ]);
      }
    },
    {
      enabled: Boolean(wallet?.publicKey),
    }
  );
}

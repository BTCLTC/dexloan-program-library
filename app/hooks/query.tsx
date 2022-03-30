import * as anchor from "@project-serum/anchor";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { useQuery } from "react-query";
import * as web3 from "../lib/web3";

export const getNFTByOwnerQueryKey = (
  walletAddress: anchor.web3.PublicKey | undefined
) => ["wallet-nfts", walletAddress?.toBase58()];

export function useNFTByOwnerQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    getNFTByOwnerQueryKey(wallet?.publicKey),
    () => {
      if (wallet) {
        return web3.fetchNFTs(connection, wallet.publicKey);
      }
    },
    {
      enabled: Boolean(wallet?.publicKey),
      refetchOnWindowFocus: false,
    }
  );
}

export type NFTResult = web3.NFTResult;

export const getMetadataFileQueryKey = (uri?: string) => ["metadataFile", uri];

export function useMetadataFileQuery(uri?: string) {
  return useQuery(
    getMetadataFileQueryKey(uri),
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
    }
  );
}

export const getListingQueryKey = (
  listing: anchor.web3.PublicKey | undefined
) => ["listing", listing?.toBase58()];

export function useListingQuery(
  connection: anchor.web3.Connection,
  listing: anchor.web3.PublicKey | undefined
) {
  return useQuery(
    getListingQueryKey(listing),
    () => {
      if (listing) return web3.fetchListing(connection, listing);
    },
    { enabled: Boolean(listing) }
  );
}

export const getListingsQueryKey = () => ["listings"];

export function useListingsQuery(connection: anchor.web3.Connection) {
  return useQuery(
    getListingsQueryKey(),
    () =>
      web3.fetchListings(connection, [
        {
          memcmp: {
            // filter listed
            offset: 7 + 1,
            bytes: bs58.encode(
              new anchor.BN(web3.ListingState.Listed).toArrayLike(Buffer)
            ),
          },
        },
      ]),
    {
      refetchOnWindowFocus: false,
    }
  );
}

export const getBorrowingsQueryKey = (
  walletAddress: anchor.web3.PublicKey | undefined
) => ["borrowings", walletAddress?.toBase58()];

export function useBorrowingsQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    getBorrowingsQueryKey(wallet?.publicKey),
    () => {
      if (wallet) {
        return web3.fetchListings(connection, [
          {
            memcmp: {
              // filter borrower
              offset: 7 + 1 + 8 + 1,
              bytes: wallet.publicKey.toBase58(),
            },
          },
        ]);
      }
    },
    {
      enabled: Boolean(wallet),
      refetchOnWindowFocus: false,
    }
  );
}

export const getLoansQueryKey = (
  walletAddress: anchor.web3.PublicKey | undefined
) => ["loans", walletAddress?.toBase58()];

export function useLoansQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    getLoansQueryKey(wallet?.publicKey),
    () => {
      if (wallet) {
        return web3.fetchListings(connection, [
          {
            memcmp: {
              // filter lender
              offset: 7 + 1 + 8 + 32 + 1,
              bytes: wallet?.publicKey.toBase58(),
            },
          },
        ]);
      }
    },
    {
      enabled: Boolean(wallet?.publicKey),
      refetchOnWindowFocus: false,
    }
  );
}

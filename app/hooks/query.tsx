import * as anchor from "@project-serum/anchor";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { useQuery } from "react-query";
import * as web3 from "../lib/web3";

export function useNFTByOwnerQuery(
  connection: anchor.web3.Connection,
  pubkey: anchor.web3.PublicKey | null
) {
  return useQuery(
    ["wallet-nfts", pubkey?.toBase58()],
    () => {
      if (pubkey) {
        return web3.fetchNFTs(connection, pubkey);
      }
    },
    {
      enabled: Boolean(pubkey),
      refetchOnWindowFocus: false,
    }
  );
}

export type NFTResult = web3.NFTResult;

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
    }
  );
}

export function useListingQuery(
  connection: anchor.web3.Connection,
  listing: anchor.web3.PublicKey | undefined
) {
  return useQuery(
    ["listing", listing?.toBase58()],
    () => {
      if (listing) return web3.fetchListing(connection, listing);
    },
    { enabled: Boolean(listing) }
  );
}

export function useListingsQuery(connection: anchor.web3.Connection) {
  return useQuery(
    ["listings"],
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

export function useListingsByOwnerQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    ["listings", wallet?.publicKey.toBase58()],
    () => {
      if (wallet) {
        return web3.fetchListingsByBorrowerAndState(
          connection,
          wallet.publicKey,
          web3.ListingState.Listed
        );
      }
    },
    {
      enabled: Boolean(wallet),
      refetchOnWindowFocus: false,
    }
  );
}

export function useLoansQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    ["loans", wallet?.publicKey.toBase58()],
    () => {
      if (wallet) {
        return web3.fetchListings(connection, [
          {
            memcmp: {
              // filter active
              offset: 7 + 1,
              bytes: bs58.encode(
                new anchor.BN(web3.ListingState.Active).toArrayLike(Buffer)
              ),
            },
          },
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

export function useBorrowingsQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    ["borrowings", wallet?.publicKey.toBase58()],
    () => {
      if (wallet) {
        return web3.fetchListingsByBorrowerAndState(
          connection,
          wallet.publicKey,
          web3.ListingState.Active
        );
      }
    },
    {
      enabled: Boolean(wallet?.publicKey),
      refetchOnWindowFocus: false,
    }
  );
}

export function useFinalizedQuery(
  connection: anchor.web3.Connection,
  wallet?: AnchorWallet
) {
  return useQuery(
    ["finalized", wallet?.publicKey.toBase58()],
    () => {
      if (wallet) {
        return web3.fetchFinalizedListingsByBorrower(
          connection,
          wallet.publicKey
        );
      }
    },
    {
      enabled: Boolean(wallet?.publicKey),
      refetchOnWindowFocus: false,
    }
  );
}

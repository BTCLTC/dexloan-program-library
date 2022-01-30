import * as anchor from "@project-serum/anchor";
import { useQuery } from "react-query";
import * as api from "../lib/api";

export function useNFTByOwnerQuery(
  connection: anchor.web3.Connection,
  pubkey?: anchor.web3.PublicKey
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

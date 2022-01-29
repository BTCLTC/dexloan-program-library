import { Flex } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useQuery } from "react-query";
import * as api from "../lib/api";
import { Card } from "../components/card";

const Me: NextPage = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const nftQuery = useQuery(
    ["wallet-nfts", anchorWallet?.publicKey?.toBase58()],
    () => {
      if (anchorWallet) {
        return api.getNFTs(connection, anchorWallet);
      }
    },
    { enabled: Boolean(anchorWallet?.publicKey) }
  );

  return (
    <Flex direction="row" flex={1} wrap="wrap">
      {nftQuery.data?.map((nft) => (
        <Card
          key={nft?.accountInfo.address.toBase58()}
          mint={nft?.accountInfo.mint}
          name={nft?.metadata.data.name}
          uri={nft?.metadata.data.uri}
        />
      ))}
    </Flex>
  );
};

export default Me;

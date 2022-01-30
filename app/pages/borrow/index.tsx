import { Flex } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useQuery } from "react-query";
import * as api from "../../lib/api";
import { Card } from "../../components/card";

const Borrow: NextPage = () => {
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
    <Flex direction="row" width="100%" gap="size-100" wrap="wrap">
      {nftQuery.data?.map((nft) => (
        <Card
          key={nft.accountInfo.pubkey?.toBase58()}
          pubkey={nft.accountInfo.pubkey}
          mint={nft.accountInfo.data?.mint}
          name={nft.metadata.data?.data?.name}
          uri={nft.metadata.data?.data?.uri}
        />
      ))}
    </Flex>
  );
};

export default Borrow;

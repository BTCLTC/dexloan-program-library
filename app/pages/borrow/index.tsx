import { Flex } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { Card } from "../../components/card";
import { useNFTByOwnerQuery } from "../../hooks/query";

const Borrow: NextPage = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const queryResult = useNFTByOwnerQuery(connection, anchorWallet?.publicKey);

  return (
    <Flex direction="row" width="100%" gap="size-100" wrap="wrap">
      {queryResult.data?.map((nft) => (
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

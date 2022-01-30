import { Flex } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useNFTByOwnerQuery } from "../../hooks/query";
import { Card } from "../../components/card";
import { ProgressCircle } from "../../components/progress";

const Borrow: NextPage = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const queryResult = useNFTByOwnerQuery(connection, anchorWallet?.publicKey);

  if (queryResult.isLoading) {
    return <ProgressCircle />;
  }

  return (
    <Flex direction="row" width="100%" gap="size-100" wrap="wrap">
      {queryResult.data?.map((nft) => (
        <Card
          key={nft.accountInfo.pubkey?.toBase58()}
          pubkey={nft.accountInfo.pubkey}
          name={nft.metadata.data?.data?.name}
          uri={nft.metadata.data?.data?.uri}
        />
      ))}
    </Flex>
  );
};

export default Borrow;
